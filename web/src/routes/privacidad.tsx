import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, legalPageHead } from "../components/LegalPage";

export const Route = createFileRoute("/privacidad")({
  head: () =>
    legalPageHead(
      "/privacidad",
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
          archivo o archivos que envías y el texto que escribes sobre tu
          situación.
          También recibimos el correo que indicas para entregar el enlace privado del reporte.
          También recibimos metadatos técnicos necesarios para validar y
          procesar el archivo, como su nombre, tipo, tamaño y una huella digital
          que permite comprobar su integridad.
          Si llegas desde un anuncio de Meta, guardamos el identificador del clic
          en tu navegador. Lo usamos durante un máximo de siete días y lo
          asociamos a la orden que crees en ese plazo.
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
          <li>Mostrar el reporte de la revisión y enviarte su enlace privado por correo.</li>
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
          Crear la orden no llama a la IA ni genera el reporte. El pago se realiza
          mediante Polar y no guardamos datos de tarjeta ni dirección de facturación.
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
          Eliminamos tu correo de nuestra base cuando el proveedor acepta el envío,
          o cuando la orden se cierra sin reporte. Si el envío falla, conservamos
          el correo para recuperar la entrega; queda pendiente de eliminación
          manual a los 30 días de completar el reporte. Esto no garantiza su
          eliminación física en esa fecha ni elimina el correo que hayas recibido.
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
          Polar procesa el pago como vendedor de registro. Le enviamos el
          identificador de la orden y el enlace de retorno al sitio; Polar
          recibe los datos que ingreses durante el checkout. Consulta su{" "}
          <a href="https://polar.sh/legal/privacy-policy" target="_blank" rel="noreferrer">política de privacidad</a>.
        </p>
        <p>
          Resend recibe tu correo y el enlace privado para enviarte el aviso de que
          el reporte está listo. No le enviamos los archivos ni el contenido del
          reporte. Resend puede conservar información del envío conforme a su{" "}
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">política de privacidad</a>.
        </p>
        <p>
          Si una orden asociada a un clic de anuncio llega a pagarse, enviamos a
          Meta un evento de compra desde nuestro servidor. Incluye el identificador
          del clic, el precio de 9.99 USD, la hora del pago y un identificador de
          evento para evitar duplicados. No enviamos la cotización, tu correo ni
          el enlace privado del reporte. El sitio no carga el píxel de Meta.
          Eliminamos el identificador de nuestra base después del envío o en la
          siguiente limpieza de órdenes vencidas y eventos antiguos.
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
          La infraestructura prevista para el servicio utiliza Cloudflare Pages
          para servir las páginas públicas y Railway para la API que recibe los
          archivos, procesa el pago, genera el análisis y envía el correo, con
          una base de datos PostgreSQL administrada para guardar reportes y
          datos extraídos y un depósito privado para los originales. Cloudflare
          recibe los datos técnicos de las visitas a las páginas públicas; los
          archivos de la cotización se envían directamente a la API. Los
          proveedores de infraestructura procesan los datos necesarios para
          prestar esos servicios. OpenAI, estos proveedores y Google pueden
          procesar información fuera del Perú según sus ubicaciones y
          condiciones de servicio.
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
          conservación o el uso de datos. Última actualización: 3 de octubre de 2026.
        </p>
      </section>
    </LegalPage>
  );
}
