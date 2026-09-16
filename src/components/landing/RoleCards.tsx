export function RoleCards({ onStart }: { onStart: () => void }) {
  return (
    <section id="perspectivas" className="section perspective-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">EMPEZAMOS POR TU LADO.</span>
          <h2>
            Antes de pagar,
            <br />
            pregunta lo que falta.
          </h2>
        </div>
        <p>
          Hoy revisamos cotizaciones desde el lado del cliente. La perspectiva
          proveedor llega pronto.
        </p>
      </div>
      <div className="perspective-grid">
        <button className="perspective-card client" onClick={onStart}>
          <span className="card-number">01 / SOY CLIENTE</span>
          <h3>
            Antes de pagar,
            <br />
            pregunta lo que falta.
          </h3>
          <p>
            ¿Cuándo entregan? ¿Qué incluye? ¿Quién responde si algo sale mal?
          </p>
          <span className="card-link">
            Quiero revisar lo que voy a aceptar <b>↗</b>
          </span>
        </button>
        <div className="perspective-card provider is-soon" aria-disabled="true">
          <span className="card-number">02 / SOY PROVEEDOR</span>{" "}
          <span className="soon-tag">PRONTO</span>
          <h3>
            Antes de enviarla,
            <br />
            deja claros tus límites.
          </h3>
          <p>¿Cuántos cambios? ¿Qué entrega el cliente? ¿Qué se cobra aparte?</p>
          <span className="card-link">En camino — aún no disponible</span>
        </div>
      </div>
    </section>
  );
}
