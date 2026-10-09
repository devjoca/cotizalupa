import { useEffect, useRef, useState } from "react";

import type { Analysis } from "#/lib/schemas";

// When the Clipboard API is unavailable, selecting the text lets the user copy it by hand.
function selectContents(node: HTMLElement | null) {
  if (!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function CopyQuestion({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      selectContents(textRef.current);
    }
  }

  return (
    <div className="copy-box">
      <span className="copy-box__label">Pregunta para tu proveedor</span>
      <p ref={textRef}>{text}</p>
      <button type="button" onClick={copy}>
        {copied ? "✓ Copiado" : "Copiar pregunta"}
      </button>
    </div>
  );
}

function CopyAllQuestions({ questions }: { questions: string[] }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const manualRef = useRef<HTMLParagraphElement>(null);
  const text = questions.map((question, index) => `${index + 1}. ${question}`).join("\n\n");

  useEffect(() => {
    if (state === "manual") selectContents(manualRef.current);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2_000);
    } catch {
      setState("manual");
    }
  }

  return (
    <div className="report-copy-all">
      <button type="button" onClick={copy}>
        {state === "copied" ? "✓ Copiadas" : `Copiar las ${questions.length} preguntas`}
      </button>
      {state === "manual" ? <p ref={manualRef}>{text}</p> : null}
    </div>
  );
}

// `embedded` renders the title as h2 for pages that already have their own h1.
export function ReportDocument({ analysis, embedded = false }: { analysis: Analysis; embedded?: boolean }) {
  const Title = embedded ? "h2" : "h1";
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
        <Title>{title}</Title>
        <p>{subtitle}</p>
        {facts?.summary ? <p>{facts.summary}</p> : null}
        {analysis.document.rejection_reason ? (
          <p role="note">Alcance de esta revisión: {analysis.document.rejection_reason}</p>
        ) : null}
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
        {analysis.gaps.length > 1 ? (
          <CopyAllQuestions questions={analysis.gaps.map((gap) => gap.suggested_question)} />
        ) : null}
        {analysis.gaps.length > 0 ? (
          <div className="report-findings">
            {analysis.gaps.map((gap, index) => (
              <div className="report-finding" key={`${index}-${gap.title}`}>
                <h3>{gap.title}</h3>
                {gap.evidence ? (
                  <p className="report-evidence">
                    <span className="report-label">La cotización dice:</span> {gap.evidence}
                  </p>
                ) : null}
                {gap.missing ? (
                  <p>
                    <span className="report-label">Qué falta:</span> {gap.missing}
                  </p>
                ) : null}
                <p>
                  <span className="report-label">Por qué te importa:</span> {gap.why_it_matters}
                </p>
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
