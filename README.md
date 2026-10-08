# CotizaLupa

CotizaLupa reviews one quotation at a time: local preview, upload, payment,
analysis, and a private report link. Cloudflare Pages serves the prerendered
frontend at `cotizalupa.com`; the Go service on Railway (`api.cotizalupa.com`)
serves the API, Polar webhook, and report worker. Submission validates the file's
technical limits, stores originals and opens the private order link. Polar
checkout starts from that link.

`web/` is the Cloudflare frontend; `api/` is the Railway Go service.
Each owns its source, build configuration, and `.env.example`. Root commands
coordinate local development; infrastructure, docs, and fixtures stay shared.

## Local development

Requirements: Go 1.27, Node 24, pnpm 12, and local PostgreSQL and S3-compatible storage.

```bash
pnpm install
cp -n web/.env.example web/.env
cp -n api/.env.example api/.env
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

Fill in the sandbox and email settings in `api/.env` before starting the API.
`pnpm dev` starts both the Vite
frontend (`http://localhost:3002`) and the Go API (`http://localhost:3001`).
`pnpm dev:web` runs Vite alone, `pnpm dev:server` the Go API alone, and
`pnpm start` the API alone. `pnpm preview:pages` serves the built site the way
Pages does (`wrangler pages dev dist` from `web/` on port 3002, API separately), which
checks `_redirects` and `_headers`; Vite's dev server does not reproduce them.

`dev:infra` starts PostgreSQL on `127.0.0.1:55432` and a RustFS S3 bucket on
`127.0.0.1:59000`. Run `pnpm db:migrate` once after a fresh volume. Local database and bucket defaults apply when their
environment variables are absent. `api/.env` sets
`PUBLIC_APP_URL=http://localhost:3002`; `web/.env` sets
`VITE_API_URL=http://localhost:3001`. The API allows exactly `PUBLIC_APP_URL`
for CORS, so the two must match the origins actually opened and called.
Set Polar sandbox credentials, `OPENAI_API_KEY`, and the delivery settings below for full local integration. `AI_STUB=1`
replaces model calls locally; Railway ignores it.

SQL migrations in `api/internal/migrations/` own the database schema. `pnpm db:create NAME`
creates a Goose migration to edit by hand; `pnpm db:migrate` applies pending migrations.
The Go binary embeds the SQL and also accepts `migrate` in deployment. Migrations
run explicitly, never during server startup. Only `DATABASE_URL` is needed, with
the same local default as the server. Root API commands load `api/.env`,
including `pnpm db:migrate`; direct Go commands and the deployed binary do not.
Keep API secrets out of `web/.env`.

DB-backed tests are opt-in. They reset the dedicated `cotizalupa_test` database
to the shipped migration and never touch the development database:

```bash
pnpm test:go
pnpm test:go:db
```

Stop the services without deleting their volumes:

```bash
pnpm dev:infra:down
```

## Deployment

Create an empty production Postgres database. Run `./cotizalupa migrate` as
the Railway pre-deploy command before the API starts. Goose creates the schema
and applies all shipped migrations.

Set the Railway service root directory to `/api`. Its `Dockerfile` builds
the Go API image only, using `api/` as the build context. Locally, the equivalent
is `docker build -f api/Dockerfile api`.
Cloudflare Pages builds the frontend from the repository root (`pnpm build` with
`VITE_API_URL=https://api.cotizalupa.com`). The Pages build fails without
`VITE_API_URL`, so a deployed frontend can never silently call localhost or
its own origin. Set the Pages output directory to `web/dist`.
Configure the Railway service with
`DATABASE_URL` for any managed Postgres, Railway private-bucket S3 variables, `OPENAI_API_KEY`, and the
server-only settings. Do not reuse production
resources for development or tests. Optionally set `SENTRY_DSN` for minimal
server-only error reporting; capture is manual and events carry only an
operational code and tags, never request, user, or document data.

For a Wrangler deployment, build with `VITE_API_URL` set, then run
`pnpm --dir web exec wrangler pages deploy dist --project-name <your-pages-project>`.
Wrangler is a development dependency, also used by `pnpm preview:pages`.
Use the Pages project name you configured. Deployment is an owner action,
not an agent verification step.

Polar checkout needs server-only `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`,
`POLAR_WEBHOOK_SECRET`, `POLAR_ENVIRONMENT` (`sandbox` or `production`), and
`PUBLIC_APP_URL` (the Pages origin, `https://cotizalupa.com`). The API allows
exactly that origin for CORS; checkout `success_url`/`return_url` and report
emails point at it too. Subscribe the webhook endpoint
`/api/webhooks/polar` to `order.paid`. Configure a one-time $9.99 USD product with
tax-inclusive pricing so the buyer's total remains $9.99: set Settings → Payments →
Default tax behavior to Inclusive. A product price may inherit this default
or explicitly use Inclusive; keep
discounts and trials disabled. The access token needs checkout create/read
scopes. Use sandbox values for local testing; never
run a live charge as a verification step.

For Meta ads, set server-only `META_PIXEL_ID` and `META_ACCESS_TOKEN` together.
There is no browser Pixel. The public landing retains a Meta click ID for seven
days in first-party local storage and includes it with an order. The API sends a
CAPI `Purchase` only for a verified paid order carrying that ID. Delivery runs
outside the Polar webhook and retries with the order ID as a stable event ID.
It sends the public landing URL, USD 9.99, the click ID, and payment time, never
the quotation, email, or private report link. Check received events in Meta's
test tools before buying traffic. If Meta is unavailable, payment and analysis
continue; `pnpm ops:drain` also retries eligible deliveries.

To pause submissions on a deployed service, set `REVIEWS_DISABLED=true` in
Railway's deployment environment and restart the service. Only the exact value
`true` pauses the final submit and order-preparation endpoint. Unset or `false`
allows mechanical validation, storage and Polar checkout, but does not enable free full analysis.

No model runs before payment. The form preview is local; it does not certify
legibility or content. Every paid order gets a best-effort report; manual refunds cover system failures only.
Paid jobs default to `gpt-6.1-sol` with medium reasoning effort;
`OPENAI_ANALYSIS_MODEL` overrides the model. For local
development only, `AI_STUB=1` avoids model calls; production ignores the stub.

Synthetic fixtures support the free deterministic tests. There is no paid eval
command. Review a few model-generated reports manually before selling.

Original deletion is a monthly manual `pnpm ops:drain`, also used after job
failures. It advances stale unpaid/staging orders, recovers paid work and deletes
eligible originals. It reports unresolved pending payments for manual provider
review. The eligibility date is not the date of physical deletion. Never run this
command against production from a development or agent session.

## Report email

Email is required in the shared submission form and checked before creating a
checkout. Resend receives the address and private report link, never the originals
or report content. Analysis saves the report before attempting email; a send
failure leaves the report available at its original link.

Set `RESEND_API_KEY`, `RESEND_FROM` from a verified sender domain, and
`REPORT_TOKEN_SECRET`, a stable 32-byte secret encoded as 64 hexadecimal characters.
Generate the secret once with `openssl rand -hex 32` and store it in Railway's
server environment. Do not commit it. Apply the shipped migration before starting
the service. `api/.env.example` lists the required configuration.

Access links use HMAC-SHA256 of the order ID with that secret. The database
stores only the token hash. Changing the secret stops recovery of unsent links;
links already issued still work because lookup hashes the supplied token.
Keep the secret stable, and keep the sender and message content stable while
retrying the same email.
Disable click and open tracking in Resend so private access links are not rewritten
for tracking.

A persisted send claim prevents concurrent attempts; abandoned attempts become
retryable after two minutes. `pnpm ops:drain` recovers pending delivery independently
of analysis. Resend retains idempotency keys for 24 hours, so automatic recovery is
limited to 23 hours from the first attempt. Older uncertain sends require checking
the provider before any manual retry. Acceptance by Resend does not prove
inbox delivery; check bounces in its dashboard during the pilot.

The address is cleared once Resend accepts the message, or when the order closes
without a report. A failed delivery address is cleared by the manual drain after
30 days from report completion. Eligibility is not a guarantee of immediate deletion.
