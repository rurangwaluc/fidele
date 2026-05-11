import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  permissions,
  responsibilityGroupPermissions,
  responsibilityGroups,
  sessions,
  userPermissions,
  userResponsibilityGroups,
  users,
} from "@erc/db";

type AuthTokenPayload = {
  userId: string;
  sessionId: string;
  tokenId: string;
};

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();

    const token = request.user as AuthTokenPayload;

    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, token.sessionId),
          eq(sessions.userId, token.userId),
          isNull(sessions.revokedAt),
          sql`${sessions.expiresAt} > now()`,
        ),
      )
      .limit(1);

    if (!session) {
      await reply.code(401).send({
        ok: false,
        message: "Session expired. Please login again.",
      });
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);

    if (!user || !user.isActive) {
      await reply.code(401).send({
        ok: false,
        message: "Account is not active.",
      });
      return;
    }

    if (user.role === "owner") {
      request.authUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: "owner",
        permissions: ["*"],
      };

      return;
    }

    const groupPermissionRows = await db
      .select({ key: permissions.key })
      .from(userResponsibilityGroups)
      .innerJoin(
        responsibilityGroups,
        eq(
          userResponsibilityGroups.responsibilityGroupId,
          responsibilityGroups.id,
        ),
      )
      .innerJoin(
        responsibilityGroupPermissions,
        eq(
          responsibilityGroups.id,
          responsibilityGroupPermissions.responsibilityGroupId,
        ),
      )
      .innerJoin(
        permissions,
        eq(responsibilityGroupPermissions.permissionId, permissions.id),
      )
      .where(eq(userResponsibilityGroups.userId, user.id));

    const directPermissionRows = await db
      .select({ key: permissions.key })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, user.id));

    const permissionSet = new Set<string>();

    for (const row of groupPermissionRows) {
      permissionSet.add(row.key);
    }

    for (const row of directPermissionRows) {
      permissionSet.add(row.key);
    }

    request.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: "employee",
      permissions: [...permissionSet],
    };
  } catch {
    await reply.code(401).send({
      ok: false,
      message: "Login required.",
    });
  }
}

export async function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.authUser?.role !== "owner") {
    await reply.code(403).send({
      ok: false,
      message: "Only the owner can do this.",
    });
    return;
  }
}

export function requirePermission(permission: string) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.authUser?.role === "owner") {
      return;
    }

    if (!request.authUser?.permissions.includes(permission)) {
      await reply.code(403).send({
        ok: false,
        message: "You are not allowed to do this. Ask the owner.",
      });
      return;
    }
  };
}
