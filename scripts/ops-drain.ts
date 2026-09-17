import { closePool } from "#/db/client";
import { captureOperationalError, flushMonitoring } from "#/server/monitoring";
import { drainOperations } from "#/server/process";

try {
  const summary = await drainOperations();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.exhausted.length > 0) {
    captureOperationalError("processing_attempts_exhausted", undefined, {
      count: summary.exhausted.length,
    });
  }
  const processingNeedsAction = summary.processed.some((outcome) =>
    ["RETRY_PENDING", "PROCESSING_FAILED", "NOT_ANALYZABLE"].includes(
      outcome.status,
    ),
  );
  if (
    summary.stalePayments.length > 0 ||
    summary.failedOrders.length > 0 ||
    summary.failedDeletes.length > 0 ||
    summary.exhausted.length > 0 ||
    processingNeedsAction
  ) {
    process.exitCode = 2;
  }
} catch (error) {
  captureOperationalError("ops_drain_failed", error);
  process.stderr.write("ops:drain failed; check Sentry and Railway logs.\n");
  process.exitCode = 1;
} finally {
  await flushMonitoring();
  await closePool();
}
