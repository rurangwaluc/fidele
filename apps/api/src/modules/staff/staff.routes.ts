import {
  ALL_PERMISSIONS,
  RESPONSIBILITY_GROUPS,
  RESPONSIBILITY_GROUP_LABELS,
} from "@erc/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  permissions,
  responsibilityGroups,
  userPermissions,
  userResponsibilityGroups,
  users,
} from "@erc/db";
import { requireAuth, requireOwner } from "../auth/auth.middleware.js";

import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { writeAuditLog } from "../../utils/audit.js";
import { z } from "zod";

const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  responsibilityGroupKeys: z.array(z.string()).default([]),
  extraPermissionKeys: z.array(z.string()).default([]),
});

const updateStaffDetailsSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const updateStaffAccessSchema = z.object({
  responsibilityGroupKeys: z.array(z.string()).default([]),
  extraPermissionKeys: z.array(z.string()).default([]),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8),
});

function validateAccessInput(
  responsibilityGroupKeys: string[],
  extraPermissionKeys: string[],
) {
  const validGroups = Object.values(RESPONSIBILITY_GROUPS);

  const invalidGroups = responsibilityGroupKeys.filter(
    (key) => !validGroups.includes(key as any),
  );

  const invalidPermissions = extraPermissionKeys.filter(
    (key) => !ALL_PERMISSIONS.includes(key as any),
  );

  return {
    invalidGroups,
    invalidPermissions,
  };
}

async function replaceStaffAccess(
  staffId: string,
  responsibilityGroupKeys: string[],
  extraPermissionKeys: string[],
) {
  await db
    .delete(userResponsibilityGroups)
    .where(eq(userResponsibilityGroups.userId, staffId));

  await db.delete(userPermissions).where(eq(userPermissions.userId, staffId));

  if (responsibilityGroupKeys.length > 0) {
    const selectedGroups = await db
      .select()
      .from(responsibilityGroups)
      .where(inArray(responsibilityGroups.key, responsibilityGroupKeys));

    if (selectedGroups.length > 0) {
      await db.insert(userResponsibilityGroups).values(
        selectedGroups.map((group) => ({
          userId: staffId,
          responsibilityGroupId: group.id,
        })),
      );
    }
  }

  if (extraPermissionKeys.length > 0) {
    const selectedPermissions = await db
      .select()
      .from(permissions)
      .where(inArray(permissions.key, extraPermissionKeys));

    if (selectedPermissions.length > 0) {
      await db.insert(userPermissions).values(
        selectedPermissions.map((permission) => ({
          userId: staffId,
          permissionId: permission.id,
        })),
      );
    }
  }
}

async function getStaffWithAccess() {
  const staff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users);

  const result = [];

  for (const user of staff) {
    const groupRows = await db
      .select({
        key: responsibilityGroups.key,
        name: responsibilityGroups.name,
      })
      .from(userResponsibilityGroups)
      .innerJoin(
        responsibilityGroups,
        eq(
          userResponsibilityGroups.responsibilityGroupId,
          responsibilityGroups.id,
        ),
      )
      .where(eq(userResponsibilityGroups.userId, user.id));

    const permissionRows = await db
      .select({
        key: permissions.key,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, user.id));

    result.push({
      ...user,
      responsibilityGroups: groupRows,
      extraPermissions: permissionRows.map((row) => row.key),
    });
  }

  return result;
}

export async function staffRoutes(app: FastifyInstance) {
  app.get(
    "/access-options",
    { preHandler: [requireAuth, requireOwner] },
    async () => {
      return {
        ok: true,
        responsibilityGroups: Object.values(RESPONSIBILITY_GROUPS).map(
          (key) => ({
            key,
            label: RESPONSIBILITY_GROUP_LABELS[key],
          }),
        ),
        permissions: ALL_PERMISSIONS,
      };
    },
  );

  app.get("/", { preHandler: [requireAuth, requireOwner] }, async () => {
    const staff = await getStaffWithAccess();

    return {
      ok: true,
      staff,
    };
  });

  app.post(
    "/",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const parsed = createStaffSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Please check staff details.",
          errors: parsed.error.flatten(),
        });
      }

      const auth = request.authUser!;
      const data = parsed.data;

      const activeEmployees = await db
        .select()
        .from(users)
        .where(and(eq(users.role, "employee"), eq(users.isActive, true)));

      if (activeEmployees.length >= 2) {
        return reply.code(400).send({
          ok: false,
          message: "This system is for only two active employees.",
        });
      }

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({
          ok: false,
          message: "A user with this email already exists.",
        });
      }

      const { invalidGroups, invalidPermissions } = validateAccessInput(
        data.responsibilityGroupKeys,
        data.extraPermissionKeys,
      );

      if (invalidGroups.length > 0 || invalidPermissions.length > 0) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid access option selected.",
          invalidGroups,
          invalidPermissions,
        });
      }

      const passwordHash = await bcrypt.hash(data.password, 12);

      const [staff] = await db
        .insert(users)
        .values({
          name: data.name.trim(),
          email: data.email.toLowerCase(),
          phone: data.phone?.trim(),
          passwordHash,
          role: "employee",
          isActive: true,
          createdById: auth.id,
        })
        .returning();

      await replaceStaffAccess(
        staff.id,
        data.responsibilityGroupKeys,
        data.extraPermissionKeys,
      );

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.created",
        entityType: "user",
        entityId: staff.id,
        newValue: {
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          responsibilityGroupKeys: data.responsibilityGroupKeys,
          extraPermissionKeys: data.extraPermissionKeys,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return reply.code(201).send({
        ok: true,
        staff: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          role: staff.role,
          isActive: staff.isActive,
        },
      });
    },
  );

  app.patch(
    "/:id/details",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);
      const parsed = updateStaffDetailsSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid staff update request.",
        });
      }

      const auth = request.authUser!;
      const staffId = params.data.id;
      const data = parsed.data;

      const [staff] = await db
        .select()
        .from(users)
        .where(eq(users.id, staffId))
        .limit(1);

      if (!staff) {
        return reply.code(404).send({
          ok: false,
          message: "Staff not found.",
        });
      }

      if (staff.role === "owner") {
        return reply.code(400).send({
          ok: false,
          message: "Owner account is not edited here.",
        });
      }

      const nextEmail = data.email?.toLowerCase();

      if (nextEmail && nextEmail !== staff.email) {
        const [emailOwner] = await db
          .select()
          .from(users)
          .where(eq(users.email, nextEmail))
          .limit(1);

        if (emailOwner && emailOwner.id !== staff.id) {
          return reply.code(409).send({
            ok: false,
            message: "Another user already uses this email.",
          });
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          name: data.name?.trim() ?? staff.name,
          email: nextEmail ?? staff.email,
          phone: data.phone?.trim() ?? staff.phone,
          updatedAt: new Date(),
        })
        .where(eq(users.id, staff.id))
        .returning();

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.details_updated",
        entityType: "user",
        entityId: staff.id,
        oldValue: {
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
        },
        newValue: {
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        staff: updated,
      };
    },
  );

  app.patch(
    "/:id/access",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);
      const parsed = updateStaffAccessSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid access update request.",
        });
      }

      const auth = request.authUser!;
      const staffId = params.data.id;
      const data = parsed.data;

      const [staff] = await db
        .select()
        .from(users)
        .where(eq(users.id, staffId))
        .limit(1);

      if (!staff) {
        return reply.code(404).send({
          ok: false,
          message: "Staff not found.",
        });
      }

      if (staff.role === "owner") {
        return reply.code(400).send({
          ok: false,
          message: "Owner already has full control.",
        });
      }

      const { invalidGroups, invalidPermissions } = validateAccessInput(
        data.responsibilityGroupKeys,
        data.extraPermissionKeys,
      );

      if (invalidGroups.length > 0 || invalidPermissions.length > 0) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid access option selected.",
          invalidGroups,
          invalidPermissions,
        });
      }

      await replaceStaffAccess(
        staffId,
        data.responsibilityGroupKeys,
        data.extraPermissionKeys,
      );

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.access_updated",
        entityType: "user",
        entityId: staffId,
        newValue: {
          responsibilityGroupKeys: data.responsibilityGroupKeys,
          extraPermissionKeys: data.extraPermissionKeys,
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        message: "Staff access updated.",
      };
    },
  );

  app.patch(
    "/:id/reset-password",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);
      const parsed = resetPasswordSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid password reset request.",
        });
      }

      const auth = request.authUser!;

      const [staff] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.data.id))
        .limit(1);

      if (!staff) {
        return reply.code(404).send({
          ok: false,
          message: "Staff not found.",
        });
      }

      if (staff.role === "owner") {
        return reply.code(400).send({
          ok: false,
          message: "Owner password is not reset here.",
        });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);

      await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, staff.id));

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.password_reset",
        entityType: "user",
        entityId: staff.id,
        reason: "Owner reset employee password",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        message: "Staff password reset.",
      };
    },
  );

  app.patch(
    "/:id/deactivate",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid staff ID.",
        });
      }

      const auth = request.authUser!;

      const [staff] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.data.id))
        .limit(1);

      if (!staff) {
        return reply.code(404).send({
          ok: false,
          message: "Staff not found.",
        });
      }

      if (staff.role === "owner") {
        return reply.code(400).send({
          ok: false,
          message: "Owner account cannot be deactivated.",
        });
      }

      await db
        .update(users)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, staff.id));

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.deactivated",
        entityType: "user",
        entityId: staff.id,
        oldValue: { isActive: staff.isActive },
        newValue: { isActive: false },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        message: "Staff account deactivated.",
      };
    },
  );

  app.patch(
    "/:id/activate",
    { preHandler: [requireAuth, requireOwner] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid() })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({
          ok: false,
          message: "Invalid staff ID.",
        });
      }

      const auth = request.authUser!;

      const [staff] = await db
        .select()
        .from(users)
        .where(eq(users.id, params.data.id))
        .limit(1);

      if (!staff) {
        return reply.code(404).send({
          ok: false,
          message: "Staff not found.",
        });
      }

      if (staff.role === "owner") {
        return reply.code(400).send({
          ok: false,
          message: "Owner account does not need activation here.",
        });
      }

      const activeEmployees = await db
        .select()
        .from(users)
        .where(and(eq(users.role, "employee"), eq(users.isActive, true)));

      if (!staff.isActive && activeEmployees.length >= 2) {
        return reply.code(400).send({
          ok: false,
          message: "This system allows only two active employees.",
        });
      }

      await db
        .update(users)
        .set({
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, staff.id));

      await writeAuditLog({
        actorUserId: auth.id,
        action: "staff.activated",
        entityType: "user",
        entityId: staff.id,
        oldValue: { isActive: staff.isActive },
        newValue: { isActive: true },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return {
        ok: true,
        message: "Staff account activated.",
      };
    },
  );
}
