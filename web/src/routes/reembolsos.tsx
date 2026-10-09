import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/reembolsos")({
  head: () =>
    legalPageHead(
      "/reembolsos",
      "Reembolsos",
      "Condiciones de reembolso del servicio pagado de CotizaLupa.",
    ),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <LegalPage
      eyebrow="REEMBOLSOS"
      title="Reembolsos"
      intro="Si pagas una revisión y no podemos entregar el reporte, gestionaremos el reembolso completo."
    >
      <section>
        <h2>Cuándo corresponde</h2>
        <p>
          Si el pago se completa y CotizaLupa no puede entregar el
          reporte correspondiente por un fallo del servicio, reembolsaremos
          el importe total de esa revisión.
          Gestionamos estos reembolsos manualmente, no de forma automática.
        </p>
        <p>
          El servicio corresponde a una revisión de una cotización. El
          reporte será de mejor esfuerzo según los archivos enviados. Si son
          ilegibles, incompletos o contienen varias propuestas, el reporte
          explicará qué no se pudo evaluar. Su contenido no da lugar por sí
          solo a un reembolso. Esto no limita los derechos legales del usuario.
        </p>
      </section>

      <section>
        <h2>Cómo solicitarlo</h2>
        <p>
          Escribe a <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>
          {" "}con el identificador de compra, la fecha y una descripción del problema.
          Revisaremos la solicitud y te comunicaremos el resultado. Polar procesa
          el pago y el reembolso.
          No envíes datos completos de tarjeta por correo o en un formulario de
          soporte.
        </p>
      </section>

      <section>
        <h2>Derechos aplicables</h2>
        <p>
          Esta política no limita los derechos que correspondan a la persona
          consumidora según la ley aplicable ni las condiciones obligatorias del
          proveedor de pago. La compra también se rige por las{" "}
          <a
            href="https://polar.sh/legal/checkout-buyer-terms"
            target="_blank"
            rel="noreferrer"
          >
            condiciones para compradores de Polar
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Actualizaciones</h2>
        <p>
          Actualizaremos esta página si cambian el precio, el proveedor de pago
          o la forma de entregar la revisión. La versión vigente y su fecha se
          mostrarán antes del pago.
        </p>
      </section>
    </LegalPage>
  );
}
