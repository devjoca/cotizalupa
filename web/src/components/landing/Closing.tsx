import { Icon } from "./Icon";

export function Closing({ onStart }: { onStart: () => void }) {
  return (
    <section className="closing">
      <h2>Antes de aceptar, deja todo por escrito.</h2>
      <button className="button lime" onClick={onStart}>
        Revisar mi cotización <Icon name="arrow-up-right" />
      </button>
      <p>Precio de lanzamiento: $9.99 USD · pago único</p>
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
      <nav className="footer-links" aria-label="Información legal y contacto">
        <a href="/privacidad">Privacidad</a>
        <a href="/terminos">Términos</a>
        <a href="/reembolsos">Reembolsos</a>
        <a href="/contacto">Contacto</a>
      </nav>
      <span>© 2026 CotizaLupa</span>
    </footer>
  );
}
