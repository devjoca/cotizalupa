// pnpm test — deterministic, free, runs in CI. See PLAN.md "Tests".
// DB-backed cases run on Docker PostgreSQL and apply the actual Drizzle
// migration. Money and mechanical cases land with their phases.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import type { Db } from "#/db/client";
import {
  claimNext,
  createOrder,
  dueForDeletion,
  expireStaleUnpaidOrders,
  failExhaustedProcessing,
  failProcessing,
  filesForOrder,
  findOrderByTokenHash,
  hashReportToken,
  newReportToken,
  markRefunded,
  recordFile,
  recordPaymentEvent,
  rejectOrder,
  saveReportAndComplete,
  stalePaymentPending,
  transition,
} from "#/db/orders";
import { orders, paymentEvents, reports } from "#/db/schema";
import { setupTestDb } from "./db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await setupTestDb());
});

afterEach(async () => {
  await close();
});

async function paidOrder() {
  const order = await createOrder(db, {
    reportTokenHash: hashReportToken(newReportToken()),
  });
  const paid = await transition(db, order.id, "CREATED", "PAID", {
    paidAt: new Date(),
  });
  if (!paid) throw new Error("setup: could not mark PAID");
  return paid;
}

async function ageProcessingStartedBy(id: string, minutes: number) {
  await db
    .update(orders)
    .set({
      processingStartedAt: new Date(Date.now() - minutes * 60_000),
    })
    .where(eq(orders.id, id));
}

describe("order lifecycle", () => {
  it("records a manual refund conditionally and clears transient context", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()), userContext: "Synthetic concern",
    });
    expect(await markRefunded(db, order.id, "PROCESSING_FAILED")).toBeUndefined();
    await transition(db, order.id, "CREATED", "PROCESSING_FAILED");
    expect(await markRefunded(db, order.id, "PROCESSING_FAILED")).toMatchObject({ status: "REFUNDED", userContext: null });
    expect(await markRefunded(db, order.id, "PROCESSING_FAILED")).toBeUndefined();
  });
  it.each(["READY_FOR_PAYMENT", "PAYMENT_PENDING", "PAID", "PROCESSING", "COMPLETED"])("refuses file edits in %s", async (status) => {
    const order = await createOrder(db, { reportTokenHash: hashReportToken(newReportToken()) });
    await transition(db, order.id, "CREATED", status);
    await expect(recordFile(db, {
      orderId: order.id, position: 0, blobPath: "synthetic/frozen.pdf",
      mime: "application/pdf", sizeBytes: 12, sha256: "abc",
    })).rejects.toThrow("order files are frozen");
    expect(await filesForOrder(db, order.id)).toEqual([]);
  });

  it("terminal states set delete_after", async () => {
    const completed = await paidOrder();
    await claimNext(db);
    await saveReportAndComplete(db, {
      orderId: completed.id,
      result: { clear_items: [] },
      quotationFacts: { document_type: "quotation" },
    });
    const [done] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, completed.id));
    expect(done?.status).toBe("COMPLETED");
    expect(done?.deleteAfter).toBeInstanceOf(Date);
    expect(done?.completedAt).toBeInstanceOf(Date);
    expect(done!.deleteAfter.getTime()).toBe(done!.completedAt!.getTime());

    const rejected = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    await transition(db, rejected.id, "CREATED", "PRECHECKING");
    const out = await rejectOrder(db, rejected.id, "PRECHECKING");
    expect(out?.status).toBe("REJECTED");
    expect(out?.deleteAfter).toBeInstanceOf(Date);
  });

  it("stores amounts beyond the 32-bit range", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
      amountCents: 99_999_999_999,
    });
    const [stored] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stored?.amountCents).toBe(99_999_999_999);
  });

  it("report lookup finds the order by token hash only", async () => {
    const token = newReportToken();
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(token),
    });
    expect(
      (await findOrderByTokenHash(db, hashReportToken(token)))?.id,
    ).toBe(order.id);
    expect(
      await findOrderByTokenHash(db, hashReportToken(newReportToken())),
    ).toBeUndefined();
  });

  it("sweep finds only files past delete_after", async () => {
    const order = await createOrder(db, { reportTokenHash: hashReportToken(newReportToken()) });
    const file = await recordFile(db, {
      orderId: order.id,
      position: 0,
      blobPath: "orders/x/1.pdf",
      mime: "application/pdf",
      sizeBytes: 12,
      sha256: "abc",
      pages: 1,
    });
    await transition(db, order.id, "CREATED", "PAID");
    // Active orders never enter the sweep, even with a bad past deadline.
    expect(await dueForDeletion(db)).toHaveLength(0);
    await db
      .update(orders)
      .set({ deleteAfter: new Date(Date.now() - 1_000) })
      .where(eq(orders.id, order.id));
    expect(await dueForDeletion(db)).toHaveLength(0);
    await transition(db, order.id, "PAID", "EXPIRED");
    expect((await dueForDeletion(db)).map((f) => f.id)).toEqual([file.id]);
  });

  it("preserves file order and rejects duplicate positions", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    await recordFile(db, {
      orderId: order.id,
      position: 1,
      blobPath: "orders/x/2.jpg",
      mime: "image/jpeg",
      sizeBytes: 12,
      sha256: "second",
    });
    await recordFile(db, {
      orderId: order.id,
      position: 0,
      blobPath: "orders/x/1.jpg",
      mime: "image/jpeg",
      sizeBytes: 12,
      sha256: "first",
    });

    expect(
      (await filesForOrder(db, order.id)).map((file) => file.position),
    ).toEqual([0, 1]);
    await expect(
      recordFile(db, {
        orderId: order.id,
        position: 1,
        blobPath: "orders/x/duplicate.jpg",
        mime: "image/jpeg",
        sizeBytes: 12,
        sha256: "duplicate",
      }),
    ).rejects.toThrow();
  });

  it("stores only event metadata and deduplicates the provider event", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const event = {
      provider: "paddle",
      providerEventId: "evt_1",
      orderId: order.id,
      eventType: "transaction.completed",
    };
    expect(await recordPaymentEvent(db, event)).toBeDefined();
    expect(await recordPaymentEvent(db, event)).toBeUndefined();
    const [stored] = await db.select().from(paymentEvents);
    expect(stored?.payload).toEqual({});
  });

  it("expires only stale unpaid orders", async () => {
    const ready = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const pending = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const old = new Date(Date.now() - 31 * 24 * 3_600_000);
    await db
      .update(orders)
      .set({ status: "READY_FOR_PAYMENT", createdAt: old })
      .where(eq(orders.id, ready.id));
    await db
      .update(orders)
      .set({ status: "PAYMENT_PENDING", createdAt: old })
      .where(eq(orders.id, pending.id));

    expect((await expireStaleUnpaidOrders(db)).map((o) => o.id)).toEqual([
      ready.id,
    ]);
    expect((await stalePaymentPending(db)).map((o) => o.id)).toEqual([
      pending.id,
    ]);
  });
});

describe.skip("payments", () => {
  it("webhook with bad signature rejected", () => {});
  it("webhook with wrong amount rejected", () => {});
  it("duplicate webhook doesn't duplicate report", () => {});
});

describe("processing", () => {
  it("stale PROCESSING order is reclaimed", async () => {
    const order = await paidOrder();
    const first = await claimNext(db);
    expect(first?.id).toBe(order.id);
    expect(first?.attempts).toBe(1);

    await ageProcessingStartedBy(order.id, 20);
    const second = await claimNext(db);
    expect(second?.id).toBe(order.id);
    expect(second?.attempts).toBe(2);
  });

  it("invalid model output counts as attempt", async () => {
    // The mechanism, at the DB layer: every claim burns exactly one attempt,
    // so a model failure after a claim can only retry twice before the cap.
    const order = await paidOrder();
    const claimed = await claimNext(db);
    expect(claimed?.attempts).toBe(order.attempts + 1);
  });

  it("an abandoned third attempt becomes PROCESSING_FAILED", async () => {
    const order = await paidOrder();
    await db
      .update(orders)
      .set({ status: "PROCESSING", attempts: 3 })
      .where(eq(orders.id, order.id));
    await ageProcessingStartedBy(order.id, 20);

    expect(await claimNext(db)).toBeUndefined();
    expect((await failExhaustedProcessing(db)).map((o) => o.id)).toEqual([
      order.id,
    ]);
  });

  it("clears transient user context on terminal processing failure", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
      userContext: "Private analysis concern",
    });
    await transition(db, order.id, "CREATED", "PROCESSING");
    const failed = await failProcessing(db, order.id, "analysis_failed");
    expect(failed).toMatchObject({
      status: "PROCESSING_FAILED",
      userContext: null,
    });
  });

  it("saves one report and completes atomically across retries", async () => {
    const order = await paidOrder();
    await claimNext(db);
    const input = {
      orderId: order.id,
      result: { clear_items: [] },
      quotationFacts: { document_type: "quotation" },
    };

    expect(await saveReportAndComplete(db, input)).toBe(true);
    expect(await saveReportAndComplete(db, input)).toBe(true);
    expect(await db.select().from(reports)).toHaveLength(1);
    const [stored] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stored?.status).toBe("COMPLETED");
  });
});
