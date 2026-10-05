# CotizaLupa

CotizaLupa: the user uploads a quotation (PDF or photos), pays, and gets a report with
what is clear, what is missing, risks, and suggested questions. Initial market: Peru.

One paid order = one quotation = one main commercial proposal. Multiple items,
A/B/C options, add-ons, or pages still count as one. Two or more providers in the
same PDF does not count as one — comparison is not supported in the MVP.

This file is the paid-POC scope, flow, and operating constraints, and the single
source for them. Code, migrations, and tests own the details. If the code
conflicts with this document, ask — do not reinterpret either silently.

This is a first deployment with an empty production database and no existing
orders. Apply the Goose migrations to create the schema; no Drizzle adoption
or legacy-order compatibility is required.

## POC operating constraints

The experiment is whether someone pays $12 USD and finds the report useful.
These constraints protect that experiment; privacy is an operating obligation,
not a claim of competitive differentiation.

### 1. Preview before payment, analysis after payment

The approved POC has no AI pre-check. The user previews files locally and checks
that they contain one complete, legible quotation. The server validates technical
file limits before creating a payment-ready order; this does not certify content.
GPT-6.1 Sol produces a best-effort report only after verified payment, even for weak
input — gaps carry what could not be evaluated. Never fabricate findings.
Manual refunds cover system failures only, never report content. This
explicitly replaces the earlier never-charge-unprocessable-input rule.

Sixty submissions per IP per hour and four concurrent preparations, held in memory.
These limits are not a guarantee against oversized HTTP request bodies.


## A note from Joca

I like ambitious ideas, simple systems, and software that feels obvious. Do not
preserve complexity just because it already exists. Do not introduce machinery
because it looks architecturally impressive. Understand the real constraint, then
fight for the smallest model that makes the correct behavior unsurprising.

Question intermediate abstractions — are they actually needed? If a pattern exists
"just in case", remove it. If two paths do almost the same thing, pick one. A
defensible argument for a mechanism is not evidence the mechanism is needed.

The rest of this document helps you navigate the codebase and make changes
effectively. Think of these as good defaults; explicit instructions from the
developer override anything here.

## Working together

How Joca and the agent collaborate. This section wins when it overlaps with
anything below.

- **Ask at forks, don't guess.** Anything touching product or architecture —
  two reasonable designs, an unclear requirement — stops for a question. Small,
  reversible details don't need one.
- **Short plan first.** Multi-step work (a phase, a new flow) starts with a
  brief written plan. Building starts after approval. Small tasks skip the plan.
- **Walkthroughs, not receipts.** When work lands, explain the reasoning and
  the key decisions, not just what changed. Test output for logic, screenshots
  or video for UI.
- **Findings, not drive-bys.** Rot spotted outside the task gets reported in
  one sentence. Fix it on the spot only if trivial; otherwise ask whether it
  goes on the list as a pending fix.
- **English inside, Spanish outside.** Code, docs, commits, and agent chatter
  in English. Anything the user reads (UI, reports, emails) in es-PE.

## A small glossary

Use this language when communicating:

- **you** means the agent reading this file and changing CotizaLupa.
- **we** means Joca and the people building CotizaLupa.
- **user** means the person uploading a quotation and paying for a report.
- **order** means one paid review: one quotation, one report, one lifecycle.
- **preview** means the local file-review step before order creation, with no AI.
- **pre-check** means the deferred cheap-model gate, not part of the paid POC.
- **analysis** means the model pass after payment that produces the report.
- **facts** means `quotation_facts`: what we analyzed, kept forever without the document.
- **report** means the JSON + the `/r/{token}` page: clear items, gaps, what-ifs, priorities.
- **terminal** means a status after which nothing else happens except deletion and
  possibly a manual refund (`REJECTED`, `EXPIRED`, `COMPLETED`, `PROCESSING_FAILED`,
  `REFUNDED`).

## The three ways to hurt yourself

1. **Touching real money.** Sandbox and production look alike. Never run a
   real charge, real refund, or production webhook replay to "verify". Verify
   payments with the sandbox and the idempotency tests. A duplicate charge is
   worse than a bug.
2. **Reading or keeping secrets and documents.** Never open `.env`, `.env.*`, or any
   credentials/keys/token files — yours or any subagent's. Never log quotation
   content, billing, or card data. Originals belong in the private bucket;
   local temporary files are allowed for upload validation and analysis requests.
   `payment_events.payload` stores `{}`; event records keep
   only operational metadata.
3. **Writing to the live database or bucket.** The production database and the Railway bucket
   are the business. Develop against local Postgres and test fixtures. Never point a
   dev server at production, never replay prod rows locally beyond operational
   metadata.

## Hit every state

The most common defect here will be an order stuck with no way out. Before calling
order-flow work done, walk this list and say which entries applied:

- **Entry points.** Upload is reachable from the landing CTA, the dialog, and the
  pricing section. Fixing one is not fixing the flow — check each.
- **Statuses.** Every transition needs its edge: 30-day expiry for staging and
  unpaid orders, retrying a checkout without a second charge, the 3-attempt cap,
  payment reconciliation, and the manual refund step. A status with no exit is a bug.
  The durable states are `CREATED`→`REJECTED` on storage failure;
  `CREATED`/`READY_FOR_PAYMENT`→`EXPIRED` after 30 days;
  `READY_FOR_PAYMENT`→`PAYMENT_PENDING`→`PAID`; `PROCESSING`→`COMPLETED` or
  `PROCESSING_FAILED`; and `PROCESSING_FAILED`→`REFUNDED` after a manual provider
  refund. A checkout that never registers a chargeable transaction returns to
  `READY_FOR_PAYMENT`, so no order stalls in `PAYMENT_PENDING`.
- **Reverse states.** If you added a way in, add the way out and the way to see it.
  A registered `PAYMENT_PENDING` checkout needs provider reconciliation,
  never a timeout guess. A checkout URL is returned only after registration;
  the manual drain releases unregistered freezes older than 15 minutes.
  `PROCESSING` needs reclaim and failure.
  A one-way door strands paid users.
- **Immutability boundary.** From `PAYMENT_PENDING` on, files are frozen: what we
  validated = what we charged = what we analyze. Any edit path must create a new order.
- **Report page.** `/r/{token}` looks up `sha256(token)`, carries no Meta pixel,
  and renders persisted order state or the persisted report. Browser print-to-PDF
  exists. Email is required before checkout; Resend sends the private link after the report is saved. Any change to report data must render here,
  not just in the JSON.
- **Privacy.** Keep document content out of logs and operational metadata.
  Bucket retention/deletion policy and crash-safe local temporary-file cleanup
  are deferred MVP decisions. Temporary files are cleaned up on normal return;
  the manual bucket sweep remains available, without a deletion guarantee.
- **Docs.** Check whether the change makes this file or the README inaccurate.
  Apply the [documentation rules](#documentation) before adding anything.

## Dev servers

- `pnpm install` installs. Go 1.27 (`.mise.toml`), Node 24 LTS (`.nvmrc` = `24`,
  `engines.node >= 24`), pnpm 12 (`packageManager` pins it; mise resolves
  `pnpm@latest` to it).
- `web/` owns the frontend and `web/.env.example`; `api/` owns the Go service
  and `api/.env.example`. Root API commands load `api/.env`; Vite loads `web/.env`.
  The root `.env` is not used. Keep API secrets out of the web environment.
- `pnpm dev:infra` starts local PostgreSQL and a RustFS S3 bucket from `compose.yaml`.
  Deployed DB is any managed Postgres behind `DATABASE_URL`; deployed files use
  the Railway Private Bucket through the same S3 API. Never use production for dev.
- `pnpm dev` starts both the Vite frontend (port 3002) and the Go API (port
  3001) via `concurrently`; Ctrl+C stops both and a child failure stops its
  sibling. `pnpm dev:web` runs Vite alone, `pnpm dev:server` the Go API alone.
  Vite uses a fixed port with `strictPort` and makes no `/api` proxy, so
  development exercises the real cross-origin requests. `pnpm start` runs the
  API alone. `pnpm preview:pages` serves the built site the way Cloudflare
  Pages does (`wrangler pages dev dist` from `web/` on port 3002, API separately).
- Frontend `http://localhost:3002` calls API `http://localhost:3001` through
  `VITE_API_URL`; the API allows exactly `PUBLIC_APP_URL` for CORS. Keep the
  two origins matched or checkout returns break.
- SQL migrations in `api/internal/migrations/` own the database schema. `pnpm db:create NAME`
  creates a Goose migration; `pnpm db:migrate` applies pending migrations explicitly.
- Deploy the frontend to Cloudflare Pages and the API-only Docker image to
  Railway. Pages builds from the repo root and serves `web/dist`; Railway's
  service root and Docker build context are `api/`.
  `VITE_API_URL` points to Railway; `PUBLIC_APP_URL` points to Pages.
  Apply migrations to the empty production database before starting the API.
- There is no local-disk upload path that bypasses validation.
- The payment webhook calls `processNext()` after responding 200. There is no
  timer. `pnpm ops:drain` is the manual recovery and deletion backstop (the Go
  binary's `drain` subcommand); agents never run it against production. Stop what
  you started: kill only PIDs you spawned.
- Never commit or publish `.env`, tokens, sandbox credentials, or report URLs.

## Test data

Real quotations are the most sensitive data we hold. Treat them accordingly:

- Default to `fixtures/` (see `fixtures/README.md`). Synthetic documents are
  generated in memory from those cases; no real quotation belongs in the fixture set.
- Never copy production originals into your sandbox. If you need a real shape,
  reconstruct a synthetic equivalent and say so.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.
- Bring secrets only if the flow under test needs them, and never print them.

## Verifying

- Smallest proof that the change works. `pnpm test:go` (`go test ./...` from `api/`) covers
  deterministic logic for free. DB-backed tests are opt-in: start `pnpm dev:infra`
  and run `pnpm test:go:db` (`COTIZALUPA_LOCAL_DB_TEST=1 go test -count=1 ./...` from `api/`).
  They reset the dedicated `cotizalupa_test` database to the shipped migration and
  never touch the development database. Run `pnpm --dir web typecheck` for frontend changes.
- **MVP testing bar:** payments, state transitions, idempotency, and file
  immutability always ship with tests. Everything else is tested lightly or as
  its behavior stabilizes — a prototype doesn't earn a suite before it settles.
- Test meaningful logic or observable behavior: state transitions, idempotency,
  immutability, reclaim. Do not assert component markup, callback wiring, or mirrors
  of the implementation.
- CI is not wired yet; Joca owns that. **Do not run repo-wide checks** unless asked.
- There is no paid eval command or runner. Keep synthetic fixtures for free tests.
  Review a few model-generated reports manually before selling; paid model calls
  are not a substitute for deterministic tests and need explicit authorization.
- Async flows must be awaited on receipts and drains (`processNext()` outcomes),
  never on sleeps or polling. A test that needs a timeout to pass is wrong.
- Verify in the environment that matters, not the convenient one. Say what you
  actually ran.


## Commits and PRs

- Never commit, push, or open a PR unless explicitly asked.
- Before committing, inspect `git status`, `git diff`, and recent log; stage only
  intended files, never secrets. One concern per commit.
- UI changes need before/after screenshots of the landing. Timing or
  flow changes need a short video or a walkthrough of each entry point.
- Do not commit implementation plans, research notes, or agent scratch files.

## Documentation

Most code changes do not need a documentation change. Agents can read the code.

- This file is the concise paid-POC scope, flow, and operating constraints. Update
  it when an approved product decision changes. Do not copy SQL or schemas into it;
  code and migrations record those.
- A merged change is the implementation record. A change big enough to contradict
  the scope here needs an explicit sign-off first.
- Keep implementation reasoning in a nearby code comment when the code cannot carry
  it. Do not enumerate fields, narrate control flow, or maintain file catalogs —
  types, tests, and code already record that.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep
  temporary material outside the repo.
- Keep the delivery order Core → Product → Money → Production. Core and Product
  prepare and validate the order and render the durable report; Money connects
  Polar to that flow; Production verifies deployment, mailbox, policies, and manual
  operation. Say which phase a change belongs to.
- Deferred by decision: AI pre-check, presigned uploads, pre-check polling, browser
  payment writers, automatic reconciliation or refunds, eval capture, cost
  telemetry, admin tools, accounts, comparison, bucket retention/deletion policy,
  crash-safe local temporary-file cleanup, and cosmetic schema or state consolidation.
- A merged change is the implementation record. Do not preserve a second checklist
  in the repository.

## How it works

```
LOCAL PREVIEW → DIRECT UPLOAD → MECHANICAL VALIDATION → STAGE ORIGINALS → READY_FOR_PAYMENT
→ CHECKOUT (Polar) → PAID → CLAIM → ANALYSIS → SCHEMA VALIDATION → SAVE REPORT + FACTS
→ COMPLETED → ORIGINAL DUE → MANUAL DRAIN DELETES IT
```

Clients upload directly to the server. It validates mechanically: `pdfcpu` for PDF
readability and page count, image headers for declared dimensions, 25 MiB total, 5
mixed PDF/JPG/PNG files, 10 pages per PDF, and a server-computed `sha256`. No model
runs before payment. Mechanically invalid files are not persisted. Valid files get a
CREATED order and file manifest before bucket writes; only successful writes produce
READY_FOR_PAYMENT. There is no edit endpoint; new files require a new order.
Checkout opens from READY_FOR_PAYMENT via Polar sessions. After idempotent payment
confirmation, `processNext()` claims the order (`FOR UPDATE SKIP LOCKED`), calls
GPT-6.1 Sol at medium reasoning effort by default, with `store: false` and a strict
`json_schema`, re-validates the result in
`parseAnalysis` as a second barrier, saves report + facts, and marks `COMPLETED`.
Report tokens are derived from the order ID and a stable server secret; only
`sha256(token)` is stored. Resend sends only the private report link after saving.
Email failure never changes COMPLETED or repeats analysis. The manual drain retries
pending email within 23 hours of the first attempt; older uncertain sends need
manual provider review. Keep the token secret and sender stable during recovery.
The manual sweep deletes eligible originals past `delete_after` when the manual
drain runs; the MVP deletion policy is deferred.


## Taste

- Complexity belongs at the adapter boundary (payments, OpenAI, bucket). Order logic
  stays plain: status values in the DB plus conditional updates, no state-machine library.
- No speculative gaps: 0–3 strong gaps beat 8 invented ones. Unknown fields are
  `null`, never inferred. The prompt rule and `parseAnalysis` both enforce this.
- Prefer the narrowest type that carries the meaning; `any` and empty interfaces
  are the enemy.
- Comments describe how a thing is used and move when the code moves. Annotate
  decisions (why this boundary, why this order), not every line.
- If a rule here fights the task in front of you, say so loudly and get a human
  sign-off before breaking it.

## Additional tips

- Do not verify with browsers or computer use unless explicitly agreed or requested.
- Security matters most at payment verification and report-token lookup.
  Elsewhere, prefer simplicity over hardening.
- Polar approved CotizaLupa; open accounting/tax questions live in
  `docs/pricing.md`. Confirm product config before first live charge.
