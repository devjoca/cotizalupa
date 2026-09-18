import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: <S extends z.ZodType>(schema: S) => ({
      handler: <R>(handler: (input: { data: z.output<S> }) => R) =>
        ({ data }: { data: z.input<S> }) => handler({ data: schema.parse(data) }),
    }),
    handler: <R>(handler: () => R) => handler,
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestIP: () => "test" }));
vi.mock("#/server/monitoring", () => ({ captureOperationalError: vi.fn() }));
vi.mock("#/server/prepareOrder", () => ({ prepareOrder: vi.fn() }));
vi.mock("#/server/analysisGuard", () => ({
  analysisGuard: { takeRateLimit: vi.fn(() => true), tryAcquire: vi.fn(() => vi.fn()) },
}));
import { prepareReview } from "#/server/analyze";
import { getReviewsAvailability } from "#/server/reviews";
import { prepareOrder } from "#/server/prepareOrder";
import { analysisGuard } from "#/server/analysisGuard";

const input = {
  files: [{ name: "synthetic.pdf", mime: "application/pdf", dataBase64: "YQ==" }],
  perspective: "customer" as const,
  context: { category: "Remodelación" as const, other: "", amount: "", moment: "Estoy por aceptar o pagar un adelanto" as const, concern: "" },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVIEWS_DISABLED", "false");
  vi.mocked(prepareOrder).mockResolvedValue({ status: "READY_FOR_PAYMENT", report_token: "synthetic-test-only" });
});
afterEach(() => vi.unstubAllEnvs());

describe("review submission boundary", () => {
  it("blocks direct submissions when disabled", async () => {
    vi.stubEnv("REVIEWS_DISABLED", "true");
    expect(await prepareReview({ data: input })).toMatchObject({ status: "REVIEWS_DISABLED" });
    expect(analysisGuard.takeRateLimit).not.toHaveBeenCalled();
    expect(prepareOrder).not.toHaveBeenCalled();
  });
  it("returns a payment-ready link rather than a free report", async () => {
    expect(await prepareReview({ data: input })).toMatchObject({ status: "READY_FOR_PAYMENT", report_token: "synthetic-test-only" });
    expect(prepareOrder).toHaveBeenCalledOnce();
  });
  it("rechecks availability after the page loaded", async () => {
    expect(await getReviewsAvailability()).toEqual({ reviewsDisabled: false });
    vi.stubEnv("REVIEWS_DISABLED", "true");
    expect(await prepareReview({ data: input })).toMatchObject({ status: "REVIEWS_DISABLED" });
    expect(prepareOrder).not.toHaveBeenCalled();
  });
  it("refuses concurrent submissions before decoding and releases capacity on failure", async () => {
    vi.mocked(analysisGuard.tryAcquire).mockReturnValueOnce(null);
    expect(await prepareReview({ data: input })).toMatchObject({ status: "BUSY" });
    expect(prepareOrder).not.toHaveBeenCalled();
    const release = vi.fn();
    vi.mocked(analysisGuard.tryAcquire).mockReturnValueOnce(release);
    vi.mocked(prepareOrder).mockRejectedValueOnce(new Error("private internal error"));
    const result = await prepareReview({ data: input });
    expect(result.status).toBe("PREPARATION_FAILED");
    expect(JSON.stringify(result)).not.toContain("private internal error");
    expect(release).toHaveBeenCalledOnce();
  });
});
