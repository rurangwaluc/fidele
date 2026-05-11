import { db, expenseCategories, expenses, moneyLedger, users } from "@erc/db";
import { desc, eq, ilike, or } from "drizzle-orm";
import {
  makeBusinessDate,
  requireOpenCashSession,
} from "../../utils/cash-session.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const expenseMethodSchema = z.enum(["cash", "momo", "bank", "card", "other"]);

const createExpenseSchema = z.object({
  categoryName: z.string().min(2),

  title: z.string().min(2),
  description: z.string().optional(),

  amountRwf: z.coerce.number().int().min(1),

  method: expenseMethodSchema.default("cash"),

  paidAt: z.string().datetime().optional(),
});

const rejectExpenseSchema = z.object({
  reason: z.string().min(2).optional(),
});

const listExpenseQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
});

const expenseParamsSchema = z.object({
  id: z.string().uuid(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function makeExpensePrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `EXP-${y}${m}${d}`;
}

async function makeNextExpenseNumber(date = new Date()) {
  const prefix = makeExpensePrefix(date);

  const rows = await db
    .select({
      expenseNumber: expenses.expenseNumber,
    })
    .from(expenses)
    .where(ilike(expenses.expenseNumber, `${prefix}-%`));

  const highestNumber = rows.reduce((highest, row) => {
    const value = row.expenseNumber || "";
    const match = value.match(new RegExp(`^${prefix}-(\\d{3})$`));

    if (!match) return highest;

    const number = Number(match[1]);

    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);

  const nextNumber = String(highestNumber + 1).padStart(3, "0");

  return `${prefix}-${nextNumber}`;
}

async function getOrCreateExpenseCategory(name: string) {
  const cleanName = name.trim();

  const [existing] = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.name, cleanName))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(expenseCategories)
    .values({
      name: cleanName,
      isActive: 1,
    })
    .returning();

  return created;
}

export async function expensesRoutes(app: FastifyInstance) {
  app.get(
    "/categories",
    {
      preHandler: [requireAuth, requirePermission("expenses.create")],
    },
    async () => {
      const categories = await db
        .select()
        .from(expenseCategories)
        .orderBy(expenseCategories.name);

      return {
        ok: true,
        categories,
      };
    },
  );

  app.get(
    "/",
    {
      preHandler: [requireAuth, requirePermission("expenses.create")],
    },
    async (request, reply) => {
      const query = listExpenseQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid expense query.",
        });
      }

      const selection = {
        id: expenses.id,
        expenseNumber: expenses.expenseNumber,
        categoryId: expenses.categoryId,
        categoryNameSnapshot: expenses.categoryNameSnapshot,
        title: expenses.title,
        description: expenses.description,
        amountRwf: expenses.amountRwf,
        method: expenses.method,
        status: expenses.status,
        isActive: expenses.isActive,
        paidAt: expenses.paidAt,
        createdById: expenses.createdById,
        createdByName: users.name,
        approvedById: expenses.approvedById,
        approvedAt: expenses.approvedAt,
        rejectedById: expenses.rejectedById,
        rejectedAt: expenses.rejectedAt,
        rejectionReason: expenses.rejectionReason,
        ledgerEntryId: expenses.ledgerEntryId,
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt,
      };

      const rows = query.data.search
        ? await db
            .select(selection)
            .from(expenses)
            .leftJoin(users, eq(expenses.createdById, users.id))
            .where(
              or(
                ilike(expenses.expenseNumber, `%${query.data.search}%`),
                ilike(expenses.title, `%${query.data.search}%`),
                ilike(expenses.categoryNameSnapshot, `%${query.data.search}%`),
                ilike(expenses.description, `%${query.data.search}%`),
              ),
            )
            .orderBy(desc(expenses.createdAt))
        : await db
            .select(selection)
            .from(expenses)
            .leftJoin(users, eq(expenses.createdById, users.id))
            .orderBy(desc(expenses.createdAt));

      const filteredRows = query.data.status
        ? rows.filter((row) => row.status === query.data.status)
        : rows;

      return {
        ok: true,
        expenses: filteredRows,
      };
    },
  );

  app.post(
    "/",
    {
      preHandler: [requireAuth, requirePermission("expenses.create")],
    },
    async (request, reply) => {
      const parsed = createExpenseSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check expense details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
      const expenseNumber = await makeNextExpenseNumber(paidAt);
      const category = await getOrCreateExpenseCategory(data.categoryName);

      const isOwner = auth.role === "owner";

      let cashControl: Awaited<ReturnType<typeof requireOpenCashSession>> =
        null;

      if (isOwner) {
        cashControl = await requireOpenCashSession(
          reply,
          makeBusinessDate(paidAt),
        );

        if (!cashControl) {
          return;
        }
      }

      const result = await db.transaction(async (tx) => {
        const [createdExpense] = await tx
          .insert(expenses)
          .values({
            expenseNumber,
            categoryId: category.id,
            categoryNameSnapshot: category.name,
            title: data.title.trim(),
            description: cleanOptional(data.description),
            amountRwf: data.amountRwf,
            method: data.method,
            status: isOwner ? "approved" : "waiting_owner_review",
            isActive: 1,
            paidAt: isOwner ? paidAt : null,
            createdById: auth.id,
            approvedById: isOwner ? auth.id : null,
            approvedAt: isOwner ? new Date() : null,
          })
          .returning();

        let ledgerEntry = null;

        if (isOwner && cashControl) {
          const [entry] = await tx
            .insert(moneyLedger)
            .values({
              businessDate: cashControl.businessDate,
              cashSessionId: cashControl.session.id,
              direction: "money_out",
              amountRwf: data.amountRwf,
              method: data.method,
              category: "expense",
              sourceType: "expense",
              sourceId: createdExpense.id,
              description: `${createdExpense.expenseNumber}: ${createdExpense.title}`,
              actorUserId: auth.id,
              happenedAt: paidAt,
            })
            .returning();

          ledgerEntry = entry;

          const [updatedExpense] = await tx
            .update(expenses)
            .set({
              ledgerEntryId: entry.id,
              updatedAt: new Date(),
            })
            .where(eq(expenses.id, createdExpense.id))
            .returning();

          return {
            expense: updatedExpense,
            ledgerEntry,
          };
        }

        return {
          expense: createdExpense,
          ledgerEntry,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: isOwner
          ? "expenses.created_and_approved"
          : "expenses.created_waiting_owner_review",
        entityType: "expense",
        entityId: result.expense.id,
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
    "/:id",
    {
      preHandler: [requireAuth, requirePermission("expenses.create")],
    },
    async (request, reply) => {
      const params = expenseParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid expense ID.",
        });
      }

      const [expense] = await db
        .select({
          id: expenses.id,
          expenseNumber: expenses.expenseNumber,
          categoryId: expenses.categoryId,
          categoryNameSnapshot: expenses.categoryNameSnapshot,
          title: expenses.title,
          description: expenses.description,
          amountRwf: expenses.amountRwf,
          method: expenses.method,
          status: expenses.status,
          isActive: expenses.isActive,
          paidAt: expenses.paidAt,
          createdById: expenses.createdById,
          createdByName: users.name,
          approvedById: expenses.approvedById,
          approvedAt: expenses.approvedAt,
          rejectedById: expenses.rejectedById,
          rejectedAt: expenses.rejectedAt,
          rejectionReason: expenses.rejectionReason,
          ledgerEntryId: expenses.ledgerEntryId,
          createdAt: expenses.createdAt,
          updatedAt: expenses.updatedAt,
        })
        .from(expenses)
        .leftJoin(users, eq(expenses.createdById, users.id))
        .where(eq(expenses.id, params.data.id))
        .limit(1);

      if (!expense) {
        return reply.code(404).send({
          ok: false,
          message: "Expense not found.",
        });
      }

      return {
        ok: true,
        expense,
      };
    },
  );

  app.patch(
    "/:id/approve",
    {
      preHandler: [requireAuth, requirePermission("expenses.approve")],
    },
    async (request, reply) => {
      const params = expenseParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid expense ID.",
        });
      }

      const auth = request.authUser!;

      const [oldExpense] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, params.data.id))
        .limit(1);

      if (!oldExpense) {
        return reply.code(404).send({
          ok: false,
          message: "Expense not found.",
        });
      }

      if (oldExpense.status === "approved") {
        return reply.code(400).send({
          ok: false,
          message: "Expense is already approved.",
        });
      }

      if (oldExpense.status === "rejected") {
        return reply.code(400).send({
          ok: false,
          message: "Rejected expense cannot be approved.",
        });
      }

      if (oldExpense.isActive !== 1) {
        return reply.code(400).send({
          ok: false,
          message: "Inactive expense cannot be approved.",
        });
      }

      const paidAt = new Date();

      const cashControl = await requireOpenCashSession(
        reply,
        makeBusinessDate(paidAt),
      );

      if (!cashControl) {
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [ledgerEntry] = await tx
          .insert(moneyLedger)
          .values({
            businessDate: cashControl.businessDate,
            cashSessionId: cashControl.session.id,
            direction: "money_out",
            amountRwf: oldExpense.amountRwf,
            method: oldExpense.method,
            category: "expense",
            sourceType: "expense",
            sourceId: oldExpense.id,
            description: `${oldExpense.expenseNumber}: ${oldExpense.title}`,
            actorUserId: auth.id,
            happenedAt: paidAt,
          })
          .returning();

        const [approvedExpense] = await tx
          .update(expenses)
          .set({
            status: "approved",
            paidAt,
            approvedById: auth.id,
            approvedAt: new Date(),
            ledgerEntryId: ledgerEntry.id,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, oldExpense.id))
          .returning();

        return {
          expense: approvedExpense,
          ledgerEntry,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "expenses.approved",
        entityType: "expense",
        entityId: oldExpense.id,
        oldValue: oldExpense,
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

  app.patch(
    "/:id/reject",
    {
      preHandler: [requireAuth, requirePermission("expenses.approve")],
    },
    async (request, reply) => {
      const params = expenseParamsSchema.safeParse(request.params);
      const parsed = rejectExpenseSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid expense rejection.",
        });
      }

      const auth = request.authUser!;

      const [oldExpense] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, params.data.id))
        .limit(1);

      if (!oldExpense) {
        return reply.code(404).send({
          ok: false,
          message: "Expense not found.",
        });
      }

      if (oldExpense.status === "approved") {
        return reply.code(400).send({
          ok: false,
          message: "Approved expense cannot be rejected.",
        });
      }

      const [expense] = await db
        .update(expenses)
        .set({
          status: "rejected",
          rejectedById: auth.id,
          rejectedAt: new Date(),
          rejectionReason: cleanOptional(parsed.data.reason),
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, oldExpense.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "expenses.rejected",
        entityType: "expense",
        entityId: oldExpense.id,
        oldValue: oldExpense,
        newValue: expense,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        expense,
      };
    },
  );

  app.patch(
    "/:id/deactivate",
    {
      preHandler: [requireAuth, requirePermission("expenses.approve")],
    },
    async (request, reply) => {
      const params = expenseParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid expense ID.",
        });
      }

      const auth = request.authUser!;

      const [oldExpense] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, params.data.id))
        .limit(1);

      if (!oldExpense) {
        return reply.code(404).send({
          ok: false,
          message: "Expense not found.",
        });
      }

      if (oldExpense.status === "approved") {
        return reply.code(400).send({
          ok: false,
          message:
            "Approved expense already affected the money ledger and cannot be deactivated here.",
        });
      }

      const [expense] = await db
        .update(expenses)
        .set({
          isActive: 0,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, oldExpense.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "expenses.deactivated",
        entityType: "expense",
        entityId: oldExpense.id,
        oldValue: oldExpense,
        newValue: expense,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        expense,
      };
    },
  );
}
