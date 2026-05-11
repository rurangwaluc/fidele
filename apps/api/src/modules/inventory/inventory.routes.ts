import {
  db,
  products,
  stockArrivalItems,
  stockArrivals,
  stockMovements,
  users,
} from "@erc/db";
import { desc, eq, ilike } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const createArrivalSchema = z.object({
  referenceCode: z.string().optional(),
  sourceName: z.string().optional(),
  shipmentReference: z.string().optional(),
  notes: z.string().optional(),
  receivedAt: z.string().datetime().optional(),

  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantityReceived: z.coerce.number().int().min(1),
        damagedQuantity: z.coerce.number().int().min(0).default(0),
        unitCostRwf: z.coerce.number().int().min(0).default(0),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const movementQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const MONTH_CODES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function makeArrivalReference() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `ARR-${y}${m}${d}-${suffix}`;
}

function makeShipmentPrefix(date = new Date()) {
  const month = MONTH_CODES[date.getMonth()];
  const year = date.getFullYear();

  return `DXB-${month}-${year}`;
}

async function makeNextShipmentReference(date = new Date()) {
  const prefix = makeShipmentPrefix(date);

  const rows = await db
    .select({
      shipmentReference: stockArrivals.shipmentReference,
    })
    .from(stockArrivals)
    .where(ilike(stockArrivals.shipmentReference, `${prefix}-%`));

  const highestNumber = rows.reduce((highest, row) => {
    const value = row.shipmentReference || "";
    const match = value.match(new RegExp(`^${prefix}-(\\d{3})$`));

    if (!match) return highest;

    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);

  const nextNumber = String(highestNumber + 1).padStart(3, "0");

  return `${prefix}-${nextNumber}`;
}

export async function inventoryRoutes(app: FastifyInstance) {
  app.get(
    "/next-shipment-reference",
    {
      preHandler: [requireAuth, requirePermission("stock.receive")],
    },
    async () => {
      const shipmentReference = await makeNextShipmentReference();

      return {
        ok: true,
        shipmentReference,
      };
    },
  );

  app.post(
    "/arrivals",
    {
      preHandler: [requireAuth, requirePermission("stock.receive")],
    },
    async (request, reply) => {
      const parsed = createArrivalSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check stock arrival details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      for (const item of data.items) {
        if (item.damagedQuantity > item.quantityReceived) {
          return reply.code(400).send({
            ok: false,
            message:
              "Damaged quantity cannot be greater than received quantity.",
          });
        }

        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        if (!product) {
          return reply.code(404).send({
            ok: false,
            message: "One of the selected products was not found.",
          });
        }
      }

      const receivedDate = data.receivedAt
        ? new Date(data.receivedAt)
        : new Date();

      const referenceCode =
        data.referenceCode?.trim() || makeArrivalReference();

      const shipmentReference =
        data.shipmentReference?.trim() ||
        (await makeNextShipmentReference(receivedDate));

      const [existingReference] = await db
        .select()
        .from(stockArrivals)
        .where(eq(stockArrivals.referenceCode, referenceCode))
        .limit(1);

      if (existingReference) {
        return reply.code(409).send({
          ok: false,
          message: "A stock arrival with this reference already exists.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [arrival] = await tx
          .insert(stockArrivals)
          .values({
            referenceCode,
            sourceName: data.sourceName?.trim(),
            shipmentReference,
            notes: data.notes?.trim(),
            status: "received",
            receivedById: auth.id,
            createdById: auth.id,
            receivedAt: receivedDate,
          })
          .returning();

        const createdItems: (typeof stockArrivalItems.$inferSelect)[] = [];

        for (const item of data.items) {
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId))
            .limit(1);

          if (!product) {
            throw new Error("Product not found during stock arrival.");
          }

          const sellableQuantity = item.quantityReceived - item.damagedQuantity;
          const totalCostRwf = item.quantityReceived * item.unitCostRwf;

          const [arrivalItem] = await tx
            .insert(stockArrivalItems)
            .values({
              arrivalId: arrival.id,
              productId: item.productId,
              quantityReceived: item.quantityReceived,
              damagedQuantity: item.damagedQuantity,
              unitCostRwf: item.unitCostRwf,
              totalCostRwf,
              note: item.note?.trim(),
            })
            .returning();

          createdItems.push(arrivalItem);

          if (sellableQuantity > 0) {
            const quantityBefore = product.currentStock;
            const quantityAfter = quantityBefore + sellableQuantity;

            await tx
              .update(products)
              .set({
                currentStock: quantityAfter,
                updatedAt: new Date(),
              })
              .where(eq(products.id, product.id));

            await tx.insert(stockMovements).values({
              productId: product.id,
              movementType: "stock_arrival",
              quantityChange: sellableQuantity,
              quantityBefore,
              quantityAfter,
              sourceType: "stock_arrival",
              sourceId: arrival.id,
              sourceItemId: arrivalItem.id,
              reason: `New stock received: ${arrival.shipmentReference || arrival.referenceCode}`,
              actorUserId: auth.id,
            });
          }

          if (item.damagedQuantity > 0) {
            const currentQuantityAfterSellable =
              product.currentStock + sellableQuantity;

            await tx.insert(stockMovements).values({
              productId: product.id,
              movementType: "arrival_damaged",
              quantityChange: 0,
              quantityBefore: currentQuantityAfterSellable,
              quantityAfter: currentQuantityAfterSellable,
              sourceType: "stock_arrival",
              sourceId: arrival.id,
              sourceItemId: arrivalItem.id,
              reason: `${item.damagedQuantity} item(s) damaged on arrival`,
              actorUserId: auth.id,
            });
          }
        }

        return {
          arrival,
          items: createdItems,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "stock.arrival_created",
        entityType: "stock_arrival",
        entityId: result.arrival.id,
        newValue: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        arrival: result.arrival,
        items: result.items,
      });
    },
  );

  app.get(
    "/arrivals",
    {
      preHandler: [requireAuth, requirePermission("stock.view")],
    },
    async () => {
      const arrivals = await db
        .select({
          id: stockArrivals.id,
          referenceCode: stockArrivals.referenceCode,
          sourceName: stockArrivals.sourceName,
          shipmentReference: stockArrivals.shipmentReference,
          notes: stockArrivals.notes,
          status: stockArrivals.status,
          receivedAt: stockArrivals.receivedAt,
          createdAt: stockArrivals.createdAt,
          receivedByName: users.name,
        })
        .from(stockArrivals)
        .leftJoin(users, eq(stockArrivals.receivedById, users.id))
        .orderBy(desc(stockArrivals.createdAt));

      const result = [];

      for (const arrival of arrivals) {
        const items = await db
          .select({
            quantityReceived: stockArrivalItems.quantityReceived,
            damagedQuantity: stockArrivalItems.damagedQuantity,
            totalCostRwf: stockArrivalItems.totalCostRwf,
          })
          .from(stockArrivalItems)
          .where(eq(stockArrivalItems.arrivalId, arrival.id));

        result.push({
          ...arrival,
          itemCount: items.length,
          totalQuantityReceived: items.reduce(
            (sum, item) => sum + item.quantityReceived,
            0,
          ),
          totalDamagedQuantity: items.reduce(
            (sum, item) => sum + item.damagedQuantity,
            0,
          ),
          totalCostRwf: items.reduce((sum, item) => sum + item.totalCostRwf, 0),
        });
      }

      return {
        ok: true,
        arrivals: result,
      };
    },
  );

  app.get(
    "/arrivals/:id",
    {
      preHandler: [requireAuth, requirePermission("stock.view")],
    },
    async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid stock arrival ID.",
        });
      }

      const [arrival] = await db
        .select({
          id: stockArrivals.id,
          referenceCode: stockArrivals.referenceCode,
          sourceName: stockArrivals.sourceName,
          shipmentReference: stockArrivals.shipmentReference,
          notes: stockArrivals.notes,
          status: stockArrivals.status,
          receivedAt: stockArrivals.receivedAt,
          createdAt: stockArrivals.createdAt,
          receivedByName: users.name,
        })
        .from(stockArrivals)
        .leftJoin(users, eq(stockArrivals.receivedById, users.id))
        .where(eq(stockArrivals.id, params.data.id))
        .limit(1);

      if (!arrival) {
        return reply.code(404).send({
          ok: false,
          message: "Stock arrival not found.",
        });
      }

      const items = await db
        .select({
          id: stockArrivalItems.id,
          productId: stockArrivalItems.productId,
          productName: products.name,
          sku: products.sku,
          brand: products.brand,
          model: products.model,
          quantityReceived: stockArrivalItems.quantityReceived,
          damagedQuantity: stockArrivalItems.damagedQuantity,
          unitCostRwf: stockArrivalItems.unitCostRwf,
          totalCostRwf: stockArrivalItems.totalCostRwf,
          note: stockArrivalItems.note,
        })
        .from(stockArrivalItems)
        .innerJoin(products, eq(stockArrivalItems.productId, products.id))
        .where(eq(stockArrivalItems.arrivalId, arrival.id));

      return {
        ok: true,
        arrival,
        items,
      };
    },
  );

  app.get(
    "/movements",
    {
      preHandler: [requireAuth, requirePermission("stock.view")],
    },
    async (request) => {
      const query = movementQuerySchema.parse(request.query);

      const selection = {
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        sku: products.sku,
        movementType: stockMovements.movementType,
        quantityChange: stockMovements.quantityChange,
        quantityBefore: stockMovements.quantityBefore,
        quantityAfter: stockMovements.quantityAfter,
        sourceType: stockMovements.sourceType,
        sourceId: stockMovements.sourceId,
        reason: stockMovements.reason,
        actorName: users.name,
        createdAt: stockMovements.createdAt,
      };

      const rows = query.productId
        ? await db
            .select(selection)
            .from(stockMovements)
            .innerJoin(products, eq(stockMovements.productId, products.id))
            .leftJoin(users, eq(stockMovements.actorUserId, users.id))
            .where(eq(stockMovements.productId, query.productId))
            .orderBy(desc(stockMovements.createdAt))
            .limit(query.limit)
        : await db
            .select(selection)
            .from(stockMovements)
            .innerJoin(products, eq(stockMovements.productId, products.id))
            .leftJoin(users, eq(stockMovements.actorUserId, users.id))
            .orderBy(desc(stockMovements.createdAt))
            .limit(query.limit);

      return {
        ok: true,
        movements: rows,
      };
    },
  );
}
