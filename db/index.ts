import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

type DatabaseGlobal = typeof globalThis & {
  neonPool?: Pool;
  neonPoolUrl?: string;
};

const globalForDb = globalThis as DatabaseGlobal;

/**
 * The HTTP driver is ideal for one-shot queries but cannot run interactive
 * transactions. This app uses transactions when creating assignments, leasing
 * jobs, and processing webhooks, so it needs Neon's WebSocket-capable pool.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");

  if (!globalForDb.neonPool || globalForDb.neonPoolUrl !== url) {
    globalForDb.neonPool = new Pool({ connectionString: url });
    globalForDb.neonPoolUrl = url;
  }

  return drizzle(globalForDb.neonPool, { schema });
}
