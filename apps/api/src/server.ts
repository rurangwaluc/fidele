import "dotenv/config";

import Fastify from "fastify";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { cashRoutes } from "./modules/cash/cash.routes.js";
import cors from "@fastify/cors";
import { customersRoutes } from "./modules/customers/customers.routes.js";
import { debtsRoutes } from "./modules/debts/debts.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { problemsRoutes } from "./modules/problems/problems.routes.js";
import { productsRoutes } from "./modules/products/products.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { salesRoutes } from "./modules/sales/sales.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { staffRoutes } from "./modules/staff/staff.routes.js";

const app = Fastify({
  logger: true,
  ignoreTrailingSlash: true,
});

function cleanOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const envAllowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(cleanOrigin)
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultAllowedOrigins.map(cleanOrigin),
  ...envAllowedOrigins,
]);

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const cleanRequestOrigin = cleanOrigin(origin);

    if (allowedOrigins.has(cleanRequestOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

await app.register(authPlugin);

app.get("/", async () => {
  return {
    ok: true,
    service: "electronic-retail-control-api",
    message: "API is running.",
  };
});

app.get("/health", async () => {
  return {
    ok: true,
    service: "electronic-retail-control-api",
  };
});

await app.register(authRoutes, { prefix: "/auth" });
await app.register(staffRoutes, { prefix: "/staff" });
await app.register(productsRoutes, { prefix: "/products" });
await app.register(inventoryRoutes, { prefix: "/inventory" });
await app.register(customersRoutes, { prefix: "/customers" });
await app.register(salesRoutes, { prefix: "/sales" });
await app.register(debtsRoutes, { prefix: "/debts" });
await app.register(cashRoutes, { prefix: "/cash" });
await app.register(expensesRoutes, { prefix: "/expenses" });
await app.register(reportsRoutes, { prefix: "/reports" });
await app.register(problemsRoutes, { prefix: "/problems" });
await app.register(settingsRoutes, { prefix: "/settings" });

const port = Number(process.env.PORT || 5000);

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });

  console.log(`API running on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
