import { useRef, useState } from "react";

import { CLIENT_EXAMPLE } from "./content";

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable: select the text so the user can copy it.
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
        {copied ? "✓ Copiado" : "▢ Copiar pregunta"}
      </button>
    </div>
  );
}

export function Example() {
  const report = CLIENT_EXAMPLE;

  return (
    <section id="ejemplo" className="examples section">
      <div className="example-intro">
        <span className="eyebrow">MENOS SUPUESTOS. MEJORES PREGUNTAS.</span>
        <h2>
          Esto es lo que
          <br />{" "}
          te llevas.
        </h2>
        <p>
          Un reporte que conecta lo que dice tu cotización con lo que aún
          necesitas aclarar.
        </p>
        <div
          className="segmented"
          role="group"
          aria-label="Perspectiva del ejemplo"
        >
          <button
            type="button"
            className="active"
            data-example="cliente"
            aria-pressed="true"
          >
            Soy cliente
          </button>
          <button
            type="button"
            data-example="proveedor"
            aria-pressed="false"
            disabled
            title="Próximamente"
          >
            Soy proveedor · pronto
          </button>
        </div>
        <div className="source-card">
          <span className="label">DOCUMENTO DE EJEMPLO</span>
          <h3>{report.title}</h3>
          <p>
            {report.sourceLines.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </div>
        <p className="example-note">
          Ejemplo ilustrativo, no un análisis de un cliente real. No mencionar
          algo no significa que esté excluido: significa que conviene
          preguntarlo.
        </p>
      </div>
      <div className="report" id="report" aria-live="polite">
        <div className="report-head">
          <span className="brand">
            Cotiza<span>Lupa</span>
          </span>
          <span>REPORTE DE EJEMPLO</span>
        </div>
        <div className="report-title">
          <h3>{report.reportHeading}</h3>
          <p>{report.reportSubtitle}</p>
        </div>
        <div className="priorities">
          <h4>{report.prioritiesHeading}</h4>
          <ol>
            {report.priorities.map((priority) => (
              <li key={priority}>{priority}</li>
            ))}
          </ol>
        </div>
        <div className="report-section">
          <h4>
            <span className="status-icon">✓</span>
            {report.clearTitle}
          </h4>
          <ul>
            {report.clear.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="report-section">
          <h4>
            <span className="status-icon amber">!</span>
            {report.missingTitle}
          </h4>
          {report.missing.map((gap) => (
            <div className="finding" key={gap.title}>
              <b>{gap.title}</b>
              <blockquote>{gap.quote}</blockquote>
              <p>{gap.detail}</p>
            </div>
          ))}
        </div>
        <div className="report-section">
          <h4>
            <span className="status-icon purple">?</span>
            {report.scenario}
          </h4>
          <p>{report.scenarioText}</p>
        </div>
        <div className="report-section">
          <h4>{report.copyTitle}</h4>
          {report.copies.map((copy) => (
            <CopyBox key={copy} text={copy} />
          ))}
        </div>
        <div className="report-foot">
          Orientación para aclarar el acuerdo. No certifica la cotización.
        </div>
      </div>
    </section>
  );
}
