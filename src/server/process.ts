import type { Db } from "#/db/client";
import { getDb } from "#/db/client";
import {
  claimNext,
  expireStaleUnpaidOrders,
  failExhaustedProcessing,
  failProcessing,
  markNotAnalyzable,
  paidFailuresNeedingAction,
  saveReportAndComplete,
  stalePaymentPending,
} from "#/db/orders";
import type { OrderFile } from "#/db/orders";
import { MOMENTS } from "#/lib/reviewContext";
import {
  PerspectiveSchema,
  isAnalyzable,
  type ReviewContext,
} from "#/lib/schemas";
import {
  AiRefused,
  AiRequestFailed,
  analyzeQuotation,
  type AnalysisResult,
} from "./ai";
import { captureOperationalError } from "./monitoring";
import {
  InvalidOrderData,
  loadAnalysisFiles,
  sweepDueOriginals,
} from "./storage";

type ProcessDependencies = {
  db?: Db;
  analyze?: typeof analyzeQuotation;
  loadFiles?: typeof loadAnalysisFiles;
  removeFile?: (file: OrderFile) => Promise<void>;
};

export type ProcessOutcome =
  | { status: "NO_WORK" }
  | { status: "COMPLETED"; orderId: string }
  | { status: "NOT_ANALYZABLE"; orderId: string }
  | { status: "RETRY_PENDING"; orderId: string }
  | { status: "PROCESSING_FAILED"; orderId: string };

function contextFor(order: Awaited<ReturnType<typeof claimNext>>): {
  context: ReviewContext;
  perspective: "customer" | "provider";
} {
  if (!order) throw new Error("missing order");
  const perspective = PerspectiveSchema.parse(order.perspective ?? "customer");
  const moment = MOMENTS.find((value) => value === order.moment);
  if (!order.category || !moment) {
    throw new InvalidOrderData("order analysis context is incomplete");
  }
  return {
    perspective,
    context: {
      service_category: order.category,
      approximate_amount_cents: order.amountCents,
      moment,
      concern: order.userContext,
    },
  };
}

function failureCode(error: unknown): string {
  if (error instanceof AiRequestFailed) return "analysis_provider_failure";
  if (error instanceof AiRefused) return "analysis_refused";
  return "analysis_failed";
}

export async function processNext(
  dependencies: ProcessDependencies = {},
): Promise<ProcessOutcome> {
  const db = dependencies.db ?? getDb();
  const order = await claimNext(db);
  if (!order) return { status: "NO_WORK" };

  try {
    const files = await (dependencies.loadFiles ?? loadAnalysisFiles)(db, order.id);
    const { context, perspective } = contextFor(order);
    const analyzed: AnalysisResult = await (
      dependencies.analyze ?? analyzeQuotation
    )(files, { context, perspective });

    if (!isAnalyzable(analyzed.analysis)) {
      await markNotAnalyzable(db, order.id);
      return { status: "NOT_ANALYZABLE", orderId: order.id };
    }

    const { quotation_facts, ...report } = analyzed.analysis;
    const saved = await saveReportAndComplete(db, {
      orderId: order.id,
      result: report,
      quotationFacts: quotation_facts,
      model: analyzed.model,
      reasoningEffort: "medium",
      promptVersion: analyzed.prompt_version,
      schemaVersion: "v1",
      inputTokens: analyzed.usage.input_tokens,
      outputTokens: analyzed.usage.output_tokens,
      latencyMs: analyzed.latency_ms,
    });
    if (!saved) throw new Error("order left PROCESSING before completion");
    return { status: "COMPLETED", orderId: order.id };
  } catch (error) {
    // Deterministic data errors (missing context, missing/corrupt stored
    // files) never heal on retry: fail the order now instead of burning the
    // remaining attempts across drains.
    if (error instanceof InvalidOrderData) {
      captureOperationalError("order_data_invalid", error, {
        order_id: order.id,
      });
      await failProcessing(db, order.id, "order_data_invalid");
      return { status: "PROCESSING_FAILED", orderId: order.id };
    }
    const code = failureCode(error);
    captureOperationalError(code, error, {
      order_id: order.id,
      attempt: order.attempts,
    });
    if (error instanceof AiRefused) {
      await markNotAnalyzable(db, order.id, code);
      return { status: "NOT_ANALYZABLE", orderId: order.id };
    }
    if (
      order.attempts >= 3 ||
      (error instanceof AiRequestFailed && !error.retryable)
    ) {
      await failProcessing(db, order.id, code);
      return { status: "PROCESSING_FAILED", orderId: order.id };
    }
    return { status: "RETRY_PENDING", orderId: order.id };
  }
}

export async function drainOperations(
  dependencies: ProcessDependencies = {},
): Promise<{
  expired: string[];
  exhausted: string[];
  processed: ProcessOutcome[];
  stalePayments: Awaited<ReturnType<typeof stalePaymentPending>>;
  failedOrders: Awaited<ReturnType<typeof paidFailuresNeedingAction>>;
  deletedFiles: string[];
  failedDeletes: string[];
}> {
  const db = dependencies.db ?? getDb();
  const expired = await expireStaleUnpaidOrders(db);
  const exhausted = await failExhaustedProcessing(db);
  const stalePayments = await stalePaymentPending(db);
  const processed: ProcessOutcome[] = [];

  for (let count = 0; count < 100; count += 1) {
    const outcome = await processNext({ ...dependencies, db });
    if (outcome.status === "NO_WORK") break;
    processed.push(outcome);
  }

  const sweep = await sweepDueOriginals(db, dependencies.removeFile);
  const failedOrders = await paidFailuresNeedingAction(db);
  return {
    expired: expired.map((order) => order.id),
    exhausted: exhausted.map((order) => order.id),
    processed,
    stalePayments,
    failedOrders,
    deletedFiles: sweep.deleted,
    failedDeletes: sweep.failed,
  };
}
