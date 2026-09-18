// Payment adapter. MVP rail is Paddle (D8), pending application/product review.
// Ledger: authenticate the event, match order/amount/currency, UNIQUE
// provider_event_id (duplicates → 200, stop), PAID only from PAYMENT_PENDING.
// Event insert + paid transition must commit together. Browser return reads only.
// Create/reuse one chargeable checkout per order, including provider timeouts.
// Use REVIEW_PRICE_CENTS / REVIEW_CURRENCY, never the quotation's amountCents.
// Checkout needs an unexpired READY_FOR_PAYMENT order and intact files, not AI pre-check.
// Never persist provider payloads or PII. Shape stays in this file.
// See docs/pricing.md and IMPLEMENTATION.md D8. TODO: phase 3.
export {};
