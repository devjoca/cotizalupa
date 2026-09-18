// Thin data-access: plain functions, SQL in plain sight. Status changes are
// conditional updates (zero rows = no-op). Every function takes the DB first so tests inject
// an isolated PostgreSQL database while the app passes the getDb() singleton.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { getDb, type Db } from "./client";
import { orderFiles, orders, paymentEvents, reports } from "./schema";

export type Order = typeof orders.$inferSelect;
export type OrderFile = typeof orderFiles.$inferSelect;
export type Report = typeof reports.$inferSelect;

const STALE_ORDER_DAYS = 30;
const DELETABLE_STATUSES = [
  "REJECTED",
  "EXPIRED",
  "COMPLETED",
  "PROCESSING_FAILED",
  "NOT_ANALYZABLE",
  "REFUNDED",
] as const;

// Token for /r/{token}. URL-safe, 256 bits; only its sha256 reaches the DB.
export function newReportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashReportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3_600_000);
}

export async function createOrder(
  db: Db = getDb(),
  input: {
    reportTokenHash: string;
    email?: string | null;
    perspective?: string | null;
    category?: string | null;
    moment?: string | null;
    userContext?: string | null;
    amountCents?: number | null;
  },
): Promise<Order> {
  const [row] = await db
    .insert(orders)
    .values({
      id: randomUUID(),
      status: "CREATED",
      reportTokenHash: input.reportTokenHash,
      email: input.email ?? null,
      perspective: input.perspective ?? null,
      category: input.category ?? null,
      moment: input.moment ?? null,
      userContext: input.userContext ?? null,
      amountCents: input.amountCents ?? null,
    })
    .returning();
  if (!row) throw new Error("createOrder inserted no row");
  return row;
}

export async function recordFile(
  db: Db = getDb(),
  input: {
    orderId: string;
    position: number;
    blobPath: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
    pages?: number | null;
  },
): Promise<OrderFile> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    if (order?.status !== "CREATED") throw new Error("order files are frozen");
    const [row] = await tx
      .insert(orderFiles)
      .values({
        id: randomUUID(),
        orderId: input.orderId,
        position: input.position,
        blobPath: input.blobPath,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        pages: input.pages ?? null,
      })
      .returning();
    if (!row) throw new Error("recordFile inserted no row");
    return row;
  });
}

// Conditional transition: returns the row, or undefined when the order was
// not in `from` (idempotent webhook retries land here as no-ops).
export async function transition(
  db: Db = getDb(),
  id: string,
  from: string,
  to: string,
  extra?: Partial<
    Omit<Order, "id" | "createdAt" | "reportTokenHash" | "status">
  >,
): Promise<Order | undefined> {
  const terminal = DELETABLE_STATUSES.some((status) => status === to);
  const [row] = await db
    .update(orders)
    .set({
      ...extra,
      ...(terminal ? { userContext: null } : {}),
      status: to,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, id), eq(orders.status, from)))
    .returning();
  return row;
}

// Orders start with 30-day deletion eligibility. Safe terminal states shorten it;
// failed paid analyses keep the original deadline for manual recovery/refund.
export function rejectOrder(db: Db = getDb(), id: string, from: string) {
  return transition(db, id, from, "REJECTED", {
    deleteAfter: new Date(),
    userContext: null,
  });
}

export function expireOrder(db: Db = getDb(), id: string, from: string) {
  return transition(db, id, from, "EXPIRED", {
    deleteAfter: new Date(),
    userContext: null,
  });
}

export function failProcessing(db: Db = getDb(), id: string, error: string) {
  return transition(db, id, "PROCESSING", "PROCESSING_FAILED", {
    lastError: error,
    userContext: null,
  });
}

export function markNotAnalyzable(
  db: Db = getDb(),
  id: string,
  error = "not_analyzable",
) {
  return transition(db, id, "PROCESSING", "NOT_ANALYZABLE", {
    lastError: error,
    userContext: null,
  });
}

export function markRefunded(db: Db = getDb(), id: string, from: "PROCESSING_FAILED" | "NOT_ANALYZABLE") {
  return transition(db, id, from, "REFUNDED", {
    deleteAfter: new Date(),
    userContext: null,
  });
}

// One claim query for the
// webhook fast path and the manual drain. Stale PROCESSING rows
// (>15 min, attempts left) are re-claimed; after 3 attempts the cap holds.
export async function claimNext(
  db: Db = getDb(),
): Promise<Order | undefined> {
  const result = await db.execute(sql`
    UPDATE orders
    SET status = 'PROCESSING',
        processing_started_at = now(),
        attempts = attempts + 1
    WHERE id = (
      SELECT id FROM orders
      WHERE status = 'PAID'
         OR (status = 'PROCESSING'
             AND processing_started_at < now() - interval '15 minutes'
             AND attempts < 3)
      ORDER BY paid_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `);
  const [claimed] = (result as unknown as { rows: Array<{ id: string }> }).rows;
  if (!claimed) return undefined;
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, claimed.id))
    .limit(1);
  return order;
}

// One SQL statement owns the report + COMPLETED boundary. A retry after success
// is a no-op, and a legacy report saved before completion is reused.
export async function saveReportAndComplete(
  db: Db = getDb(),
  input: {
    orderId: string;
    result: unknown;
    quotationFacts: unknown;
    model?: string | null;
    reasoningEffort?: string | null;
    promptVersion?: string | null;
    schemaVersion?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number | null;
    costUsd?: number | null;
  },
): Promise<boolean> {
  const result = await db.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT id
      FROM orders
      WHERE id = ${input.orderId}
        AND status IN ('PROCESSING', 'COMPLETED')
      FOR UPDATE
    ), saved AS (
      INSERT INTO reports (
        id, order_id, model, reasoning_effort, prompt_version, schema_version,
        result, quotation_facts, input_tokens, output_tokens, latency_ms,
        cost_usd
      )
      SELECT
        ${randomUUID()}::uuid,
        id,
        ${input.model ?? null},
        ${input.reasoningEffort ?? null},
        ${input.promptVersion ?? null},
        ${input.schemaVersion ?? null},
        ${JSON.stringify(input.result)}::jsonb,
        ${JSON.stringify(input.quotationFacts)}::jsonb,
        ${input.inputTokens ?? null},
        ${input.outputTokens ?? null},
        ${input.latencyMs ?? null},
        ${input.costUsd ?? null}
      FROM eligible
      ON CONFLICT (order_id) DO NOTHING
      RETURNING order_id
    ), completed AS (
      UPDATE orders
      SET status = 'COMPLETED',
          completed_at = now(),
          delete_after = now(),
          user_context = NULL,
          updated_at = now()
      WHERE id IN (SELECT id FROM eligible)
        AND status = 'PROCESSING'
      RETURNING id
    )
    SELECT id FROM eligible LIMIT 1;
  `);
  return (result as unknown as { rows: Array<{ id: string }> }).rows.length > 0;
}

// Legacy free-POC helper retained for fixture compatibility. It is not exposed
// by a server function; the current public submission only prepares an order.
export async function createCompletedDemoReport(
  db: Db = getDb(),
  input: {
    perspective: string;
    category: string;
    moment: string;
    amountCents: number | null;
    result: unknown;
    quotationFacts: unknown;
    model: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  },
): Promise<{ orderId: string; reportToken: string }> {
  const orderId = randomUUID();
  const reportId = randomUUID();
  const reportToken = newReportToken();
  const reportTokenHash = hashReportToken(reportToken);
  const saved = await db.execute(sql`
    WITH created AS (
      INSERT INTO orders (
        id, status, perspective, category, moment, amount_cents,
        report_token_hash, attempts, processing_started_at, completed_at,
        delete_after
      )
      VALUES (
        ${orderId}::uuid,
        'COMPLETED',
        ${input.perspective},
        ${input.category},
        ${input.moment},
        ${input.amountCents},
        ${reportTokenHash},
        1,
        now(),
        now(),
        now()
      )
      RETURNING id
    ), saved_report AS (
      INSERT INTO reports (
        id, order_id, model, reasoning_effort, prompt_version, schema_version,
        result, quotation_facts, input_tokens, output_tokens, latency_ms
      )
      SELECT
        ${reportId}::uuid,
        id,
        ${input.model},
        'medium',
        ${input.promptVersion},
        'v1',
        ${JSON.stringify(input.result)}::jsonb,
        ${JSON.stringify(input.quotationFacts)}::jsonb,
        ${input.inputTokens},
        ${input.outputTokens},
        ${input.latencyMs}
      FROM created
      RETURNING order_id
    )
    SELECT order_id FROM saved_report;
  `);
  const [row] = (saved as unknown as {
    rows: Array<{ order_id: string }>;
  }).rows;
  if (!row) throw new Error("completed demo report was not saved");
  return { orderId: row.order_id, reportToken };
}

// A process can die after claiming its third attempt. The drain closes that
// otherwise invisible state after the same 15-minute reclaim window.
export async function failExhaustedProcessing(
  db: Db = getDb(),
): Promise<Array<Pick<Order, "id">>> {
  const result = await db.execute(sql`
    UPDATE orders
    SET status = 'PROCESSING_FAILED',
        last_error = 'attempt_limit_exhausted',
        user_context = NULL,
        updated_at = now()
    WHERE status = 'PROCESSING'
      AND attempts >= 3
      AND processing_started_at < now() - interval '15 minutes'
    RETURNING id;
  `);
  return (result as unknown as { rows: Array<Pick<Order, "id">> }).rows;
}

export async function expireStaleUnpaidOrders(
  db: Db = getDb(),
): Promise<Order[]> {
  return db
    .update(orders)
    .set({
      status: "EXPIRED",
      deleteAfter: new Date(),
      userContext: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(orders.status, ["CREATED", "READY_FOR_PAYMENT", "PAYMENT_FAILED"]),
        lte(orders.createdAt, daysAgo(STALE_ORDER_DAYS)),
      ),
    )
    .returning();
}

export async function filesForOrder(
  db: Db = getDb(),
  orderId: string,
): Promise<OrderFile[]> {
  return db
    .select()
    .from(orderFiles)
    .where(
      and(eq(orderFiles.orderId, orderId), isNull(orderFiles.deletedAt)),
    )
    .orderBy(orderFiles.position);
}

export async function stalePaymentPending(
  db: Db = getDb(),
): Promise<
  Array<
    Pick<
      Order,
      | "id"
      | "paymentProvider"
      | "paymentTransactionId"
      | "createdAt"
      | "updatedAt"
    >
  >
> {
  return db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentTransactionId: orders.paymentTransactionId,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "PAYMENT_PENDING"),
        lte(orders.createdAt, daysAgo(STALE_ORDER_DAYS)),
      ),
    );
}

export async function paidFailuresNeedingAction(
  db: Db = getDb(),
): Promise<
  Array<
    Pick<
      Order,
      "id" | "status" | "attempts" | "lastError" | "refundRequestedAt"
    >
  >
> {
  return db
    .select({
      id: orders.id,
      status: orders.status,
      attempts: orders.attempts,
      lastError: orders.lastError,
      refundRequestedAt: orders.refundRequestedAt,
    })
    .from(orders)
    .where(inArray(orders.status, ["PROCESSING_FAILED", "NOT_ANALYZABLE"]));
}

export async function findOrderByTokenHash(
  db: Db = getDb(),
  reportTokenHash: string,
): Promise<Order | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.reportTokenHash, reportTokenHash))
    .limit(1);
  return row;
}

export async function findReportByOrderId(
  db: Db = getDb(),
  orderId: string,
): Promise<Report | undefined> {
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.orderId, orderId))
    .limit(1);
  return row;
}

// Idempotency: the UNIQUE on provider_event_id makes the second insert a
// no-op that returns undefined — duplicates answer 200 and stop.
export async function recordPaymentEvent(
  db: Db = getDb(),
  input: {
    provider: string;
    providerEventId: string;
    orderId?: string | null;
    eventType: string;
  },
) {
  const [row] = await db
    .insert(paymentEvents)
    .values({
      id: randomUUID(),
      provider: input.provider,
      providerEventId: input.providerEventId,
      orderId: input.orderId ?? null,
      eventType: input.eventType,
      // Keep the existing non-null column without retaining provider content.
      payload: {},
    })
    .onConflictDoNothing({ target: paymentEvents.providerEventId })
    .returning();
  return row;
}

// Only safe terminal states can enter deletion. A bad date must never delete
// files from PAYMENT_PENDING, PAID, or PROCESSING orders.
export async function dueForDeletion(db: Db = getDb()): Promise<OrderFile[]> {
  return db
    .select({
      id: orderFiles.id,
      orderId: orderFiles.orderId,
      position: orderFiles.position,
      blobPath: orderFiles.blobPath,
      mime: orderFiles.mime,
      sizeBytes: orderFiles.sizeBytes,
      sha256: orderFiles.sha256,
      pages: orderFiles.pages,
      deletedAt: orderFiles.deletedAt,
      createdAt: orderFiles.createdAt,
    })
    .from(orderFiles)
    .innerJoin(orders, eq(orderFiles.orderId, orders.id))
    .where(
      and(
        isNull(orderFiles.deletedAt),
        inArray(orders.status, [...DELETABLE_STATUSES]),
        lte(orders.deleteAfter, new Date()),
      ),
    );
}

export async function markFileDeleted(db: Db = getDb(), id: string) {
  const [row] = await db
    .update(orderFiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(orderFiles.id, id), isNull(orderFiles.deletedAt)))
    .returning();
  return row;
}
