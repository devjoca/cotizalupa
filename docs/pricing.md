# Pricing

The launch ticket is $9.99 USD for one review of one quotation. It is a one-time
purchase. This file owns the ticket and the payment rail; change it and
`AGENTS.md` together.

## Experiment

We are testing whether a person will pay $9.99 for a useful report before
accepting a quotation. The landing shows $9.99 USD.

## Polar checkout

Joca confirmed Polar approved CotizaLupa. Polar is the Merchant of Record and
the only MVP payment rail. The product must be a one-time, fixed-price USD 9.99
product with tax-inclusive pricing, with discount codes and trials disabled.
The buyer's total must stay at $9.99 after tax. Configure its product ID,
organization access token, signed webhook secret, sandbox or production mode,
and public app URL on the server. No provider credentials go to the browser or
repository.

```
local preview → upload → mechanical validation → private order link
→ Polar checkout → signed order.paid → analysis → persisted /r/{token}
```

The user confirms that the files are legible, complete, and from one provider.
Mechanical validation rejects unsupported, unreadable PDFs, invalid image
headers, and oversized files before checkout. It does not determine whether the content is a suitable
quotation. Every paid order gets a best-effort report; unsuitable content is
reported with gaps, not rejected after payment. Manual refunds cover system
failures only. The original Polar fee may remain a
cost to us.

The [Polar Checkout API](https://polar.sh/docs/features/checkout/session)
registers one payable session per order. Its metadata carries only our order ID.
The API returns its URL only after registering the checkout ID in the database.
Reuse an open registered session. If creation or registration fails before the
URL is returned, the API releases the order back to READY_FOR_PAYMENT; the manual
drain recovers abandoned unregistered freezes after 15 minutes. A provider-
confirmed expired or failed session closes the order as EXPIRED. The
browser return only reads state. The signed
[`order.paid` event](https://polar.sh/docs/api-reference/webhooks/order.paid)
changes an order to PAID only after checking the registered checkout ID, product,
order ID, paid status, $9.99 subtotal and total, no discount, and USD currency. Insert the
unique event and change state in one DB transaction. Store only event metadata;
`payment_events.payload` receives `{}`.

Polar's [public fees](https://polar.sh/docs/merchant-of-record/fees) list Starter
at 5% + $0.50 per transaction, plus 1.5% for non-US cards. At $9.99, those two
fees would be $1.15 before payout costs, taxes, or other fees. Confirm the
actual account plan before using this estimate for decisions. Polar says the
initial transaction fee is not returned to the seller after a refund.

Polar handles the buyer checkout and its applicable sales tax as Merchant of
Record. This does not settle CotizaLupa's Peruvian income tax, monthly filings,
exportación de servicios, or IGV treatment of the foreign provider fee. Ask the
accountant before the first live charge. Do not build a Peruvian invoicing API
for this experiment without a separate decision.

## Operations

- No real charge or refund as an agent test. Use sandbox, deterministic payment
  tests, and owner sign-off before live charges.
- A signed event with wrong amount, currency, product, order ID, or checkout ID
  must never mark PAID. A duplicate event answers 200 and stops.
- `PAYMENT_PENDING` with a checkout ID requires provider reconciliation.
  Without a checkout ID, no payable URL was returned; the manual drain releases
  that abandoned freeze after 15 minutes. Never expire a registered checkout
  merely because time passed.
- Manual refunds (system failures only) happen in Polar first, then the conditional DB transition to
  REFUNDED. No automatic refund path.
- Meta CAPI Purchase follows as a separate integration after payment, once
  approved. It uses verified paid orders only and no quotation content.
- The report stays as JSON and facts in Postgres. `/r/{token}` renders it and
  offers browser print-to-PDF. Resend emails the private link after the report
  is saved. No server PDF renderer or generated attachment.

## Cost guardrails

GPT-6.1 Sol runs only after verified payment, at medium reasoning effort by default. The current
file cap is five PDF/JPG/PNG files, 25 MiB combined, ten pages per PDF. Five PDFs
could mean 50 pages of model input, so the prior $1 analysis cap is a budget
assumption, not an enforced limit. Review real model-generated reports manually
before selling and tighten the page cap if spend requires it. Keep the existing
usage metadata; do not add a cost dashboard before sales.
