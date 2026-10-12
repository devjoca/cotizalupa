import type { ReactNode } from "react";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function legalPageHead(path: string, title: string, description: string) {
  const pageTitle = `${title} | CotizaLupa`;
  const url = `https://cotizalupa.com${path}`;
  const image = "https://cotizalupa.com/og.png";

  return {
    meta: [
      { title: pageTitle },
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: pageTitle },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: pageTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "es", href: url },
    ],
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
