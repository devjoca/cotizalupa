// Docker PostgreSQL test harness. Every test gets a generated database, applies
// the migrations exactly as shipped, and drops only that database on close.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { Db } from "#/db/client";
import * as schema from "#/db/schema";

export async function setupTestDb(): Promise<{
  db: Db;
  close: () => Promise<void>;
}> {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa_test";
  const database = new URL(connectionString).pathname.slice(1);
  if (database !== "cotizalupa_test") {
    throw new Error("TEST_DATABASE_URL must use the cotizalupa_test database");
  }

  const admin = new Pool({ connectionString });
  const databaseName = `test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${databaseName}`;
  const client = new Pool({ connectionString: testUrl.toString() });

  try {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await client.query(readFileSync(join(dir, file), "utf8"));
    }
  } catch (error) {
    await client.end();
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
    throw error;
  }

  return {
    db: drizzle(client, { schema }),
    close: async () => {
      await client.end();
      await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin.end();
    },
  };
}
