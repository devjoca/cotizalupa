// Izipay: signature over `payloadHttp`, `code === "00"`, orderNumber, amount in
// cents, currency, `uniqueId` UNIQUE in payment_events (duplicates → 200, stop).
// Conditional UPDATE PAID only from PAYMENT_PENDING. IPN and browser callback
// share the same path. Never persist DNI, address, card, billing.
// See PLAN.md "Pago". TODO: phase 3.
export {};
