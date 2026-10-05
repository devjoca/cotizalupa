// Landing copy and demo data. Identifiers in English; user-facing strings in es-PE.

import type { Analysis } from "#/lib/schemas";

export interface HeroExample {
  title: string;
  sub: string;
  total: string;
  totalNote: string;
  gapLabel: string;
  gapValue: string;
  findingLabel: string;
  findingQuestion: string;
  findingText: string;
  suggestedQuestion: string;
}

export const HERO_EXAMPLES: HeroExample[] = [
  {
    title: "Mueble TV en melamina",
    sub: "Instalación incluida",
    total: "S/3,800",
    totalNote: "50% de adelanto",
    gapLabel: "Entrega",
    gapValue: "Sin especificar",
    findingLabel: "FALTA DEFINIR · PRIORIDAD ALTA",
    findingQuestion: "¿Para cuándo estará instalado?",
    findingText:
      "La cotización incluye la instalación, pero no una fecha máxima de entrega.",
    suggestedQuestion:
      "¿Podemos dejar por escrito la fecha máxima de entrega e instalación?",
  },
  {
    title: "Desarrollo de ecommerce",
    sub: "Entrega en 6 semanas",
    total: "S/8,000",
    totalNote: "50% de adelanto",
    gapLabel: "Revisiones",
    gapValue: "Sin precisar",
    findingLabel: "FALTA DEFINIR · PRIORIDAD ALTA",
    findingQuestion: "¿Cuántos cambios incluye el precio?",
    findingText:
      "Los S/8,000 no aclaran rondas de cambios ni qué se cobra como adicional.",
    suggestedQuestion:
      "¿Cuántas rondas de cambios incluyen los S/8,000 y cómo se aprueba un adicional?",
  },
  {
    title: "Remodelación de cocina",
    sub: "Acabados de primera",
    total: "S/12,500",
    totalNote: "30% de adelanto",
    gapLabel: "Materiales",
    gapValue: "Sin detallar",
    findingLabel: "FALTA DEFINIR · PRIORIDAD ALTA",
    findingQuestion: "¿Qué materiales están incluidos?",
    findingText:
      "“Acabados de primera” no detalla marcas, modelos ni quién los compra.",
    suggestedQuestion:
      "¿Podemos detallar marcas y acabados incluidos en los S/12,500?",
  },
];

// Landing report examples are typed as the real report so they render through
// ReportDocument and cannot promise anything the paid report does not show.
// The source documents are synthetic or anonymized: no real names or contacts.
export interface LandingExample {
  id: string;
  tab: string;
  sourceTitle: string;
  sourceLines: string[];
  analysis: Analysis;
}

const analyzableDocument: Analysis["document"] = {
  is_quotation: true,
  quotation_count: 1,
  is_legible: true,
  is_single_commercial_proposal: true,
  rejection_reason: null,
};

export const LANDING_EXAMPLES: LandingExample[] = [
  {
    id: "muebles",
    tab: "Muebles a medida",
    sourceTitle: "Mueble TV en melamina",
    sourceLines: ["Instalación incluida", "Precio: S/3,800", "50% de adelanto"],
    analysis: {
      document: analyzableDocument,
      clear_items: [
        {
          title: "Precio y adelanto",
          detail: "El precio indicado es S/3,800 y se pide un adelanto del 50%.",
        },
        {
          title: "Instalación incluida",
          detail: "La cotización indica expresamente que la instalación está incluida.",
        },
      ],
      gaps: [
        {
          title: "Fecha de entrega e instalación",
          status: "missing",
          evidence: "“Instalación incluida”",
          missing: "No aparece una fecha máxima de entrega ni de instalación.",
          why_it_matters:
            "Sin una fecha escrita, no tienes una referencia para reclamar si el trabajo se retrasa.",
          suggested_question:
            "Antes de hacer el adelanto, ¿podemos dejar por escrito la fecha máxima de entrega e instalación?",
        },
        {
          title: "Medidas, material y acabado",
          status: "ambiguous",
          evidence: "“Mueble TV en melamina”",
          missing: "Faltan dimensiones, espesor, acabado y herrajes.",
          why_it_matters:
            "“Melamina” no describe por sí sola el mueble acordado. Sin medidas es difícil verificar que recibes lo cotizado.",
          suggested_question:
            "¿Pueden detallar las medidas finales, el espesor de la melamina, el acabado y los herrajes incluidos?",
        },
        {
          title: "Precio final y adicionales",
          status: "ambiguous",
          evidence: "“Precio: S/3,800”",
          missing: "No se aclara si incluye transporte, desmontaje o impuestos aplicables.",
          why_it_matters:
            "Conviene preguntarlo antes de asumir que están incluidos o que se cobran aparte.",
          suggested_question:
            "¿Los S/3,800 incluyen transporte, desmontaje e impuestos aplicables? ¿Qué podría generar un adicional?",
        },
        {
          title: "Garantía y corrección de errores",
          status: "missing",
          evidence: null,
          missing: "La cotización no menciona garantía ni quién corrige errores de fabricación o de medidas.",
          why_it_matters:
            "Si el mueble llega con fallas, no hay un acuerdo escrito sobre quién asume la corrección.",
          suggested_question:
            "¿Qué garantía ofrecen y por cuánto tiempo? Si hay un error de fabricación o de medidas, ¿quién asume la corrección y la reinstalación?",
        },
      ],
      what_if: [
        "Si el mueble no encaja, no se especifica quién verifica las medidas ni quién asume la corrección, el traslado y la reinstalación.",
      ],
      priorities: [
        "Acordar una fecha máxima de instalación",
        "Precisar medidas, material y acabado",
        "Definir garantía y corrección de errores",
      ],
      quotation_facts: {
        document_type: "quotation",
        service: "Mueble TV en melamina",
        supplier: null,
        amount: { value_cents: 380_000, currency: "PEN" },
        summary: "Mueble TV en melamina con instalación incluida por S/3,800 y 50% de adelanto.",
        scope_summary: "Fabricación e instalación de un mueble TV en melamina.",
        delivery_summary: null,
        payment_summary: "50% de adelanto.",
      },
    },
  },
  {
    id: "obra",
    tab: "Obra de construcción",
    sourceTitle: "Construcción de fachada rústica",
    sourceLines: [
      "Lista de mano de obra · 8 partidas",
      "Viga peraltada: 10 ML × S/90 = S/1,200",
      "Total: S/13,750 (sin IGV)",
    ],
    analysis: {
      document: analyzableDocument,
      clear_items: [
        {
          title: "Partidas detalladas",
          detail:
            "La mayoría de partidas indica cantidad, unidad y precio unitario, y los subtotales suman el total de S/13,750.",
        },
      ],
      gaps: [
        {
          title: "Materiales incluidos",
          status: "ambiguous",
          evidence: "“Lista de Mano de Obra” · “Ladrillo · 1000 · S/1,200”",
          missing:
            "El documento se presenta como mano de obra, pero incluye una partida de ladrillo. No queda claro si cemento, fierro, ladrillo y agregados están incluidos o los compras tú.",
          why_it_matters:
            "Si los materiales van aparte, el costo real de la obra puede ser bastante mayor que los S/13,750.",
          suggested_question:
            "¿Los S/13,750 son solo mano de obra o incluyen materiales? Si no los incluyen, ¿quién los compra y cuánto estiman que costarán?",
        },
        {
          title: "Subtotal de la viga peraltada",
          status: "ambiguous",
          evidence: "“Viga Peraltada · 10 ML · S/. 90 · S/. 1200”",
          missing: "10 metros lineales a S/90 suman S/900, pero el subtotal dice S/1,200.",
          why_it_matters:
            "La diferencia de S/300 cambia el total. Conviene confirmar cuál es el monto correcto antes de aceptar.",
          suggested_question:
            "En la viga peraltada, 10 ML a S/90 dan S/900, pero el subtotal es S/1,200. ¿Cuál es el monto correcto?",
        },
        {
          title: "IGV y comprobante",
          status: "ambiguous",
          evidence: "“Total (SIN IGV) S/. 13 750”",
          missing: "No se aclara si al pagar se sumará el IGV ni qué comprobante se emitirá.",
          why_it_matters: "Si se agrega el IGV, el monto que pagarás será distinto al total del documento.",
          suggested_question:
            "¿El pago final será S/13,750 o se sumará el IGV? ¿Qué comprobante emitirán?",
        },
        {
          title: "Plazo de obra y forma de pago",
          status: "missing",
          evidence: null,
          missing: "No aparece fecha de inicio, duración de la obra, adelanto ni cómo se pagará.",
          why_it_matters:
            "Sin plazo ni cronograma de pagos por escrito, es difícil reclamar un retraso o saber cuánto pagar en cada etapa.",
          suggested_question:
            "¿Cuánto tiempo tomará la obra desde el inicio y cómo serían los pagos: adelanto, avances y pago final?",
        },
      ],
      what_if: [
        "Si los materiales no están incluidos, tendrías que comprarlos aparte y la obra costaría más de S/13,750.",
        "Si al pagar se suma el IGV, el monto final sería mayor al que muestra el documento.",
      ],
      priorities: [
        "Confirmar si los materiales están incluidos en el precio",
        "Corregir el subtotal de la viga peraltada y confirmar el total",
        "Acordar el plazo de obra y el cronograma de pagos",
      ],
      quotation_facts: {
        document_type: "quotation",
        service: "Construcción de fachada rústica",
        supplier: null,
        amount: { value_cents: 1_375_000, currency: "PEN" },
        summary:
          "Lista de mano de obra con 8 partidas (columnas, vigas, sobrecimiento, ladrillo, piso pulido, nivelación y celosía) por S/13,750 sin IGV.",
        scope_summary: "Columnas, vigas, sobrecimiento, ladrillo, piso pulido, nivelación de terreno y celosía.",
        delivery_summary: null,
        payment_summary: null,
      },
    },
  },
];
