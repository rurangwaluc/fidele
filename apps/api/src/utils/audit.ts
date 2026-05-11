import { auditLogs, db } from "@erc/db";

type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function writeAuditLog(input: AuditInput) {
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue as Record<string, unknown> | undefined,
    newValue: input.newValue as Record<string, unknown> | undefined,
    reason: input.reason,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });
}