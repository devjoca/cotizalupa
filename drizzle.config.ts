import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Neon Postgres over TCP with `pg` Pool. Set DATABASE_URL in .env (see .env.example).
    url: process.env.DATABASE_URL ?? "",
  },
});
