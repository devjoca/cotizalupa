import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "#/db/client";
import { orderFiles, orders, reports } from "#/db/schema";
import { expireStaleUnpaidOrders, findOrderByTokenHash, hashReportToken, markRefunded, paidFailuresNeedingAction, transition } from "#/db/orders";
import * as ai from "#/server/ai";
import { analysisCases, caseUploads } from "../fixtures/analysis";
import { prepareOrder } from "#/server/prepareOrder";
import { loadAnalysisFiles, sweepDueOriginals, writeOriginal } from "#/server/storage";
import { loadPublicReport } from "#/server/reportLoader";
import { processNext } from "#/server/process";
import { setupTestDb } from "./db";

const input = {
  files: [{ name: "private-original-name.png", mime: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }],
  perspective: "customer" as const,
  context: { service_category: "Remodelación", approximate_amount_cents: 999999, moment: "Estoy por aceptar o pagar un adelanto" as const, concern: "Synthetic concern" },
};
let db: Db;
let close: () => Promise<void>;
beforeEach(async () => { ({ db, close } = await setupTestDb()); });
afterEach(async () => { await close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("upload to payment-ready order", () => {
  it("does not call the model or persist mechanically invalid input", async () => {
    const write = vi.fn();
    const result = await prepareOrder({ ...input, files: [{ ...input.files[0]!, dataBase64: "%%" }] }, { getDatabase: () => db, write });
    expect(result.status).toBe("INVALID_UPLOAD");
    expect(write).not.toHaveBeenCalled();
    expect(await db.select().from(orders)).toEqual([]);
  });
  it("commits the manifest before writing and never runs analysis before payment", async () => {
    const write = vi.fn(async () => {
      expect((await db.select().from(orders))[0]?.status).toBe("CREATED");
      expect(await db.select().from(orderFiles)).toHaveLength(1);
    });
    const result = await prepareOrder(input, { getDatabase: () => db, write });
    expect(result.status).toBe("READY_FOR_PAYMENT");
    if (result.status !== "READY_FOR_PAYMENT") throw new Error("unexpected gate result");
    const order = await findOrderByTokenHash(db, hashReportToken(result.report_token));
    expect(order).toMatchObject({ status: "READY_FOR_PAYMENT", attempts: 0, userContext: "Synthetic concern", amountCents: 999999, precheckResult: null });
    expect(JSON.stringify(await db.select().from(orderFiles))).not.toContain("private-original-name");
    expect(await loadPublicReport(db, result.report_token)).toEqual({ status: "READY_FOR_PAYMENT", amountCents: 1200, currency: "USD" });
    expect(await loadPublicReport(db, "wrong-token")).toEqual({ status: "NOT_FOUND" });
    const analyze = vi.fn();
    expect(await processNext({ db, analyze })).toEqual({ status: "NO_WORK" });
    expect(analyze).not.toHaveBeenCalled();
    expect(await db.select().from(reports)).toEqual([]);
  });
  it("tracks all keys after a partial write and clears transient context", async () => {
    const result = await prepareOrder({ ...input, files: [input.files[0]!, input.files[0]!] }, {
      getDatabase: () => db,
      write: async (file) => { if (file.position === 1) throw new Error("write outcome unknown"); },
    });
    expect(result.status).toBe("STORAGE_FAILED");
    expect((await db.select().from(orders))[0]).toMatchObject({ status: "REJECTED", userContext: null });
    const removed: string[] = [];
    const sweep = await sweepDueOriginals(db, async (file) => { removed.push(file.blobPath); });
    expect(sweep.deleted).toHaveLength(2);
    expect(removed).toHaveLength(2);
  });
  it("hands a prepared order to the existing processor only after simulated payment", async () => {
    vi.stubEnv("AI_STUB", "1");
    const analyze = vi.spyOn(ai, "analyzeQuotation");
    const result = await prepareOrder(input, { getDatabase: () => db, write: async () => {} });
    if (result.status !== "READY_FOR_PAYMENT") throw new Error("unexpected gate result");
    const [order] = await db.select().from(orders);
    expect(analyze).not.toHaveBeenCalled();
    expect(await processNext({ db })).toEqual({ status: "NO_WORK" });
    // Local isolated DB only. The Paddle integration must own these transitions.
    await transition(db, order!.id, "READY_FOR_PAYMENT", "PAYMENT_PENDING");
    expect(await loadPublicReport(db, result.report_token)).toEqual({ status: "PAYMENT_PENDING" });
    expect(await processNext({ db })).toEqual({ status: "NO_WORK" });
    expect(analyze).not.toHaveBeenCalled();
    await transition(db, order!.id, "PAYMENT_PENDING", "PAID", { paidAt: new Date() });
    expect(await loadPublicReport(db, result.report_token)).toEqual({ status: "PROCESSING" });
    expect(await processNext({ db, loadFiles: async () => [] })).toEqual({ status: "COMPLETED", orderId: order!.id });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await loadPublicReport(db, result.report_token)).toMatchObject({ status: "COMPLETED" });
    expect(await processNext({ db })).toEqual({ status: "NO_WORK" });
    expect(await db.select().from(reports)).toHaveLength(1);
    expect((await db.select().from(orders))[0]?.userContext).toBeNull();
  });
  it("accepts technically valid input without AI, then exposes unsuitable paid input for manual refund", async () => {
    const analyze = vi.spyOn(ai, "analyzeQuotation").mockResolvedValue({
      analysis: {
        document: { is_quotation: false, quotation_count: 0, is_legible: true, is_single_commercial_proposal: false, rejection_reason: "Es una factura." },
        quotation_facts: null, clear_items: [], gaps: [], what_if: [], priorities: [],
      },
      usage: { input_tokens: 1, output_tokens: 1 }, latency_ms: 1,
      model: "synthetic", prompt_version: "test",
    });
    const invoice = analysisCases.find((item) => item.name === "invoice")!;
    const result = await prepareOrder({ ...input, files: caseUploads(invoice) }, { getDatabase: () => db, write: async () => {} });
    if (result.status !== "READY_FOR_PAYMENT") throw new Error("unexpected preparation result");
    expect(analyze).not.toHaveBeenCalled();
    const [order] = await db.select().from(orders);
    await transition(db, order!.id, "READY_FOR_PAYMENT", "PAYMENT_PENDING");
    await transition(db, order!.id, "PAYMENT_PENDING", "PAID");
    expect(await processNext({ db, loadFiles: async () => [] })).toEqual({ status: "NOT_ANALYZABLE", orderId: order!.id });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(await db.select().from(reports)).toEqual([]);
    expect(await loadPublicReport(db, result.report_token)).toEqual({ status: "FAILED" });
    expect(await paidFailuresNeedingAction(db)).toEqual([expect.objectContaining({ id: order!.id, status: "NOT_ANALYZABLE" })]);
    expect((await db.select().from(orders))[0]?.userContext).toBeNull();
    expect(await processNext({ db })).toEqual({ status: "NO_WORK" });
    // Simulates the database bookkeeping after an owner refunds in the dashboard.
    expect(await markRefunded(db, order!.id, "NOT_ANALYZABLE")).toBeDefined();
    expect(await loadPublicReport(db, result.report_token)).toEqual({ status: "REFUNDED" });
    expect(await paidFailuresNeedingAction(db)).toEqual([]);
  });
  it("expires a crashed staging upload so its manifest can be drained", async () => {
    const result = await prepareOrder(input, { getDatabase: () => db, write: async () => {} });
    if (result.status !== "READY_FOR_PAYMENT") throw new Error("unexpected gate result");
    const [order] = await db.select().from(orders);
    await db.update(orders).set({ status: "CREATED", createdAt: new Date(Date.now() - 31 * 86400000) }).where(eq(orders.id, order!.id));
    expect(await expireStaleUnpaidOrders(db)).toHaveLength(1);
    expect((await sweepDueOriginals(db, async () => {})).deleted).toHaveLength(1);
  });
  it("writes accepted bytes to local MinIO, verifies integrity and deletes them", async () => {
    vi.stubEnv("AWS_ENDPOINT_URL", "http://127.0.0.1:59000");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "cotizalupa-local");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "cotizalupa-local-secret");
    vi.stubEnv("AWS_S3_BUCKET_NAME", "cotizalupa");
    vi.stubEnv("AWS_DEFAULT_REGION", "auto");
    vi.stubEnv("AWS_S3_URL_STYLE", "path");
    const result = await prepareOrder(input, { getDatabase: () => db, write: writeOriginal });
    expect(result.status).toBe("READY_FOR_PAYMENT");
    const [order] = await db.select().from(orders);
    try {
      expect((await loadAnalysisFiles(db, order!.id))[0]?.dataBase64).toBe(input.files[0]!.dataBase64);
    } finally {
      await transition(db, order!.id, "READY_FOR_PAYMENT", "EXPIRED", { deleteAfter: new Date() });
      expect((await sweepDueOriginals(db)).deleted).toHaveLength(1);
    }
  });
});
