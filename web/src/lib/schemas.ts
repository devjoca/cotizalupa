// The report shape returned by GET /api/reports/{token}. The Go server
// validates it (parseAnalysis in internal/app/analysis.go) before saving, so
// the client only needs the type. Unknown values are null, never inferred.
export type Analysis = {
  document: {
    is_quotation: boolean;
    quotation_count: number;
    is_legible: boolean;
    is_single_commercial_proposal: boolean;
    rejection_reason: string | null;
  };
  clear_items: { title: string; detail: string }[];
  gaps: {
    title: string;
    status: "missing" | "ambiguous";
    evidence: string | null;
    missing: string | null;
    why_it_matters: string;
    suggested_question: string;
  }[];
  what_if: string[];
  priorities: string[];
  // Null for a limited report.
  quotation_facts: {
    document_type: "quotation";
    service: string | null;
    supplier: string | null;
    amount: { value_cents: number | null; currency: string | null };
    summary: string | null;
    scope_summary: string | null;
    delivery_summary: string | null;
    payment_summary: string | null;
  } | null;
};
