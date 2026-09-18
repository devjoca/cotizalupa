import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "#/db/client";
import {
  claimNext,
  createCompletedDemoReport,
  createOrder,
  hashReportToken,
  newReportToken,
  saveReportAndComplete,
  transition,
} from "#/db/orders";
import {
  loadPublicReport,
  loadPublicReportSafely,
} from "#/server/reportLoader";
import { setupTestDb } from "./db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await setupTestDb());
});

afterEach(async () => {
  await close();
});

describe("public report lookup", () => {
  it.each([
    ["PAYMENT_PENDING", "PAYMENT_PENDING"], ["PAID", "PROCESSING"],
    ["PROCESSING", "PROCESSING"], ["PROCESSING_FAILED", "FAILED"],
    ["NOT_ANALYZABLE", "FAILED"], ["REFUNDED", "REFUNDED"], ["EXPIRED", "EXPIRED"],
  ])("shows %s as %s without exposing internal errors", async (stored, visible) => {
    const token = newReportToken();
    const order = await createOrder(db, { reportTokenHash: hashReportToken(token) });
    await transition(db, order.id, "CREATED", stored, { lastError: "internal failure" });
    expect(await loadPublicReport(db, token)).toEqual({ status: visible });
  });

  it("does not present an overdue order as payable before the monthly drain", async () => {
    const token = newReportToken();
    const order = await createOrder(db, { reportTokenHash: hashReportToken(token) });
    await transition(db, order.id, "CREATED", "READY_FOR_PAYMENT", { deleteAfter: new Date(Date.now() - 1000) });
    expect(await loadPublicReport(db, token)).toEqual({ status: "EXPIRED" });
  });
  it("persists a completed demo report behind a new raw token", async () => {
    const saved = await createCompletedDemoReport(db, {
      perspective: "customer",
      category: "Remodelación",
      moment: "Estoy por aceptar o pagar un adelanto",
      amountCents: 3900,
      result: {
        document: {
          is_quotation: true,
          quotation_count: 1,
          is_legible: true,
          is_single_commercial_proposal: true,
          rejection_reason: null,
        },
        clear_items: [{ title: "Precio", detail: "El precio está indicado." }],
        gaps: [],
        what_if: [],
        priorities: [],
      },
      quotationFacts: {
        document_type: "quotation",
        service: "Remodelación",
        supplier: null,
        amount: { value_cents: 3900, currency: "PEN" },
        summary: null,
        scope_summary: null,
        delivery_summary: null,
        payment_summary: null,
      },
      model: "stub",
      promptVersion: "v1",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });

    expect(saved.reportToken).not.toContain(saved.orderId);
    expect(await loadPublicReport(db, saved.reportToken)).toMatchObject({
      status: "COMPLETED",
      analysis: {
        quotation_facts: { service: "Remodelación" },
      },
    });
  });

  it("returns a persisted report only for the matching raw token", async () => {
    const token = newReportToken();
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(token),
    });
    await transition(db, order.id, "CREATED", "PAID", { paidAt: new Date() });
    await claimNext(db);
    await saveReportAndComplete(db, {
      orderId: order.id,
      result: {
        document: {
          is_quotation: true,
          quotation_count: 1,
          is_legible: true,
          is_single_commercial_proposal: true,
          rejection_reason: null,
        },
        clear_items: [{ title: "Precio", detail: "El precio está indicado." }],
        gaps: [],
        what_if: [],
        priorities: [],
      },
      quotationFacts: {
        document_type: "quotation",
        service: "Diseño gráfico",
        supplier: null,
        amount: { value_cents: 3900, currency: "PEN" },
        summary: null,
        scope_summary: null,
        delivery_summary: null,
        payment_summary: null,
      },
    });

    expect(await loadPublicReport(db, newReportToken())).toEqual({
      status: "NOT_FOUND",
    });
    expect(await loadPublicReport(db, token)).toMatchObject({
      status: "COMPLETED",
      analysis: {
        quotation_facts: { service: "Diseño gráfico" },
        clear_items: [{ title: "Precio" }],
      },
    });
  });

  it("does not expose an order that has no report yet", async () => {
    const token = newReportToken();
    await createOrder(db, { reportTokenHash: hashReportToken(token) });

    expect(await loadPublicReport(db, token)).toEqual({ status: "NOT_READY" });
  });

  it("returns unavailable when the database cannot be opened", async () => {
    const openDatabase = () => {
      throw new Error("DATABASE_URL is required");
    };

    expect(await loadPublicReportSafely(openDatabase, "private-token")).toEqual(
      { status: "UNAVAILABLE" },
    );
  });
});
