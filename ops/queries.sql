-- No admin UI. Run these by hand. See PLAN.md "Operación".
-- TODO: phase 4 — fill in real queries.

-- Orders stuck in PAYMENT_PENDING for more than 30 minutes
-- SELECT * FROM orders WHERE status = 'PAYMENT_PENDING' AND updated_at < now() - interval '30 minutes';

-- Orders needing attention (failed analysis)
-- SELECT * FROM orders WHERE status IN ('PROCESSING_FAILED', 'NOT_ANALYZABLE');

-- Refund requested but not marked REFUNDED
-- SELECT * FROM orders WHERE refund_requested_at IS NOT NULL AND status <> 'REFUNDED';

-- Cost per order in the last week
-- SELECT id, (SELECT sum((result->>'cost_usd')::float) FROM reports WHERE order_id = orders.id) FROM orders WHERE created_at > now() - interval '7 days';
