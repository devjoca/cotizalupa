import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { rememberMetaClick } from "../lib/adAttribution";

import { Hero } from "../components/landing/Hero";
import { CategoryStrip } from "../components/landing/CategoryStrip";
import { LANDING_EXAMPLES } from "../components/landing/content";
import { RoleCards } from "../components/landing/RoleCards";
import { Example } from "../components/landing/Example";
import { Method } from "../components/landing/Method";
import { Pricing } from "../components/landing/Pricing";
import { FAQ_ITEMS, Faq } from "../components/landing/Faq";
import { Closing, Footer } from "../components/landing/Closing";
import { ReviewDialog } from "../components/landing/ReviewDialog";
import { Icon } from "../components/landing/Icon";

const SITE = "https://cotizalupa.com";
const TITLE = "Revisa tu cotización antes de pagar | CotizaLupa";
const DESCRIPTION =
  "Sube tu cotización en PDF o foto y recibe un reporte con lo que está claro, lo que falta aclarar y las preguntas para tu proveedor. $9.99 USD, pago único.";
const OG_IMAGE = `${SITE}/og.png`;
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};
const PRODUCT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Revisión de cotizaciones de CotizaLupa",
  description: DESCRIPTION,
  image: OG_IMAGE,
  brand: {
    "@type": "Brand",
    name: "CotizaLupa",
  },
  offers: {
    "@type": "Offer",
    url: `${SITE}/`,
    price: "9.99",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CotizaLupa" },
      { property: "og:locale", content: "es_LA" },
      { property: "og:url", content: `${SITE}/` },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CotizaLupa",
          url: `${SITE}/`,
          inLanguage: "es",
        },
      },
      { "script:ld+json": FAQ_SCHEMA },
      { "script:ld+json": PRODUCT_SCHEMA },
    ],
    links: [
      { rel: "canonical", href: `${SITE}/` },
      { rel: "alternate", hrefLang: "es", href: `${SITE}/` },
    ],
  }),
  component: Landing,
});

function Landing() {
  useEffect(() => {
    rememberMetaClick();
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const [exampleId, setExampleId] = useState(LANDING_EXAMPLES[0].id);

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
        <Hero onStart={startFlow} onShowExample={setExampleId} />
        <CategoryStrip />
        <RoleCards onStart={startFlow} />
        <Example activeId={exampleId} onSelect={setExampleId} />
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
