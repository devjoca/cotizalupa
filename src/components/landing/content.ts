// Landing copy and demo data. Identifiers in English; user-facing strings in es-PE.
// Ported verbatim from the vanilla mockup (public/mockup/app.js).

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

export interface ReportGap {
  title: string;
  quote: string;
  detail: string;
}

export interface ClientExampleReport {
  title: string;
  sourceLines: string[];
  reportHeading: string;
  reportSubtitle: string;
  prioritiesHeading: string;
  priorities: string[];
  clearTitle: string;
  clear: string[];
  missingTitle: string;
  missing: ReportGap[];
  scenario: string;
  scenarioText: string;
  copyTitle: string;
  copies: string[];
}

export const CLIENT_EXAMPLE: ClientExampleReport = {
  title: "Mueble TV en melamina",
  sourceLines: ["Instalación incluida", "Precio: S/3,800", "50% de adelanto"],
  reportHeading: "Antes de dar el adelanto",
  reportSubtitle: "Muebles a medida · Perspectiva cliente",
  prioritiesHeading: "Tus 3 prioridades",
  priorities: [
    "Acordar una fecha máxima de instalación",
    "Precisar medidas, material y acabado",
    "Definir garantía y corrección de errores",
  ],
  clearTitle: "Está claro",
  clear: [
    "Precio indicado: S/3,800 y adelanto del 50%.",
    "La instalación está expresamente incluida.",
  ],
  missingTitle: "Falta definir",
  missing: [
    {
      title: "Entrega e instalación",
      quote: "“Instalación incluida”",
      detail:
        "No aparece una fecha máxima ni qué se acuerda si hay un retraso.",
    },
    {
      title: "Materiales y medidas",
      quote: "“Mueble TV en melamina”",
      detail:
        "Faltan dimensiones, espesor, acabado y herrajes. “Melamina” no describe por sí sola el mueble acordado.",
    },
    {
      title: "Precio final y adicionales",
      quote: "“Precio S/3,800”",
      detail:
        "No se aclara si incluye transporte, desmontaje o impuestos aplicables. Pregunta antes de asumir que se cobran aparte.",
    },
  ],
  scenario: "¿Qué pasa si el mueble no encaja?",
  scenarioText:
    "No se especifica quién verifica las medidas ni quién asume la corrección, el traslado y la reinstalación si hay un error de fabricación.",
  copyTitle: "Preguntas recomendadas",
  copies: [
    "Antes de hacer el adelanto, ¿podemos dejar por escrito la fecha máxima de entrega e instalación, las medidas finales y el espesor, acabado y herrajes del mueble?",
    "¿Los S/3,800 incluyen transporte, desmontaje e impuestos aplicables? ¿Qué podría generar un adicional y cómo lo aprobaríamos?",
    "¿Qué garantía ofrecen y por cuánto tiempo? Si hay un error de fabricación o medidas, ¿quién asume la corrección y la reinstalación?",
  ],
};

export const CATEGORIES = [
  "Muebles a medida",
  "Remodelación",
  "Construcción",
  "Catering y eventos",
  "Fotografía",
  "Diseño gráfico",
  "Arquitectura",
  "Marketing",
  "Desarrollo web",
  "Desarrollo de software",
  "Servicios profesionales",
  "Reparaciones e instalaciones",
  "Otro",
];

export const MOMENTS = [
  "Estoy por aceptar o pagar un adelanto",
  "Ya acepté, pero todavía no pagué",
  "Ya pagué un adelanto o el total",
];

export const OTHER_CATEGORY = "Otro";
