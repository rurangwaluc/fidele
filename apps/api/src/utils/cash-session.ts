import { and, eq } from "drizzle-orm";
import { cashSessions, db } from "@erc/db";

import type { FastifyReply } from "fastify";

export function makeBusinessDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export async function requireOpenCashSession(
  reply: FastifyReply,
  businessDate = makeBusinessDate(),
) {
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.businessDate, businessDate),
        eq(cashSessions.status, "open"),
      ),
    )
    .limit(1);

  if (!session) {
    reply.code(409).send({
      ok: false,
      code: "CASH_SESSION_NOT_OPEN",
      message:
        "Cash session is not open. Open cash before creating sales, receiving payments, or moving money.",
      businessDate,
    });

    return null;
  }

  return {
    businessDate,
    session,
  };
}
