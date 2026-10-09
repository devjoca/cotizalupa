import { renderToString } from "react-dom/server";
import {
  HeadContent,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
} from "@tanstack/react-router";

import { getRouter } from "./router";

// Public pages that get static HTML at build time, so crawlers and link
// previews read the content without running JavaScript.
export const PRERENDER_PATHS = ["/", "/terminos", "/privacidad", "/reembolsos", "/contacto"];

// Rendered by the router's notFoundComponent.
export const NOT_FOUND_PATH = "/__no-existe";

export async function render(path: string) {
  const router = getRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return {
    head: renderToString(
      <RouterContextProvider router={router}>
        <HeadContent />
      </RouterContextProvider>,
    ),
    body: renderToString(<RouterProvider router={router} />),
  };
}

// /r/{token} needs the API, so its HTML is a static placeholder. Report links
// open from mobile email apps where the script can be slow or blocked.
export function renderReportShell() {
  return {
    head: renderToString(
      <>
        <title>Tu reporte | CotizaLupa</title>
        <meta name="robots" content="noindex, nofollow" />
      </>,
    ),
    body: renderToString(
      <main className="report-page report-page--state">
        <section className="report-state">
          <a className="report-brand" href="/" aria-label="CotizaLupa, inicio">
            Cotiza<span>Lupa</span>
          </a>
          <p className="report-state__eyebrow">ABRIENDO TU REPORTE</p>
          <h1>Estamos cargando tu reporte.</h1>
          <p>
            Si esta página no cambia en unos segundos, recárgala. Si sigue
            igual, escríbenos a soporte@cotizalupa.com con el enlace que
            recibiste.
          </p>
        </section>
      </main>,
    ),
  };
}
