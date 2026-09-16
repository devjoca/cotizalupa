export function Closing({ onStart }: { onStart: () => void }) {
  return (
    <section className="closing">
      <span className="eyebrow">ANTES DE DECIR «YO PENSÉ QUE INCLUÍA…»</span>
      <h2>
        Que quede claro.
        <br />
        Desde el principio.
      </h2>
      <button className="button lime" onClick={onStart}>
        Revisar mi cotización <span>↗</span>
      </button>
      <p>S/39 por revisión · sin suscripción</p>
    </section>
  );
}

export function Footer() {
  return (
    <footer>
      <a className="brand" href="#">
        Cotiza<span>Lupa</span>
        <span className="brand-period" aria-hidden="true">
          .
        </span>
      </a>
      <p>Lo que falta dejar claro.</p>
      <span>© 2026 CotizaLupa · Versión de demostración</span>
    </footer>
  );
}
