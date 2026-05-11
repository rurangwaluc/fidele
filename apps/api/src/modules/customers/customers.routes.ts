import { customers, db } from "@erc/db";
import { desc, eq, ilike, or } from "drizzle-orm";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const createCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const customerParamsSchema = z.object({
  id: z.string().uuid(),
});

const customerQuerySchema = z.object({
  search: z.string().optional(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export async function customersRoutes(app: FastifyInstance) {
  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("customers.view")],
    },
    async (request) => {
      const query = customerQuerySchema.parse(request.query);

      const rows = query.search?.trim()
        ? await db
            .select()
            .from(customers)
            .where(
              or(
                ilike(customers.name, `%${query.search.trim()}%`),
                ilike(customers.phone, `%${query.search.trim()}%`),
              ),
            )
            .orderBy(desc(customers.createdAt))
        : await db.select().from(customers).orderBy(desc(customers.createdAt));

      return {
        ok: true,
        customers: rows,
      };
    },
  );

  app.post(
    "/",
    {
      preHandler: [requireAuth, requirePermission("customers.create")],
    },
    async (request, reply) => {
      const parsed = createCustomerSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check customer details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;
      const phone = cleanOptional(data.phone);

      if (phone) {
        const [existingPhone] = await db
          .select()
          .from(customers)
          .where(eq(customers.phone, phone))
          .limit(1);

        if (existingPhone) {
          return reply.code(409).send({
            ok: false,
            message: "A customer with this phone number already exists.",
          });
        }
      }

      const [customer] = await db
        .insert(customers)
        .values({
          name: data.name.trim(),
          phone,
          address: cleanOptional(data.address),
          notes: cleanOptional(data.notes),
          isActive: true,
          createdById: auth.id,
        })
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "customers.created",
        entityType: "customer",
        entityId: customer.id,
        newValue: customer,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        customer,
      });
    },
  );

  app.get(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("customers.view")],
    },
    async (request, reply) => {
      const params = customerParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid customer ID.",
        });
      }

      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, params.data.id))
        .limit(1);

      if (!customer) {
        return reply.code(404).send({
          ok: false,
          message: "Customer not found.",
        });
      }

      return {
        ok: true,
        customer,
      };
    },
  );

  app.patch(
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("customers.update")],
    },
    async (request, reply) => {
      const params = customerParamsSchema.safeParse(request.params);
      const parsed = updateCustomerSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid customer update.",
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const [oldCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, params.data.id))
        .limit(1);

      if (!oldCustomer) {
        return reply.code(404).send({
          ok: false,
          message: "Customer not found.",
        });
      }

      const nextPhone =
        data.phone === undefined
          ? oldCustomer.phone
          : cleanOptional(data.phone);

      if (nextPhone && nextPhone !== oldCustomer.phone) {
        const [existingPhone] = await db
          .select()
          .from(customers)
          .where(eq(customers.phone, nextPhone))
          .limit(1);

        if (existingPhone && existingPhone.id !== oldCustomer.id) {
          return reply.code(409).send({
            ok: false,
            message: "Another customer already uses this phone number.",
          });
        }
      }

      const [updated] = await db
        .update(customers)
        .set({
          name: data.name?.trim() ?? oldCustomer.name,
          phone: nextPhone,
          address:
            data.address === undefined
              ? oldCustomer.address
              : cleanOptional(data.address),
          notes:
            data.notes === undefined
              ? oldCustomer.notes
              : cleanOptional(data.notes),
          isActive: data.isActive ?? oldCustomer.isActive,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, oldCustomer.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "customers.updated",
        entityType: "customer",
        entityId: updated.id,
        oldValue: oldCustomer,
        newValue: updated,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        customer: updated,
      };
    },
  );
}
