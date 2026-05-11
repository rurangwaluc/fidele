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
import { staffRoutes } from "./modules/staff/staff.routes.js";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

await app.register(authPlugin);

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

const port = Number(process.env.PORT || 5000);

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });

  console.log(`API running on http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
