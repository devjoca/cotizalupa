# CotizaLupa paid POC

Test whether a person in Peru pays $12 USD to understand a quotation before
accepting it, and finds the resulting report useful. One paid order is one
quotation, one report and one lifecycle. Multiple items, options and annexes
may belong to one proposal. Comparing providers is outside the POC.

`IMPLEMENTATION.md` records the implementation and current delivery status.
Code, migrations and tests own the detailed schemas and SQL. Keep the existing
stack and working recovery mechanisms; deleting unused columns or consolidating
statuses is not a launch prerequisite.

## Flow

```text
LOCAL FILE PREVIEW → DIRECT UPLOAD → MECHANICAL VALIDATION
  invalid file → explain rejection; no persisted document or order
  valid file → CREATED + file manifest → bucket writes → READY_FOR_PAYMENT

READY_FOR_PAYMENT → PAYMENT_PENDING → verified webhook → PAID
PAID → PROCESSING → COMPLETED → persisted report at /r/{token}
```

The current application stops at READY_FOR_PAYMENT and explains that checkout
is unavailable. It does not charge or run the full analysis for free. The same
private link shows the order's state and, after payment and analysis, its report.

## Before checkout

- Direct upload to the server. No presigned URLs or persisted pre-check polling.
- The final form step previews images and opens PDFs locally. The user can
  remove or replace files before creating the order. Nothing is uploaded by preview.
- At most five files, any mix of PDF/JPG/PNG, 25 MiB combined, 10 pages per PDF.
- Server verifies real MIME, PDF readability/encryption, size and SHA-256.
- No AI pre-check. Warn the user to send one complete, legible quotation, not
  competing providers. Mechanical validation does not establish content suitability.
- Astra checks suitability and produces the report only after verified payment.
  Missing price or names alone do not reject a quotation. If no report can be
  delivered, handle a full refund manually. This approved POC tradeoff replaces
  the earlier promise to reject every unsuitable document before payment.
- Ten submissions per IP per hour and two concurrent preparation requests in
  memory. These limits are not a guarantee against oversized HTTP request bodies.
- Only mechanically valid submissions are persisted. Commit the order and complete file
  manifest before writing the bucket so interrupted uploads remain traceable.
  Mark READY_FOR_PAYMENT only after all writes succeed. Failed writes leave a
  rejected order for deletion; crashed CREATED orders expire in the monthly drain.
- There is no file-edit endpoint. A changed quotation needs a new order. File
  registration is restricted to CREATED, before the payment freeze boundary.

## Paddle, next integration

Paddle remains subject to application and live-domain product acceptance.
Implement its adapter only after acceptance. The review ticket is $12 USD;
the quotation's approximate PEN amount must never be used as the charge amount.

- Checkout requires an unexpired READY_FOR_PAYMENT order and intact stored files.
  The legacy precheck_result column stays null and is not a payment prerequisite.
  Starting checkout conditionally freezes the order as
  PAYMENT_PENDING. Repeated requests must reuse the chargeable transaction.
- Resolve provider timeouts without blindly creating a second transaction.
- Verify signature, successful event, registered transaction ID, order ID,
  amount and currency before changing payment state.
- Insert the unique provider event and conditionally set PAYMENT_PENDING → PAID
  in one database transaction. Duplicate event: respond 200 and stop. A no-op
  state transition must not trigger analysis.
- Retain event ID, provider, type, order and timestamp only. The existing payload
  column receives `{}`; no schema cleanup is necessary to launch.
- The browser return reads status. It never confirms payment.
- Commit PAID before acknowledging the webhook, then call processNext() in the
  same service. A crash after acknowledgement is recoverable through ops:drain.
- Refund manually in Paddle, then conditionally mark a failed order REFUNDED.
  There is no automated refund path.

## Processing and manual operation

Keep the existing Postgres claim query, three-attempt cap, 15-minute reclaim,
third-attempt failure closure, atomic report save, and integrity checks. One
Railway service runs web and jobs; no timer, Redis, workflow engine or admin UI.

Existing exceptional states stay:

```text
CREATED → REJECTED on storage failure
CREATED / READY_FOR_PAYMENT / legacy PAYMENT_FAILED → EXPIRED after 30 days
PAYMENT_PENDING → PAID or EXPIRED only after verified provider resolution
PROCESSING → PROCESSING_FAILED or NOT_ANALYZABLE
PROCESSING_FAILED / NOT_ANALYZABLE → REFUNDED after manual provider refund
```

Do not add a new PAYMENT_FAILED workflow or UPLOADED/PRECHECKING states.
The existing NOT_ANALYZABLE status means Astra could not analyze the paid input.
It requires a manual refund, not repeated model attempts or an invented report.
Use synthetic test cases when useful; never auto-save a customer's original.

Use ops:drain for failed jobs and operational alerts during the pilot, as well
as monthly original deletion. Paid users must not wait until monthly cleanup
for support. Queries live in `ops/queries.sql`. A pending payment is never
assumed failed because of age; inspect its transaction in Paddle and ensure
it cannot still be paid before expiring the order and deleting its files.

## Privacy and report access

Monthly deletion is an operating obligation. Do not advertise immediate
deletion or a 35-day physical-deletion guarantee.

Orders start with delete_after at 30 days. Rejection, completion, expiry and
refund can make originals eligible sooner. The monthly drain deletes eligible
originals from safe terminal states and records deleted_at only after success.
An unpaid file that becomes eligible just after a sweep may remain until the
following month's sweep. Active payment/processing exceptions require manual
resolution; they must not become forgotten indefinite retention.

Clear transient user context at terminal transitions. Keep the report, structured
facts and operational metadata, with deletion requests handled through support.
No OCR, full-text copy, conversation history or original content in logs.
OpenAI requests use store:false; this does not promise zero provider retention.

The private link resolves sha256(token), exposes no raw token to the database,
contains no Meta pixel and renders persisted results. Browser print-to-PDF is
available. Email delivery, accounts and generated PDF storage remain deferred.

## Proof required to sell

Deterministic tests cover validation, no model call before payment, partial uploads,
immutability, payment authenticity/idempotency, recovery, atomic report save
and deletion. Preserve existing tests; add behavioral coverage at new boundaries.
No markup suite or cost dashboard is required.

Before enabling payments, manually review a few model-generated reports.
There is no paid eval runner. A mocked model proves wiring, not judgment. Test the
deployed upload with the maximum combined size and two simultaneous submissions.

Walk the landing CTA, dialog and pricing entry point through validation,
sandbox checkout, one payment and a report that can be reopened. Verify failure
and manual refund handling. Production charge/refund verification is an owner
sign-off, never an agent test. Confirm the support mailbox works and complete
Paddle/accountant launch decisions in `docs/pricing.md`.

## Delivery order and deferred work

Keep Core → Product → Money → Production. Core and Product prepare and validate
the order and render the durable report. Money connects Paddle to that flow;
Production verifies the deployment, mailbox, policies and manual operation.

The next application integrations are Paddle and then Meta CAPI, as requested.
CAPI must deduplicate Purchase for verified paid orders and must not receive
quotation content. It remains separate from successful report delivery.

Defer AI pre-check, presigned uploads, pre-check polling, browser payment writers, automatic
reconciliation/refunds, automatic eval capture, new cost telemetry, admin tools,
email delivery, accounts, comparison, and cosmetic schema/state consolidation.
