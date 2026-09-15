// Neon Postgres over TCP with `pg` Pool (persistent process, no serverless driver).
// See PLAN.md "Modelo de datos" and AGENTS.md. TODO: phase 1 — implement schema.
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
