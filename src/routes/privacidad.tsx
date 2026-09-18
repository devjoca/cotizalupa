import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/privacidad")({
  head: () =>
    legalPageHead(
      "Política de privacidad",
      "Cómo CotizaLupa trata los documentos y datos de una revisión.",
    ),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="PRIVACIDAD"
      title="Política de privacidad"
      intro="Esta página explica qué datos usa CotizaLupa para revisar una cotización y qué conserva para entregar y operar el reporte."
    >
      <section>
        <h2>Qué hace CotizaLupa</h2>
        <p>
          CotizaLupa revisa una cotización, presupuesto o propuesta comercial
          para señalar información clara, datos faltantes, ambigüedades,
          escenarios y preguntas que conviene hacer antes de aceptar
          la propuesta. El análisis usa un servicio automatizado de IA y no es
          asesoría legal, financiera, tributaria ni técnica.
        </p>
      </section>

      <section>
        <h2>Datos que recibimos</h2>
        <p>
          Cuando creas una orden, recibimos el
          archivo o archivos que envías y el contexto que escribes: la
          perspectiva, categoría, momento, monto aproximado y preocupación.
          También recibimos metadatos técnicos necesarios para validar y
          procesar el archivo, como su nombre, tipo, tamaño y una huella digital
          que permite comprobar su integridad.
        </p>
        <p>
          No subas datos que no sean necesarios para revisar la
          cotización. Antes de subir un archivo, confirma que tienes permiso
          para compartirlo y evita incluir claves, datos de tarjeta o
          información especialmente sensible.
        </p>
      </section>

      <section>
        <h2>Para qué usamos esos datos</h2>
        <ul>
          <li>Validar que el archivo sea compatible con la revisión.</li>
          <li>
            Enviar el documento y el contexto al proveedor de IA para producir
            el análisis solicitado.
          </li>
          <li>Mostrar el reporte de la revisión.</li>
          <li>
            Proteger el servicio frente a abuso y diagnosticar fallas
            operativas.
          </li>
        </ul>
      </section>

      <section>
        <h2>Qué conservamos</h2>
        <p>
          La vista previa del formulario muestra los archivos en tu navegador,
          sin enviarlos al servidor. Al crear la orden, validamos el formato,
          tamaño y páginas, y guardamos los archivos compatibles en un depósito
          privado junto con el contexto necesario para la revisión. Esta
          validación técnica no comprueba su contenido ni su legibilidad.
          Los pagos todavía no están habilitados. Crear la orden no llama a la
          IA ni genera el reporte.
        </p>
        <p>
          Realizamos una limpieza manual mensual. Las solicitudes sin pago
          vencen a los 30 días y sus originales se eliminan en la siguiente
          limpieza. Esto puede acercar la conservación a dos meses desde la
          carga. Los originales de revisiones completadas o reembolsadas pueden
          eliminarse antes, en la siguiente limpieza. Los pagos por confirmar
          y las revisiones en curso se resuelven antes de borrar sus archivos.
          La preocupación escrita se elimina al cerrar o vencer la solicitud.
        </p>
        <p>
          Conservamos los reportes ya generados, los hechos estructurados y los
          metadatos operativos para que sus enlaces funcionen, sin un plazo de
          eliminación automática. Estos datos pueden contener información de
          la cotización. Puedes solicitar su eliminación al correo de soporte.
        </p>
        <p>
          El enlace del reporte funciona como una llave. Cualquier persona que
          tenga el enlace puede leer ese reporte, así que no lo compartas en un
          lugar público. Los reportes pueden contener información tomada de la
          cotización. Eliminar el original no elimina automáticamente el reporte
          ni los datos extraídos.
        </p>
      </section>

      <section>
        <h2>Proveedores</h2>
        <p>
          Solo después de confirmar el pago enviaremos el documento y el
          contexto a OpenAI para generar el reporte. No usamos IA antes del pago.
          Solicitamos que la respuesta no se almacene para su consulta posterior.
          OpenAI puede conservar datos para controles de abuso u otras obligaciones
          según sus políticas y la configuración del servicio. Esto no equivale
          a una garantía de eliminación inmediata por parte de OpenAI.
        </p>
        <p>
          CotizaLupa puede usar Sentry para recibir errores operativos
          sanitizados. No enviamos a Sentry el archivo, el reporte, el contexto,
          la solicitud HTTP, el usuario ni el historial de navegación. Actualmente
          no incorporamos analítica publicitaria en el reporte público.
        </p>
        <p>
          Las páginas públicas cargan las fuentes Libre Franklin y Source Serif
          4 desde Google Fonts cuando el navegador las solicita. Google puede
          recibir datos técnicos de esa solicitud. Consulta su{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            política de privacidad
          </a>
          .
        </p>
        <p>
          El uso de la API de OpenAI en el servicio se describe en sus{" "}
          <a
            href="https://developers.openai.com/api/docs/guides/your-data"
            target="_blank"
            rel="noreferrer"
          >
            políticas de uso de datos de la API
          </a>
          .
        </p>
      </section>

      <section>
        <h2>Infraestructura y procesamiento fuera del Perú</h2>
        <p>
          La infraestructura prevista para el servicio utiliza Railway para servir la aplicación y Neon
          para guardar reportes y datos extraídos. Los proveedores de infraestructura
          procesan los datos necesarios para prestar esos servicios. OpenAI, estos
          proveedores y Google pueden procesar información fuera del Perú según
          sus ubicaciones y condiciones de servicio.
        </p>
        <p>
          Usamos temporalmente la dirección IP para limitar solicitudes y evitar
          abusos. No guardamos el documento completo en registros de errores.
          Si nos escribes por correo, recibimos tu dirección y el contenido de tu
          consulta para responderte. No adjuntes la cotización si no es necesaria.
        </p>
      </section>

      <section>
        <h2>Solicitudes de privacidad</h2>
        <p>
          Para solicitar acceso, corrección o eliminación, usa el canal de
          {" "}
          <a href="mailto:soporte@cotizalupa.com">soporte@cotizalupa.com</a>.
          La solicitud puede requerir información suficiente para ubicar el
          reporte. Responderemos según la ley aplicable y según los datos que
          todavía conservemos.
        </p>
      </section>

      <section>
        <h2>Actualizaciones</h2>
        <p>
          Actualizaremos esta política si cambia el flujo, los proveedores, la
          conservación o el uso de datos. Última actualización: 17 de septiembre de 2026.
        </p>
      </section>
    </LegalPage>
  );
}
