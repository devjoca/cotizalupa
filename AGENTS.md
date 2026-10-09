# CotizaLupa

Upload a quotation (PDF or photos), pay $9.99 USD, get a report (clear, missing, risks, questions). Initial market: Peru.

One paid order = one quotation = one main commercial proposal. Multi-item, A/B/C options, add-ons, or pages = one. Two or more providers in one PDF = not one — comparison is not supported in the MVP.

This file is the paid-POC scope, flow, and safety. Code, migrations, and tests own the details. Code conflicts with this file → ask, don't reinterpret either silently. First deployment, empty prod DB: apply the Goose migrations, no legacy compatibility.

The experiment is whether someone pays $9.99 USD and finds the report useful. No AI pre-check: the user previews files locally (one complete, legible quotation); the server validates technical limits only, never content. GPT-6.1 Sol reports best-effort after verified payment, even on weak input — gaps carry what could not be evaluated. Never fabricate findings. Manual refunds cover system failures only, never report content.

## Taste (Joca)

Ambitious ideas, simple systems, software that feels obvious. Smallest model that makes the correct behavior unsurprising. Remove "just in case" machinery; two near-identical paths → pick one.

## Working together

- **Ask at forks.** Product/architecture, two designs, unclear requirement → ask. Small reversible details don't need one.
- **Short plan first.** Multi-step work starts with a brief written plan; build after approval. Small tasks skip it.
- **Findings, not drive-bys.** Off-task rot gets one sentence; fix only if trivial, else ask.
- English code/chatter, es-PE user-facing text. Landings explain reasoning + key decisions, with test output for logic and screenshots/video for UI.

## Glossary

- **order**: one paid review (one quotation, one report, one lifecycle). **preview**: local file check, no AI. **analysis**: model pass after payment. **report**: JSON + `/r/{token}` (clear items, gaps, what-ifs, priorities). **terminal**: `REJECTED`, `EXPIRED`, `COMPLETED`, `PROCESSING_FAILED`, `REFUNDED` — after these only deletion and possibly a manual refund.

## Safety

1. **Real money.** Never run a real charge, refund, or prod webhook replay to "verify" — sandbox + idempotency tests only. A duplicate charge is worse than a bug.
2. **Secrets and documents.** Never open `.env`, `.env.*`, or credentials/keys/token files. Never log quotation, billing, or card content. `payment_events.payload` stores `{}`; metadata only.
3. **Prod DB/bucket.** Develop against local Postgres + fixtures only. Never point a dev server at production or replay prod rows beyond operational metadata.

## Order flow (every status must exit; a status with no exit is a bug)

- [ ] Upload reachable: landing CTA, dialog, pricing.
- [ ] `CREATED`→`REJECTED` (storage failure); `CREATED`/`READY_FOR_PAYMENT`→`EXPIRED` (30 days); `PAYMENT_PENDING` never stalls (reconciliation, 3-attempt cap, drain releases freezes); `PROCESSING`→`COMPLETED`/`PROCESSING_FAILED`; `PROCESSING_FAILED`→`REFUNDED` (manual provider refund).
- [ ] Files frozen from `PAYMENT_PENDING`: validated = charged = analyzed. Edits → new order.
- [ ] `/r/{token}` looks up `sha256(token)`, carries no Meta pixel, renders persisted state/report. Email required before checkout; link sent only after the report is saved.
- [ ] Meta purchase tracking is CAPI only, after verified payment for an order with an ad click ID. No quotation content, email, or private report token goes to Meta.
- [ ] Quotation content stays out of logs and operational metadata.

## Dev

Setup, ports, CORS, deploy: README.md (`Local development`, `Deployment`); `web/` and `api/` own their `.env.example`. Root API commands load `api/.env`. Kill only PIDs you spawned. Never commit, push, or open a PR unless asked.

## Verifying

MVP bar: payments, state transitions, idempotency, file immutability always ship with tests; everything else lightly. Rules live in CODING_STANDARDS.md (`Tests`, `Verifying`).

## Docs, plans, deferred

This file changes only on approved product decisions (no SQL/schemas — code owns those). No plans, notes, or scratch in the repo. Delivery order Core → Product → Money → Production; say which phase a change belongs to. Deferred: AI pre-check, presigned uploads, pre-check polling, browser payment writers, auto-reconcile/refunds, eval capture, cost telemetry, admin tools, accounts, comparison, bucket retention/deletion, crash-safe tmp cleanup, cosmetic schema consolidation.

## How it works

```
LOCAL PREVIEW → DIRECT UPLOAD → MECHANICAL VALIDATION → STAGE ORIGINALS → READY_FOR_PAYMENT
→ CHECKOUT (Polar) → PAID → CLAIM → ANALYSIS → SCHEMA VALIDATION → SAVE REPORT + FACTS
→ COMPLETED → ORIGINAL DUE → MANUAL DRAIN DELETES IT
```

No model before payment; invalid files are not persisted. No edit endpoint. Tokens derive from order ID + stable server secret (hash stored only); the link is emailed after saving, and email failure never changes `COMPLETED` or repeats analysis. Limits, model settings, email recovery: README.md + code.

## Taste (code)

Code rules live in CODING_STANDARDS.md — read it when writing or reviewing code. A rule that fights the task → flag loudly, get sign-off before breaking it.
