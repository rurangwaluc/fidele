import { db, products, specialPriceRequests, users } from "@erc/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const requestSpecialPriceSchema = z.object({
  productId: z.string().uuid(),
  requestedPriceRwf: z.coerce.number().int().min(0),
  quantity: z.coerce.number().int().min(1).default(1),
  reason: z.string().min(3),
});

const decisionSchema = z.object({
  decisionNote: z.string().optional(),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function expiresInMinutes(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

export async function specialPriceRoutes(app: FastifyInstance) {
  app.post(
    "/request",
    {
      preHandler: [requireAuth, requirePermission("specialPrice.request")],
    },
    async (request, reply) => {
      const parsed = requestSpecialPriceSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check special price request details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, data.productId))
        .limit(1);

      if (!product) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      if (!product.isActive) {
        return reply.code(400).send({
          ok: false,
          message: "Inactive product cannot be sold.",
        });
      }

      if (data.quantity > product.currentStock) {
        return reply.code(400).send({
          ok: false,
          message: `${product.name} has only ${product.currentStock} in stock.`,
        });
      }

      if (data.requestedPriceRwf >= product.minSellingPriceRwf) {
        return reply.code(400).send({
          ok: false,
          message:
            "Approval is only required below minimum price. This price can continue without approval.",
        });
      }

      const [createdRequest] = await db
        .insert(specialPriceRequests)
        .values({
          productId: product.id,
          sellerId: auth.id,
          requestedPriceRwf: data.requestedPriceRwf,
          normalPriceRwf: product.sellingPriceRwf,
          minimumPriceRwf: product.minSellingPriceRwf,
          quantity: data.quantity,
          reason: data.reason.trim(),
          status: "pending",
          expiresAt: expiresInMinutes(30),
        })
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "special_price.requested",
        entityType: "special_price_request",
        entityId: createdRequest.id,
        newValue: createdRequest,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        request: createdRequest,
      });
    },
  );

  app.get(
    "/pending",
    {
      preHandler: [requireAuth, requirePermission("specialPrice.approve")],
    },
    async () => {
      const rows = await db
        .select({
          id: specialPriceRequests.id,
          productId: specialPriceRequests.productId,
          productName: products.name,
          productSku: products.sku,
          sellerId: specialPriceRequests.sellerId,
          sellerName: users.name,
          requestedPriceRwf: specialPriceRequests.requestedPriceRwf,
          normalPriceRwf: specialPriceRequests.normalPriceRwf,
          minimumPriceRwf: specialPriceRequests.minimumPriceRwf,
          quantity: specialPriceRequests.quantity,
          reason: specialPriceRequests.reason,
          status: specialPriceRequests.status,
          expiresAt: specialPriceRequests.expiresAt,
          createdAt: specialPriceRequests.createdAt,
        })
        .from(specialPriceRequests)
        .leftJoin(products, eq(specialPriceRequests.productId, products.id))
        .leftJoin(users, eq(specialPriceRequests.sellerId, users.id))
        .where(eq(specialPriceRequests.status, "pending"))
        .orderBy(desc(specialPriceRequests.createdAt));

      return {
        ok: true,
        requests: rows,
      };
    },
  );

  app.post(
    "/:id/approve",
    {
      preHandler: [requireAuth, requirePermission("specialPrice.approve")],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const parsed = decisionSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check approval request.",
        });
      }

      const auth = request.authUser!;

      const [existingRequest] = await db
        .select()
        .from(specialPriceRequests)
        .where(eq(specialPriceRequests.id, params.data.id))
        .limit(1);

      if (!existingRequest) {
        return reply.code(404).send({
          ok: false,
          message: "Special price request not found.",
        });
      }

      if (existingRequest.status !== "pending") {
        return reply.code(400).send({
          ok: false,
          message: "This request has already been reviewed.",
        });
      }

      if (
        existingRequest.expiresAt &&
        new Date(existingRequest.expiresAt).getTime() < Date.now()
      ) {
        await db
          .update(specialPriceRequests)
          .set({
            status: "expired",
            updatedAt: new Date(),
          })
          .where(eq(specialPriceRequests.id, existingRequest.id));

        return reply.code(400).send({
          ok: false,
          message: "This request has expired. Ask seller to request again.",
        });
      }

      const [approvedRequest] = await db
        .update(specialPriceRequests)
        .set({
          status: "approved",
          approverId: auth.id,
          decisionNote: cleanOptional(parsed.data.decisionNote),
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(specialPriceRequests.id, existingRequest.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "special_price.approved",
        entityType: "special_price_request",
        entityId: approvedRequest.id,
        oldValue: existingRequest,
        newValue: approvedRequest,
        reason: cleanOptional(parsed.data.decisionNote) || undefined,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        request: approvedRequest,
      };
    },
  );

  app.post(
    "/:id/reject",
    {
      preHandler: [requireAuth, requirePermission("specialPrice.approve")],
    },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const parsed = decisionSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check rejection request.",
        });
      }

      const auth = request.authUser!;

      const [existingRequest] = await db
        .select()
        .from(specialPriceRequests)
        .where(eq(specialPriceRequests.id, params.data.id))
        .limit(1);

      if (!existingRequest) {
        return reply.code(404).send({
          ok: false,
          message: "Special price request not found.",
        });
      }

      if (existingRequest.status !== "pending") {
        return reply.code(400).send({
          ok: false,
          message: "This request has already been reviewed.",
        });
      }

      const [rejectedRequest] = await db
        .update(specialPriceRequests)
        .set({
          status: "rejected",
          approverId: auth.id,
          decisionNote: cleanOptional(parsed.data.decisionNote),
          rejectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(specialPriceRequests.id, existingRequest.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "special_price.rejected",
        entityType: "special_price_request",
        entityId: rejectedRequest.id,
        oldValue: existingRequest,
        newValue: rejectedRequest,
        reason: cleanOptional(parsed.data.decisionNote) || undefined,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        request: rejectedRequest,
      };
    },
  );
}
