import { ReportDocument } from "#/components/ReportDocument";

import { LANDING_EXAMPLES } from "./content";

export function Example({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (exampleId: string) => void;
}) {
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
              onClick={() => onSelect(item.id)}
            >
              {item.tab}
            </button>
          ))}
        </div>
        <div className="source-card">
          <span className="label">COTIZACIÓN DE EJEMPLO</span>
          <h3>{example.sourceTitle}</h3>
          <a
            className="source-thumb"
            href={example.image.src}
            target="_blank"
            rel="noreferrer"
          >
            <img
              key={example.id}
              src={example.image.src}
              alt={example.image.alt}
              width={example.image.width}
              height={example.image.height}
              loading="lazy"
              decoding="async"
            />
          </a>
          <span className="label">LO QUE CONTÓ EL CLIENTE</span>
          <p className="source-situation">“{example.situation}”</p>
        </div>
        <p className="example-note">
          Reporte generado por CotizaLupa a partir de una cotización de ejemplo
          con datos ficticios. No mencionar algo no significa que esté
          excluido: significa que conviene preguntarlo.
        </p>
      </div>
      <div aria-live="polite">
        <ReportDocument analysis={example.analysis} embedded />
      </div>
    </section>
  );
}
