# CotizaLupa — implementation record

`PLAN.md` is guidance, not frozen spec. This file records what we actually
built and decided, and where we diverged. Update it in place when a decision
changes — do not append a second account.

## Stack (actual, scaffolded 2026-09-15)

| Layer | PLAN said | We run | Why different |
|---|---|---|---|
| TanStack Start | 1.168 | `@tanstack/react-start` 1.168.54 (latest) | — |
| TanStack Router | (implied 1.168) | `@tanstack/react-router` 1.170.36 | react-start@1.168.54 declares exactly this; our own 1.168.26 pin loaded a second copy and 500'd dev SSR (D2) |
| React | 19.3 | 19.3.0 | — |
| Node | 24 LTS | 24.16.0, `.nvmrc` = `24`, `engines >= 24` | — |
| pnpm | (implied current) | 12.4.1 via mise `pnpm@latest`, `packageManager` pinned | Shell had 9.15.4; scaffold workspace format needs ≥10 (D1) |
| Drizzle | 0.45 / kit 0.31 | `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10 | — |
| Zod | 4 | 4.6.5 | — |
| `pg` | 8.x | 8.23.0 | — |
| `unpdf` / `file-type` | 1.x / 22 | 1.8.1 / 22.1.0 | — |
| `openai` | 7.x | 7.15.0 | — |
| Local PostgreSQL | (not specified) | `postgres:17-alpine` | Local dev and isolated-database lifecycle tests use the same server/driver shape as Neon |
| Local bucket | (not specified) | `quay.io/minio/minio:latest` | Local S3-compatible bucket; Railway remains the deployed bucket |
| Sentry Node | (approved exception) | 10.74.0 | Manual server error capture only; no tracing, replay, request bodies, or PII |
| AWS S3 client | (bucket adapter) | 3.1130.0 | Railway Buckets expose an S3-compatible API |
| Vitest | 5 | ^5.0.1 (lockfile: 5.0.1) | exact pin fought pnpm 12's 24h minimum-release-age policy on publish day (D3) |

Rule going forward: retain these versions unless a concrete constraint requires
a change. Approved product decisions update PLAN.md and this record together.

## Decision log

### D1 — pnpm 12 via mise (2026-09-15)
Scaffold's `pnpm-workspace.yaml` (`allowBuilds` format) is unreadable by the
shell's pnpm 9 (`packages field missing or empty`). First verified with one-off
pnpm 10, then migrated fully: mise `pnpm@latest` → 12.4.1, `packageManager`
pinned, legacy `pnpm.onlyBuiltDependencies` removed (workspace file is the
source of truth). If `pnpm --version` still shows 9 in some shell, that shell
is resolving the old shim — mise exec shows 12.4.1.

### D2 — Router follows Start's declared deps, not PLAN's line (2026-09-15)
Symptom: dev SSR 500 `{"status":500,"unhandled":true,"message":"HTTPError"}`,
cause `TypeError: object is not iterable` in `handleServerRoutes`
(`@tanstack/start-server-core`). Root: our `@tanstack/react-router@1.168.26`
pin vs `1.170.36` required by `@tanstack/react-start@1.168.54` → two router
copies at runtime. Fix was dependency alignment in `package.json`, no code
change. Lesson: "1.168" names the Start package only; TanStack siblings are
independently versioned and the Start package pins them exactly — deleting or
downgrading those pins reintroduces the duplicate-copy 500.

### D3 — Vitest as a range, fresh lockfile (2026-09-15)
pnpm 12's default `minimum-release-age` (24h) rejected same-day publishes in
the committed lockfile (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Relaxing the
policy repo-wide was rejected (it's real protection for money-handling code);
instead loosened the one exact-pinned violator (`vitest` → `^5.0.1`) and
rebuilt the lockfile. Policy now passes on plain commands. Expect this friction
again on any day we add a brand-new release — that's the policy working.

### D4 — Scaffold source (2026-09-15)
`@tanstack/cli create` (the old `create-start` is deprecated), blank template,
Railway adapter, no toolchain, no git, deps installed after. Skeleton added on
top: `src/server/*`, `src/db/*`, `src/lib/schemas.ts` (real `PrecheckSchema`),
`/r/$token` stub, `tests/lifecycle.test.ts` (12 skipped cases from PLAN),
`ops/queries.sql` stubs, `fixtures/README.md`, mockup copied to
`docs/mockup/` (read-only reference). Verified: install, `vitest run`
(12 skipped / 0 failed), `vite build`, dev SSR 200 on `/` and `/r/:token`.

### D5 — Landing serves the mockup verbatim (2026-09-15, retired 2026-09-16)
`/` renders `docs/mockup/index.html`'s body (imported `?raw`) with its
stylesheet and vanilla JS from `public/mockup/`, injected by effect because
the script runs top-level and `innerHTML` scripts don't execute. Starter
`main`/`body` CSS was trimmed to a box-sizing reset so it can't fight the
mockup's own typography. Temporary until the landing/upload flow is rebuilt
in React (phase 1); the served copy is `public/mockup/`, the reference
original stays in `docs/mockup/` — keep them in sync by re-copying, or delete
both when React takes over.

Retired: `/` is now SSR React (`src/routes/index.tsx` + `src/components/landing/`,
plain CSS tokens in `src/styles/landing.css`, zero new deps — no Tailwind, no
component library for two pages). The `?raw` shim, `landing-body.html`, and
`public/mockup/` are deleted; `docs/mockup/` stays as the frozen visual
baseline. Dropped in the port: the unreachable `proveedor` example dataset and
the `document.modelContext` demo-tool registration (its contract includes the
proveedor path closed in iteration 1). Flow logic lives in a pure
`review-flow.ts` reducer + `tests/review-flow.test.ts`.

### D6 — AGENTS.md encodes Joca's taste (2026-09-15)
Two interview rounds replaced the opinionated defaults: ask at forks (never
guess on product/architecture), short written plan + approval before
multi-step work, walkthrough reports, findings-reported-not-fixed unless
trivial, EN inside / es-PE outside, tests mandatory only for money + states +
idempotency + immutability, commits only on explicit ask.

### D7 — Ticket is $12 USD, one-shot (2026-09-15, display updated 2026-09-17)
Mockup and early copy said S/20. That covers inference + a cheap gateway
and then loses money once Meta Ads is the acquisition channel. $12 USD is
the launch willingness-to-pay (about S/39 at 3.40, reference only). Live landing shows $12 USD.
`docs/mockup/` stays S/20 as the visual baseline. Meta CAPI is a separate next
integration after Paddle, Purchase only for verified paid orders. Do not change the ticket in
code without updating this decision and `docs/pricing.md`.

### D8 — Paddle is the MVP payment rail (2026-09-15, updated 2026-09-17)
MVP hypothesis is “will someone pay ~$12?”, not “can we operate Peruvian
payments.” Paddle does not provide preliminary assessments or preapproval by
email. Eligibility is pending the Paddle application, a live HTTPS domain, and
review of the functional product. Once accepted, checkout is Paddle (MoR):
local preview → mechanical validation → Paddle → webhook `PAID` → analyze.
There is no prepayment model call in the approved POC. We still have renta and
the monthly 621; we do not emit a boleta per consumer in this path.
Exportación de servicios and IGV on a non-domiciled MoR fee are
accountant questions, not assumptions.

Payments code stays provider-agnostic: verify the Paddle event, match
order/amount/currency, deduplicate `provider_event_id`, and allow `PAID` only
from `PAYMENT_PENDING`. Economics and the Paddle application questions live in
`docs/pricing.md`.

### D9 — Free POC used one AI pass (2026-09-16, superseded by D16)
The original free POC ran submit → persisted `/r/{token}` report with no payment and no
AI pre-payment gate. A successful synchronous analysis atomically creates a
terminal demo order and its report, then returns the raw token only to the
browser for navigation. It persists neither the original nor the user's concern.
The backend still rejects mechanically invalid uploads before model spend: one
PDF of at most 10 pages, or 1–10 JPG/PNG images, 25 MiB combined, real MIME,
readable/unencrypted PDF, server-computed SHA-256. The single Astra pass checks
the commercial unit and produces the report. This is not the paid design: a
cheap pre-check was originally planned before checkout. D16 supersedes that
design with local preview and post-payment suitability checks plus manual refunds.

The POC model boundary lives in `src/server/ai.ts`: `store: false`, 16,000 total
output/reasoning tokens, a 180 s timeout, one retry, strict JSON schema, and a
second domain-validation pass. PDFs use `input_file`; photos use `input_image`.
User context is normalized, length-limited, passed as untrusted data, and never
overrides document facts. `quotation_facts` is canonical; the report header is
derived from it instead of asking the model for duplicate quotation fields.
Model invalid output, refusal, document rejection, retryable provider failure,
and permanent provider/configuration failure remain distinct outcomes.

Spend protection stays in memory to preserve the one-process design: 10
requests per IP per hour and at most two simultaneous model calls. These limits
reset on deploy and are intentionally not distributed.

### D10 — Manual recovery, monthly deletion, minimal Sentry (2026-09-16, revised for paid POC)
There is no interval. The phase 3 webhook will call `processNext()` after
responding 200; `pnpm ops:drain` is the manual backstop run monthly or after a
Sentry alert. It expires old unpaid orders, repairs exhausted processing,
drains claimable work, lists stale payments for manual Paddle reconciliation,
lists every existing paid analysis failure, deletes due originals, and exits
nonzero when manual work remains. It never guesses that a pending payment failed.

Every order starts with a 30-day `delete_after` eligibility date. Safe terminal
states advance eligibility to now; paid failures retain the original date for
recovery or refund. Every terminal transition clears `user_context`. The sweep only accepts
terminal statuses, so a bad date cannot delete a pending or processing original.
Physical deletion occurs on the next manual drain after eligibility. There is
no 30/35-day physical-deletion guarantee. A monthly sweep can retain a newly
eligible unpaid original until the following month's sweep. Review pending
payments in Paddle; never let an unresolved payment become indefinite retention.
Paid failures require attention during pilot operation, not just monthly cleanup.

Sentry is the one approved infrastructure exception. The server SDK captures
sanitized operational errors only. Default integrations, PII, request data,
breadcrumbs, tracing, and replay are disabled.

### D11 — DB recovery boundary and local services (2026-09-16)
Docker PostgreSQL applies the generated migration in a unique database per test
and executes the same `pg` driver and `FOR UPDATE SKIP LOCKED` claim SQL as
Neon. Docker Compose also provides MinIO for local bucket integration. Report
insertion and `PROCESSING → COMPLETED` now share one SQL statement, retries
reuse the unique report row, and the manual drain closes a crashed third
attempt. Bucket reads verify size and SHA-256 before analysis; deletion marks
`deleted_at` only after the bucket acknowledges the delete.

### D12 — Persisted report page (2026-09-16)

`/r/{token}` hashes the raw URL token on the server, validates the stored report
against `AnalysisSchema`, and renders only persisted report data. Invalid,
unfinished, and unavailable reports have separate es-PE states. The page is
`noindex`, contains no Meta pixel, and never stores the raw token. Completed
reports offer browser print-to-PDF with a dedicated A4 stylesheet; we do not
generate or store another report artifact. Email capture and delivery remain
undecided and are not part of this phase.

### D13 — Review shutdown flag (2026-09-17)

Phase 2 includes the server-only `REVIEWS_DISABLED` flag. Only the exact value
`true` disables submission: the final submit is disabled in the UI,
and the server endpoint rejects before processing. When unset or set
to any other value, mechanical validation and order preparation are available. Existing reports
and jobs are unaffected. This flag does not enable payments. The internal
`/analyze` prompt-testing page, its renderer, and its non-persisting endpoint
were removed; the landing flow is the only review submission path.

### D14 — Public policy pages moved forward (2026-09-17)

Phase 4 public policy work was approved and brought forward. Privacy, terms,
refunds, and contact pages are implemented with `soporte@cotizalupa.com` for
support/privacy requests and Jose Carlos Pereyra Leon as the operator. Verify
the mailbox works before submission. These pages now describe local preview,
technical validation, post-payment AI, manual refunds, temporary storage and monthly deletion separately from the unavailable paid
service; the product is not launch ready.

### D15 — Five files, any mix; amount_cents is bigint (2026-09-18)

Mechanical limit is now at most 5 files per order, any mix of PDF/JPG/PNG
(25 MiB combined, 10 pages per PDF, real MIME, server-computed SHA-256).
The single-PDF-or-images split and its `MIXED_FILE_TYPES` rejection are gone:
multi-page phone photos of one quotation kept tripping the old rule, and one
uniform cap is simpler to explain than two. The paid-POC PLAN now reflects this limit.
Watch the cost side: five 10-page PDFs is 50 pages of model input; tighten
with a total-page cap if spend says so.

`amount_cents` is `bigint` (edited in the single unmigrated migration, prod
was never migrated): the Zod range allows ~S/999M, which overflows a 32-bit
`integer` after model spend. TS side uses `bigint(..., { mode: "number" })`.

Also in this pass: deterministic order-data failures (incomplete context,
missing/corrupt stored files) fail the order immediately as
`order_data_invalid` instead of burning 3 claim attempts; MIME↔extension
mapping lives once in `uploadLimits.ts`; the `analyze.ts` size estimate is
gone (`validateAnalysisFiles` is the one gate).

### D16 — Local preview, pay first, then Astra

Joca approved removing the cheap-model pre-check from the paid POC. The final
form step previews local images and opens PDFs without uploading them. The user
can remove files or return to replace them before order creation. Warn about
complete, legible input and one quotation, but do not claim the preview or
technical validation certifies its content. Until Paddle is integrated, the
button creates an order and explicitly says payment is unavailable.

Mechanical validation still checks MIME, size, PDF parsing/encryption, pages
and SHA-256. Invalid input leaves no persisted order or document. Valid input creates a
CREATED order and complete file manifest in one transaction, then writes the
bucket, then becomes READY_FOR_PAYMENT. Failed writes leave tracked keys and a
REJECTED order; interrupted CREATED uploads expire through the existing drain.
No edit endpoint exists, and file registration locks the order and refuses
anything past CREATED. The original free report helper remains internal for
existing tests; no public endpoint can run Astra without payment.

The existing private report link shows payment-ready, pending, processing,
expired, failed and refunded states. Checkout remains explicitly unavailable.
The $12 USD review ticket is server-owned and distinct from the order's
approximate quotation amount in PEN. Paddle must use the former for verification.
No model runs during preparation. The pre-check request, configuration and
dedicated tests are removed, not feature-flagged. The nullable precheck_result
column remains unused; no migration is needed. The two-request admission
limit covers decoding, validation and storage; HTTP transport
buffering still needs deployed-size verification.

Astra checks document suitability and generates the report only after verified
payment. NOT_ANALYZABLE is an expected paid-input failure, not a broken pre-check.
Do not save a fabricated report or retry unsuitable input. Handle a full refund
manually through the provider, then conditionally mark REFUNDED. This replaces
the earlier rule promising no payment for unprocessable content. Existing
recovery and failure visibility stay. Model stubs remain disabled in production.
The paid eval command and runner were removed at Joca's request. Synthetic
fixtures remain for free deterministic tests; review a few model-generated
reports manually before selling. The form describes CotizaLupa analyzing the
files after payment; AI processing and the provider are disclosed in the linked
privacy policy, without implying files stay exclusively on our servers.

New payment events retain operational metadata only; the legacy payload column receives `{}`.
Only the verified webhook will write PAID, atomically with the event insert.
The browser return is read-only. Checkout duplication/provider-timeout handling
belongs to the Paddle integration. CAPI is the subsequent separate integration.

## Phase status

- [x] 0. Scaffold (this file's baseline)
- [x] 1. Core implementation: direct upload, mechanical validation,
  tracked bucket writes and payment-ready orders, with no prepayment AI. Local PostgreSQL
  tests apply the migrations to isolated databases; no production migration is implied.
- [x] 2. Product implementation: Astra → Zod, processNext(), persisted report,
  private order-state page, local file preview and file immutability. REVIEWS_DISABLED gates submission.
- [ ] 3. Money: Paddle acceptance, checkout/session recovery, authenticated
  transactional webhook, browser-return refresh and sandbox payment tests.
  CAPI follows as a separate integration; no quotation content in attribution.
- [ ] 4. Producción: sweep/retry mechanisms are built and the public policy
  pages are implemented. Still open: mailbox verification,
  deployed upload limits, manual report-quality review,
  deployment verification, and owner sandbox-to-live charge/refund sign-off.

## Open questions

Paddle application and live-domain review, before writing `payments.ts`:
one-shot USD? signed webhook + retries + stable event id? checkout only after
technical file validation? refunds? invoice language + LATAM VAT/IGV? Peru-resident payouts?
ToS vs AI/document-upload.

Accountant, before first live charge: CotizaLupa→Paddle booking;
exportación de servicios (four SUNAT conditions, do not assume);
non-domiciled IGV on the MoR fee (2026 procedure).
