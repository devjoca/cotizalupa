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
    result.status === "READY_FOR_PAYMENT"
      ? {
          eyebrow: "ORDEN CREADA",
          title: "Guardamos tus archivos.",
          detail: `Todavía no hemos revisado su contenido. La revisión costará $${result.amountCents / 100} ${result.currency}. Los pagos todavía no están habilitados. No se ha realizado ningún cobro ni generado el reporte. Guarda este enlace para volver a consultar el estado.`,
        }
      : result.status === "PAYMENT_PENDING"
      ? {
          eyebrow: "PAGO POR CONFIRMAR",
          title: "Estamos esperando la confirmación del pago.",
          detail: "No vuelvas a pagar. Actualiza este enlace para consultar el estado o escribe a soporte si el pago ya se realizó.",
        }
      : result.status === "EXPIRED"
      ? {
          eyebrow: "REVISIÓN VENCIDA",
          title: "Necesitamos que vuelvas a subir la cotización.",
          detail: "Esta solicitud venció y ya no admite pagos. Puedes iniciar una nueva revisión desde el inicio.",
        }
      : result.status === "FAILED"
      ? {
          eyebrow: "REVISIÓN PENDIENTE DE SOPORTE",
          title: "No pudimos completar tu reporte.",
          detail: "Escríbenos a soporte@cotizalupa.com con el enlace de esta página para gestionar el reembolso manual. No vuelvas a pagar.",
        }
      : result.status === "REFUNDED"
      ? {
          eyebrow: "REEMBOLSO REGISTRADO",
          title: "Hemos registrado el reembolso de esta revisión.",
          detail: "Consulta el estado de la devolución con tu proveedor de pago. Si tienes dudas, escribe a soporte@cotizalupa.com.",
        }
      : result.status === "NOT_READY" || result.status === "PROCESSING"
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
        {(result.status === "PAYMENT_PENDING" || result.status === "PROCESSING") && (
          <button type="button" onClick={() => window.location.reload()}>Actualizar estado</button>
        )}
        <a className="report-state__link" href="/">
          Volver a CotizaLupa
        </a>
      </section>
    </main>
  );
}
