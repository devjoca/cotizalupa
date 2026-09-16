// pnpm test — deterministic, free, runs in CI. See PLAN.md "Tests".
// Each case below is a required behavior; implement in phase order.
import { describe, it } from "vitest";

describe.skip("mechanical validation", () => {
  it(">10 pages rejected", () => {});
  it("encrypted pdf rejected", () => {});
  it("fake mime rejected", () => {});
});

describe.skip("order lifecycle", () => {
  it("payment cannot occur before successful precheck", () => {});
  it("files immutable after PAYMENT_PENDING", () => {});
  it("terminal states set delete_after", () => {});
});

describe.skip("payments", () => {
  it("webhook with bad signature rejected", () => {});
  it("webhook with wrong amount rejected", () => {});
  it("duplicate webhook doesn't duplicate report", () => {});
});

describe.skip("processing", () => {
  it("stale PROCESSING order is reclaimed", () => {});
  it("fourth attempt marks PROCESSING_FAILED", () => {});
  it("invalid model output counts as attempt", () => {});
});
