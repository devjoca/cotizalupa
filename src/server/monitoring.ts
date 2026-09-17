import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

let initialized = false;

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    breadcrumbs: undefined,
    contexts: undefined,
    extra: undefined,
    modules: undefined,
    request: undefined,
    transaction: undefined,
    user: undefined,
  };
}

function initializeMonitoring(): boolean {
  if (initialized) return Boolean(process.env.SENTRY_DSN);
  initialized = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  // Manual error capture only. No request instrumentation, tracing, replay,
  // breadcrumbs, local variables, or automatic OpenAI prompt/response capture.
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
  });
  return true;
}

function sanitizedError(code: string, source: unknown): Error {
  const error = new Error(code);
  if (!(source instanceof Error) || !source.stack) return error;
  const frames = source.stack.split("\n").slice(1);
  error.stack = [`Error: ${code}`, ...frames].join("\n");
  return error;
}

export function captureOperationalError(
  code: string,
  source?: unknown,
  tags: Record<string, string | number | boolean | undefined> = {},
): void {
  if (!initializeMonitoring()) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value !== undefined) scope.setTag(key, value);
    }
    Sentry.captureException(sanitizedError(code, source));
  });
}

export async function flushMonitoring(timeoutMs = 2_000): Promise<boolean> {
  if (!initialized || !process.env.SENTRY_DSN) return true;
  return Sentry.flush(timeoutMs);
}
