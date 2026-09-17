import { useRef, useState } from "react";

import type { Analysis } from "#/lib/schemas";

function CopyQuestion({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      const node = textRef.current;
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return (
    <div className="copy-box">
      <p ref={textRef}>{text}</p>
      <button type="button" onClick={copy}>
        {copied ? "✓ Copiado" : "Copiar pregunta"}
      </button>
    </div>
  );
}

export function ReportDocument({ analysis }: { analysis: Analysis }) {
  const facts = analysis.quotation_facts;
  const title = facts?.service ?? "Revisión de tu cotización";
  const subtitle = facts?.supplier
    ? `Cotización de ${facts.supplier}`
    : "Puntos que conviene aclarar antes de decidir";

  return (
    <article className="report-document">
      <header className="report-document__head">
        <a className="report-brand" href="/" aria-label="CotizaLupa, inicio">
          Cotiza<span>Lupa</span>
        </a>
        <span>REPORTE DE COTIZALUPA</span>
      </header>

      <div className="report-document__title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {facts?.summary ? <p>{facts.summary}</p> : null}
      </div>

      {analysis.priorities.length > 0 ? (
        <section className="report-priorities">
          <h2>Primero revisa esto</h2>
          <ol>
            {analysis.priorities.map((priority, index) => (
              <li key={`${index}-${priority}`}>{priority}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="report-block">
        <h2>
          <span className="report-icon report-icon--clear">✓</span>
          Lo que está claro
        </h2>
        {analysis.clear_items.length > 0 ? (
          <div className="report-findings">
            {analysis.clear_items.map((item, index) => (
              <div className="report-finding" key={`${index}-${item.title}`}>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No encontramos puntos suficientemente claros para destacar.</p>
        )}
      </section>

      <section className="report-block">
        <h2>
          <span className="report-icon">!</span>
          Lo que falta aclarar
        </h2>
        {analysis.gaps.length > 0 ? (
          <div className="report-findings">
            {analysis.gaps.map((gap, index) => (
              <div className="report-finding" key={`${index}-${gap.title}`}>
                <h3>{gap.title}</h3>
                {gap.evidence ? <blockquote>{gap.evidence}</blockquote> : null}
                {gap.missing ? <p>{gap.missing}</p> : null}
                <p>{gap.why_it_matters}</p>
                <CopyQuestion text={gap.suggested_question} />
              </div>
            ))}
          </div>
        ) : (
          <p>No encontramos vacíos importantes en esta cotización.</p>
        )}
      </section>

      {analysis.what_if.length > 0 ? (
        <section className="report-block">
          <h2>
            <span className="report-icon">?</span>
            Qué podría pasar
          </h2>
          <ul>
            {analysis.what_if.map((scenario, index) => (
              <li key={`${index}-${scenario}`}>{scenario}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="report-document__foot">
        Orientación para aclarar el acuerdo. No certifica la cotización ni
        reemplaza asesoría profesional.
      </footer>
    </article>
  );
}
