# CotizaLupa

CotizaLupa reviews one quotation at a time: upload, pre-check, payment,
analysis, and a private report link. The product is still being built in the
phase order recorded in `IMPLEMENTATION.md`.

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

To pause free reviews on a deployed service, set `REVIEWS_DISABLED=true` in
Railway's deployment environment and restart the service. Only the exact value
`true` pauses the final submit and server analysis endpoint. Unset or `false`
keeps the free POC available and does not enable payments. The internal
`/analyze` page and its separate analysis endpoint have been removed.
