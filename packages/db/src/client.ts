import "dotenv/config";

import * as schema from "./schema/index.js";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

export const sql = postgres(process.env.DATABASE_URL, {
  max: 10,
});

export const db = drizzle(sql, { schema });
