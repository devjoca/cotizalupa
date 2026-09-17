# CotizaLupa. Plan MVP v0.2

Producto: el usuario sube una cotización (PDF o fotos), paga, y recibe un reporte con lo que está claro, lo que falta, riesgos y preguntas sugeridas. Mercado inicial: Perú.

Principio: lo más simple que funcione. Nada se construye para concurrencia o escala que todavía no existe.

## Stack congelado

| Capa | Decisión |
|---|---|
| Full-stack | TanStack Start 1.168 + React 19.3 + Vite 8 + TypeScript strict (la versión que pinee el scaffold; 7.0 es el compilador nativo, 6.x el puente) |
| Runtime | Node 24 LTS (`engines.node: ">=24"`, `.nvmrc` = `24`), pnpm |
| Hosting | Railway Pro, un solo servicio (web + jobs en el mismo proceso) |
| DB | Neon Postgres, driver `pg` 8.x con `Pool` sobre TCP (proceso persistente, no hace falta `@neondatabase/serverless`) |
| ORM | Drizzle 0.45 + drizzle-kit 0.31 (estables; no usar los RC de 1.0) |
| Validación | Zod 4 |
| Archivos | Railway Private Bucket, presigned URLs |
| PDF | `unpdf` 1.x para páginas y cifrado (pdfjs mantenido; `pdf-lib` no tiene releases desde 2021), `file-type` 22 para el MIME real |
| IA | `openai` 7.x, Responses API, `store: false`, `json_schema` strict |
| Tests | Vitest 5 |
| Modelo | Astra para el análisis. El más barato disponible para el pre-check |
| Pagos | Paddle Checkout, pendiente de aceptación escrita del producto |
| Cola | Postgres, una query de claim |
| Límites | 10 páginas / 10 imágenes por orden |
| Errores | Logs de Railway + Sentry server-only, sin PII ni contenido del documento |
| No | OCR, texto persistido, Redis, workflow engine, vector DB, admin UI, tracing, replay |

Desarrollo local: `pnpm dev:infra` levanta PostgreSQL 17 y MinIO. Tests de DB
usan `cotizalupa_test` para crear una base aislada por caso; nunca usan
`DATABASE_URL`.
Producción mantiene Neon y Railway Bucket con las mismas interfaces `pg`/S3.

Versiones verificadas en npm el 15 de septiembre de 2026. Node 22 está en maintenance desde octubre 2025; Node 24 es el LTS activo hasta abril 2028. Node 26 pasa a LTS el 27 de octubre de 2026; migrar cuando las deps lo declaren soportado.

No cambiar el stack salvo restricción concreta encontrada durante la implementación.

## Regla comercial

1 orden pagada = 1 cotización = una propuesta comercial principal.

Cuenta como una aunque tenga varios ítems, opciones A/B/C, adicionales, anexos o varias páginas. No cuenta como una: dos o más proveedores en el mismo PDF, aunque sea para comparar. No se soporta comparación en el MVP.

## Flujo

```
CREATE ORDER → UPLOAD → VALIDACIÓN MECÁNICA → PRE-CHECK IA → READY_FOR_PAYMENT
→ PADDLE → PAID → CLAIM → ANÁLISIS ASTRA → ZOD → SAVE REPORT + FACTS
→ COMPLETED → ORIGINAL DUE → OPS:DRAIN LO ELIMINA
```

El pre-check no analiza gaps. Solo protege la unidad comercial y evita cobrar por lo que no podemos procesar.

## Validación mecánica (antes del pre-check)

Server-side, después del upload a presigned URL:

- MIME real con `file-type`. Si no coincide con PDF/JPEG/PNG, rechazar.
- Tamaño máximo 25 MB.
- PDF: abrir con `unpdf`. Cifrado o corrupto, rechazar. Más de 10 páginas, rechazar y registrar `pages` para conocer la distribución real.
- Más de 10 imágenes, rechazar.
- `sha256` calculado en el servidor, nunca enviado por el cliente.

## Pre-check

```ts
const PrecheckSchema = z.object({
  is_quotation: z.boolean(),
  quotation_count: z.number().int().min(0),
  is_legible: z.boolean(),
  is_single_commercial_proposal: z.boolean(),
  reason: z.string().nullable(),
})

const accept =
  r.is_quotation && r.is_legible &&
  r.quotation_count === 1 && r.is_single_commercial_proposal
```

Sin `confidence`. Si el modelo no está seguro, `reason` lo dice y pedimos al usuario que suba la cotización por separado.

| Caso | Resultado |
|---|---|
| 1 cotización de varias páginas | ACCEPT |
| 1 cotización + anexos | ACCEPT |
| Opciones A/B/C del mismo proveedor | ACCEPT |
| Muchos ítems en una propuesta | ACCEPT |
| Cotización sin precio | ACCEPT, señalar ausencia |
| Moneda ambigua | ACCEPT, no inferir |
| Proveedor/cliente ambiguos | ACCEPT, reportar ambigüedad |
| Varias cotizaciones independientes | REJECT |
| 2 cotizaciones para comparar | REJECT |
| Factura, recibo, contrato | REJECT |
| Ilegible | REJECT |

Rate limit: contador en memoria por IP, 10 órdenes por hora. Sin Redis. Corre en el mismo proceso.

## Estados

```
CREATED → UPLOADED → PRECHECKING → READY_FOR_PAYMENT → PAYMENT_PENDING → PAID → PROCESSING → COMPLETED

PRECHECKING        → REJECTED
READY_FOR_PAYMENT  → EXPIRED           (30 días sin pagar; drain manual)
PAYMENT_PENDING    → PAID | PAYMENT_FAILED (resultado autenticado de Paddle; puede reintentar)
PAYMENT_PENDING    → EXPIRED           (solo manual tras reconciliar Paddle; nunca por el drain)
PROCESSING         → PROCESSING_FAILED (3 intentos)
PROCESSING         → NOT_ANALYZABLE    (el modelo no puede tras el pago)
PROCESSING_FAILED, NOT_ANALYZABLE → REFUNDED (manual)
```

Son valores en la DB y updates condicionales. Sin librería de state machine.

Cada orden nace con `delete_after = created_at + 30 días`. `REJECTED`,
`EXPIRED`, `COMPLETED` y `REFUNDED` lo adelantan a `now()`. Los fallos pagados
conservan el límite original para permitir recuperación o reembolso manual.
Toda transición terminal borra `user_context`; el reporte y `quotation_facts`
son los únicos resultados de análisis que se conservan.
El drain solo borra archivos de estados terminales seguros; nunca borra desde
`PAYMENT_PENDING`, `PAID` o `PROCESSING`. La eliminación física ocurre al
siguiente `pnpm ops:drain`, no exactamente al vencer la fecha.

Cada `NOT_ANALYZABLE` es un pre-check que falló. Se guarda como caso de eval.

## Congelar archivos al pagar

Al crear la sesión de Paddle la orden pasa a `PAYMENT_PENDING` y los archivos
quedan inmutables. Lo que validamos = lo que cobramos = lo que analizamos. Para
cambiar un archivo: nueva orden.

## Pago

Antes de la transición: firma de Paddle, estado exitoso, `transaction_id`, id
de orden, monto en céntimos y moneda. El id estable del evento entra en
`payment_events.provider_event_id` (UNIQUE; si ya existe, responder 200 y terminar).

```sql
UPDATE orders SET status = 'PAID', paid_at = now()
WHERE id = $1 AND status = 'PAYMENT_PENDING'
RETURNING id;
```

Cero filas: no pasa nada más. Webhook y retorno del navegador entran por el
mismo camino verificado.

No persistimos DNI, dirección, tarjeta ni billing. `payment_events.payload` se guarda sin `billing` ni `card`.

`PAYMENT_PENDING` nunca expira solo por antigüedad. El drain lista las órdenes
de 30 días para reconciliación manual en Paddle. Confirmada pagada → `PAID`;
confirmada fallida/cancelada/vencida → `PAYMENT_FAILED` o `EXPIRED`; dudosa →
sin cambio.

## Procesamiento

Un solo proceso. El webhook, después de responder 200, llama a `processNext()`.
No hay timer. `pnpm ops:drain` es el respaldo manual: expira impagos viejos,
repara intentos agotados, procesa trabajo recuperable, lista pagos pendientes
que requieren revisión y borra originales vencidos. Termina con código distinto
de cero si todavía requiere intervención manual.

```sql
UPDATE orders
SET status = 'PROCESSING',
    processing_started_at = now(),
    attempts = attempts + 1
WHERE id = (
  SELECT id FROM orders
  WHERE status = 'PAID'
     OR (status = 'PROCESSING'
         AND processing_started_at < now() - interval '15 minutes'
         AND attempts < 3)
  ORDER BY paid_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

Commit y después se llama al modelo. Después de 3 intentos: `PROCESSING_FAILED`.

El drain corre a mano una vez al mes y cuando Sentry muestra un fallo operativo.

## Análisis

Responses API con `store: false`, PDF e imágenes nativos, `text.format` con `json_schema` en modo strict. Todos los campos requeridos, los desconocidos `nullable`. Zod valida como segunda barrera. Si falla igual, cuenta como intento.

Regla del prompt: no generar gaps para llenar el reporte. 0 a 3 gaps fuertes valen más que 8 especulativos.

## Modelo de datos

```sql
orders
  id uuid pk, status text
  country text default 'PE', currency text default 'PEN', amount_cents integer
  perspective text, category text, moment text, user_context text null, email text null
  report_token_hash text unique
  payment_provider text null, payment_transaction_id text null
  precheck_result jsonb null
  processing_started_at timestamptz null
  delete_after timestamptz not null default now() + interval '30 days'
  attempts smallint default 0, last_error text null
  refund_requested_at timestamptz null
  fbp, fbc, client_user_agent, client_ip text null
  meta_purchase_sent_at timestamptz null
  created_at, paid_at, completed_at, updated_at

order_files
  id, order_id, position, blob_path, mime, size_bytes, sha256, pages, deleted_at

reports
  id, order_id
  model, reasoning_effort, prompt_version, schema_version
  result jsonb, quotation_facts jsonb
  input_tokens, output_tokens, latency_ms, cost_usd
  created_at

payment_events
  id, provider, provider_event_id unique, order_id, event_type, payload jsonb, created_at
```

### `quotation_facts`

Se conserva indefinidamente junto al reporte. Representa qué analizamos sin conservar el documento.

```json
{
  "document_type": "quotation",
  "service": "Diseño arquitectónico",
  "supplier": "Estudio ABC",
  "amount": { "value_cents": 201000, "currency": "PEN" },
  "summary": "...",
  "scope_summary": "...",
  "delivery_summary": "...",
  "payment_summary": "..."
}
```

Campo desconocido: `null`. Nunca inventado.

### Reporte

```json
{
  "quotation": {},
  "clear_items": [],
  "gaps": [
    {
      "title": "...",
      "status": "missing | ambiguous",
      "evidence": "...",
      "missing": "...",
      "why_it_matters": "...",
      "suggested_question": "..."
    }
  ],
  "what_if": [],
  "priorities": []
}
```

## Página del reporte

`/r/{token}`. Se busca por `sha256(token)` y solo renderiza el reporte persistido.
Sin pixel de Meta en esta página. El envío por email, la captura de email y la
descarga en PDF quedan diferidos hasta definir ese flujo de producto.

## Privacidad

El original tiene un límite inicial de 30 días y se elimina en el siguiente
drain una vez elegible. OpenAI usa `store: false`. No persistimos OCR, texto
completo ni conversaciones. `user_context` existe solo mientras puede hacer
falta para analizar o recuperar; se limpia al completar, rechazar, vencer o
reembolsar. Conservamos `quotation_facts`, el reporte y metadata operativa.

## SUNAT

Boleta a consumidor final, emitida a mano. DNI/RUC no es requisito del producto. Comprobante identificado se trata como flujo separado si alguien lo pide. Nada de Nubefact/API antes de vender.

## Operación

Sin admin UI. Queries documentadas en `ops/queries.sql`:

- órdenes `READY_FOR_PAYMENT`/`PAYMENT_FAILED` de más de 30 días
- órdenes en `PAYMENT_PENDING` de más de 30 días para reconciliar, sin update masivo
- órdenes `PROCESSING` agotadas o trabadas
- órdenes en `PROCESSING_FAILED` y `NOT_ANALYZABLE`
- órdenes con `refund_requested_at` sin `REFUNDED`
- costo por orden en la última semana

Reembolso: manual desde Paddle, después transición condicional a `REFUNDED`.

## Tests

Dos carpetas, dos comandos.

`pnpm test` (Vitest, determinista, gratis; requiere `pnpm dev:infra` para los
casos DB y el mismo servicio PostgreSQL en CI):

- `>10 pages rejected`, `encrypted pdf rejected`, `fake mime rejected`
- `payment cannot occur before successful precheck`
- `files immutable after PAYMENT_PENDING`
- `webhook with bad signature rejected`, `webhook with wrong amount rejected`
- `duplicate webhook doesn't duplicate report`
- `stale PROCESSING order is reclaimed`, `abandoned third attempt marks PROCESSING_FAILED`
- `report + COMPLETED is atomic/idempotent`, `active files never enter deletion`
- `stale PAYMENT_PENDING is reported, never expired automatically`
- `invalid model output counts as attempt`
- `terminal deletion eligibility and active-state exclusion`

`pnpm eval` (llama al modelo, cuesta dinero, corre a mano):

```
fixtures/
  normal-quotation.pdf
  quotation-without-price.pdf
  quotation-with-options.pdf
  quotation-with-annex.pdf
  multiple-quotations.pdf
  invoice.pdf
  unreadable.pdf
  ten-page-quotation.pdf
```

Imprime aciertos sobre total. Umbral orientativo 9 de 10, no pass/fail estricto.

## Fases

Sin estimaciones. El orden importa, el tiempo no.

1. Core: TanStack Start, Neon/Drizzle, bucket, upload, validación mecánica, órdenes, pre-check.
2. Producto: Astra → Zod → reporte, `quotation_facts`, `processNext()`, página `/r/{token}`.
3. Money: Paddle sandbox, idempotencia, webhook + retorno del navegador. Meta CAPI solo si hace falta para adquisición.
4. Producción: `delete_after`, reintentos, política de privacidad, boleta manual, prueba con dinero real y reembolso manual.

Las preguntas de aceptación del producto se resuelven con Paddle antes de
escribir el adapter de pagos.
