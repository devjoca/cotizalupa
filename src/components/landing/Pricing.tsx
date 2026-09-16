export function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="precio" className="section price-section">
      <div className="price-copy">
        <span className="eyebrow">UN PAGO. UNA DECISIÓN MÁS INFORMADA.</span>
        <h2>
          Una segunda mirada.
          <br />
          Un solo pago.
        </h2>
        <p>
          Para quien contrata, antes de aceptar o pagar.
          <br />
          Sin un plan mensual que no necesitas.
        </p>
        <span className="price-note">
          No calculamos si está caro o barato.
          <br />
          Te ayudamos a ver qué condiciones económicas faltan precisar.
        </span>
      </div>
      <div className="price-card">
        <span className="label">REVISIÓN DE UNA COTIZACIÓN</span>
        <div className="large-price">
          S/39<span>pago único</span>
        </div>
        <ul>
          <li>Revisión según el tipo de servicio</li>
          <li>Lo claro, lo ambiguo y lo ausente</li>
          <li>Escenarios que conviene contemplar</li>
          <li>Las 3 prioridades para resolver</li>
          <li>Preguntas o textos listos para copiar</li>
        </ul>
        <button className="button blue" onClick={onStart}>
          Revisar mi cotización <span>↗</span>
        </button>
        <p className="fine-print">Sin cuenta. Sin suscripción.</p>
      </div>
    </section>
  );
}
