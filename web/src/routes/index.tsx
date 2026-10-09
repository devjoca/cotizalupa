import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { rememberMetaClick } from "../lib/adAttribution";

import { Hero } from "../components/landing/Hero";
import { RoleCards } from "../components/landing/RoleCards";
import { Example } from "../components/landing/Example";
import { Method } from "../components/landing/Method";
import { Pricing } from "../components/landing/Pricing";
import { Faq } from "../components/landing/Faq";
import { Closing, Footer } from "../components/landing/Closing";
import { ReviewDialog } from "../components/landing/ReviewDialog";
import { Icon } from "../components/landing/Icon";

const SITE = "https://cotizalupa.com";
const TITLE = "Revisa tu cotización antes de pagar | CotizaLupa";
const DESCRIPTION =
  "Sube tu cotización en PDF o foto y recibe un reporte con lo que está claro, lo que falta aclarar y las preguntas para tu proveedor. $9.99 USD, pago único.";
const OG_IMAGE = `${SITE}/og.png`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CotizaLupa" },
      { property: "og:locale", content: "es_PE" },
      { property: "og:url", content: `${SITE}/` },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CotizaLupa",
          url: `${SITE}/`,
          inLanguage: "es-PE",
        },
      },
    ],
    links: [{ rel: "canonical", href: `${SITE}/` }],
  }),
  component: Landing,
});

function Landing() {
  useEffect(() => {
    rememberMetaClick();
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);

  // Iteration 1 is cliente-only: every entry point opens the same client flow.
  function startFlow() {
    setFlowKey((key) => key + 1);
    setDialogOpen(true);
  }

  return (
    <>
      <header>
        <a href="#" className="brand" aria-label="CotizaLupa, inicio">
          Cotiza<span>Lupa</span>
          <span className="brand-period" aria-hidden="true">
            .
          </span>
        </a>
        <nav aria-label="Principal">
          <a href="#como">Cómo funciona</a>
          <a href="#ejemplo">Ver un ejemplo</a>
          <a href="#precio">Precio</a>
        </nav>
        <button className="button small dark" onClick={startFlow}>
          Revisar cotización <Icon name="arrow-up-right" />
        </button>
      </header>
      <main>
        <div className="availability-note" role="status">
          Revisa tus archivos antes de crear una orden. El pago único de $9.99 USD se abre desde el enlace privado; la IA analiza después de la confirmación.
        </div>
        <Hero onStart={startFlow} />
        <div className="category-strip">
          <div>
            Muebles a medida <i aria-hidden="true">✳</i> Remodelaciones{" "}
            <i aria-hidden="true">✳</i> Desarrollo web{" "}
            <i aria-hidden="true">✳</i> Eventos <i aria-hidden="true">✳</i>{" "}
            Y mucho más
          </div>
        </div>
        <RoleCards onStart={startFlow} />
        <Example />
        <Method />
        <Pricing onStart={startFlow} />
        <Faq />
        <Closing onStart={startFlow} />
      </main>
      <Footer />
      <ReviewDialog
        key={flowKey}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
