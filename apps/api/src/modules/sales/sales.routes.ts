import {
  customerDebtInstallments,
  customerDebts,
  customers,
  db,
  moneyLedger,
  products,
  saleItems,
  salePayments,
  sales,
  stockMovements,
  users,
} from "@erc/db";
import { desc, eq, ilike } from "drizzle-orm";
import {
  makeBusinessDate,
  requireOpenCashSession,
} from "../../utils/cash-session.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

type ProductRecord = typeof products.$inferSelect;
type SaleItemRecord = typeof saleItems.$inferSelect;
type SalePaymentRecord = typeof salePayments.$inferSelect;
type CustomerDebtRecord = typeof customerDebts.$inferSelect;
type CustomerDebtInstallmentRecord =
  typeof customerDebtInstallments.$inferSelect;

type ProductLine = {
  product: ProductRecord;
  quantity: number;
  unitPriceRwf: number;
  lineTotalRwf: number;
  soldBelowMinimum: boolean;
};

const installmentFrequencySchema = z.enum(["daily", "weekly", "monthly"]);

const createSaleSchema = z.object({
  customerType: z.enum(["walk_in", "existing", "new"]).default("walk_in"),

  customerId: z.string().uuid().optional(),
  walkInName: z.string().optional(),

  newCustomer: z
    .object({
      name: z.string().min(2),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),

  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        unitPriceRwf: z.coerce.number().int().min(0),
      }),
    )
    .min(1),

  payment: z
    .object({
      amountPaidRwf: z.coerce.number().int().min(0).default(0),
      method: z.enum(["cash", "momo", "bank", "card", "other"]).default("cash"),
      note: z.string().optional(),
      expectedPaymentAt: z.string().datetime().optional(),

      installmentPlan: z
        .object({
          numberOfInstallments: z.coerce.number().int().min(1).max(36),
          frequency: installmentFrequencySchema.default("monthly"),
          firstDueAt: z.string().datetime().optional(),
        })
        .optional(),
    })
    .default({
      amountPaidRwf: 0,
      method: "cash",
    }),

  notes: z.string().optional(),
});

const saleParamsSchema = z.object({
  id: z.string().uuid(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function makeSalePrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `SALE-${y}${m}${d}`;
}

async function makeNextSaleNumber(date = new Date()) {
  const prefix = makeSalePrefix(date);

  const rows = await db
    .select({
      saleNumber: sales.saleNumber,
    })
    .from(sales)
    .where(ilike(sales.saleNumber, `${prefix}-%`));

  const highestNumber = rows.reduce((highest, row) => {
    const value = row.saleNumber || "";
    const match = value.match(new RegExp(`^${prefix}-(\\d{3})$`));

    if (!match) return highest;

    const number = Number(match[1]);

    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);

  const nextNumber = String(highestNumber + 1).padStart(3, "0");

  return `${prefix}-${nextNumber}`;
}

function defaultExpectedPaymentAt() {
  const date = new Date();

  if (date.getHours() >= 20) {
    date.setDate(date.getDate() + 1);
  }

  date.setHours(20, 0, 0, 0);

  return date;
}

function getSalePaymentStatus(totalAmountRwf: number, amountPaidRwf: number) {
  const balanceRwf = totalAmountRwf - amountPaidRwf;

  if (balanceRwf <= 0) {
    return {
      status: "paid",
      paymentStatus: "paid",
      balanceRwf: 0,
    };
  }

  if (amountPaidRwf > 0) {
    return {
      status: "partially_paid",
      paymentStatus: "partially_paid",
      balanceRwf,
    };
  }

  return {
    status: "unpaid",
    paymentStatus: "unpaid",
    balanceRwf,
  };
}

function addInstallmentFrequency(
  date: Date,
  frequency: z.infer<typeof installmentFrequencySchema>,
  step: number,
) {
  const nextDate = new Date(date);

  if (frequency === "daily") {
    nextDate.setDate(nextDate.getDate() + step);
  }

  if (frequency === "weekly") {
    nextDate.setDate(nextDate.getDate() + step * 7);
  }

  if (frequency === "monthly") {
    nextDate.setMonth(nextDate.getMonth() + step);
  }

  return nextDate;
}

function buildInstallmentSchedule(input: {
  debtId: string;
  saleId: string;
  balanceRwf: number;
  numberOfInstallments: number;
  frequency: z.infer<typeof installmentFrequencySchema>;
  firstDueAt?: string;
}) {
  const firstDueAt = input.firstDueAt
    ? new Date(input.firstDueAt)
    : defaultExpectedPaymentAt();

  const baseAmount = Math.floor(input.balanceRwf / input.numberOfInstallments);
  const remainder = input.balanceRwf % input.numberOfInstallments;

  return Array.from({ length: input.numberOfInstallments }).map((_, index) => {
    const isLast = index === input.numberOfInstallments - 1;
    const expectedAmountRwf = isLast ? baseAmount + remainder : baseAmount;

    return {
      debtId: input.debtId,
      saleId: input.saleId,
      installmentNumber: index + 1,
      expectedAmountRwf,
      amountPaidRwf: 0,
      balanceRwf: expectedAmountRwf,
      dueAt: addInstallmentFrequency(firstDueAt, input.frequency, index),
      status: "pending",
    };
  });
}

export async function salesRoutes(app: FastifyInstance) {
  app.post(
    "/",
    {
      preHandler: [requireAuth, requirePermission("sales.create")],
    },
    async (request, reply) => {
      const parsed = createSaleSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check sale details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const cashControl = await requireOpenCashSession(reply);

      if (!cashControl) {
        return;
      }

      const productLines: ProductLine[] = [];
      let subtotalRwf = 0;

      for (const item of data.items) {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product) {
          return reply.code(404).send({
            ok: false,
            message: "One selected product was not found.",
          });
        }

        if (!product.isActive) {
          return reply.code(400).send({
            ok: false,
            message: `${product.name} is inactive and cannot be sold.`,
          });
        }

        if (item.quantity > product.currentStock) {
          return reply.code(400).send({
            ok: false,
            message: `${product.name} has only ${product.currentStock} in stock.`,
          });
        }

        const soldBelowMinimum = item.unitPriceRwf < product.minSellingPriceRwf;

        if (soldBelowMinimum && auth.role !== "owner") {
          return reply.code(403).send({
            ok: false,
            message:
              "Selling below minimum price requires owner approval. Ask the owner to approve this sale.",
          });
        }

        const lineTotalRwf = item.quantity * item.unitPriceRwf;
        subtotalRwf += lineTotalRwf;

        productLines.push({
          product,
          quantity: item.quantity,
          unitPriceRwf: item.unitPriceRwf,
          lineTotalRwf,
          soldBelowMinimum,
        });
      }

      const amountPaidRwf = data.payment.amountPaidRwf;

      if (amountPaidRwf > subtotalRwf) {
        return reply.code(400).send({
          ok: false,
          message: "Amount paid cannot be greater than sale total.",
        });
      }

      const paymentResult = getSalePaymentStatus(subtotalRwf, amountPaidRwf);
      const installmentPlan = data.payment.installmentPlan;

      if (installmentPlan && paymentResult.balanceRwf <= 0) {
        return reply.code(400).send({
          ok: false,
          message: "Installment plan requires a remaining balance.",
        });
      }

      if (paymentResult.balanceRwf > 0 && data.customerType === "walk_in") {
        return reply.code(400).send({
          ok: false,
          message:
            "Pay-later or installment sale needs a customer profile. Choose existing customer or create new customer.",
        });
      }

      if (data.customerType === "existing" && !data.customerId) {
        return reply.code(400).send({
          ok: false,
          message: "Choose an existing customer for this sale.",
        });
      }

      if (data.customerType === "new" && !data.newCustomer) {
        return reply.code(400).send({
          ok: false,
          message: "Enter new customer details for this sale.",
        });
      }

      const saleNumber = await makeNextSaleNumber();

      const result = await db.transaction(async (tx) => {
        let customerId: string | null = null;
        let walkInName: string | null = null;

        if (data.customerType === "walk_in") {
          walkInName = cleanOptional(data.walkInName) || "Walk-in customer";
        }

        if (data.customerType === "existing") {
          const [customer] = await tx
            .select()
            .from(customers)
            .where(eq(customers.id, data.customerId!))
            .limit(1);

          if (!customer) {
            throw new Error("Selected customer was not found.");
          }

          customerId = customer.id;
        }

        if (data.customerType === "new") {
          const newCustomer = data.newCustomer!;

          if (newCustomer.phone?.trim()) {
            const [existingPhone] = await tx
              .select()
              .from(customers)
              .where(eq(customers.phone, newCustomer.phone.trim()))
              .limit(1);

            if (existingPhone) {
              throw new Error(
                "A customer with this phone number already exists.",
              );
            }
          }

          const [createdCustomer] = await tx
            .insert(customers)
            .values({
              name: newCustomer.name.trim(),
              phone: cleanOptional(newCustomer.phone),
              address: cleanOptional(newCustomer.address),
              notes: cleanOptional(newCustomer.notes),
              isActive: true,
              createdById: auth.id,
            })
            .returning();

          customerId = createdCustomer.id;
        }

        const expectedPaymentAt =
          paymentResult.balanceRwf > 0
            ? installmentPlan?.firstDueAt
              ? new Date(installmentPlan.firstDueAt)
              : data.payment.expectedPaymentAt
                ? new Date(data.payment.expectedPaymentAt)
                : defaultExpectedPaymentAt()
            : null;

        const [createdSale] = await tx
          .insert(sales)
          .values({
            saleNumber,

            customerType: data.customerType,
            customerId,
            walkInName,

            status: paymentResult.status,
            paymentStatus: paymentResult.paymentStatus,

            subtotalRwf,
            discountRwf: 0,
            totalAmountRwf: subtotalRwf,
            amountPaidRwf,
            balanceRwf: paymentResult.balanceRwf,

            expectedPaymentAt,

            notes: cleanOptional(data.notes),

            soldById: auth.id,
            createdById: auth.id,
          })
          .returning();

        const createdItems: SaleItemRecord[] = [];

        for (const line of productLines) {
          const [freshProduct] = await tx
            .select()
            .from(products)
            .where(eq(products.id, line.product.id))
            .limit(1);

          if (!freshProduct) {
            throw new Error("Product not found during sale.");
          }

          if (line.quantity > freshProduct.currentStock) {
            throw new Error(`${freshProduct.name} does not have enough stock.`);
          }

          const quantityBefore = freshProduct.currentStock;
          const quantityAfter = quantityBefore - line.quantity;

          const [createdItem] = await tx
            .insert(saleItems)
            .values({
              saleId: createdSale.id,
              productId: freshProduct.id,
              productNameSnapshot: freshProduct.name,
              skuSnapshot: freshProduct.sku,
              quantity: line.quantity,
              unitPriceRwf: line.unitPriceRwf,
              minSellingPriceRwf: freshProduct.minSellingPriceRwf,
              lineTotalRwf: line.lineTotalRwf,
              soldBelowMinimum: line.soldBelowMinimum,
            })
            .returning();

          createdItems.push(createdItem);

          await tx
            .update(products)
            .set({
              currentStock: quantityAfter,
              updatedAt: new Date(),
            })
            .where(eq(products.id, freshProduct.id));

          await tx.insert(stockMovements).values({
            productId: freshProduct.id,
            movementType: "sale",
            quantityChange: -line.quantity,
            quantityBefore,
            quantityAfter,
            sourceType: "sale",
            sourceId: createdSale.id,
            sourceItemId: createdItem.id,
            reason: `Sale ${createdSale.saleNumber}`,
            actorUserId: auth.id,
          });
        }

        let createdPayment: SalePaymentRecord | null = null;

        if (amountPaidRwf > 0) {
          const paidAt = new Date();

          const [payment] = await tx
            .insert(salePayments)
            .values({
              saleId: createdSale.id,
              amountRwf: amountPaidRwf,
              method: data.payment.method,
              note: cleanOptional(data.payment.note),
              receivedById: auth.id,
              paidAt,
            })
            .returning();

          createdPayment = payment;

          await tx.insert(moneyLedger).values({
            businessDate: cashControl.businessDate || makeBusinessDate(paidAt),
            cashSessionId: cashControl.session.id,
            direction: "money_in",
            amountRwf: amountPaidRwf,
            method: data.payment.method,
            category: installmentPlan
              ? "installment_deposit"
              : paymentResult.balanceRwf > 0
                ? "sale_deposit"
                : "sale_payment",
            sourceType: "sale_payment",
            sourceId: createdSale.id,
            sourceItemId: payment.id,
            description: `Payment received for ${createdSale.saleNumber}.`,
            actorUserId: auth.id,
            happenedAt: paidAt,
          });
        }

        let createdDebt: CustomerDebtRecord | null = null;
        const createdInstallments: CustomerDebtInstallmentRecord[] = [];

        if (paymentResult.balanceRwf > 0) {
          if (!customerId) {
            throw new Error(
              "Customer is required for unpaid, partially paid, or installment sale.",
            );
          }

          const [debt] = await tx
            .insert(customerDebts)
            .values({
              customerId,
              saleId: createdSale.id,
              originalAmountRwf: paymentResult.balanceRwf,
              amountPaidRwf: 0,
              balanceRwf: paymentResult.balanceRwf,
              status: "pending",
              expectedPaymentAt,
              notes:
                cleanOptional(data.payment.note) ||
                (installmentPlan
                  ? "Customer will pay in installments."
                  : "Customer promised to pay later."),
              createdById: auth.id,
            })
            .returning();

          createdDebt = debt;

          if (installmentPlan) {
            const scheduleRows = buildInstallmentSchedule({
              debtId: debt.id,
              saleId: createdSale.id,
              balanceRwf: paymentResult.balanceRwf,
              numberOfInstallments: installmentPlan.numberOfInstallments,
              frequency: installmentPlan.frequency,
              firstDueAt: installmentPlan.firstDueAt,
            });

            const installments = await tx
              .insert(customerDebtInstallments)
              .values(scheduleRows)
              .returning();

            createdInstallments.push(...installments);
          }
        }

        return {
          sale: createdSale,
          items: createdItems,
          payment: createdPayment,
          debt: createdDebt,
          installments: createdInstallments,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "sales.created",
        entityType: "sale",
        entityId: result.sale.id,
        newValue: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        ...result,
      });
    },
  );

  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("sales.create")],
    },
    async () => {
      const rows = await db
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          customerType: sales.customerType,
          walkInName: sales.walkInName,
          status: sales.status,
          paymentStatus: sales.paymentStatus,
          totalAmountRwf: sales.totalAmountRwf,
          amountPaidRwf: sales.amountPaidRwf,
          balanceRwf: sales.balanceRwf,
          expectedPaymentAt: sales.expectedPaymentAt,
          createdAt: sales.createdAt,
          customerName: customers.name,
          soldByName: users.name,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .leftJoin(users, eq(sales.soldById, users.id))
        .orderBy(desc(sales.createdAt));

      return {
        ok: true,
        sales: rows,
      };
    },
  );

  app.get(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("sales.create")],
    },
    async (request, reply) => {
      const params = saleParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid sale ID.",
        });
      }

      const [sale] = await db
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          customerType: sales.customerType,
          walkInName: sales.walkInName,
          status: sales.status,
          paymentStatus: sales.paymentStatus,
          subtotalRwf: sales.subtotalRwf,
          totalAmountRwf: sales.totalAmountRwf,
          amountPaidRwf: sales.amountPaidRwf,
          balanceRwf: sales.balanceRwf,
          expectedPaymentAt: sales.expectedPaymentAt,
          notes: sales.notes,
          createdAt: sales.createdAt,
          customerName: customers.name,
          customerPhone: customers.phone,
          soldByName: users.name,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .leftJoin(users, eq(sales.soldById, users.id))
        .where(eq(sales.id, params.data.id))
        .limit(1);

      if (!sale) {
        return reply.code(404).send({
          ok: false,
          message: "Sale not found.",
        });
      }

      const items = await db
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, params.data.id));

      const payments = await db
        .select()
        .from(salePayments)
        .where(eq(salePayments.saleId, params.data.id));

      const debts = await db
        .select()
        .from(customerDebts)
        .where(eq(customerDebts.saleId, params.data.id));

      const installments = await db
        .select()
        .from(customerDebtInstallments)
        .where(eq(customerDebtInstallments.saleId, params.data.id))
        .orderBy(customerDebtInstallments.installmentNumber);

      return {
        ok: true,
        sale,
        items,
        payments,
        debts,
        installments,
      };
    },
  );
}
