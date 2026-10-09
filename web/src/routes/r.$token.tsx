import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  const initialResult = Route.useLoaderData();
  const [result, setResult] = useState(initialResult);
  const { token } = Route.useParams();
  const [waitExpired, setWaitExpired] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    setResult(initialResult);
  }, [initialResult, token]);

  useEffect(() => {
    setWaitExpired(false);
    setRefreshFailed(false);
    if (result.status !== "PAYMENT_PENDING" && result.status !== "PROCESSING" && result.status !== "NOT_READY") return;

    // A waiting limit offers support; it never declares a payment or job failed.
    const controller = new AbortController();
    const limit = result.status === "PROCESSING" ? 10 * 60_000 : 5 * 60_000;
    let stopped = false;
    let nextPoll: ReturnType<typeof setTimeout>;
    const deadline = setTimeout(() => {
      stopped = true;
      clearTimeout(nextPoll);
      controller.abort();
      setWaitExpired(true);
    }, limit);

    async function poll() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const next = await getPublicReport({ data: { token }, signal: controller.signal });
          if (stopped) return;
          setRefreshFailed(next.status === "UNAVAILABLE");
          if (next.status !== "UNAVAILABLE") setResult(next);
        } catch {
          if (stopped) return;
          setRefreshFailed(true);
        }
      }
      if (!stopped) nextPoll = setTimeout(poll, 5_000);
    }

    nextPoll = setTimeout(poll, 5_000);
    return () => {
      stopped = true;
      clearTimeout(nextPoll);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [token, result.status]);

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
          title: "Tu orden está lista para ser pagada.",
          detail: `La revisión cuesta $${result.amountCents / 100} ${result.currency}. Después del pago, tu reporte aparecerá aquí y te lo enviaremos por correo.`,
        }
      : result.status === "PAYMENT_PENDING"
      ? {
          eyebrow: "PAGO POR CONFIRMAR",
          title: "Estamos confirmando tu pago.",
          detail: "Esta página se actualizará automáticamente. Cuando recibamos la confirmación, comenzaremos la revisión. Si ya pagaste, no vuelvas a pagar ni crees otra orden.",
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
          title: "Estamos revisando tu cotización.",
          detail:
            "Tu reporte aparecerá aquí automáticamente. También te enviaremos el enlace por correo cuando esté listo. Puedes cerrar esta página y volver a abrir el mismo enlace.",
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
        {refreshFailed && !waitExpired && (
          <p role="status">No pudimos actualizar el estado. Volveremos a intentarlo automáticamente; si ya pagaste, no vuelvas a pagar.</p>
        )}
        {waitExpired && (
          <div role="status">
            <p>Esto está tardando más de lo esperado. No pudimos confirmar el avance; puedes escribirnos para que revisemos tu orden personalmente. Si ya pagaste, no vuelvas a pagar.</p>
            <a className="report-state__link" href={`mailto:soporte@cotizalupa.com?subject=${encodeURIComponent("Ayuda con mi revisión")}&body=${encodeURIComponent(`Hola, mi revisión está tardando más de lo esperado. Este es mi enlace: ${window.location.origin}/r/${encodeURIComponent(token)}`)}`}>
              Escribir a soporte@cotizalupa.com
            </a>
          </div>
        )}
        {waitExpired && result.status === "PAYMENT_PENDING" && (
          <button type="button" onClick={() => window.location.reload()}>Actualizar estado</button>
        )}
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
