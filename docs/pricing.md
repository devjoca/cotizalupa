# Pricing

Decided 2026-09-15 (ticket) and 2026-09-15 (rail). Price and payment
provider are product decisions. `PLAN.md` does not freeze either. Do not
change the number or the rail in code without updating this file and
`IMPLEMENTATION.md` (D7, D8).

## The experiment

The MVP hypothesis is **willingness to pay**, not “can we operate Peruvian
payments optimally.”

| | |
|---|---|
| Hypothesis | A person pays ~**$12** for one CotizaLupa review |
| Checkout (MVP) | **Paddle**, pending written product acceptance |
| Display on the live Peru landing | **S/39** until Paddle is live (same ticket, local copy) |
| Recurrence | One-shot. No subscription, no second charge |

`$12 ≈ S/39` at USD/PEN 3.40. One paid order = one quotation = one report.
That does not change with the rail.

Do not recopy `docs/mockup/` onto the live landing. The mockup still says
S/20; that is the visual baseline, not the price.

## Why this ticket (not 20, 29, or 49)

Acquisition is Meta Ads. SUNAT and the gateway do not force the number. Ads do.

- **S/20** (mockup) covers inference + a cheap gateway and then loses
  money at a normal Meta CPA. Do not launch ads at S/20.
- **S/29** only works if CAC stays near S/12, which a new pixel will not
  deliver in week one.
- **S/39 / $12** is still tiny next to the mockup quote (S/3,800) or a
  50% adelanto (S/1,900). At a base CAC of S/20 it keeps a thin leftover
  even if Astra hits the $1 cap. That is the launch ticket.
- **S/49** is the A/B, not the default.

Paddle's exact take remains pending its written quote. The MVP accepts the MoR
premium to keep consumer invoicing and payment-tax handling out of the product.

## MVP rail — Paddle (MoR)

Paddle is the seller to the customer. Flow we want:

```
upload → mechanical validation → pre-check → Paddle checkout
→ webhook paid → analyze → /r/{token}
```

Concentrate the MVP on landing → Purchase conversion → perceived report
quality. Do not build a facturador or second checkout to learn whether anyone
pays $12.

### What Paddle does not erase

Paddle invoices the customer and takes on consumer-facing sales tax where
they operate. **You still have Peruvian renta and monthly declarations
(621).** Confirm with the accountant, in writing:

1. How to book CotizaLupa → Paddle (payouts in, their invoice/fees out).
2. Whether this is **exportación de servicios**. SUNAT requires four
   conditions at once, including utilization abroad. Do not assume it.
3. Whether Paddle’s fee is a service used in Peru from a non-domiciled
   supplier. SUNAT has a 2026 procedure to declare/pay that IGV. Do not
   skip it because “MoR handles tax.”

621 is monthly. Nobody should be in SUNAT daily. Per-customer CPE is
what Paddle removes from the product, not the monthly filing.

### What to send Paddle (product acceptance)

Ask for written yes/no before writing `src/server/payments.ts`.

> CotizaLupa is a one-shot digital product. The customer uploads one
> quotation (PDF or photos), we run a cheap pre-check, then they pay
> ~USD 12 once (card) and receive a report URL: what is clear, missing,
> risky, and which questions to ask. No account, no subscription, no
> physical goods. Initial ads: Spanish, Peru, then other LATAM.
>
> We never charge if the document is not exactly one legible quotation.
> After payment we may still refund if analysis fails
> (`NOT_ANALYZABLE`). We do not persist DNI, address, card, or billing.
>
> Please confirm in writing:
> 1. You accept this product (document upload + AI analysis report).
> 2. One-shot USD checkout (not subscription) is supported.
> 3. Webhook: signed, retry policy, stable event id, amount + currency
>    in the payload, sandbox vs live.
> 4. We can open checkout only after our pre-check passes, and bind the
>    Paddle order to our `orders.id`.
> 5. Refunds: dashboard and/or API; whether your fee is returned.
> 6. Customer invoice language (Spanish?) and whether you collect/remit
>    Peru IGV / Mexico IVA / Colombia IVA for digital services.
> 7. Restricted countries and whether Peru-resident sellers can receive
>    payouts.
> 8. Anything in the ToS that bans AI, document processing, or ads-driven
>    consumer checkout.

## Payment ledger

Provider is an adapter. These rules do not change:

- No checkout until pre-check accepts. Files freeze at `PAYMENT_PENDING`.
- Verify authenticity, success, `order id`, amount, and currency before
  any state change.
- `payment_events.provider_event_id` UNIQUE; duplicates return 200 and stop.
- `PAID` only from `PAYMENT_PENDING`. Zero rows = no-op.
- Webhook and browser return share one path.
- No DNI, address, card, or billing in the database.
- Refunds: provider dashboard/API, then `status = 'REFUNDED'`. No
  auto-refund code in the MVP.
- Meta **Purchase** only on `PAID`. Never on `PAYMENT_PENDING`, never on
  `/r/{token}`.

`orders.payment_provider` and `payment_events.provider` exist so the
adapter can change without a new order model.

## Assumptions (2026-09-15)

| Input | Value | Source / note |
|---|---|---|
| USD/PEN | 3.40 | ~3.36 on 2026-09-02; rounded up |
| UIT 2026 | S/5,500 | D.S. 301-2025-EF |
| Inference cap | **$1.00 = S/3.40** | Worst case we budget, not the mean |
| Typical Astra medium | $0.25–$0.70 | 2–4 page quotation |
| Pre-check + crumbs | ~S/0.30 | Cheapest model |
| Peru Meta CPC | S/0.30–S/1.50 | Local 2026 ranges |
| Peru conversion CPA | S/15–S/45 | Cold conversion |
| Paddle take | Pending written quote | MoR premium; do not invent the rate |

## Meta CAC (unchanged by the rail)

CAC is cash to Meta per **paid** order. Pre-check rejects still ate the
click.

| Scenario | CAC | When |
|---|---:|---|
| Good | S/12 | Strong creative, quote in hand, pixel trained |
| Base | S/20 | Cold conversion after a few weeks |
| Harsh | S/35 | Learning, weak creative, many rejects |

Break-even CAC depends on Paddle's written quote and FX. Price for 2–4%
click → pay, not 7%. Learning-phase losses are funded with cash, not by
cutting the sticker to S/20.

Meta often needs ~50 purchases/week to leave learning (~S/7,000/month
media at harsh CAC). Agency fees extra. Accountant treats Meta IGV.

## Guardrails so $1 stays $1

- Analysis: Astra, `reasoning_effort: medium`. Never `high` in the MVP.
- Pre-check: cheapest model.
- 10-page cap stays.
- `reports.cost_usd`: log and inspect at $1.
- Never spend Astra before money clears.

## What this file does not decide

- Accountant’s Paddle booking, exportación, and non-domiciled IGV.
- Accountant’s Meta-as-import treatment.
- A/B S/49 after the pixel has data.
- Nubefact or any billing API.
