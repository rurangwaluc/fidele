import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    description: text("description"),

    isActive: integer("is_active").default(1).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameIdx: index("expense_categories_name_idx").on(table.name),
    activeIdx: index("expense_categories_active_idx").on(table.isActive),
  }),
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    expenseNumber: text("expense_number").notNull(),

    categoryId: uuid("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),

    categoryNameSnapshot: text("category_name_snapshot").notNull(),

    title: text("title").notNull(),
    description: text("description"),

    amountRwf: integer("amount_rwf").notNull(),

    method: text("method").default("cash").notNull(),

    status: text("status").default("waiting_owner_review").notNull(),

    isActive: integer("is_active").default(1).notNull(),

    paidAt: timestamp("paid_at", { withTimezone: true }),

    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    approvedById: uuid("approved_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    approvedAt: timestamp("approved_at", { withTimezone: true }),

    rejectedById: uuid("rejected_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    rejectedAt: timestamp("rejected_at", { withTimezone: true }),

    rejectionReason: text("rejection_reason"),

    ledgerEntryId: uuid("ledger_entry_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    expenseNumberIdx: index("expenses_expense_number_idx").on(
      table.expenseNumber,
    ),
    statusIdx: index("expenses_status_idx").on(table.status),
    categoryIdx: index("expenses_category_idx").on(table.categoryId),
    createdByIdx: index("expenses_created_by_idx").on(table.createdById),
    activeIdx: index("expenses_active_idx").on(table.isActive),
  }),
);
