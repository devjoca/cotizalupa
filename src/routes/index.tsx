import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import landingCss from "../styles/landing.css?url";
import { Hero } from "../components/landing/Hero";
import { RoleCards } from "../components/landing/RoleCards";
import { Example } from "../components/landing/Example";
import { Method } from "../components/landing/Method";
import { Pricing } from "../components/landing/Pricing";
import { Faq } from "../components/landing/Faq";
import { Closing, Footer } from "../components/landing/Closing";
import { ReviewDialog } from "../components/landing/ReviewDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "CotizaLupa — Lo que falta dejar claro en tu cotización",
      },
      {
        name: "description",
        content:
          "Descubre qué falta aclarar en una cotización antes de aceptarla. Revisión para clientes. S/39, sin suscripción.",
      },
      { name: "theme-color", content: "#b33127" },
    ],
    links: [{ rel: "stylesheet", href: landingCss }],
  }),
  component: Landing,
});

function Landing() {
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
          Revisar cotización <span aria-hidden="true">↗</span>
        </button>
      </header>
      <main>
        <Hero onStart={startFlow} />
        <div className="category-strip">
          <span>PARA ACUERDOS GRANDES Y PEQUEÑOS</span>
          <div>
            Muebles a medida <i>✳</i> Remodelaciones <i>✳</i> Desarrollo web{" "}
            <i>✳</i> Eventos <i>✳</i> Y mucho más
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
