# CotizaLupa

CotizaLupa reviews one quotation at a time: local preview, upload, payment,
analysis, and a private report link. The product is still being built in the
phase order recorded in `IMPLEMENTATION.md`. Submission currently validates the
file's technical limits, stores originals and opens the private
order link. It stops at READY_FOR_PAYMENT. Paddle and then CAPI remain to integrate.

## Local development

Requirements: Node 24, pnpm 12, and Docker.

```bash
pnpm install
pnpm dev:infra
cp -n .env.example .env
pnpm db:migrate
pnpm dev
```

`dev:infra` starts PostgreSQL on `127.0.0.1:55432` and MinIO on
`127.0.0.1:59000` (console: `127.0.0.1:59001`). The example environment file
already contains the matching local-only credentials. In development, the app
uses that PostgreSQL URL when `DATABASE_URL` is absent. Set `DATABASE_URL` only
to override the local database. Add an OpenAI key only when the flow being
tested needs a model call. Production still requires `DATABASE_URL`.

DB-backed tests use generated databases under `cotizalupa_test`; they never use
`DATABASE_URL`:

```bash
pnpm test
```

Stop the services without deleting their volumes:

```bash
pnpm dev:infra:down
```

## Deployment

The deployed app is one persistent Railway service. Configure a Neon
`DATABASE_URL`, Railway private-bucket S3 variables, `OPENAI_API_KEY`, and the
optional server-only `SENTRY_DSN` from `.env.example`. Do not reuse production
resources for development or tests.

To pause submissions on a deployed service, set `REVIEWS_DISABLED=true` in
Railway's deployment environment and restart the service. Only the exact value
`true` pauses the final submit and order-preparation endpoint. Unset or `false`
allows mechanical validation and storage but does not enable payments or free full analysis. The internal
`/analyze` page and its separate analysis endpoint have been removed.

No model runs before payment. The form preview is local; it does not certify
legibility or content. Paid input that cannot produce a report needs a manual refund.
`OPENAI_ANALYSIS_MODEL` keeps the existing Astra default for paid jobs. For local
development only, `AI_STUB=1` avoids model calls; production ignores the stub.

Synthetic fixtures support the free deterministic tests. There is no paid eval
command. Review a few model-generated reports manually before selling.

Original deletion is a monthly manual `pnpm ops:drain`, also used after job
failures. It advances stale unpaid/staging orders, recovers paid work and deletes
eligible originals. It reports unresolved pending payments for manual provider
review. The eligibility date is not the date of physical deletion. Never run this
command against production from a development or agent session.
