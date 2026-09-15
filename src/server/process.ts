// Single process. IPN handler calls processNext() after responding 200.
// A 60s setInterval also calls processNext() (stuck orders + expired deletes).
// Claim query with FOR UPDATE SKIP LOCKED; after 3 attempts → PROCESSING_FAILED.
// Analysis: Responses API, store:false, strict json_schema, Zod as second barrier.
// See PLAN.md "Procesamiento" and "Análisis". TODO: phase 2.
export async function processNext(): Promise<void> {
  // TODO: implement claim query + model call.
}
