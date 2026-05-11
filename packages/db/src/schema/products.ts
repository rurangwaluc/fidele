import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    description: text("description"),

    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex("product_categories_name_unique").on(table.name),
  }),
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: text("name").notNull(),
    sku: text("sku").notNull(),

    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),

    brand: text("brand"),
    model: text("model"),
    description: text("description"),

    buyingPriceRwf: integer("buying_price_rwf").default(0).notNull(),
    sellingPriceRwf: integer("selling_price_rwf").default(0).notNull(),
    minSellingPriceRwf: integer("min_selling_price_rwf").default(0).notNull(),

    currentStock: integer("current_stock").default(0).notNull(),
    lowStockAlert: integer("low_stock_alert").default(1).notNull(),

    warrantyText: text("warranty_text"),

    reviewStatus: text("review_status").default("approved").notNull(),
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
    skuUnique: uniqueIndex("products_sku_unique").on(table.sku),
  }),
);
