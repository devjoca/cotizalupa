import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/terminos")({
  head: () =>
    legalPageHead(
      "Términos de uso",
      "Alcance y condiciones de uso de CotizaLupa.",
    ),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="CONDICIONES DE USO"
      title="Términos de uso"
      intro="CotizaLupa está en versión de demostración. Jose Carlos Pereyra Leon opera el servicio. Estos términos describen su alcance y las condiciones de uso."
    >
      <section>
        <h2>Qué ofrece CotizaLupa</h2>
        <p>
          CotizaLupa analiza una sola cotización o propuesta comercial por
          revisión y genera un reporte con elementos claros, faltantes,
          ambiguos, escenarios y preguntas sugeridas. Una cotización puede
          tener varias páginas, partidas, opciones A/B/C o adicionales.
          Comparar dos o más proveedores dentro del mismo archivo no forma
          parte del servicio inicial.
        </p>
        <p>
          El precio previsto para una revisión pagada es de 12 USD, pago único.
          El servicio pagado todavía no está disponible y CotizaLupa no está
          aceptando cobros en esta versión de demostración.
        </p>
      </section>

      <section>
        <h2>Uso permitido</h2>
        <p>
          Solo sube documentos que tengas derecho a compartir y revisar. No
          subas datos de tarjeta, contraseñas ni información de otra persona
          sin autorización. No uses CotizaLupa para cargar contenido ilegal,
          para intentar cambiar las instrucciones del análisis o para afectar
          el servicio de otras personas.
        </p>
      </section>

      <section>
        <h2>Límites del reporte</h2>
        <p>
          El reporte es una ayuda para preparar preguntas. Un modelo puede
          pasar por alto detalles, interpretar mal una parte o no reconocer un
          riesgo. El reporte no determina si un precio es caro o barato y no
          reemplaza la revisión de un abogado, contador, arquitecto, ingeniero
          u otro profesional competente cuando la decisión lo requiera.
        </p>
        <p>
          El reporte no garantiza que una cotización sea completa, correcta,
          segura o adecuada para un proyecto. La decisión de aceptar, enviar o
          pagar una propuesta sigue siendo de la persona usuaria.
        </p>
      </section>

      <section>
        <h2>Archivos y reportes</h2>
        <p>
          El usuario debe revisar que el archivo sea legible y corresponda a
          una sola cotización. El sistema puede rechazar archivos que no pueda
          procesar. El reporte se entrega mediante un enlace privado. El acceso
          al enlace permite leerlo, por lo que el usuario debe cuidar dónde lo
          comparte.
        </p>
      </section>

      <section>
        <h2>Disponibilidad</h2>
        <p>
          La demostración y el servicio futuro pueden cambiar, interrumpirse o
          cerrarse para mantenimiento, seguridad o mejoras. No hay pagos
          habilitados mientras la página indique que el servicio está en
          preparación.
        </p>
      </section>

      <section>
        <h2>Contacto y cambios</h2>
        <p>
          Puedes contactar a Jose Carlos Pereyra Leon, operador de CotizaLupa,
          escribiendo a{" "}
          <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>.
          También actualizaremos estos términos si cambia el producto, su precio
          o su tratamiento de datos.
        </p>
      </section>
    </LegalPage>
  );
}
