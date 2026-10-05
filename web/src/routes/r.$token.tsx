import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { ReportDocument } from "#/components/ReportDocument";
import { beginCheckout, getPublicReport } from "#/lib/api";

// Public report page. The server hashes the URL token before lookup; the raw
// token never reaches the database. This route intentionally has no Meta pixel.
export const Route = createFileRoute("/r/$token")({
  loader: ({ params }) => getPublicReport({ data: { token: params.token } }),
  errorComponent: ReportLoadError,
  head: () => ({
    meta: [
      { title: "Tu reporte | CotizaLupa" },
      {
        name: "description",
        content: "Reporte privado de revisión de cotización.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReportPage,
});

function ReportLoadError() {
  const router = useRouter();
  return (
    <main className="report-page report-page--state">
      <section className="report-state">
        <a className="report-brand" href="/" aria-label="CotizaLupa, inicio">
          Cotiza<span>Lupa</span>
        </a>
        <p className="report-state__eyebrow">SIN CONEXIÓN</p>
        <h1>No pudimos cargar tu reporte.</h1>
        <p>
          Revisa tu conexión a internet e inténtalo de nuevo. Tu enlace sigue
          guardado: no necesitas crear otra orden ni volver a pagar.
        </p>
        <button type="button" onClick={() => router.invalidate()}>
          Reintentar
        </button>
        <a className="report-state__link" href="/">
          Volver a CotizaLupa
        </a>
      </section>
    </main>
  );
}

function ReportPage() {
  const result = Route.useLoaderData();
  const { token } = Route.useParams();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function openCheckout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const next = await beginCheckout({ data: { token } });
      if (next.status === "CHECKOUT") {
        window.location.assign(next.url);
        return;
      }
      if (next.status === "PENDING") {
        window.location.reload();
        return;
      }
      if (next.status === "EXPIRED") {
        window.location.reload();
        return;
      }
      if (next.status === "INVALID_FILES") {
        window.location.reload();
        return;
      }
      setCheckoutError("No pudimos abrir el pago. Inténtalo más tarde o escribe a soporte@cotizalupa.com.");
    } catch {
      setCheckoutError("No pudimos abrir el pago. Inténtalo más tarde.");
    } finally {
      setCheckoutBusy(false);
    }
  }

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
          eyebrow: "PAGO PENDIENTE",
          title: "Tu revisión está lista para pagar.",
          detail: `La revisión cuesta $${result.amountCents / 100} ${result.currency}. Después del pago, tu reporte aparecerá aquí y te lo enviaremos por correo.`,
        }
      : result.status === "PAYMENT_PENDING"
      ? {
          eyebrow: "PAGO POR CONFIRMAR",
          title: "Estamos esperando la confirmación del pago.",
          detail: "Consulta el estado aquí. Si ya pagaste, no crees otra orden. Si Polar confirma que el checkout venció sin pago, esta orden se cerrará.",
        }
      : result.status === "REJECTED"
      ? {
          eyebrow: "ARCHIVOS NO DISPONIBLES",
          title: "Necesitamos que vuelvas a subir la cotización.",
          detail: "No pudimos verificar los archivos guardados. Esta orden no admite pagos y no se realizó ningún cobro. Puedes iniciar una nueva revisión desde el inicio.",
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
      : result.status === "NOT_READY"
      ? {
          eyebrow: "ORDEN EN PREPARACIÓN",
          title: "Tu orden todavía no está lista.",
          detail: "Todavía no hemos iniciado el análisis ni realizado ningún cobro. Actualiza esta página para consultar el estado de los archivos.",
        }
      : result.status === "PROCESSING"
      ? {
          eyebrow: "ANÁLISIS EN PROCESO",
          title: "Tu reporte todavía no está listo.",
          detail:
            "Estamos revisando la cotización. Te enviaremos el enlace por correo cuando el reporte esté listo. Puedes cerrar esta página y volver a abrir el mismo enlace.",
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
        {(result.status === "READY_FOR_PAYMENT" || result.status === "PAYMENT_PENDING") && (
          <button type="button" disabled={checkoutBusy} onClick={openCheckout}>
            {checkoutBusy ? "Consultando pago…" : result.status === "READY_FOR_PAYMENT" ? "Pagar revisión" : "Consultar pago"}
          </button>
        )}
        {checkoutError && <p role="alert">{checkoutError}</p>}
        {(result.status === "NOT_READY" || result.status === "PROCESSING") && (
          <button type="button" onClick={() => window.location.reload()}>Actualizar estado</button>
        )}
        <a className="report-state__link" href="/">
          Volver a CotizaLupa
        </a>
      </section>
    </main>
  );
}
