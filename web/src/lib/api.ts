import type { Analysis } from "./schemas";
import { extensionToMime } from "./uploadLimits";

// Single configured API origin. Local development falls back to the Go API on
// port 3001; a production build fails fast instead of silently calling
// localhost or the frontend's own origin.
const LOCAL_API_URL = "http://localhost:3001";

function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  const configured = raw?.trim().replace(/\/+$/, "");
  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new Error("VITE_API_URL inválido: debe ser una URL absoluta (https://api.cotizalupa.com).");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("VITE_API_URL inválido: debe usar http o https.");
    }
    return parsed.toString().replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) return LOCAL_API_URL;
  throw new Error("Falta VITE_API_URL: la versión desplegada debe apuntar a https://api.cotizalupa.com.");
}

const API_BASE_URL = resolveApiBaseUrl();

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  // No Content-Type on bodyless GETs, so no CORS preflight is triggered.
  const response = await fetch(apiUrl(path), { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export type PrepareResult =
  | { status: "READY_FOR_PAYMENT"; report_token: string }
  | { status: "RATE_LIMITED" | "BUSY" | "INVALID_UPLOAD" | "PREPARATION_FAILED" | "STORAGE_FAILED"; message: string };

export function prepareReview(input: {
  files: File[];
  context: { email: string; concern: string; ad_fbc?: string };
}): Promise<PrepareResult> {
  const body = new FormData();
  body.set("context", JSON.stringify(input.context));
  for (const file of input.files) {
    const mime = file.type || extensionToMime(file.name);
    const upload = file.type || !mime ? file : new Blob([file], { type: mime });
    body.append("files", upload, file.name);
  }
  // The browser sets the multipart boundary; setting Content-Type here would
  // break the upload.
  return fetch(apiUrl("/api/reviews"), { method: "POST", body }).then(async (response) => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json() as Promise<PrepareResult>;
  });
}

export type PublicReportResult =
  | { status: "NOT_FOUND" | "NOT_READY" | "UNAVAILABLE" | "REJECTED" | "PAYMENT_PENDING" | "PROCESSING" | "EXPIRED" | "FAILED" | "REFUNDED" }
  | { status: "READY_FOR_PAYMENT"; amountCents: number; currency: string }
  | { status: "COMPLETED"; analysis: Analysis };

export function getPublicReport(input: { data: { token: string }; signal?: AbortSignal }): Promise<PublicReportResult> {
  return getJson(`/api/reports/${encodeURIComponent(input.data.token)}`, input.signal);
}

export type CheckoutResult =
  | { status: "CHECKOUT"; url: string }
  | { status: "PENDING" | "NOT_FOUND" | "UNAVAILABLE" | "INVALID_FILES" | "EXPIRED" };

export function beginCheckout(input: { data: { token: string } }): Promise<CheckoutResult> {
  return postJson("/api/checkouts", input.data);
}
