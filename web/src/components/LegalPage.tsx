import type { ReactNode } from "react";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function legalPageHead(path: string, title: string, description: string) {
  return {
    meta: [
      { title: `${title} | CotizaLupa` },
      { name: "description", content: description },
    ],
    links: [{ rel: "canonical", href: `https://cotizalupa.com${path}` }],
  };
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: LegalPageProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="CotizaLupa, inicio">
          Cotiza<span>Lupa</span>
          <span className="legal-brand-period" aria-hidden="true">
            .
          </span>
        </a>
        <nav className="legal-nav" aria-label="Información de CotizaLupa">
          <a href="/privacidad">Privacidad</a>
          <a href="/terminos">Términos</a>
          <a href="/reembolsos">Reembolsos</a>
          <a href="/contacto">Contacto</a>
        </nav>
      </header>

      <main className="legal-main">
        <p className="legal-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>

        <div className="legal-notice">
          <p>Responsable: Jose Carlos Pereyra Leon, quien opera CotizaLupa.</p>
          <p><a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a></p>
          <p>Última actualización: 17 de septiembre de 2026.</p>
        </div>

        <div className="legal-content">{children}</div>
      </main>

      <footer className="legal-footer">
        <a className="legal-footer-brand" href="/">
          Cotiza<span>Lupa</span>
          <span className="legal-brand-period" aria-hidden="true">
            .
          </span>
        </a>
        <span>© 2026 CotizaLupa · Versión de demostración</span>
        <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>
      </footer>
    </div>
  );
}
