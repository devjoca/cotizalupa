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
      "Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones que no sean necesarios. Conserva el alcance, los montos, fechas y condiciones. CotizaLupa usa el archivo solo para generar el reporte y no lo guarda en esta demostración. Cuando el análisis usa IA, el archivo se envía a OpenAI.",
  },
  {
    question: "¿La revisión garantiza que todo está bien?",
    answer:
      "No. Ayuda a identificar omisiones, preguntas y ambigüedades; puede pasar por alto detalles. No es asesoría legal o financiera, peritaje técnico ni certificación. Para una decisión que requiera criterio profesional, consulta al especialista correspondiente.",
  },
  {
    question: "¿Puedo pagar y obtener un análisis real ahora?",
    answer:
      "Esta versión permite explorar la experiencia y los reportes de ejemplo. Los pagos y el análisis de documentos aún no están habilitados. No se te cobrará ni se presentará un ejemplo como análisis de tu archivo.",
  },
];

export function Faq() {
  return (
    <section className="section faq">
      <div>
        <span className="eyebrow">ANTES DE EMPEZAR</span>
        <h2>
          Las dudas,
          <br />{" "}
          sobre la mesa.
        </h2>
      </div>
      <div className="faq-list">
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
