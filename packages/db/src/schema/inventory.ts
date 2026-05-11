import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./products.js";
import { users } from "./auth.js";

export const stockArrivals = pgTable(
  "stock_arrivals",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    referenceCode: text("reference_code").notNull(),
    sourceName: text("source_name"),
    shipmentReference: text("shipment_reference"),
    notes: text("notes"),

    status: text("status").default("received").notNull(),

    receivedById: uuid("received_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    referenceCodeUnique: uniqueIndex("stock_arrivals_reference_code_unique").on(
      table.referenceCode,
    ),
  }),
);

export const stockArrivalItems = pgTable("stock_arrival_items", {
  id: uuid("id").defaultRandom().primaryKey(),

  arrivalId: uuid("arrival_id")
    .notNull()
    .references(() => stockArrivals.id, {
      onDelete: "cascade",
    }),

  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, {
      onDelete: "restrict",
    }),

  quantityReceived: integer("quantity_received").notNull(),
  damagedQuantity: integer("damaged_quantity").default(0).notNull(),

  unitCostRwf: integer("unit_cost_rwf").default(0).notNull(),
  totalCostRwf: integer("total_cost_rwf").default(0).notNull(),

  note: text("note"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),

  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, {
      onDelete: "restrict",
    }),

  movementType: text("movement_type").notNull(),

  quantityChange: integer("quantity_change").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),

  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id"),
  sourceItemId: uuid("source_item_id"),

  reason: text("reason"),

  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
