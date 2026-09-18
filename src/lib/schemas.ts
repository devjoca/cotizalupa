import { z } from "zod";

import { CATEGORIES, MOMENTS, OTHER_CATEGORY } from "./reviewContext";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function cleanUserText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CleanOtherSchema = z
  .string()
  .transform(cleanUserText)
  .pipe(z.string().max(160));
const CleanConcernSchema = z
  .string()
  .transform(cleanUserText)
  .pipe(z.string().max(800))
  .transform((value) => value || null);
const ApproximateAmountSchema = z
  .string()
  .transform(cleanUserText)
  .pipe(z.string().max(20))
  .refine(
    (value) => value === "" || /^\d{1,9}(?:\.\d{1,2})?$/.test(value),
    "El monto aproximado no es válido.",
  )
  .transform((value) =>
    value === "" ? null : Math.round(Number(value) * 100),
  );

export const ReviewContextInputSchema = z
  .strictObject({
    category: z.enum(CATEGORIES),
    other: CleanOtherSchema,
    amount: ApproximateAmountSchema,
    moment: z.enum(MOMENTS),
    concern: CleanConcernSchema,
  })
  .superRefine((value, context) => {
    if (value.category === OTHER_CATEGORY && value.other.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["other"],
        message: "Describe el servicio que quieres revisar.",
      });
    }
  })
  .transform((value) => ({
    service_category:
      value.category === OTHER_CATEGORY ? value.other : value.category,
    approximate_amount_cents: value.amount,
    moment: value.moment,
    concern: value.concern,
  }));

export type ReviewContext = z.infer<typeof ReviewContextInputSchema>;

// Paid Astra analysis checks the commercial unit and produces the report.
// The analysis returns the document check, report and facts. Strict json_schema needs
// every field required, so unknowns are `null` — never inferred, never guessed.
export const DocumentCheckSchema = z.strictObject({
  is_quotation: z.boolean(),
  // Plain number: strict json_schema rejects the minimum/maximum that .int() emits.
  quotation_count: z.number(),
  is_legible: z.boolean(),
  is_single_commercial_proposal: z.boolean(),
  rejection_reason: z.string().nullable(),
});

export const AmountSchema = z.strictObject({
  value_cents: z.number().nullable(),
  currency: z.string().nullable(),
});

export const ClearItemSchema = z.strictObject({
  title: z.string(),
  detail: z.string(),
});

export const GapSchema = z.strictObject({
  title: z.string(),
  status: z.enum(["missing", "ambiguous"]),
  evidence: z.string().nullable(),
  missing: z.string().nullable(),
  why_it_matters: z.string(),
  suggested_question: z.string(),
});

// Kept forever without the document. Null when the file was not analyzable.
export const QuotationFactsSchema = z.strictObject({
  // Single-value enum, not literal: strict mode rejects `const`.
  document_type: z.enum(["quotation"]),
  service: z.string().nullable(),
  supplier: z.string().nullable(),
  amount: AmountSchema,
  summary: z.string().nullable(),
  scope_summary: z.string().nullable(),
  delivery_summary: z.string().nullable(),
  payment_summary: z.string().nullable(),
});

// This wire schema stays within the subset accepted by OpenAI strict JSON
// schema. Domain constraints run in AnalysisSchema after the response arrives.
export const AnalysisWireSchema = z.strictObject({
  document: DocumentCheckSchema,
  clear_items: z.array(ClearItemSchema),
  gaps: z.array(GapSchema),
  what_if: z.array(z.string()),
  priorities: z.array(z.string()),
  quotation_facts: QuotationFactsSchema.nullable(),
});

function documentIsAnalyzable(
  document: z.infer<typeof DocumentCheckSchema>,
): boolean {
  return document.is_quotation && document.is_legible &&
    document.quotation_count === 1 && document.is_single_commercial_proposal;
}

export const AnalysisSchema = AnalysisWireSchema.superRefine(
  (analysis, context) => {
    if (
      !Number.isInteger(analysis.document.quotation_count) ||
      analysis.document.quotation_count < 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["document", "quotation_count"],
        message: "quotation_count must be a non-negative integer",
      });
    }

    if (analysis.clear_items.length + analysis.gaps.length > 8) {
      context.addIssue({
        code: "custom",
        path: ["gaps"],
        message: "clear_items and gaps cannot exceed eight findings",
      });
    }
    if (analysis.what_if.length > 3 || analysis.priorities.length > 3) {
      context.addIssue({
        code: "custom",
        path: ["priorities"],
        message: "what_if and priorities cannot exceed three items each",
      });
    }

    const analyzable = documentIsAnalyzable(analysis.document);
    if (analyzable) {
      if (analysis.quotation_facts === null) {
        context.addIssue({
          code: "custom",
          path: ["quotation_facts"],
          message: "an analyzable quotation requires quotation_facts",
        });
      }
      if (analysis.document.rejection_reason !== null) {
        context.addIssue({
          code: "custom",
          path: ["document", "rejection_reason"],
          message: "an analyzable quotation cannot have a rejection_reason",
        });
      }
    } else {
      if (!analysis.document.rejection_reason?.trim()) {
        context.addIssue({
          code: "custom",
          path: ["document", "rejection_reason"],
          message: "a rejected document requires a rejection_reason",
        });
      }
      if (analysis.quotation_facts !== null) {
        context.addIssue({
          code: "custom",
          path: ["quotation_facts"],
          message: "a rejected document cannot have quotation_facts",
        });
      }
      if (
        analysis.clear_items.length > 0 ||
        analysis.gaps.length > 0 ||
        analysis.what_if.length > 0 ||
        analysis.priorities.length > 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["clear_items"],
          message: "a rejected document cannot contain report findings",
        });
      }
    }

    const amount = analysis.quotation_facts?.amount;
    if (
      amount &&
      amount.value_cents !== null &&
      (!Number.isInteger(amount.value_cents) || amount.value_cents < 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["quotation_facts", "amount", "value_cents"],
        message: "value_cents must be a non-negative integer",
      });
    }
    if (amount && amount.currency !== null && !/^[A-Z]{3}$/.test(amount.currency)) {
      context.addIssue({
        code: "custom",
        path: ["quotation_facts", "amount", "currency"],
        message: "currency must be a three-letter ISO code",
      });
    }
    if (amount && amount.value_cents !== null && amount.currency === null) {
      context.addIssue({
        code: "custom",
        path: ["quotation_facts", "amount", "currency"],
        message: "a known amount requires a currency",
      });
    }
  },
);

export type Analysis = z.infer<typeof AnalysisSchema>;

// One value the caller branches on: analyzable → report, else NOT_ANALYZABLE.
export const isAnalyzable = (a: Analysis): boolean =>
  documentIsAnalyzable(a.document);

// CUSTOMER: what the client should clarify before accepting. PROVIDER: what
// the supplier should clarify before sending. Facts never change with it.
export const PerspectiveSchema = z.enum(["customer", "provider"]);
export type Perspective = z.infer<typeof PerspectiveSchema>;
