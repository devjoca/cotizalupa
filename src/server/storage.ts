// Railway Private Bucket via presigned URLs. Files immutable once the order
// reaches PAYMENT_PENDING (new order to change a file). Originals deleted by
// delete_after sweep (REJECTED/EXPIRED immediate, COMPLETED +24h).
// See PLAN.md "Congelar archivos al pagar" and "Privacidad". TODO: phase 1.
export {};
