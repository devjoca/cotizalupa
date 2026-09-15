# CotizaLupa

CotizaLupa: the user uploads a quotation (PDF or photos), pays, and gets a report with
what is clear, what is missing, risks, and suggested questions. Initial market: Peru.

One paid order = one quotation = one main commercial proposal. Multiple items,
A/B/C options, add-ons, or pages still count as one. Two or more providers in the
same PDF does not count as one — comparison is not supported in the MVP.

`PLAN.md` is guidance, not frozen spec. `IMPLEMENTATION.md` is the record of
what we actually built and decided — read it before changing versions, deps,
or phase order, and update it in place when a decision changes. If they
conflict, ask — do not reinterpret either silently.

## What makes CotizaLupa special?

Three things we can never compromise on. Everything else is negotiable.

### 1. Never charge for what we cannot process

The pre-check exists to protect the commercial unit before money moves. If the
document is not exactly one legible quotation, reject before payment — never after.
A `NOT_ANALYZABLE` after payment is a pre-check failure, and it gets saved as an
eval case so it does not repeat.

### 2. Privacy by deletion, not by policy

Originals live in the bucket until `delete_after`, then they are gone. No persisted
OCR, no full text, no conversations — only `quotation_facts`, the report, and
operational metadata. OpenAI always with `store: false`. Never add a table, log
line, or cache that keeps document content past its purpose.

### 3. One process, boring infra

Single Railway service (web + jobs in the same process), Postgres as the queue
(one claim query), in-memory rate limit, Railway logs. No Redis, no workflow
engine, no vector DB, no admin UI, no Sentry. If your design needs new infra for
the MVP, the design is wrong.

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
- **pre-check** means the cheap-model gate before payment. It never analyzes gaps.
- **analysis** means the Astra pass after payment that produces the report.
- **facts** means `quotation_facts`: what we analyzed, kept forever without the document.
- **report** means the JSON + the `/r/{token}` page: clear items, gaps, what-ifs, priorities.
- **terminal** means a status after which nothing else happens except deletion and
  possibly a manual refund (`REJECTED`, `EXPIRED`, `COMPLETED`, `PROCESSING_FAILED`,
  `NOT_ANALYZABLE`, `REFUNDED`).

## The three ways to hurt yourself

1. **Touching real money.** Izipay sandbox and production look alike. Never run a
   real charge, real refund, or production IPN replay to "verify". Verify payments
   with the sandbox and the idempotency tests. A duplicate charge is worse than a bug.
2. **Reading or keeping secrets and documents.** Never open `.env`, `.env.*`, or any
   credentials/keys/token files — yours or any subagent's. Never log, copy, or
   persist original quotation content, billing, or card data. `payment_events.payload`
   is stored without `billing` and `card`, and that rule has no exceptions.
3. **Writing to the live database or bucket.** Production Neon and the Railway bucket
   are the business. Develop against local Postgres and test fixtures. Never point a
   dev server at production, never replay prod rows locally beyond operational
   metadata, never extend original retention past `delete_after`.

## Hit every state

The most common defect here will be an order stuck with no way out. Before calling
order-flow work done, walk this list and say which entries applied:

- **Entry points.** Upload is reachable from the landing CTA, the dialog, and the
  pricing section. Fixing one is not fixing the flow. The mockup in `docs/mockup/`
  shows all three — check each.
- **Statuses.** Every transition in `PLAN.md` "Estados" needs its edge: expiry timers
  (24 h), retry path (`PAYMENT_FAILED` can retry), 3-attempt cap, manual refund step.
  A status with no exit is a bug.
- **Reverse states.** If you added a way in, add the way out and the way to see it.
  `PAYMENT_PENDING` needs expiry and retry. `PROCESSING` needs reclaim and failure.
  A one-way door strands paid users.
- **Immutability boundary.** From `PAYMENT_PENDING` on, files are frozen: what we
  validated = what we charged = what we analyze. Any edit path must create a new order.
- **Report page.** `/r/{token}` looks up `sha256(token)`, carries no Meta pixel, and
  warns users without email to keep the link. Any change to report data must render
  here, not just in the JSON.
- **Privacy.** Any new field, log, or cache holding document content must have a
  deletion story. If it does not expire with `delete_after`, do not add it.
- **Docs.** Check whether the change makes `PLAN.md` or `ops/queries.sql` inaccurate.
  Apply the [documentation rules](#documentation) before adding anything.

## Dev servers

- `pnpm install` installs. Node 24 LTS (`.nvmrc` = `24`, `engines.node >= 24`),
  pnpm 12 (`packageManager` pins it; mise resolves `pnpm@latest` to it).
- `pnpm dev` starts the app on port 3000 (or the next free port if 3000 is
  taken — a kubectl OTel forward holds it on Joca's machine). One process serves web + jobs.
- DB is Neon Postgres via `pg` Pool over TCP (`DATABASE_URL` in `.env`, see
  `.env.example`). No serverless driver, no local emulator — use a dev database,
  never production.
- Files go to the Railway Private Bucket via presigned URLs. No local-disk uploads
  path that bypasses validation.
- A 60 s `setInterval` calls `processNext()` for stuck orders and expired deletes.
  The IPN handler calls it too after responding 200. Stop what you started: kill
  only PIDs you spawned.
- Never commit or publish `.env`, tokens, sandbox credentials, or report URLs.

## Test data

Real quotations are the most sensitive data we hold. Treat them accordingly:

- Default to `fixtures/` (see `fixtures/README.md`). The 8 eval PDFs are the shared
  vocabulary for pre-check behavior — use them before inventing new cases.
- Never copy production originals into your sandbox. If you need a real shape,
  reconstruct a synthetic equivalent and say so.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.
- Bring secrets only if the flow under test needs them, and never print them.

## Verifying

- Smallest proof that the change works. `pnpm test` (Vitest, deterministic, free,
  runs in CI) for the files you touched; targeted typecheck for the scope you changed.
- **MVP testing bar:** payments, state transitions, idempotency, and file
  immutability always ship with tests. Everything else is tested lightly or as
  its behavior stabilizes — a prototype doesn't earn a suite before it settles.
- Test meaningful logic or observable behavior: state transitions, idempotency,
  immutability, reclaim. Do not assert component markup, callback wiring, or mirrors
  of the implementation.
- **Do not run repo-wide checks** unless asked. CI owns the full suite.
- `pnpm eval` calls the model, costs money, and runs by hand — never in CI, never to
  "double-check" something a unit test already covers. Guideline is 9/10 hits, not a
  strict pass/fail.
- Async flows must be awaited on receipts and drains (`processNext()` outcomes),
  never on sleeps or polling. A test that needs a timeout to pass is wrong.
- Verify in the environment that matters (CI, no local creds/config), not the
  convenient one. Say what you actually ran.

## Payments

Money code has one extra reviewer: the ledger. Every payments change must show:

- Signature verified over `payloadHttp`, `code === "00"`, matching `orderNumber`,
  amount in cents, and currency before any state change.
- `uniqueId` UNIQUE in `payment_events`: duplicates answer 200 and stop.
- Conditional transition (`PAID` only from `PAYMENT_PENDING`, zero rows = no-op).
- IPN and browser callback entering through the same path — tested, not asserted.
- No new persisted PII. DNI, address, card, and billing never touch the database.

Refunds are manual from the Izipay panel, then `UPDATE orders SET status='REFUNDED'`.
There is no auto-refund code path in the MVP.

## Commits and PRs

- Never commit, push, or open a PR unless explicitly asked.
- Before committing, inspect `git status`, `git diff`, and recent log; stage only
  intended files, never secrets. One concern per commit.
- UI changes need before/after screenshots against the mockup baseline. Timing or
  flow changes need a short video or a walkthrough of each entry point.
- Do not commit implementation plans, research notes, or agent scratch files.

## Documentation

Most code changes do not need a documentation change. Agents can read the code.

- `PLAN.md` is the product spec: phase order, state machine, schemas, test lists.
  It is guidance, not frozen — do not rewrite it when we diverge.
- `IMPLEMENTATION.md` is the record of what we actually built and decided.
  When a version, dep, or phase-order decision changes, update it in place.
  A change big enough to contradict the plan needs an explicit sign-off first.
- `ops/queries.sql` is the ops manual. If your change adds a status, a failure mode,
  or a cost signal, the query that surfaces it goes there.
- Keep implementation reasoning in a nearby code comment when the code cannot carry
  it. Do not enumerate fields, narrate control flow, or maintain file catalogs —
  types, tests, and code already record that.
- The mockup (`docs/mockup/`) is a visual reference, not a spec. Note deviations
  from it in the PR or commit body instead of editing the mockup.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep
  temporary material outside the repo.
- Phase order in `PLAN.md` matters; time estimates do not. Build in phase order
  (1. Core, 2. Producto, 3. Money, 4. Producción) and say which phase a change
  belongs to.
- A merged change is the implementation record. Do not preserve a second checklist
  in the repository.

## How it works

```
CREATE ORDER → UPLOAD → MECHANICAL VALIDATION → PRE-CHECK IA → READY_FOR_PAYMENT
→ IZIPAY → PAID → CLAIM → ASTRA ANALYSIS → ZOD → SAVE REPORT + FACTS
→ COMPLETED → DELETE ORIGINAL ≤ 24 h
```

Clients upload to presigned URLs. The server validates mechanically (`file-type`,
`unpdf`, 25 MB, 10 pages/images, server-computed `sha256`), runs the cheap-model
pre-check, and only then opens Izipay checkout. After idempotent payment
confirmation, `processNext()` claims the order (`FOR UPDATE SKIP LOCKED`), calls
Astra with `store: false` and strict `json_schema`, validates with Zod as a second
barrier, saves report + facts, and marks `COMPLETED`. One sweep deletes originals
past `delete_after`.

## Where code lives

- `src/routes/` — TanStack Start routes: landing/upload flow, `/r/$token` report page.
- `src/server/validation.ts` — mechanical validation (MIME, size, pages, sha256).
- `src/server/precheck.ts` — cheap-model gate + in-memory IP rate limit.
- `src/server/payments.ts` — Izipay session, IPN/callback, idempotency.
- `src/server/process.ts` — `processNext()`, claim query, Astra analysis, retries.
- `src/server/storage.ts` — bucket presigned URLs, immutability, deletion sweep.
- `src/db/` — Drizzle schema + `pg` Pool client (`schema.ts`, `client.ts`).
- `src/lib/schemas.ts` — `PrecheckSchema`, report schemas (Zod 4, strict).
- `ops/queries.sql` — hand-run operational queries (no admin UI).
- `tests/` — `pnpm test`: deterministic Vitest suite, runs in CI.
- `eval/` + `fixtures/` — `pnpm eval`: hand-run model evals, costs money.
- `docs/mockup/` — static landing/flow reference (read-only, do not ship as-is).
- `drizzle/` — generated migrations (`pnpm db:generate`, `pnpm db:migrate`).

## Taste

- Complexity belongs at the adapter boundary (Izipay, OpenAI, bucket). Order logic
  stays plain: status values in the DB plus conditional updates, no state-machine library.
- No speculative gaps: 0–3 strong gaps beat 8 invented ones. Unknown fields are
  `null`, never inferred. The prompt rule and Zod both enforce this.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used and move when the code moves. Annotate
  decisions (why this boundary, why this order), not every line.
- If a rule here fights the task in front of you, say so loudly and get a human
  sign-off before breaking it.

## Additional tips

- Do not verify with browsers or computer use unless explicitly agreed or requested.
- Security matters most at three seams: payment verification, report-token lookup,
  and file deletion. Elsewhere, prefer simplicity over hardening.
- The four Izipay questions (IPN retries, query API, refund API, minimum billing
  fields) go out before phase 1 — flag anything that answers them sooner.
