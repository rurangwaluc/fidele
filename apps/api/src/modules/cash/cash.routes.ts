import { cashSessions, db, moneyLedger, users } from "@erc/db";
import { desc, eq } from "drizzle-orm";
import {
  makeBusinessDate,
  requireOpenCashSession,
} from "../../utils/cash-session.js";
import { requireAuth, requirePermission } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const cashQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const openCashSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  openingFloatRwf: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional(),
});

const reopenCashSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional(),
});

const closeCashSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  countedCashRwf: z.coerce.number().int().min(0),
  notes: z.string().optional(),
});

const manualMovementSchema = z.object({
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  direction: z.enum(["money_in", "money_out"]),
  amountRwf: z.coerce.number().int().min(1),
  method: z.enum(["cash", "momo", "bank", "card", "other"]).default("cash"),
  category: z.string().min(2),
  description: z.string().optional(),
});

function cleanOptional(value?: string) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function summarizeLedger(
  ledgerRows: {
    direction: string;
    method: string;
    amountRwf: number;
  }[],
  openingFloatRwf = 0,
) {
  const totals = {
    moneyInRwf: 0,
    moneyOutRwf: 0,

    cashInRwf: 0,
    cashOutRwf: 0,

    momoInRwf: 0,
    momoOutRwf: 0,

    bankInRwf: 0,
    bankOutRwf: 0,

    cardInRwf: 0,
    cardOutRwf: 0,

    otherInRwf: 0,
    otherOutRwf: 0,

    expectedCashRwf: openingFloatRwf,
  };

  for (const row of ledgerRows) {
    const amount = Number(row.amountRwf || 0);

    if (row.direction === "money_in") {
      totals.moneyInRwf += amount;

      if (row.method === "cash") totals.cashInRwf += amount;
      if (row.method === "momo") totals.momoInRwf += amount;
      if (row.method === "bank") totals.bankInRwf += amount;
      if (row.method === "card") totals.cardInRwf += amount;
      if (row.method === "other") totals.otherInRwf += amount;
    }

    if (row.direction === "money_out") {
      totals.moneyOutRwf += amount;

      if (row.method === "cash") totals.cashOutRwf += amount;
      if (row.method === "momo") totals.momoOutRwf += amount;
      if (row.method === "bank") totals.bankOutRwf += amount;
      if (row.method === "card") totals.cardOutRwf += amount;
      if (row.method === "other") totals.otherOutRwf += amount;
    }
  }

  totals.expectedCashRwf =
    openingFloatRwf + totals.cashInRwf - totals.cashOutRwf;

  return totals;
}

export async function cashRoutes(app: FastifyInstance) {
  app.get(
    "/today",
    {
      preHandler: [requireAuth, requirePermission("cash.receivePayment")],
    },
    async (request, reply) => {
      const query = cashQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid cash date.",
        });
      }

      const businessDate = query.data.date || makeBusinessDate();

      const [session] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      const ledger = await db
        .select({
          id: moneyLedger.id,
          businessDate: moneyLedger.businessDate,
          cashSessionId: moneyLedger.cashSessionId,
          direction: moneyLedger.direction,
          amountRwf: moneyLedger.amountRwf,
          method: moneyLedger.method,
          category: moneyLedger.category,
          sourceType: moneyLedger.sourceType,
          sourceId: moneyLedger.sourceId,
          sourceItemId: moneyLedger.sourceItemId,
          description: moneyLedger.description,
          actorUserId: moneyLedger.actorUserId,
          actorName: users.name,
          happenedAt: moneyLedger.happenedAt,
          createdAt: moneyLedger.createdAt,
        })
        .from(moneyLedger)
        .leftJoin(users, eq(moneyLedger.actorUserId, users.id))
        .where(eq(moneyLedger.businessDate, businessDate))
        .orderBy(desc(moneyLedger.happenedAt));

      const totals = summarizeLedger(
        ledger,
        Number(session?.openingFloatRwf || 0),
      );

      return {
        ok: true,
        businessDate,
        session: session || null,
        totals,
        ledger,
      };
    },
  );

  app.post(
    "/open",
    {
      preHandler: [requireAuth, requirePermission("cash.receivePayment")],
    },
    async (request, reply) => {
      const parsed = openCashSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid cash opening details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;
      const businessDate = data.businessDate || makeBusinessDate();

      const [existingSession] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      if (existingSession) {
        return reply.code(409).send({
          ok: false,
          message:
            existingSession.status === "closed"
              ? "Cash session already exists and is closed. Use reopen cash instead."
              : "Cash session already exists for this date.",
          session: existingSession,
        });
      }

      const [session] = await db
        .insert(cashSessions)
        .values({
          businessDate,
          status: "open",
          openingFloatRwf: data.openingFloatRwf,
          expectedCashRwf: data.openingFloatRwf,
          openedById: auth.id,
          notes: cleanOptional(data.notes),
        })
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "cash.opened",
        entityType: "cash_session",
        entityId: session.id,
        newValue: session,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        session,
      });
    },
  );

  app.patch(
    "/reopen",
    {
      preHandler: [requireAuth, requirePermission("cash.closeDay")],
    },
    async (request, reply) => {
      const parsed = reopenCashSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid cash reopening details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;

      if (auth.role !== "owner") {
        return reply.code(403).send({
          ok: false,
          message: "Only the owner can reopen a closed cash session.",
        });
      }

      const data = parsed.data;
      const businessDate = data.businessDate || makeBusinessDate();

      const [session] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      if (!session) {
        return reply.code(404).send({
          ok: false,
          message: "Cash session was not found for this date.",
        });
      }

      if (session.status === "open") {
        return reply.code(400).send({
          ok: false,
          message: "Cash session is already open.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [updatedSession] = await tx
          .update(cashSessions)
          .set({
            status: "open",
            countedCashRwf: null,
            differenceRwf: 0,
            closedById: null,
            closedAt: null,
            notes: cleanOptional(data.notes) || session.notes,
            updatedAt: new Date(),
          })
          .where(eq(cashSessions.id, session.id))
          .returning();

        const [reopenLog] = await tx
          .insert(moneyLedger)
          .values({
            businessDate,
            cashSessionId: session.id,
            direction: "neutral",
            amountRwf: 0,
            method: "cash",
            category: "cash_reopened",
            sourceType: "cash_session",
            sourceId: session.id,
            description:
              cleanOptional(data.notes) ||
              "Owner reopened this cash session after it was closed.",
            actorUserId: auth.id,
            happenedAt: new Date(),
          })
          .returning();

        return {
          session: updatedSession,
          reopenLog,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "cash.reopened",
        entityType: "cash_session",
        entityId: session.id,
        oldValue: session,
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

  app.post(
    "/close",
    {
      preHandler: [requireAuth, requirePermission("cash.closeDay")],
    },
    async (request, reply) => {
      const parsed = closeCashSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid cash closing details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;
      const businessDate = data.businessDate || makeBusinessDate();

      const [session] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      if (!session) {
        return reply.code(404).send({
          ok: false,
          message: "Open cash session was not found for this date.",
        });
      }

      if (session.status === "closed") {
        return reply.code(400).send({
          ok: false,
          message: "Cash session is already closed.",
        });
      }

      const ledger = await db
        .select()
        .from(moneyLedger)
        .where(eq(moneyLedger.businessDate, businessDate));

      const totals = summarizeLedger(
        ledger,
        Number(session.openingFloatRwf || 0),
      );

      const countedCashRwf = data.countedCashRwf;
      const differenceRwf = countedCashRwf - totals.expectedCashRwf;

      const result = await db.transaction(async (tx) => {
        const [updatedSession] = await tx
          .update(cashSessions)
          .set({
            status: "closed",
            expectedCashRwf: totals.expectedCashRwf,
            countedCashRwf,
            differenceRwf,
            closedById: auth.id,
            closedAt: new Date(),
            notes: cleanOptional(data.notes) || session.notes,
            updatedAt: new Date(),
          })
          .where(eq(cashSessions.id, session.id))
          .returning();

        const [differenceLog] = await tx
          .insert(moneyLedger)
          .values({
            businessDate,
            cashSessionId: session.id,
            direction: "neutral",
            amountRwf: Math.abs(differenceRwf),
            method: "cash",
            category: "cash_closing_difference",
            sourceType: "cash_session",
            sourceId: session.id,
            description:
              differenceRwf === 0
                ? "Cash closing balanced."
                : differenceRwf > 0
                  ? `Cash surplus of Rwf ${differenceRwf}.`
                  : `Cash shortage of Rwf ${Math.abs(differenceRwf)}.`,
            actorUserId: auth.id,
            happenedAt: new Date(),
          })
          .returning();

        return {
          session: updatedSession,
          differenceLog,
        };
      });

      await writeAuditLog({
        actorUserId: auth.id,
        action: "cash.closed",
        entityType: "cash_session",
        entityId: session.id,
        oldValue: session,
        newValue: result,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        ...result,
        totals,
      };
    },
  );

  app.get(
    "/ledger",
    {
      preHandler: [requireAuth, requirePermission("cash.receivePayment")],
    },
    async (request, reply) => {
      const query = cashQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid cash date.",
        });
      }

      const businessDate = query.data.date || makeBusinessDate();

      const ledger = await db
        .select({
          id: moneyLedger.id,
          businessDate: moneyLedger.businessDate,
          cashSessionId: moneyLedger.cashSessionId,
          direction: moneyLedger.direction,
          amountRwf: moneyLedger.amountRwf,
          method: moneyLedger.method,
          category: moneyLedger.category,
          sourceType: moneyLedger.sourceType,
          sourceId: moneyLedger.sourceId,
          sourceItemId: moneyLedger.sourceItemId,
          description: moneyLedger.description,
          actorUserId: moneyLedger.actorUserId,
          actorName: users.name,
          happenedAt: moneyLedger.happenedAt,
          createdAt: moneyLedger.createdAt,
        })
        .from(moneyLedger)
        .leftJoin(users, eq(moneyLedger.actorUserId, users.id))
        .where(eq(moneyLedger.businessDate, businessDate))
        .orderBy(desc(moneyLedger.happenedAt));

      const [session] = await db
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.businessDate, businessDate))
        .limit(1);

      const totals = summarizeLedger(
        ledger,
        Number(session?.openingFloatRwf || 0),
      );

      return {
        ok: true,
        businessDate,
        session: session || null,
        totals,
        ledger,
      };
    },
  );

  app.post(
    "/ledger/manual",
    {
      preHandler: [requireAuth, requirePermission("cash.closeDay")],
    },
    async (request, reply) => {
      const parsed = manualMovementSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid money movement.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;
      const businessDate = data.businessDate || makeBusinessDate();

      const cashControl = await requireOpenCashSession(reply, businessDate);

      if (!cashControl) {
        return;
      }

      const [movement] = await db
        .insert(moneyLedger)
        .values({
          businessDate: cashControl.businessDate,
          cashSessionId: cashControl.session.id,
          direction: data.direction,
          amountRwf: data.amountRwf,
          method: data.method,
          category: data.category.trim(),
          sourceType: "manual_money_movement",
          description: cleanOptional(data.description),
          actorUserId: auth.id,
          happenedAt: new Date(),
        })
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "cash.manual_movement_created",
        entityType: "money_ledger",
        entityId: movement.id,
        newValue: movement,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        movement,
      });
    },
  );
}
