import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/reembolsos")({
  head: () =>
    legalPageHead(
      "Reembolsos",
      "Condiciones de reembolso previstas para el servicio pagado de CotizaLupa.",
    ),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <LegalPage
      eyebrow="REEMBOLSOS"
      title="Reembolsos"
      intro="CotizaLupa todavía no acepta pagos. Estas condiciones se aplicarán a las revisiones que se compren cuando se habiliten los pagos."
    >
      <section>
        <h2>Estado actual</h2>
        <p>
          La versión de demostración no cobra por una revisión. No ingreses
          datos de pago ni envíes dinero a CotizaLupa mientras el servicio
          pagado no esté habilitado en el sitio.
        </p>
      </section>

      <section>
        <h2>Servicio pagado previsto</h2>
        <p>
          Si un pago futuro se completa y CotizaLupa no puede entregar el
          reporte correspondiente, reembolsaremos el importe total de esa
          revisión. Esto cubre, por ejemplo, un fallo del servicio que impida
          completar el análisis después del cobro.
        </p>
        <p>
          El servicio corresponde a una revisión de una cotización. La
          existencia de un reporte no significa que el resultado sea favorable,
          que detecte todos los problemas o que el documento sea correcto. Esas
          limitaciones no cambian el criterio de reembolso cuando no podemos
          entregar el reporte contratado.
        </p>
      </section>

      <section>
        <h2>Cómo solicitarlo</h2>
        <p>
          Escribe a <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>
          {" "}con el identificador de compra, la fecha y una descripción del problema.
          Revisaremos la solicitud y te comunicaremos el resultado. Si la compra
          se realiza mediante Paddle, también podrás solicitarlo en <a href="https://paddle.net">paddle.net</a>.
          No envíes datos completos de tarjeta por correo o en un formulario de
          soporte.
        </p>
      </section>

      <section>
        <h2>Derechos aplicables</h2>
        <p>
          Esta política no limita los derechos que correspondan a la persona
          consumidora según la ley aplicable ni las condiciones obligatorias del
          proveedor de pago. Antes de activar Paddle, publicaremos la versión
          final junto con la información que Paddle muestre durante el checkout
          y sus reglas aplicables a la compra, incluida su{" "}
          <a
            href="https://www.paddle.com/legal/refund-policy"
            target="_blank"
            rel="noreferrer"
          >
            política de reembolsos
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
