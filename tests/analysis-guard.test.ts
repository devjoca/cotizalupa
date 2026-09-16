import { describe, expect, it } from "vitest";

import { AnalysisGuard } from "#/server/analysisGuard";

describe("analysis guard", () => {
  it("limits each key inside an hourly window and resets afterward", () => {
    const guard = new AnalysisGuard({ hourlyLimit: 2, concurrencyLimit: 1 });
    expect(guard.takeRateLimit("ip", 0)).toBe(true);
    expect(guard.takeRateLimit("ip", 1)).toBe(true);
    expect(guard.takeRateLimit("ip", 2)).toBe(false);
    expect(guard.takeRateLimit("ip", 60 * 60 * 1000)).toBe(true);
  });

  it("caps concurrent work and releases a slot only once", () => {
    const guard = new AnalysisGuard({ hourlyLimit: 1, concurrencyLimit: 1 });
    const release = guard.tryAcquire();
    expect(release).not.toBeNull();
    expect(guard.tryAcquire()).toBeNull();
    release?.();
    release?.();
    expect(guard.tryAcquire()).not.toBeNull();
  });
});
