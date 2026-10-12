import { Icon } from "./Icon";

export function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="precio" className="section price-section">
      <div className="price-copy">
        <h2>Un solo pago.</h2>
        <p>
          Cada cotización depende de lo que incluye y de sus condiciones.
          Te ayudamos a ver qué conviene aclarar antes de aceptar o pagar.
        </p>
      </div>
      <div className="price-card">
        <span className="label">PRECIO DE LANZAMIENTO · UNA COTIZACIÓN</span>
        <div className="large-price">
          $9.99 USD<span>pago único</span>
        </div>
        <ul>
          <li>Lo claro y lo que falta aclarar</li>
          <li>Las 3 prioridades para resolver</li>
          <li>Preguntas listas para copiar</li>
        </ul>
        <button className="button blue" onClick={onStart}>
          Revisar mi cotización <Icon name="arrow-up-right" />
        </button>
      </div>
    </section>
  );
}
