import { useState } from "react";

import { ReportDocument } from "#/components/ReportDocument";

import { LANDING_EXAMPLES } from "./content";

export function Example() {
  const [activeId, setActiveId] = useState(LANDING_EXAMPLES[0].id);
  const example =
    LANDING_EXAMPLES.find((item) => item.id === activeId) ?? LANDING_EXAMPLES[0];

  return (
    <section id="ejemplo" className="examples section">
      <div className="example-intro">
        <h2>Así se ve el reporte</h2>
        <div className="segmented" role="group" aria-label="Cotización de ejemplo">
          {LANDING_EXAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === example.id ? "active" : undefined}
              data-example={item.id}
              aria-pressed={item.id === example.id}
              onClick={() => setActiveId(item.id)}
            >
              {item.tab}
            </button>
          ))}
        </div>
        <div className="source-card">
          <span className="label">DOCUMENTO DE EJEMPLO</span>
          <h3>{example.sourceTitle}</h3>
          <p>
            {example.sourceLines.map((line) => (
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
      <div aria-live="polite">
        <ReportDocument analysis={example.analysis} embedded />
      </div>
    </section>
  );
}
