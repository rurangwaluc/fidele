import {
  customerDebtInstallments,
  customerDebts,
  customers,
  db,
  debtPayments,
  moneyLedger,
  salePayments,
  sales,
  users,
} from "@erc/db";
import { desc, eq } from "drizzle-orm";
import {
  makeBusinessDate,
  requireOpenCashSession,
} from "../../utils/cash-session.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

type InstallmentRecord = typeof customerDebtInstallments.$inferSelect;

type InstallmentAllocation = {
  installment: InstallmentRecord;
  amountRwf: number;
};

const debtParamsSchema = z.object({
  id: z.string().uuid(),
});

const createDebtPaymentSchema = z.object({
  amountRwf: z.coerce.number().int().min(1),
  method: z.enum(["cash", "momo", "bank", "card", "other"]).default("cash"),
  note: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  installmentId: z.string().uuid().optional(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function getUpdatedSalePaymentStatus(
  totalAmountRwf: number,
  amountPaidRwf: number,
) {
  const balanceRwf = Math.max(0, totalAmountRwf - amountPaidRwf);

  if (balanceRwf === 0) {
    return {
      status: "paid",
      paymentStatus: "paid",
      balanceRwf,
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

function buildInstallmentAllocations(input: {
  installments: InstallmentRecord[];
  amountRwf: number;
  installmentId?: string;
}) {
  const allocations: InstallmentAllocation[] = [];

  if (input.installments.length === 0) {
    return allocations;
  }

  if (input.installmentId) {
    const installment = input.installments.find(
      (item) => item.id === input.installmentId,
    );

    if (!installment) {
      throw new Error("Selected installment was not found.");
    }

    if (installment.balanceRwf <= 0 || installment.status === "paid") {
      throw new Error("This installment is already paid.");
    }

    if (input.amountRwf > installment.balanceRwf) {
      throw new Error(
        "Payment cannot be greater than selected installment balance.",
      );
    }

    allocations.push({
      installment,
      amountRwf: input.amountRwf,
    });

    return allocations;
  }

  let remainingAmount = input.amountRwf;

  for (const installment of input.installments) {
    if (remainingAmount <= 0) break;
    if (installment.balanceRwf <= 0 || installment.status === "paid") continue;

    const amountForThisInstallment = Math.min(
      installment.balanceRwf,
      remainingAmount,
    );

    allocations.push({
      installment,
      amountRwf: amountForThisInstallment,
    });

    remainingAmount -= amountForThisInstallment;
  }

  if (remainingAmount > 0) {
    throw new Error("Payment is greater than remaining installment balances.");
  }

  return allocations;
}

export async function debtsRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("debts.recordPayment")],
    },
    async () => {
      const baseDebts = await db
        .select({
          id: customerDebts.id,
          customerId: customerDebts.customerId,
          saleId: customerDebts.saleId,
          originalAmountRwf: customerDebts.originalAmountRwf,
          amountPaidRwf: customerDebts.amountPaidRwf,
          balanceRwf: customerDebts.balanceRwf,
          status: customerDebts.status,
          expectedPaymentAt: customerDebts.expectedPaymentAt,
          notes: customerDebts.notes,
          createdAt: customerDebts.createdAt,
          customerName: customers.name,
          customerPhone: customers.phone,
          saleNumber: sales.saleNumber,
          createdByName: users.name,
        })
        .from(customerDebts)
        .innerJoin(customers, eq(customerDebts.customerId, customers.id))
        .leftJoin(sales, eq(customerDebts.saleId, sales.id))
        .leftJoin(users, eq(customerDebts.createdById, users.id))
        .orderBy(desc(customerDebts.createdAt));

      const debts = [];

      for (const debt of baseDebts) {
        const installments = await db
          .select()
          .from(customerDebtInstallments)
          .where(eq(customerDebtInstallments.debtId, debt.id))
          .orderBy(customerDebtInstallments.installmentNumber);

        debts.push({
          ...debt,
          installments,
        });
      }

      return {
        ok: true,
        debts,
      };
    },
  );

  app.get(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("debts.recordPayment")],
    },
    async (request, reply) => {
      const params = debtParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid debt ID.",
        });
      }

      const [debt] = await db
        .select({
          id: customerDebts.id,
          customerId: customerDebts.customerId,
          saleId: customerDebts.saleId,
          originalAmountRwf: customerDebts.originalAmountRwf,
          amountPaidRwf: customerDebts.amountPaidRwf,
          balanceRwf: customerDebts.balanceRwf,
          status: customerDebts.status,
          expectedPaymentAt: customerDebts.expectedPaymentAt,
          notes: customerDebts.notes,
          createdAt: customerDebts.createdAt,
          updatedAt: customerDebts.updatedAt,
          customerName: customers.name,
          customerPhone: customers.phone,
          saleNumber: sales.saleNumber,
          createdByName: users.name,
        })
        .from(customerDebts)
        .innerJoin(customers, eq(customerDebts.customerId, customers.id))
        .leftJoin(sales, eq(customerDebts.saleId, sales.id))
        .leftJoin(users, eq(customerDebts.createdById, users.id))
        .where(eq(customerDebts.id, params.data.id))
        .limit(1);

      if (!debt) {
        return reply.code(404).send({
          ok: false,
          message: "Debt not found.",
        });
      }

      const installments = await db
        .select()
        .from(customerDebtInstallments)
        .where(eq(customerDebtInstallments.debtId, debt.id))
        .orderBy(customerDebtInstallments.installmentNumber);

      const payments = await db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.debtId, debt.id))
        .orderBy(desc(debtPayments.createdAt));

      return {
        ok: true,
        debt,
        installments,
        payments,
      };
    },
  );

  app.post(
    "/:id/payments",
    {
      preHandler: [requireAuth, requirePermission("debts.recordPayment")],
    },
    async (request, reply) => {
      const params = debtParamsSchema.safeParse(request.params);
      const parsed = createDebtPaymentSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid debt payment request.",
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const cashControl = await requireOpenCashSession(reply);

      if (!cashControl) {
        return;
      }

      const [debt] = await db
        .select()
        .from(customerDebts)
        .where(eq(customerDebts.id, params.data.id))
        .limit(1);

      if (!debt) {
        return reply.code(404).send({
          ok: false,
          message: "Debt not found.",
        });
      }

      if (debt.balanceRwf <= 0 || debt.status === "paid") {
        return reply.code(400).send({
          ok: false,
          message: "This debt is already paid.",
        });
      }

      if (data.amountRwf > debt.balanceRwf) {
        return reply.code(400).send({
          ok: false,
          message: "Payment cannot be greater than remaining debt balance.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

        const installments = await tx
          .select()
          .from(customerDebtInstallments)
          .where(eq(customerDebtInstallments.debtId, debt.id))
          .orderBy(customerDebtInstallments.installmentNumber);

        const allocations = buildInstallmentAllocations({
          installments,
          amountRwf: data.amountRwf,
          installmentId: data.installmentId,
        });

        const updatedInstallments = [];

        for (const allocation of allocations) {
          const nextAmountPaid =
            allocation.installment.amountPaidRwf + allocation.amountRwf;
          const nextBalance =
            allocation.installment.balanceRwf - allocation.amountRwf;
          const nextStatus = nextBalance <= 0 ? "paid" : "partially_paid";

          const [updatedInstallment] = await tx
            .update(customerDebtInstallments)
            .set({
              amountPaidRwf: nextAmountPaid,
              balanceRwf: nextBalance,
              status: nextStatus,
              paidAt: nextBalance <= 0 ? paidAt : allocation.installment.paidAt,
              updatedAt: new Date(),
            })
            .where(eq(customerDebtInstallments.id, allocation.installment.id))
            .returning();

          updatedInstallments.push(updatedInstallment);
        }

        const createdDebtPayments = [];

        if (allocations.length > 0) {
          for (const allocation of allocations) {
            const [payment] = await tx
              .insert(debtPayments)
              .values({
                debtId: debt.id,
                installmentId: allocation.installment.id,
                saleId: debt.saleId,
                amountRwf: allocation.amountRwf,
                method: data.method,
                note: cleanOptional(data.note),
                receivedById: auth.id,
                paidAt,
              })
              .returning();

            createdDebtPayments.push(payment);
          }
        } else {
          const [payment] = await tx
            .insert(debtPayments)
            .values({
              debtId: debt.id,
              saleId: debt.saleId,
              amountRwf: data.amountRwf,
              method: data.method,
              note: cleanOptional(data.note),
              receivedById: auth.id,
              paidAt,
            })
            .returning();

          createdDebtPayments.push(payment);
        }

        const nextAmountPaid = debt.amountPaidRwf + data.amountRwf;
        const nextBalance = debt.balanceRwf - data.amountRwf;
        const nextStatus = nextBalance <= 0 ? "paid" : "partially_paid";

        const [updatedDebt] = await tx
          .update(customerDebts)
          .set({
            amountPaidRwf: nextAmountPaid,
            balanceRwf: nextBalance,
            status: nextStatus,
            updatedAt: new Date(),
          })
          .where(eq(customerDebts.id, debt.id))
          .returning();

        let updatedSale = null;
        let salePayment = null;

        if (debt.saleId) {
          const [sale] = await tx
            .select()
            .from(sales)
            .where(eq(sales.id, debt.saleId))
            .limit(1);

          if (sale) {
            const nextSaleAmountPaid = sale.amountPaidRwf + data.amountRwf;
            const nextSalePayment = getUpdatedSalePaymentStatus(
              sale.totalAmountRwf,
              nextSaleAmountPaid,
            );

            const [saleUpdate] = await tx
              .update(sales)
              .set({
                amountPaidRwf: nextSaleAmountPaid,
                balanceRwf: nextSalePayment.balanceRwf,
                status: nextSalePayment.status,
                paymentStatus: nextSalePayment.paymentStatus,
                updatedAt: new Date(),
              })
              .where(eq(sales.id, sale.id))
              .returning();

            updatedSale = saleUpdate;

            const [createdSalePayment] = await tx
              .insert(salePayments)
              .values({
                saleId: sale.id,
                amountRwf: data.amountRwf,
                method: data.method,
                note: cleanOptional(data.note) || "Debt payment received.",
                receivedById: auth.id,
                paidAt,
              })
              .returning();

            salePayment = createdSalePayment;
          }
        }

        const firstDebtPayment = createdDebtPayments[0] ?? null;

        const [ledgerEntry] = await tx
          .insert(moneyLedger)
          .values({
            businessDate: cashControl.businessDate || makeBusinessDate(paidAt),
            cashSessionId: cashControl.session.id,
            direction: "money_in",
            amountRwf: data.amountRwf,
            method: data.method,
            category: data.installmentId
              ? "installment_payment"
              : allocations.length > 0
                ? "installment_payment"
                : "debt_payment",
            sourceType: "debt_payment",
            sourceId: debt.id,
            sourceItemId: firstDebtPayment?.id ?? null,
            description: debt.saleId
              ? "Customer debt payment received for sale."
              : "Customer debt payment received.",
            actorUserId: auth.id,
            happenedAt: paidAt,
          })
          .returning();

        return {
          payment: firstDebtPayment,
          payments: createdDebtPayments,
          debt: updatedDebt,
          sale: updatedSale,
          salePayment,
          installments: updatedInstallments,
          ledgerEntry,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "debts.payment_recorded",
        entityType: "customer_debt",
        entityId: debt.id,
        oldValue: debt,
        newValue: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        ...result,
      };
    },
  );
}
