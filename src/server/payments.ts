// Payment adapter. MVP rail is Paddle (D8), pending written product acceptance.
// Ledger: authenticate the event, match order/amount/currency, UNIQUE
// provider_event_id (duplicates → 200, stop), PAID only from PAYMENT_PENDING.
// Webhook and browser return share one path. Never persist DNI, address, card,
// billing. Provider-specific payload shape stays in this file.
// See docs/pricing.md and IMPLEMENTATION.md D8. TODO: phase 3.
export {};
