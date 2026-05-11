import { db, productCategories, products } from "@erc/db";
import { desc, eq, ilike, or } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const createProductSchema = z.object({
  name: z.string().min(2),
  sku: z.string().optional(),

  categoryName: z.string().optional(),

  brand: z.string().optional(),
  model: z.string().optional(),
  description: z.string().optional(),

  buyingPriceRwf: z.coerce.number().int().min(0).default(0),
  sellingPriceRwf: z.coerce.number().int().min(0).default(0),
  minSellingPriceRwf: z.coerce.number().int().min(0).default(0),

  lowStockAlert: z.coerce.number().int().min(0).default(1),
  warrantyText: z.string().optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  categoryName: z.string().optional(),

  brand: z.string().optional(),
  model: z.string().optional(),
  description: z.string().optional(),

  lowStockAlert: z.coerce.number().int().min(0).optional(),
  warrantyText: z.string().optional(),
});

const updatePriceSchema = z.object({
  buyingPriceRwf: z.coerce.number().int().min(0).optional(),
  sellingPriceRwf: z.coerce.number().int().min(0).optional(),
  minSellingPriceRwf: z.coerce.number().int().min(0).optional(),
  reason: z.string().min(2).optional(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
});

function cleanSkuPart(value?: string) {
  if (!value) return [];

  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .filter(Boolean);
}

function normalizeManualSku(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeSku(name: string, brand?: string, model?: string) {
  const tokens = [
    ...cleanSkuPart(brand),
    ...cleanSkuPart(model),
    ...cleanSkuPart(name),
  ];

  const uniqueTokens = Array.from(new Set(tokens));
  const base = uniqueTokens.join("-").slice(0, 32).replace(/-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `${base || "PRODUCT"}-${suffix}`;
}

async function getOrCreateCategory(name?: string) {
  if (!name?.trim()) return null;

  const cleanName = name.trim();

  const [existing] = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.name, cleanName))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(productCategories)
    .values({
      name: cleanName,
    })
    .returning();

  return created;
}

export async function productsRoutes(app: FastifyInstance) {
  app.get(
    "/categories",
    {
      preHandler: [requireAuth, requirePermission("products.view")],
    },
    async () => {
      const categories = await db
        .select()
        .from(productCategories)
        .orderBy(productCategories.name);

      return {
        ok: true,
        categories,
      };
    },
  );

  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("products.view")],
    },
    async (request) => {
      const query = listQuerySchema.parse(request.query);

      const selection = {
        id: products.id,
        name: products.name,
        sku: products.sku,
        brand: products.brand,
        model: products.model,
        description: products.description,
        buyingPriceRwf: products.buyingPriceRwf,
        sellingPriceRwf: products.sellingPriceRwf,
        minSellingPriceRwf: products.minSellingPriceRwf,
        currentStock: products.currentStock,
        lowStockAlert: products.lowStockAlert,
        warrantyText: products.warrantyText,
        reviewStatus: products.reviewStatus,
        isActive: products.isActive,
        createdAt: products.createdAt,
        categoryName: productCategories.name,
      };

      const rows = query.search
        ? await db
            .select(selection)
            .from(products)
            .leftJoin(
              productCategories,
              eq(products.categoryId, productCategories.id),
            )
            .where(
              or(
                ilike(products.name, `%${query.search}%`),
                ilike(products.sku, `%${query.search}%`),
                ilike(products.brand, `%${query.search}%`),
                ilike(products.model, `%${query.search}%`),
              ),
            )
            .orderBy(desc(products.createdAt))
        : await db
            .select(selection)
            .from(products)
            .leftJoin(
              productCategories,
              eq(products.categoryId, productCategories.id),
            )
            .orderBy(desc(products.createdAt));

      return {
        ok: true,
        products: rows,
      };
    },
  );

  app.post(
    "/",
    {
      preHandler: [requireAuth, requirePermission("products.create")],
    },
    async (request, reply) => {
      const parsed = createProductSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check product details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const category = await getOrCreateCategory(data.categoryName);

      const sku = data.sku?.trim()
        ? normalizeManualSku(data.sku)
        : makeSku(data.name, data.brand, data.model);

      const [existingSku] = await db
        .select()
        .from(products)
        .where(eq(products.sku, sku))
        .limit(1);

      if (existingSku) {
        return reply.code(409).send({
          ok: false,
          message: "A product with this SKU already exists.",
        });
      }

      const [product] = await db
        .insert(products)
        .values({
          name: data.name.trim(),
          sku,
          categoryId: category?.id ?? null,

          brand: data.brand?.trim(),
          model: data.model?.trim(),
          description: data.description?.trim(),

          buyingPriceRwf: data.buyingPriceRwf,
          sellingPriceRwf: data.sellingPriceRwf,
          minSellingPriceRwf: data.minSellingPriceRwf,

          currentStock: 0,
          lowStockAlert: data.lowStockAlert,
          warrantyText: data.warrantyText?.trim(),

          reviewStatus:
            auth.role === "owner" ? "approved" : "waiting_owner_review",
          createdById: auth.id,
        })
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "products.created",
        entityType: "product",
        entityId: product.id,
        newValue: product,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        product,
      });
    },
  );

  app.get(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("products.view")],
    },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid product ID.",
        });
      }

      const [product] = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          brand: products.brand,
          model: products.model,
          description: products.description,
          buyingPriceRwf: products.buyingPriceRwf,
          sellingPriceRwf: products.sellingPriceRwf,
          minSellingPriceRwf: products.minSellingPriceRwf,
          currentStock: products.currentStock,
          lowStockAlert: products.lowStockAlert,
          warrantyText: products.warrantyText,
          reviewStatus: products.reviewStatus,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          categoryName: productCategories.name,
        })
        .from(products)
        .leftJoin(
          productCategories,
          eq(products.categoryId, productCategories.id),
        )
        .where(eq(products.id, params.data.id))
        .limit(1);

      if (!product) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      return {
        ok: true,
        product,
      };
    },
  );

  app.patch(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("products.update")],
    },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      const parsed = updateProductSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid product update.",
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const [oldProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, params.data.id))
        .limit(1);

      if (!oldProduct) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      const category = await getOrCreateCategory(data.categoryName);

      const [updated] = await db
        .update(products)
        .set({
          name: data.name?.trim() ?? oldProduct.name,
          categoryId: category?.id ?? oldProduct.categoryId,

          brand: data.brand?.trim() ?? oldProduct.brand,
          model: data.model?.trim() ?? oldProduct.model,
          description: data.description?.trim() ?? oldProduct.description,

          lowStockAlert: data.lowStockAlert ?? oldProduct.lowStockAlert,
          warrantyText: data.warrantyText?.trim() ?? oldProduct.warrantyText,

          updatedAt: new Date(),
        })
        .where(eq(products.id, oldProduct.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "products.updated",
        entityType: "product",
        entityId: updated.id,
        oldValue: oldProduct,
        newValue: updated,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        product: updated,
      };
    },
  );

  app.patch(
    "/:id/prices",
    {
      preHandler: [requireAuth, requirePermission("products.updatePrice")],
    },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      const parsed = updatePriceSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid price update.",
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const [oldProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, params.data.id))
        .limit(1);

      if (!oldProduct) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      const [updated] = await db
        .update(products)
        .set({
          buyingPriceRwf: data.buyingPriceRwf ?? oldProduct.buyingPriceRwf,
          sellingPriceRwf: data.sellingPriceRwf ?? oldProduct.sellingPriceRwf,
          minSellingPriceRwf:
            data.minSellingPriceRwf ?? oldProduct.minSellingPriceRwf,
          reviewStatus:
            auth.role === "owner" ? "approved" : "waiting_owner_review",
          updatedAt: new Date(),
        })
        .where(eq(products.id, oldProduct.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "products.price_updated",
        entityType: "product",
        entityId: updated.id,
        oldValue: {
          buyingPriceRwf: oldProduct.buyingPriceRwf,
          sellingPriceRwf: oldProduct.sellingPriceRwf,
          minSellingPriceRwf: oldProduct.minSellingPriceRwf,
        },
        newValue: {
          buyingPriceRwf: updated.buyingPriceRwf,
          sellingPriceRwf: updated.sellingPriceRwf,
          minSellingPriceRwf: updated.minSellingPriceRwf,
        },
        reason: data.reason,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        product: updated,
      };
    },
  );

  app.patch(
    "/:id/deactivate",
    {
      preHandler: [requireAuth, requirePermission("products.update")],
    },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid product ID.",
        });
      }

      const auth = request.authUser!;

      const [oldProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, params.data.id))
        .limit(1);

      if (!oldProduct) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      const [updated] = await db
        .update(products)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(products.id, oldProduct.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "products.deactivated",
        entityType: "product",
        entityId: oldProduct.id,
        oldValue: { isActive: oldProduct.isActive },
        newValue: { isActive: false },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        product: updated,
      };
    },
  );

  app.patch(
    "/:id/activate",
    {
      preHandler: [requireAuth, requirePermission("products.update")],
    },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid product ID.",
        });
      }

      const auth = request.authUser!;

      const [oldProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, params.data.id))
        .limit(1);

      if (!oldProduct) {
        return reply.code(404).send({
          ok: false,
          message: "Product not found.",
        });
      }

      const [updated] = await db
        .update(products)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(products.id, oldProduct.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "products.activated",
        entityType: "product",
        entityId: oldProduct.id,
        oldValue: { isActive: oldProduct.isActive },
        newValue: { isActive: true },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        product: updated,
      };
    },
  );
}
