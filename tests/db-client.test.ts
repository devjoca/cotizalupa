import { describe, expect, it } from "vitest";

import { resolveDatabaseUrl } from "#/db/client";

describe("database configuration", () => {
  it("uses the Docker Compose database by default outside production", () => {
    expect(resolveDatabaseUrl({ NODE_ENV: "development" })).toBe(
      "postgresql://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa",
    );
  });

  it("uses an explicit database URL in every environment", () => {
    expect(
      resolveDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://configured/database",
      }),
    ).toBe("postgresql://configured/database");
  });

  it("requires an explicit database URL in production", () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required",
    );
  });
});
