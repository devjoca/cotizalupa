import { z } from "zod";

// PLAN.md "Pre-check" — the only gate before payment. No `confidence` field:
// uncertainty goes in `reason` and the user is asked to upload separately.
export const PrecheckSchema = z.object({
  is_quotation: z.boolean(),
  quotation_count: z.number().int().min(0),
  is_legible: z.boolean(),
  is_single_commercial_proposal: z.boolean(),
  reason: z.string().nullable(),
});

export type Precheck = z.infer<typeof PrecheckSchema>;

export const acceptPrecheck = (r: Precheck): boolean =>
  r.is_quotation &&
  r.is_legible &&
  r.quotation_count === 1 &&
  r.is_single_commercial_proposal;
