import { createFileRoute } from "@tanstack/react-router";

import { ReportDocument } from "#/components/ReportDocument";
import { getPublicReport } from "#/server/report";
import reportDocumentCss from "#/styles/report-document.css?url";
import reportCss from "#/styles/report.css?url";

// Public report page. The server hashes the URL token before lookup; the raw
// token never reaches the database. This route intentionally has no Meta pixel.
export const Route = createFileRoute("/r/$token")({
  loader: ({ params }) => getPublicReport({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Tu reporte | CotizaLupa" },
      {
        name: "description",
        content: "Reporte privado de revisión de cotización.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "stylesheet", href: reportCss },
      { rel: "stylesheet", href: reportDocumentCss },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const result = Route.useLoaderData();

  if (result.status === "COMPLETED") {
    return (
      <main className="report-page">
        <nav className="report-nav" aria-label="Navegación del reporte">
          <a href="/">← Volver al inicio</a>
          <button type="button" onClick={() => window.print()}>
            Guardar como PDF
          </button>
        </nav>
        <ReportDocument analysis={result.analysis} />
      </main>
    );
  }

  const content =
    result.status === "NOT_READY"
      ? {
          eyebrow: "ANÁLISIS EN PROCESO",
          title: "Tu reporte todavía no está listo.",
          detail:
            "Estamos revisando la cotización. Vuelve a abrir este mismo enlace en unos minutos.",
        }
      : result.status === "NOT_FOUND"
        ? {
            eyebrow: "ENLACE NO VÁLIDO",
            title: "No encontramos este reporte.",
            detail:
              "Revisa que el enlace esté completo. Por seguridad, no podemos buscar reportes por nombre o documento.",
          }
        : {
            eyebrow: "REPORTE NO DISPONIBLE",
            title: "No podemos mostrar este reporte.",
            detail:
              "El análisis no se completó o necesita revisión manual.",
          };

  return (
    <main className="report-page report-page--state">
      <section className="report-state">
        <a className="report-brand" href="/" aria-label="CotizaLupa, inicio">
          Cotiza<span>Lupa</span>
        </a>
        <p className="report-state__eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.detail}</p>
        <a className="report-state__link" href="/">
          Volver a CotizaLupa
        </a>
      </section>
    </main>
  );
}
