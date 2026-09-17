// PostgreSQL over TCP with `pg` Pool: local Docker and deployed Neon use the
// same driver (persistent process, no serverless driver).
// Lazy singleton: importing this module never connects, so `vite build` and
// `vitest` pass without DATABASE_URL. See PLAN.md "Modelo de datos".
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type PgPool = InstanceType<typeof Pool>;

const LOCAL_DATABASE_URL =
  "postgresql://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa";

export function resolveDatabaseUrl(
  env: Partial<Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "NODE_ENV">> = process.env,
): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required");
  }
  return LOCAL_DATABASE_URL;
}

// Production, local development, and tests all use the same `pg` driver.
export type Db = NodePgDatabase<typeof schema>;

let pool: PgPool | undefined;
let db: Db | undefined;

export function getPool(): PgPool {
  const connectionString = resolveDatabaseUrl();
  pool ??= new Pool({ connectionString });
  return pool;
}

export function getDb(): Db {
  db ??= drizzle(getPool(), { schema });
  return db;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
  db = undefined;
}
