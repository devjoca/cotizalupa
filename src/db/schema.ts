// Tables per PLAN.md "Modelo de datos". Status stays text + conditional
// updates in orders.ts — no enum, no state-machine library.
// IDs are app-generated (crypto.randomUUID), never a DB default, so tests and
// Neon run the same shape.
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    status: text("status").notNull(),
    country: text("country").notNull().default("PE"),
    currency: text("currency").notNull().default("PEN"),
    amountCents: integer("amount_cents"),
    perspective: text("perspective"),
    category: text("category"),
    moment: text("moment"),
    userContext: text("user_context"),
    email: text("email"),
    // sha256(token). The token itself is never stored.
    reportTokenHash: text("report_token_hash").notNull().unique(),
    paymentProvider: text("payment_provider"),
    paymentTransactionId: text("payment_transaction_id"),
    precheckResult: jsonb("precheck_result"),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    // Hard ceiling for original retention. Safe terminal transitions shorten it.
    deleteAfter: timestamp("delete_after", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    refundRequestedAt: timestamp("refund_requested_at", {
      withTimezone: true,
    }),
    fbp: text("fbp"),
    fbc: text("fbc"),
    clientUserAgent: text("client_user_agent"),
    clientIp: text("client_ip"),
    metaPurchaseSentAt: timestamp("meta_purchase_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_delete_after_idx").on(t.deleteAfter),
  ],
);

export const orderFiles = pgTable(
  "order_files",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    position: smallint("position").notNull(),
    blobPath: text("blob_path").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    pages: integer("pages"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("order_files_order_position_idx").on(t.orderId, t.position)],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  model: text("model"),
  reasoningEffort: text("reasoning_effort"),
  promptVersion: text("prompt_version"),
  schemaVersion: text("schema_version"),
  result: jsonb("result").notNull(),
  quotationFacts: jsonb("quotation_facts"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  costUsd: real("cost_usd"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey(),
  provider: text("provider").notNull(),
  // Idempotency key: duplicates answer 200 and stop. No billing/card in payload, ever.
  providerEventId: text("provider_event_id").notNull().unique(),
  orderId: uuid("order_id").references(() => orders.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
