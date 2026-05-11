import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),

    passwordHash: text("password_hash").notNull(),

    role: text("role").notNull(), // owner | employee
    isActive: boolean("is_active").default(true).notNull(),

    createdById: uuid("created_by_id"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    keyUnique: uniqueIndex("permissions_key_unique").on(table.key),
  }),
);

export const responsibilityGroups = pgTable(
  "responsibility_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    keyUnique: uniqueIndex("responsibility_groups_key_unique").on(table.key),
  }),
);

export const responsibilityGroupPermissions = pgTable(
  "responsibility_group_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    responsibilityGroupId: uuid("responsibility_group_id")
      .notNull()
      .references(() => responsibilityGroups.id, { onDelete: "cascade" }),

    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueGroupPermission: uniqueIndex(
      "responsibility_group_permissions_group_id_permission_id_unique",
    ).on(table.responsibilityGroupId, table.permissionId),
  }),
);

export const userResponsibilityGroups = pgTable(
  "user_responsibility_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    responsibilityGroupId: uuid("responsibility_group_id")
      .notNull()
      .references(() => responsibilityGroups.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueUserGroup: uniqueIndex(
      "user_responsibility_groups_user_id_group_id_unique",
    ).on(table.userId, table.responsibilityGroupId),
  }),
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueUserPermission: uniqueIndex(
      "user_permissions_user_id_permission_id_unique",
    ).on(table.userId, table.permissionId),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  tokenId: text("token_id").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),

  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),

  reason: text("reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
