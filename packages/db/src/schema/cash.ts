import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    businessDate: text("business_date").notNull(),

    status: text("status").default("open").notNull(),

    openingFloatRwf: integer("opening_float_rwf").default(0).notNull(),
    expectedCashRwf: integer("expected_cash_rwf").default(0).notNull(),
    countedCashRwf: integer("counted_cash_rwf"),
    differenceRwf: integer("difference_rwf").default(0).notNull(),

    openedById: uuid("opened_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    closedById: uuid("closed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    closedAt: timestamp("closed_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    businessDateUnique: uniqueIndex("cash_sessions_business_date_unique").on(
      table.businessDate,
    ),
    statusIdx: index("cash_sessions_status_idx").on(table.status),
  }),
);

export const moneyLedger = pgTable(
  "money_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    businessDate: text("business_date").notNull(),

    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "set null",
    }),

    direction: text("direction").notNull(),

    amountRwf: integer("amount_rwf").notNull(),

    method: text("method").default("cash").notNull(),

    category: text("category").notNull(),

    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    sourceItemId: uuid("source_item_id"),

    description: text("description"),

    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    happenedAt: timestamp("happened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    businessDateIdx: index("money_ledger_business_date_idx").on(
      table.businessDate,
    ),
    sourceIdx: index("money_ledger_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    methodIdx: index("money_ledger_method_idx").on(table.method),
    categoryIdx: index("money_ledger_category_idx").on(table.category),
    actorIdx: index("money_ledger_actor_idx").on(table.actorUserId),
  }),
);
