const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: "¿Sirve para mi tipo de cotización?",
    answer:
      "El enfoque está pensado para servicios y productos con condiciones por acordar: desde muebles y remodelaciones hasta software, eventos o servicios profesionales. Si tu categoría no aparece en el formulario, elige “Otro” y descríbela.",
  },
  {
    question: "¿Me dirá si me están cobrando de más?",
    answer:
      "No. No comparamos precios de mercado. Buscamos importes ambiguos, conceptos que podrían generar adicionales y condiciones de pago que conviene precisar.",
  },
  {
    question: "¿Y si ya pagué o acepté la cotización?",
    answer:
      "Puedes indicar ese momento en el formulario. Aún puede haber puntos que convenga conversar. La revisión no cambia las condiciones ya acordadas ni resuelve disputas.",
  },
  {
    question: "¿Necesito compartir mis datos personales?",
    answer:
      "Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones que no sean necesarios. Conserva el alcance, los montos, fechas y condiciones. Al generar el reporte, enviamos el archivo y el contexto a OpenAI. CotizaLupa no guarda el original en esta demo, pero conserva el reporte y los datos extraídos.",
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
          Versión de demostración: explora el formulario y el reporte de
          ejemplo. Aún no se realizan cobros.
        </p>
      </div>
      <div className="faq-list">
        <details>
          <summary>¿Puedo pagar y obtener un análisis real ahora?</summary>
          <p>{reviewsDisabled
            ? "Los pagos y las revisiones no están disponibles. Puedes explorar el formulario y ver el reporte de ejemplo."
            : "Puedes generar un reporte gratuito con IA. Los pagos aún no están habilitados y no se te cobrará nada."}</p>
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
