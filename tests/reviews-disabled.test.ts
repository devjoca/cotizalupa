import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

// Execute the real validators and handlers without TanStack's HTTP transport.
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
vi.mock("#/db/client", () => ({ getDb: vi.fn() }));
vi.mock("#/db/orders", () => ({ createCompletedDemoReport: vi.fn() }));
vi.mock("#/server/validation", async (importOriginal) => {
  const original = await importOriginal<typeof import("#/server/validation")>();
  return { ...original, validateAnalysisFiles: vi.fn() };
});
vi.mock("#/server/ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("#/server/ai")>();
  return { ...original, analyzeQuotation: vi.fn() };
});
vi.mock("#/server/analysisGuard", () => ({
  analysisGuard: { takeRateLimit: vi.fn(() => true), tryAcquire: vi.fn(() => vi.fn()) },
}));

import { analyzeAndPersistReport } from "#/server/analyze";
import { getReviewsAvailability } from "#/server/reviews";
import { validateAnalysisFiles } from "#/server/validation";
import { analyzeQuotation } from "#/server/ai";
import { createCompletedDemoReport } from "#/db/orders";
import { getDb } from "#/db/client";
import { analysisGuard } from "#/server/analysisGuard";

const input = {
  files: [{ name: "synthetic.pdf", mime: "application/pdf", dataBase64: "YQ==" }],
  perspective: "customer" as const,
  context: {
    category: "Remodelación" as const,
    other: "",
    amount: "",
    moment: "Estoy por aceptar o pagar un adelanto" as const,
    concern: "",
  },
};
const modelResult = {
  analysis: {
    document: { is_quotation: true, quotation_count: 1, is_legible: true, is_single_commercial_proposal: true, rejection_reason: null },
    quotation_facts: { document_type: "quotation" as const, supplier: null, service: "Remodelación", amount: { value_cents: null, currency: null }, summary: null, scope_summary: null, delivery_summary: null, payment_summary: null },
    clear_items: [], gaps: [], what_if: [], priorities: [],
  },
  usage: { input_tokens: 1, output_tokens: 1 },
  latency_ms: 1, model: "synthetic", prompt_version: "test",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(validateAnalysisFiles).mockResolvedValue([]);
  vi.mocked(analyzeQuotation).mockResolvedValue(modelResult);
  vi.mocked(createCompletedDemoReport).mockResolvedValue({ reportToken: "synthetic-test-only", orderId: "synthetic-order" });
});
afterEach(() => vi.unstubAllEnvs());

describe("review availability", () => {
  it("blocks a direct request before processing or storage", async () => {
    vi.stubEnv("REVIEWS_DISABLED", "true");
    expect(await analyzeAndPersistReport({ data: input })).toMatchObject({ status: "REVIEWS_DISABLED" });
    expect(analysisGuard.takeRateLimit).not.toHaveBeenCalled();
    expect(validateAnalysisFiles).not.toHaveBeenCalled();
    expect(analyzeQuotation).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(createCompletedDemoReport).not.toHaveBeenCalled();
  });

  it.each([undefined, "false"])("preserves free analysis when configured as %s", async (value) => {
    vi.stubEnv("REVIEWS_DISABLED", value);
    expect(await getReviewsAvailability()).toEqual({ reviewsDisabled: false });
    expect(await analyzeAndPersistReport({ data: input })).toMatchObject({ status: "COMPLETED", report_token: "synthetic-test-only" });
    expect(analyzeQuotation).toHaveBeenCalledOnce();
    expect(createCompletedDemoReport).toHaveBeenCalledOnce();
  });

  it("rechecks at submission after a page loaded with reviews enabled", async () => {
    vi.stubEnv("REVIEWS_DISABLED", "false");
    expect(await getReviewsAvailability()).toEqual({ reviewsDisabled: false });
    vi.stubEnv("REVIEWS_DISABLED", "true");
    expect(await analyzeAndPersistReport({ data: input })).toMatchObject({ status: "REVIEWS_DISABLED" });
    expect(await getReviewsAvailability()).toEqual({ reviewsDisabled: true });
    expect(analyzeQuotation).not.toHaveBeenCalled();
  });
});
