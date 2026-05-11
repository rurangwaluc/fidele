import { and, eq, isNull } from "drizzle-orm";
import { db, sessions, users } from "@erc/db";

import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { requireAuth } from "./auth.middleware.js";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: "Please enter a valid email and password.",
        errors: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      await writeAuditLog({
        action: "auth.login_failed",
        entityType: "user",
        reason: "Email not found",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(401).send({
        ok: false,
        message: "Wrong email or password.",
      });
    }

    if (!user.isActive) {
      return reply.code(403).send({
        ok: false,
        message: "This account is inactive. Ask the owner.",
      });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
      await writeAuditLog({
        actorUserId: user.id,
        action: "auth.login_failed",
        entityType: "user",
        entityId: user.id,
        reason: "Wrong password",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(401).send({
        ok: false,
        message: "Wrong email or password.",
      });
    }

    const tokenId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        tokenId,
        expiresAt,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      })
      .returning();

    const token = app.jwt.sign(
      {
        userId: user.id,
        sessionId: session.id,
        tokenId,
      },
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    );

    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login_success",
      entityType: "user",
      entityId: user.id,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    return {
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  });

  app.post("/logout", { preHandler: [requireAuth] }, async (request) => {
    const auth = request.authUser!;

    await db
      .update(sessions)
      .set({
        revokedAt: new Date(),
      })
      .where(and(eq(sessions.userId, auth.id), isNull(sessions.revokedAt)));

    await writeAuditLog({
      actorUserId: auth.id,
      action: "auth.logout",
      entityType: "user",
      entityId: auth.id,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    return {
      ok: true,
      message: "Logged out.",
    };
  });

  app.get("/me", { preHandler: [requireAuth] }, async (request) => {
    const auth = request.authUser!;

    return {
      ok: true,
      user: {
        id: auth.id,
        name: auth.name,
        email: auth.email,
        phone: auth.phone,
        role: auth.role,
        permissions: auth.permissions,
      },
    };
  });
}
