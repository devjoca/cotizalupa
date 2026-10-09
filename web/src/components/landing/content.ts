// Landing copy and demo data. Identifiers in English; user-facing strings in es-PE.

import type { Analysis } from "#/lib/schemas";

export const CATEGORIES = [
  "Construcción",
  "Muebles a medida",
  "Tiendas virtuales",
  "Remodelaciones",
  "Eventos",
  "Instalaciones eléctricas",
  "Desarrollo web",
  "Cocinas a medida",
  "Matrimonios",
  "Gasfitería",
  "Arquitectura",
  "Fotografía y video",
  "Drywall",
  "Diseño de interiores",
  "Software a medida",
  "Catering",
  "Carpintería metálica",
  "Marketing digital",
  "Cámaras de seguridad",
  "Mudanzas",
];

export interface HeroExample {
  exampleId: string;
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

// Each card condenses one gap from the LANDING_EXAMPLES report named by exampleId.
export const HERO_EXAMPLES: HeroExample[] = [
  {
    exampleId: "cerco",
    title: "Cerco perimétrico",
    sub: "Presupuesto de mano de obra",
    total: "S/ 9,300",
    totalNote: "sin IGV",
    gapLabel: "Viga collar · 30 ML × S/ 40",
    gapValue: "S/ 1,500",
    findingLabel: "LO QUE FALTA ACLARAR",
    findingQuestion: "La viga collar no cuadra",
    findingText:
      "30 metros a S/ 40 dan S/ 1,200, no S/ 1,500. Con ese parcial corregido, el total sería S/ 9,000.",
    suggestedQuestion:
      "En la viga collar, 30 metros a S/ 40 dan S/ 1,200, pero figura S/ 1,500. ¿Cuál es el monto correcto?",
  },
  {
    exampleId: "tienda",
    title: "Tienda virtual en WooCommerce",
    sub: "Hasta 50 productos",
    total: "S/ 6,800",
    totalNote: "+ IGV · 50% al inicio",
    gapLabel: "Cambios",
    gapValue: "“Incluye cambios”",
    findingLabel: "LO QUE FALTA ACLARAR",
    findingQuestion: "No hay un límite claro para los cambios incluidos",
    findingText:
      "No indica cuántas rondas de cambios incluye ni qué pedidos se cobrarían aparte.",
    suggestedQuestion:
      "¿Cuántas rondas de cambios incluye el precio de S/ 6,800 más IGV? ¿Qué cambios se cobrarían aparte y cómo se calcularía ese cobro?",
  },
  {
    exampleId: "ropero",
    title: "Ropero empotrado de melamina",
    sub: "Transporte e instalación incluidos",
    total: "S/ 3,200",
    totalNote: "IGV incluido · 50% de adelanto",
    gapLabel: "Instalación",
    gapValue: "Sin fecha",
    findingLabel: "LO QUE FALTA ACLARAR",
    findingQuestion: "No hay una fecha de instalación confirmada",
    findingText:
      "No se indica cuándo estará aprobado el plano ni si los 15 días hábiles terminan con el ropero instalado.",
    suggestedQuestion:
      "Si pago el adelanto de S/ 1,600 ahora, ¿qué día quedaría instalado el ropero, considerando la aprobación del plano?",
  },
];

// Landing report examples are real CotizaLupa output for synthetic quotations
// (fictitious names, no real contacts), typed as the real report so they render
// through ReportDocument and cannot promise anything the paid report does not show.
// The supplier is hidden so no example reads as an endorsement of a business.
export interface LandingExample {
  id: string;
  tab: string;
  sourceTitle: string;
  image: { src: string; alt: string; width: number; height: number };
  situation: string;
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
    id: "cerco",
    tab: "Construcción",
    sourceTitle: "Presupuesto de mano de obra para un cerco",
    image: {
      src: "/examples/cerco.png",
      alt:
        "Presupuesto de ejemplo de un maestro de obra: ocho partidas para un cerco perimétrico, desde excavación hasta pintura, con total de S/. 9,300 sin IGV.",
      width: 1000,
      height: 707,
    },
    situation:
      "Me piden 50% de adelanto para empezar el cerco de mi casa. Quiero saber qué preguntar antes de pagar.",
    analysis: {
      document: analyzableDocument,
      clear_items: [
        {
          title: "El presupuesto es de mano de obra e incluye herramientas menores",
          detail:
            "La propuesta se presenta como presupuesto de mano de obra y deja las herramientas y el equipo menor a cargo del contratista. No presenta el total como un precio que incluya materiales.",
        },
      ],
      gaps: [
        {
          title: "La viga collar no cuadra y falta confirmar el total final",
          status: "ambiguous",
          evidence:
            "«Viga collar · ML · 30 · S/. 40.00 · S/. 1,500.00»; «TOTAL (SIN IGV) S/. 9,300.00».",
          missing:
            "No se aclara cuál es el importe correcto de la viga collar ni cuánto pagarías finalmente con el IGV indicado como excluido.",
          why_it_matters:
            "30 metros a S/ 40 dan S/ 1,200, no S/ 1,500. Los parciales sí suman S/ 9,300, pero si solo se corrige esa multiplicación, sumarían S/ 9,000; necesitas confirmar la base correcta antes de calcular el adelanto.",
          suggested_question:
            "En la viga collar, 30 metros a S/ 40 dan S/ 1,200, pero figura S/ 1,500. ¿Cuál es el monto correcto? ¿Me envías la cotización corregida con el total final que debo pagar, incluido el IGV que corresponda?",
        },
        {
          title: "El adelanto no tiene condiciones por escrito",
          status: "missing",
          evidence: null,
          missing:
            "La cotización no indica el adelanto, cuándo se paga el saldo ni qué pasa con el dinero si el trabajo no comienza.",
          why_it_matters:
            "Según lo que cuentas, te piden 50% para empezar, pero esa condición no aparece en el presupuesto. Antes de pagarlo, conviene saber qué compromiso asume el contratista y cuándo tendrás que hacer los siguientes pagos.",
          suggested_question:
            "Antes de pagar el 50%, ¿me confirmas por escrito cuándo pago el resto? Si el trabajo no llega a empezar, ¿qué pasa con el adelanto?",
        },
        {
          title: "No queda definido cómo será el cerco terminado",
          status: "ambiguous",
          evidence:
            "«Sobrecimiento · ML · 30»; «Columnas de confinamiento · UND · 10»; «Tarrajeo · M · 60 · S/. 25.00 · S/. 1,500.00»; «Pintura · GLB · 1 · S/. 600.00».",
          missing:
            "No se indican la altura y distribución del cerco, si los 60 de tarrajeo son metros cuadrados, qué caras se tarrajean ni qué acabado de pintura se incluye.",
          why_it_matters:
            "Las cantidades no bastan para saber qué cerco recibirás. Una diferencia en altura, caras acabadas o pintura puede terminar en trabajos adicionales o en una entrega distinta de la que esperabas.",
          suggested_question:
            "¿Me envías un croquis con las medidas y la ubicación de las 10 columnas, indicando qué caras se tarrajean y pintan y qué acabado incluye? ¿Los 60 de tarrajeo son 60 m²?",
        },
        {
          title: "Falta separar los gastos que pagarás aparte",
          status: "missing",
          evidence: null,
          missing:
            "No se detalla quién compra y traslada los materiales ni si el retiro de tierra y escombros está incluido en la mano de obra.",
          why_it_matters:
            "Como el presupuesto es de mano de obra, tendrás que prever los materiales por separado. El traslado y el retiro de lo excavado también pueden generar pagos adicionales si no se acuerdan antes.",
          suggested_question:
            "¿Me puedes indicar qué gastos van por mi cuenta además de la mano de obra, incluyendo compra y traslado de materiales y retiro de tierra y escombros?",
        },
        {
          title: "No hay fecha de inicio ni duración del trabajo",
          status: "missing",
          evidence: null,
          missing:
            "No se indica cuándo empieza la obra, cuánto dura ni de qué depende que el contratista pueda comenzar.",
          why_it_matters:
            "La validez de 15 días corresponde a la oferta, no al plazo de ejecución. Pagar el adelanto no te permite saber cuándo empezarán ni cuándo quedará terminado el cerco.",
          suggested_question:
            "Si pago el adelanto, ¿qué día empiezan y qué debe estar listo para comenzar? ¿Cuántos días tomará terminar todas las partidas, incluida la pintura?",
        },
      ],
      what_if: [
        "Si pagas el 50% sobre S/ 9,300 antes de corregir la viga collar y confirmar el IGV, el adelanto puede calcularse sobre un total que luego cambie.",
        "Si esperas tarrajeo y pintura en ambas caras, pero el contratista ha considerado solo una, la segunda cara puede convertirse en un cobro adicional.",
        "Si entregas el adelanto y el trabajo no empieza, sin condiciones escritas puede haber desacuerdo sobre cuándo comenzar o qué pasa con tu dinero.",
      ],
      priorities: [
        "Pide la cotización corregida con el total final antes de calcular el adelanto.",
        "Confirma con un croquis y una lista qué trabajo incluye el precio y qué gastos pagarás aparte.",
        "Deja por escrito las condiciones de pago y las fechas de trabajo antes de entregar dinero.",
      ],
      quotation_facts: {
        document_type: "quotation",
        service: "Mano de obra para cerco perimétrico en Ate, Lima",
        supplier: null,
        amount: {
          value_cents: 930_000,
          currency: "PEN",
        },
        summary:
          "Presupuesto de mano de obra por S/ 9,300 sin IGV, con una diferencia entre la multiplicación y el parcial de la viga collar. Oferta válida por 15 días.",
        scope_summary:
          "Incluye excavación de zanjas, cimiento corrido, sobrecimiento, 10 columnas de confinamiento, viga collar, asentado de ladrillo, tarrajeo y pintura. Herramientas y equipo menor a cargo del contratista.",
        delivery_summary: null,
        payment_summary: null,
      },
    },
  },
  {
    id: "tienda",
    tab: "Tienda virtual",
    sourceTitle: "Propuesta para una tienda virtual",
    image: {
      src: "/examples/tienda.png",
      alt:
        "Propuesta de ejemplo de un estudio web: tienda en WooCommerce con hasta 50 productos, S/ 6,800 más IGV, 50% al inicio y entrega en 5 semanas.",
      width: 1000,
      height: 739,
    },
    situation:
      "Ya pagué el 50%. Me preocupa que después me cobren aparte por cambios o por el hosting.",
    analysis: {
      document: analyzableDocument,
      clear_items: [
        {
          title: "Precio base y pago del saldo definidos",
          detail:
            "La inversión es S/ 6,800 más IGV, no un total con impuesto incluido. La cotización establece 50% al inicio y 50% a la entrega; como ya pagaste el adelanto, el siguiente pago corresponde a la entrega.",
        },
        {
          title: "Hay entregables concretos incluidos",
          detail:
            "El precio contempla una tienda en WooCommerce con diseño personalizado y adaptable a celulares, carga de hasta 50 productos y una capacitación de 1 hora.",
        },
      ],
      gaps: [
        {
          title: "No hay un límite claro para los cambios incluidos",
          status: "ambiguous",
          evidence: "Incluye cambios",
          missing:
            "No indica cuántas rondas de cambios incluye ni qué pedidos se cobrarían aparte.",
          why_it_matters:
            "Aunque ya pagaste el 50%, no puedes saber qué ajustes podrás pedir sin aumentar el precio. Conviene distinguir los cambios que tú solicites de las correcciones de errores del proveedor.",
          suggested_question:
            "¿Cuántas rondas de cambios incluye el precio de S/ 6,800 más IGV? ¿Qué cambios se cobrarían aparte y cómo se calcularía ese cobro?",
        },
        {
          title: "Hosting y dominio: falta aclarar la renovación",
          status: "ambiguous",
          evidence: "Hosting y dominio incluidos el primer año",
          missing:
            "No precisa cuándo empieza ese primer año ni cuánto costará mantener el hosting y el dominio después.",
          why_it_matters:
            "La cotización sí los incluye durante el primer año, pero no permite calcular el gasto posterior ni saber cuándo aparecerá el primer cobro de renovación.",
          suggested_question:
            "¿Desde qué fecha corre el primer año de hosting y dominio incluidos? ¿Cuánto costará renovar ambos al terminar ese año?",
        },
        {
          title: "Las cinco semanas no tienen un inicio ni una entrega definidos",
          status: "ambiguous",
          evidence: "Plazo de entrega: 5 semanas · Forma de pago: 50% al inicio y 50% a la entrega",
          missing:
            "No indica desde cuándo se cuentan las cinco semanas ni en qué estado debe estar la tienda para considerarla entregada.",
          why_it_matters:
            "Haber pagado el adelanto no confirma que el plazo ya esté corriendo. Además, el saldo depende de una entrega que podría entenderse como una versión para revisar o como una tienda lista para vender.",
          suggested_question:
            "Ya pagué el 50%: ¿desde qué fecha se cuentan las 5 semanas? ¿Qué debe estar listo y funcionando para considerar entregada la tienda y pagar el saldo?",
        },
        {
          title: "La pasarela de pagos no está especificada",
          status: "ambiguous",
          evidence: "Integración de pasarela de pagos",
          missing:
            "No identifica la pasarela ni aclara si habrá pagos a terceros por activarla o usarla.",
          why_it_matters:
            "Que la integración esté incluida no significa necesariamente que el servicio de la pasarela no tenga otros cobros. Conviene conocerlos antes de aprobar su instalación.",
          suggested_question:
            "¿Qué pasarela de pagos van a integrar? ¿Qué cobros de esa pasarela tendría que pagar aparte de los S/ 6,800 más IGV?",
        },
        {
          title: "La garantía de un mes no dice qué cubre",
          status: "ambiguous",
          evidence: "Soporte: 1 mes de garantía",
          missing:
            "No indica cuándo comienza ese mes ni qué fallas o consultas atenderán sin cobro.",
          why_it_matters:
            "Si aparecen errores después de la entrega, no queda claro cuáles corregirán como garantía y cuáles podrían tratar como un servicio adicional.",
          suggested_question:
            "¿Desde cuándo empieza el mes de garantía? ¿Qué fallas o consultas atenderán sin costo durante ese mes?",
        },
      ],
      what_if: [
        "Si pides ajustes y el proveedor los considera fuera de los cambios incluidos, podrías recibir un cobro adicional pese a haber pagado el adelanto.",
        "Si termina el primer año sin haber acordado el costo de renovación del hosting y dominio, tendrás que decidir si pagas un importe que hoy no conoces para mantener la tienda disponible.",
        "Si el proveedor considera entregada una versión que todavía requiere pruebas o ajustes, podría solicitarte el saldo antes de que tú la consideres lista para vender.",
      ],
      priorities: [
        "Pide por escrito qué cambios cubre el precio antes de solicitar ajustes.",
        "Confirma cuándo empieza el año incluido y cuánto costará renovar hosting y dominio.",
        "Acuerda la fecha de entrega y qué debe funcionar antes de pagar el saldo.",
      ],
      quotation_facts: {
        document_type: "quotation",
        service: "Diseño de tienda virtual en WooCommerce",
        supplier: null,
        amount: {
          value_cents: 680_000,
          currency: "PEN",
        },
        summary: "Propuesta para una tienda virtual de Florería del Parque por S/ 6,800 más IGV.",
        scope_summary:
          "Diseño personalizado en WooCommerce, hasta 50 productos, integración de pasarela de pagos, diseño adaptable a celulares, cambios, hosting y dominio durante el primer año y capacitación de 1 hora. Ofrece 1 mes de garantía.",
        delivery_summary:
          "Plazo de 5 semanas, sin precisar desde cuándo se cuenta ni qué constituye la entrega.",
        payment_summary: "50% al inicio y 50% a la entrega.",
      },
    },
  },
  {
    id: "ropero",
    tab: "Muebles",
    sourceTitle: "Cotización de un ropero a medida",
    image: {
      src: "/examples/ropero.png",
      alt:
        "Cotización de ejemplo de un taller de muebles: ropero empotrado de melamina de 2.40 m por S/ 3,200 con IGV, transporte e instalación incluidos.",
      width: 1000,
      height: 670,
    },
    situation: "Estoy por pagar el adelanto. Quiero que esté listo antes de fin de mes.",
    analysis: {
      document: analyzableDocument,
      clear_items: [
        {
          title: "Precio y pagos definidos",
          detail:
            "El total es S/ 3,200 e incluye IGV, transporte e instalación en Lima Metropolitana. El adelanto es S/ 1,600 y los otros S/ 1,600 se pagan al terminar la instalación.",
        },
        {
          title: "Materiales y componentes especificados",
          detail:
            "Se indican las medidas del ropero, melamina de 18 mm color roble, canto PVC de 2 mm y las cantidades de puertas, cajones, repisas, tubos colgadores y herrajes.",
        },
        {
          title: "Garantía con cobertura y exclusiones",
          detail:
            "La garantía dura un año y cubre defectos de fabricación y herrajes. Excluye humedad y golpes.",
        },
      ],
      gaps: [
        {
          title: "No hay una fecha de instalación confirmada",
          status: "ambiguous",
          evidence:
            "«Plazo: 15 días hábiles desde el pago del adelanto y la aprobación del plano.»",
          missing:
            "No se indica cuándo estará aprobado el plano ni si los 15 días hábiles terminan con el ropero instalado.",
          why_it_matters:
            "Pagar el adelanto no activa por sí solo el plazo. Como quieres tenerlo listo antes de fin de mes, necesitas confirmar la fecha de instalación antes de pagar.",
          suggested_question:
            "Si pago el adelanto de S/ 1,600 ahora, ¿qué día quedaría instalado el ropero, considerando la aprobación del plano?",
        },
        {
          title: "Falta el plano que define la distribución",
          status: "missing",
          evidence:
            "«Distribución: 3 puertas batientes, 4 cajones, 2 repisas y 2 tubos colgadores (según plano adjunto)»",
          missing:
            "En el archivo recibido no aparece el plano citado, por lo que no se pueden revisar la ubicación y las medidas de los espacios interiores.",
          why_it_matters:
            "Las cantidades están definidas, pero no cómo se acomodarán. Aprobar sin revisar el plano puede terminar en un ropero distinto al que esperas.",
          suggested_question:
            "¿Me envías el plano con la distribución y las medidas de los espacios interiores del ropero para revisarlo antes de pagar el adelanto?",
        },
        {
          title: "No se explica qué pasa con el adelanto si no empieza el trabajo",
          status: "missing",
          evidence: null,
          missing:
            "No se indica qué ocurre con el adelanto si el pedido no llega a empezar o se cancela antes de fabricar.",
          why_it_matters:
            "Estás por entregar S/ 1,600. Si no logran acordar el plano o una fecha que te sirva, no queda claro qué parte de ese dinero podrías recuperar.",
          suggested_question:
            "Si el pedido no llega a empezar o se cancela antes de fabricar, ¿qué pasa con el adelanto de S/ 1,600?",
        },
        {
          title: "Cambios y correcciones sin reglas",
          status: "missing",
          evidence: null,
          missing:
            "No se explica cómo afectan al precio y al plazo los cambios que pidas después de aprobar el plano, ni cómo se corrige un trabajo que no coincide con lo aprobado.",
          why_it_matters:
            "Un cambio que tú pidas puede generar un adicional o retrasar la instalación. Corregir una diferencia respecto del plano aprobado es un caso distinto y conviene aclararlo para evitar desacuerdos.",
          suggested_question:
            "Si pido cambiar el plano después de aprobarlo, ¿cómo afecta al precio y a la fecha de instalación? Si el ropero no coincide con el plano aprobado, ¿cómo lo corrigen?",
        },
      ],
      what_if: [
        "Si pagas el adelanto pero la aprobación del plano se demora, los 15 días hábiles empezarán más tarde y el ropero podría no quedar instalado antes de fin de mes.",
        "Si apruebas el pedido sin ver el plano, podrías recibir las cantidades indicadas con una distribución interior distinta de la que esperabas.",
        "Si el pedido no llega a empezar después de pagar S/ 1,600, la cotización no define qué ocurre con ese adelanto.",
      ],
      priorities: [
        "Confirma por escrito una fecha de instalación que cumpla tu objetivo antes de pagar.",
        "Pide y revisa el plano citado en la cotización.",
        "Aclara qué pasa con los S/ 1,600 si el pedido no llega a empezar.",
      ],
      quotation_facts: {
        document_type: "quotation",
        service: "Fabricación e instalación de un ropero empotrado de melamina a medida",
        supplier: null,
        amount: {
          value_cents: 320_000,
          currency: "PEN",
        },
        summary:
          "Cotización N.° 0457, del 01/10/2026, por S/ 3,200 con IGV incluido y validez de 10 días.",
        scope_summary:
          "Ropero de 2.40 m de ancho, 2.60 m de alto y 0.60 m de profundidad, en melamina de 18 mm color roble con canto PVC de 2 mm. Incluye 3 puertas batientes, 4 cajones, 2 repisas, 2 tubos colgadores y los herrajes indicados. La distribución remite a un plano adjunto que no aparece en el archivo recibido.",
        delivery_summary:
          "Incluye transporte e instalación en Lima Metropolitana. Plazo de 15 días hábiles desde el pago del adelanto y la aprobación del plano.",
        payment_summary:
          "50% al confirmar el pedido y 50% al terminar la instalación: S/ 1,600 en cada pago.",
      },
    },
  },
];
