import type { Db } from "#/db/client";
import {
  findOrderByTokenHash,
  findReportByOrderId,
  hashReportToken,
} from "#/db/orders";
import { AnalysisSchema } from "#/lib/schemas";
import { REVIEW_PRICE_CENTS, REVIEW_CURRENCY } from "#/lib/price";
import { captureOperationalError } from "./monitoring";
import type { PublicReportResult } from "./report";

// Lives here — not in report.ts — so the route-facing server-fn module
// exports no plain values. Anything value-exported from a module a route
// imports is shipped to the browser, where the db chain (pg → Buffer)
// crashes. report.ts re-exports nothing from this file.
const ACTIVE_REPORT_STATUSES = new Set([
  "CREATED",
  "UPLOADED",
  "PRECHECKING",
  "READY_FOR_PAYMENT",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAID",
  "PROCESSING",
]);

export async function loadPublicReport(
  db: Db,
  token: string,
): Promise<PublicReportResult> {
  if (token.length === 0 || token.length > 128) return { status: "NOT_FOUND" };

  const order = await findOrderByTokenHash(db, hashReportToken(token));
  if (!order) return { status: "NOT_FOUND" };

  if (order.status === "READY_FOR_PAYMENT" || order.status === "PAYMENT_FAILED") {
    if (order.deleteAfter <= new Date()) return { status: "EXPIRED" };
    return { status: "READY_FOR_PAYMENT", amountCents: REVIEW_PRICE_CENTS, currency: REVIEW_CURRENCY };
  }
  if (order.status === "PAYMENT_PENDING") return { status: "PAYMENT_PENDING" };
  if (order.status === "PAID" || order.status === "PROCESSING") return { status: "PROCESSING" };
  if (order.status === "EXPIRED") return { status: "EXPIRED" };
  if (order.status === "REFUNDED") return { status: "REFUNDED" };
  if (order.status === "PROCESSING_FAILED" || order.status === "NOT_ANALYZABLE") return { status: "FAILED" };

  const report = await findReportByOrderId(db, order.id);
  if (!report) {
    return ACTIVE_REPORT_STATUSES.has(order.status)
      ? { status: "NOT_READY" }
      : { status: "UNAVAILABLE" };
  }

  const storedResult =
    report.result !== null &&
    typeof report.result === "object" &&
    !Array.isArray(report.result)
      ? report.result
      : {};
  const parsed = AnalysisSchema.safeParse({
    ...storedResult,
    quotation_facts: report.quotationFacts,
  });
  if (!parsed.success) {
    captureOperationalError("stored_report_invalid", parsed.error, {
      order_id: order.id,
    });
    return { status: "UNAVAILABLE" };
  }

  return { status: "COMPLETED", analysis: parsed.data };
}

export async function loadPublicReportSafely(
  getDatabase: () => Db,
  token: string,
): Promise<PublicReportResult> {
  try {
    return await loadPublicReport(getDatabase(), token);
  } catch (error) {
    // A public link must not expose database or configuration failures. The
    // raw token is deliberately absent from monitoring metadata.
    captureOperationalError("public_report_load_failed", error);
    return { status: "UNAVAILABLE" };
  }
}
