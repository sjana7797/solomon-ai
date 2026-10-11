import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./schema/relations";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

export const db = drizzle({
  client: pool,
  relations,
});

export * from "./schema";
