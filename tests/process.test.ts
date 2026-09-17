import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "#/db/client";
import {
  createOrder,
  failProcessing,
  findReportByOrderId,
  hashReportToken,
  markNotAnalyzable,
  newReportToken,
  transition,
} from "#/db/orders";
import { orders } from "#/db/schema";
import { drainOperations, processNext } from "#/server/process";
import { MOMENTS } from "#/lib/reviewContext";
import { eq } from "drizzle-orm";
import { setupTestDb } from "./db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await setupTestDb());
});

afterEach(async () => {
  await close();
});

describe("processNext", () => {
  it("claims, analyzes, saves, and completes one paid order", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
      perspective: "customer",
      category: "Diseño gráfico",
      moment: MOMENTS[0],
      userContext: "Confirmar el plazo",
      amountCents: 39_00,
    });
    await transition(db, order.id, "CREATED", "PAID", { paidAt: new Date() });
    const analyze = vi.fn(async () => ({
      analysis: {
        document: {
          is_quotation: true,
          quotation_count: 1,
          is_legible: true,
          is_single_commercial_proposal: true,
          rejection_reason: null,
        },
        clear_items: [],
        gaps: [],
        what_if: [],
        priorities: [],
        quotation_facts: {
          document_type: "quotation" as const,
          service: "Diseño",
          supplier: null,
          amount: { value_cents: null, currency: null },
          summary: null,
          scope_summary: null,
          delivery_summary: null,
          payment_summary: null,
        },
      },
      usage: { input_tokens: 10, output_tokens: 20 },
      latency_ms: 25,
      model: "test-model",
      prompt_version: "test-v1",
    }));

    expect(
      await processNext({
        db,
        analyze,
        loadFiles: async () => [
          {
            name: "cotizacion.pdf",
            mime: "application/pdf",
            dataBase64: "aGVsbG8=",
          },
        ],
      }),
    ).toEqual({ status: "COMPLETED", orderId: order.id });

    const [stored] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stored).toMatchObject({ status: "COMPLETED", userContext: null });
    expect(await findReportByOrderId(db, order.id)).toBeDefined();
    expect(analyze).toHaveBeenCalledWith(expect.any(Array), {
      perspective: "customer",
      context: {
        service_category: "Diseño gráfico",
        approximate_amount_cents: 39_00,
        moment: MOMENTS[0],
        concern: "Confirmar el plazo",
      },
    });
  });

  it("keeps existing paid failures visible to the manual drain", async () => {
    const failedOrder = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    await transition(db, failedOrder.id, "CREATED", "PROCESSING");
    await failProcessing(db, failedOrder.id, "synthetic_failure");
    const rejectedOrder = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    await transition(db, rejectedOrder.id, "CREATED", "PROCESSING");
    await markNotAnalyzable(db, rejectedOrder.id);

    const summary = await drainOperations({
      db,
      removeFile: async () => undefined,
    });

    expect(summary.failedOrders).toHaveLength(2);
    expect(summary.failedOrders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: failedOrder.id,
          status: "PROCESSING_FAILED",
          lastError: "synthetic_failure",
        }),
        expect.objectContaining({
          id: rejectedOrder.id,
          status: "NOT_ANALYZABLE",
          lastError: "not_analyzable",
        }),
      ]),
    );
  });
});
