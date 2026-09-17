import type { analyzeFiles } from "../server/analyze";

export type AnalyzeResult = Awaited<ReturnType<typeof analyzeFiles>>;

// Used only by the /analyze prompt-validation page. Product reports render on
// /r/{token} through ReportDocument.
export function ReportView({ result }: { result: AnalyzeResult }) {
  if (result.status !== "COMPLETED") {
    return (
      <section>
        <h2>
          {result.status === "DOCUMENT_REJECTED" || result.status === "AI_REFUSED"
            ? "No podemos analizar este documento"
            : "No se pudo completar el análisis"}
        </h2>
        <p>{result.message}</p>
      </section>
    );
  }
  const a = result.analysis;
  const quotation = a.quotation_facts
    ? {
        supplier: a.quotation_facts.supplier,
        service: a.quotation_facts.service,
        amount: a.quotation_facts.amount,
        summary: a.quotation_facts.summary,
      }
    : null;
  return (
    <section>
      <p>
        {result.model} · {result.latency_ms} ms · {result.usage.input_tokens}/
        {result.usage.output_tokens} tokens
      </p>
      <h2>Claro</h2>
      <ul>
        {a.clear_items.map((c) => (
          <li key={c.title}>
            <strong>{c.title}</strong> — {c.detail}
          </li>
        ))}
      </ul>
      <h2>Falta aclarar ({a.gaps.length})</h2>
      <ul>
        {a.gaps.map((g) => (
          <li key={g.title}>
            <strong>{g.title}</strong> [{g.status}]<br />
            {g.why_it_matters}
            <br />
            <em>Pregunta: {g.suggested_question}</em>
          </li>
        ))}
      </ul>
      <h2>Y si…</h2>
      <ul>
        {a.what_if.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <h2>Prioridades</h2>
      <ol>
        {a.priorities.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <details>
        <summary>JSON + facts</summary>
        <pre>
          {JSON.stringify(
            { quotation, quotation_facts: a.quotation_facts },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
