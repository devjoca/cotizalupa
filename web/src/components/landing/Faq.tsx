export const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: "¿Puedo pedir una revisión ahora?",
    answer:
      "Sí. Primero revisas los archivos y creas la orden. Después recibirás un enlace privado para completar el pago. Empezamos a revisar tu cotización cuando el pago queda confirmado.",
  },
  {
    question: "¿Sirve para mi tipo de cotización?",
    answer:
      "El enfoque está pensado para servicios y productos con condiciones por acordar: desde muebles y remodelaciones hasta software, eventos o servicios profesionales. No necesitas clasificar el servicio antes de subir la cotización.",
  },
  {
    question: "¿Me dirá si me están cobrando de más?",
    answer:
      "No podemos decirte si el precio es caro o barato: cada cotización depende de lo que incluye y muchas no tienen una referencia pública comparable. Sí revisamos si los importes se entienden, si podrían aparecer cobros adicionales y qué condiciones te conviene confirmar.",
  },
  {
    question: "¿Y si ya pagué o acepté la cotización?",
    answer:
      "Cuéntalo en el formulario al describir tu situación. Aún puede haber puntos que convenga conversar. La revisión no cambia las condiciones ya acordadas ni resuelve disputas.",
  },
  {
    question: "¿Necesito compartir mis datos personales?",
    answer:
      "Puedes ocultar nombres, teléfonos, documento de identidad y direcciones que no sean necesarios. Conserva el alcance, los montos, fechas y condiciones. Guardamos temporalmente los archivos al crear la orden y solo los enviamos a un servicio de IA después del pago para preparar el reporte. Eliminamos los originales elegibles durante una limpieza mensual. El reporte y los datos extraídos se conservan para que puedas consultarlos.",
  },
  {
    question: "¿La revisión garantiza que todo está bien?",
    answer:
      "No. Ayuda a identificar omisiones, preguntas y ambigüedades; puede pasar por alto detalles. No es asesoría legal o financiera, peritaje técnico ni certificación. Para una decisión que requiera criterio profesional, consulta al especialista correspondiente.",
  },

];

export function Faq() {
  return (
    <section className="section faq">
      <div>
        <h2>Preguntas frecuentes</h2>
        <p>
          Revisa el formulario y el reporte de ejemplo antes de iniciar una revisión.
        </p>
      </div>
      <div className="faq-list">
        {FAQ_ITEMS.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
