import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { customers } from "./customers.js";
import { products } from "./products.js";
import { users } from "./auth.js";

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    saleNumber: text("sale_number").notNull(),

    customerType: text("customer_type").default("walk_in").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    walkInName: text("walk_in_name"),

    status: text("status").default("paid").notNull(),
    paymentStatus: text("payment_status").default("paid").notNull(),

    subtotalRwf: integer("subtotal_rwf").default(0).notNull(),
    discountRwf: integer("discount_rwf").default(0).notNull(),
    totalAmountRwf: integer("total_amount_rwf").default(0).notNull(),
    amountPaidRwf: integer("amount_paid_rwf").default(0).notNull(),
    balanceRwf: integer("balance_rwf").default(0).notNull(),

    expectedPaymentAt: timestamp("expected_payment_at", {
      withTimezone: true,
    }),

    notes: text("notes"),

    soldById: uuid("sold_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

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
    saleNumberUnique: uniqueIndex("sales_sale_number_unique").on(
      table.saleNumber,
    ),
  }),
);

export const saleItems = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(),

  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, {
      onDelete: "cascade",
    }),

  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, {
      onDelete: "restrict",
    }),

  productNameSnapshot: text("product_name_snapshot").notNull(),
  skuSnapshot: text("sku_snapshot").notNull(),

  quantity: integer("quantity").notNull(),
  unitPriceRwf: integer("unit_price_rwf").notNull(),
  minSellingPriceRwf: integer("min_selling_price_rwf").default(0).notNull(),
  lineTotalRwf: integer("line_total_rwf").notNull(),

  soldBelowMinimum: boolean("sold_below_minimum").default(false).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const salePayments = pgTable("sale_payments", {
  id: uuid("id").defaultRandom().primaryKey(),

  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, {
      onDelete: "cascade",
    }),

  amountRwf: integer("amount_rwf").notNull(),
  method: text("method").default("cash").notNull(),
  note: text("note"),

  receivedById: uuid("received_by_id").references(() => users.id, {
    onDelete: "set null",
  }),

  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const customerDebts = pgTable("customer_debts", {
  id: uuid("id").defaultRandom().primaryKey(),

  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, {
      onDelete: "restrict",
    }),

  saleId: uuid("sale_id").references(() => sales.id, {
    onDelete: "set null",
  }),

  originalAmountRwf: integer("original_amount_rwf").notNull(),
  amountPaidRwf: integer("amount_paid_rwf").default(0).notNull(),
  balanceRwf: integer("balance_rwf").notNull(),

  status: text("status").default("pending").notNull(),

  expectedPaymentAt: timestamp("expected_payment_at", {
    withTimezone: true,
  }),

  notes: text("notes"),

  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const customerDebtInstallments = pgTable("customer_debt_installments", {
  id: uuid("id").defaultRandom().primaryKey(),

  debtId: uuid("debt_id")
    .notNull()
    .references(() => customerDebts.id, {
      onDelete: "cascade",
    }),

  saleId: uuid("sale_id").references(() => sales.id, {
    onDelete: "set null",
  }),

  installmentNumber: integer("installment_number").notNull(),

  expectedAmountRwf: integer("expected_amount_rwf").notNull(),
  amountPaidRwf: integer("amount_paid_rwf").default(0).notNull(),
  balanceRwf: integer("balance_rwf").notNull(),

  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),

  status: text("status").default("pending").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const debtPayments = pgTable("debt_payments", {
  id: uuid("id").defaultRandom().primaryKey(),

  debtId: uuid("debt_id")
    .notNull()
    .references(() => customerDebts.id, {
      onDelete: "cascade",
    }),

  installmentId: uuid("installment_id").references(
    () => customerDebtInstallments.id,
    {
      onDelete: "set null",
    },
  ),

  saleId: uuid("sale_id").references(() => sales.id, {
    onDelete: "set null",
  }),

  amountRwf: integer("amount_rwf").notNull(),
  method: text("method").default("cash").notNull(),
  note: text("note"),

  receivedById: uuid("received_by_id").references(() => users.id, {
    onDelete: "set null",
  }),

  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
