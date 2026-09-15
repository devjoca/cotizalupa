import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";

import landingBody from "./landing-body.html?raw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "CotizaLupa — Lo que falta dejar claro en tu cotización",
      },
      {
        name: "description",
        content:
          "Descubre qué falta aclarar en una cotización antes de aceptarla o enviarla. Una revisión, dos perspectivas. S/20, sin suscripción.",
      },
      { name: "theme-color", content: "#b33127" },
    ],
    links: [{ rel: "stylesheet", href: "/mockup/style.css" }],
  }),
  component: Landing,
});

// Temporary scaffold: serves the mockup verbatim (vanilla HTML + JS) until the
// landing/upload flow is rebuilt in React (phase 1). The script runs top-level
// (no DOMContentLoaded), so it must execute after the markup is injected.
function Landing() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = landingBody;
    const script = document.createElement("script");
    script.src = "/mockup/app.js";
    host.appendChild(script);
    return () => {
      host.innerHTML = "";
    };
  }, []);

  return <div ref={ref} />;
}
