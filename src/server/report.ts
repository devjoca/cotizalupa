import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "#/db/client";
import type { Analysis } from "#/lib/schemas";
import { loadPublicReportSafely } from "./reportLoader";

export type PublicReportResult =
  | { status: "NOT_FOUND" }
  | { status: "NOT_READY" }
  | { status: "UNAVAILABLE" }
  | { status: "READY_FOR_PAYMENT"; amountCents: number; currency: string }
  | { status: "PAYMENT_PENDING" | "PROCESSING" | "EXPIRED" | "FAILED" | "REFUNDED" }
  | { status: "COMPLETED"; analysis: Analysis };

export const getPublicReport = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(1).max(128) }))
  .handler(({ data }) => loadPublicReportSafely(getDb, data.token));
