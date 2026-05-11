import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),

    isActive: boolean("is_active").default(true).notNull(),

    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    phoneUnique: uniqueIndex("customers_phone_unique").on(table.phone),
  }),
);
