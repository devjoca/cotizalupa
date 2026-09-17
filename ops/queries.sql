-- No admin UI. Run `pnpm ops:drain` monthly or after a Sentry alert. These
-- read-only queries explain what the command sees. Do not bulk-update
-- PAYMENT_PENDING: confirm each transaction in Paddle first.

-- 1. Unpaid orders the drain expires after 30 days
SELECT id, status, created_at, delete_after
FROM orders
WHERE status IN ('READY_FOR_PAYMENT', 'PAYMENT_FAILED')
  AND created_at <= now() - interval '30 days'
ORDER BY created_at;

-- 2. Pending payments requiring manual Paddle reconciliation
SELECT id, payment_provider, payment_transaction_id, created_at, updated_at
FROM orders
WHERE status = 'PAYMENT_PENDING'
  AND created_at <= now() - interval '30 days'
ORDER BY created_at;

-- 3. Work available to process or reclaim
SELECT id, status, attempts, paid_at, processing_started_at
FROM orders
WHERE status = 'PAID'
   OR (status = 'PROCESSING'
       AND processing_started_at < now() - interval '15 minutes'
       AND attempts < 3)
ORDER BY paid_at;

-- 4. Crashed third attempts the drain closes as PROCESSING_FAILED
SELECT id, status, attempts, processing_started_at
FROM orders
WHERE status = 'PROCESSING'
  AND attempts >= 3
  AND processing_started_at < now() - interval '15 minutes';

-- 5. Paid failures needing review/refund
SELECT id, status, attempts, last_error
FROM orders
WHERE status IN ('PROCESSING_FAILED', 'NOT_ANALYZABLE');

-- 6. Originals eligible for deletion. The status allowlist is intentional.
SELECT f.id, f.order_id, f.blob_path, o.status, o.delete_after
FROM order_files f
JOIN orders o ON o.id = f.order_id
WHERE f.deleted_at IS NULL
  AND o.delete_after <= now()
  AND o.status IN (
    'REJECTED', 'EXPIRED', 'COMPLETED',
    'PROCESSING_FAILED', 'NOT_ANALYZABLE', 'REFUNDED'
  );

-- 7. Refund requested but not closed out
SELECT id, status, refund_requested_at
FROM orders
WHERE refund_requested_at IS NOT NULL AND status <> 'REFUNDED';

-- 8. Cost per order in the last 30 days
SELECT o.id, o.status, r.model, r.input_tokens, r.output_tokens, r.cost_usd
FROM orders o
LEFT JOIN reports r ON r.order_id = o.id
WHERE o.created_at > now() - interval '30 days';

-- After refunding in Paddle, use the application transition. If emergency SQL
-- is unavoidable, keep the conditional status check and clear transient text:
-- UPDATE orders
-- SET status = 'REFUNDED', delete_after = now(), user_context = NULL,
--     updated_at = now()
-- WHERE id = '...' AND status IN ('PROCESSING_FAILED', 'NOT_ANALYZABLE')
-- RETURNING id;
