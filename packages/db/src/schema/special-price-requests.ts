import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { products } from "./products.js";
import { users } from "./auth.js";

export const specialPriceRequests = pgTable("special_price_requests", {
  id: uuid("id").defaultRandom().primaryKey(),

  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, {
      onDelete: "restrict",
    }),

  sellerId: uuid("seller_id")
    .notNull()
    .references(() => users.id, {
      onDelete: "restrict",
    }),

  approverId: uuid("approver_id").references(() => users.id, {
    onDelete: "set null",
  }),

  requestedPriceRwf: integer("requested_price_rwf").notNull(),
  normalPriceRwf: integer("normal_price_rwf").notNull(),
  minimumPriceRwf: integer("minimum_price_rwf").notNull(),
  quantity: integer("quantity").default(1).notNull(),

  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(),

  decisionNote: text("decision_note"),

  expiresAt: timestamp("expires_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
