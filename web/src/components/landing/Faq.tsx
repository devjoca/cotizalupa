const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: "¿Sirve para mi tipo de cotización?",
    answer:
      "El enfoque está pensado para servicios y productos con condiciones por acordar: desde muebles y remodelaciones hasta software, eventos o servicios profesionales. No necesitas clasificar el servicio antes de subir la cotización.",
  },
  {
    question: "¿Me dirá si me están cobrando de más?",
    answer:
      "No. No comparamos precios de mercado. Buscamos importes ambiguos, conceptos que podrían generar adicionales y condiciones de pago que conviene precisar.",
  },
  {
    question: "¿Y si ya pagué o acepté la cotización?",
    answer:
      "Cuéntalo en el formulario al describir tu situación. Aún puede haber puntos que convenga conversar. La revisión no cambia las condiciones ya acordadas ni resuelve disputas.",
  },
  {
    question: "¿Necesito compartir mis datos personales?",
    answer:
      "Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones que no sean necesarios. Conserva el alcance, los montos, fechas y condiciones. Guardamos temporalmente los archivos al crear la orden y solo los enviamos a OpenAI después del pago. Eliminamos originales elegibles en una limpieza mensual. El reporte y los datos extraídos se conservan para su consulta.",
  },
  {
    question: "¿La revisión garantiza que todo está bien?",
    answer:
      "No. Ayuda a identificar omisiones, preguntas y ambigüedades; puede pasar por alto detalles. No es asesoría legal o financiera, peritaje técnico ni certificación. Para una decisión que requiera criterio profesional, consulta al especialista correspondiente.",
  },

];

export function Faq({ reviewsDisabled }: { reviewsDisabled: boolean }) {
  return (
    <section className="section faq">
      <div>
        <h2>Preguntas frecuentes</h2>
        <p>
          Revisa el formulario y el reporte de ejemplo antes de iniciar una revisión.
        </p>
      </div>
      <div className="faq-list">
        <details>
          <summary>¿Puedo pagar y obtener un análisis real ahora?</summary>
          <p>{reviewsDisabled
            ? "No aceptamos nuevas revisiones en este momento. Puedes explorar el formulario y ver el reporte de ejemplo."
            : "Sí. Primero revisas los archivos, creas la orden y abres el pago con Polar. Analizamos la cotización cuando Polar confirma el pago."}</p>
        </details>
        {FAQS.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
