import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/contacto")({
  head: () =>
    legalPageHead(
      "/contacto",
      "Contacto",
      "Canales de contacto, soporte y privacidad de CotizaLupa.",
    ),
  component: ContactPage,
});

function ContactPage() {
  return (
    <LegalPage
      eyebrow="CONTACTO"
      title="Hablemos"
      intro="Escríbenos a soporte@cotizalupa.com para consultas sobre el servicio, problemas con tu reporte o solicitudes de privacidad."
    >
      <section>
        <h2>Quién opera CotizaLupa</h2>
        <p>
          Jose Carlos Pereyra Leon es el responsable de CotizaLupa. Para soporte
          y solicitudes de privacidad, escribe a{" "}
          <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>.
        </p>
      </section>

      <section>
        <h2>Qué puedes consultar</h2>
        <ul>
          <li>Preguntas sobre el uso del reporte.</li>
          <li>Problemas con un enlace o una revisión.</li>
          <li>Solicitudes relacionadas con privacidad y eliminación.</li>
          <li>Solicitudes de reembolso del servicio pagado.</li>
        </ul>
        <p>
          No compartas información completa de tarjetas, contraseñas ni una
          cotización por un canal que no haya sido publicado en esta página.
        </p>
      </section>

      <section>
        <h2>Condiciones del servicio</h2>
        <p>
          Consulta nuestras políticas de
          <a href="/privacidad"> privacidad</a>,
          <a href="/terminos"> términos</a> y
          <a href="/reembolsos"> reembolsos</a>.
        </p>
      </section>
    </LegalPage>
  );
}
