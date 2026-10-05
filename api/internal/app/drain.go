package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/minio/minio-go/v7"
)

func (a *App) Drain(ctx context.Context) error {
	if _, err := a.DB.Exec(ctx, `UPDATE orders SET status='EXPIRED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now()
		WHERE status IN ('CREATED','READY_FOR_PAYMENT','PAYMENT_FAILED') AND created_at < now()-interval '30 days'`); err != nil {
		return err
	}
	if _, err := a.DB.Exec(ctx, `UPDATE orders SET status='PROCESSING_FAILED',last_error='attempt_limit_exhausted',user_context=NULL,email=NULL,updated_at=now()
		WHERE status='PROCESSING' AND attempts>=3 AND processing_started_at < now()-interval '15 minutes'`); err != nil {
		return err
	}
	// A crash between freezing an order and registering its checkout leaves a
	// PAYMENT_PENDING order with no transaction. Nothing exists to reconcile in
	// Polar, so release it back to READY_FOR_PAYMENT instead of stranding it.
	if _, err := a.DB.Exec(ctx, `UPDATE orders SET status='READY_FOR_PAYMENT',payment_provider=NULL,payment_transaction_id=NULL,updated_at=now()
		WHERE status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id IS NULL AND updated_at < now()-interval '15 minutes'`); err != nil {
		return err
	}
	for i := 0; i < 100; i++ {
		jobCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
		found, err := a.processNext(jobCtx)
		cancel()
		if err != nil {
			return err
		}
		if !found {
			break
		}
	}
	if err := a.recoverReportEmails(ctx); err != nil {
		return err
	}
	// Keep a failed delivery address only for its operational recovery period.
	if _, err := a.DB.Exec(ctx, `UPDATE orders SET email=NULL WHERE email IS NOT NULL AND
 (status IN ('REJECTED','EXPIRED','PROCESSING_FAILED','REFUNDED','NOT_ANALYZABLE') OR
 (status='COMPLETED' AND completed_at < now()-interval '30 days'))`); err != nil {
		return err
	}
	deleted, failed, err := a.sweepDueOriginals(ctx, func(path string) error {
		return a.Bucket.RemoveObject(ctx, a.BucketName, path, minio.RemoveObjectOptions{})
	})
	if err != nil {
		return err
	}
	var stale int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM orders WHERE status='PAYMENT_PENDING' AND updated_at < now()-interval '15 minutes'`).Scan(&stale); err != nil {
		return err
	}
	var pendingEmails int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM orders WHERE status='COMPLETED' AND report_email_sent_at IS NULL AND email IS NOT NULL`).Scan(&pendingEmails); err != nil {
		return err
	}
	slog.Info("manual drain completed", "pending_report_emails", pendingEmails, "deleted_originals", len(deleted), "failed_originals", len(failed), "stale_pending_payments", stale)
	return nil
}

// sweepDueOriginals deletes originals whose order is past delete_after and in a
// terminal state, recording deleted_at only after the bucket deletion succeeds.
// A failed deletion keeps its row for the next sweep, so it stays retryable.
func (a *App) sweepDueOriginals(ctx context.Context, remove func(path string) error) (deleted, failed []string, err error) {
	rows, err := a.DB.Query(ctx, `SELECT f.id,f.blob_path FROM order_files f JOIN orders o ON o.id=f.order_id
		WHERE f.deleted_at IS NULL AND o.delete_after <= now()
		AND o.status IN ('REJECTED','EXPIRED','COMPLETED','PROCESSING_FAILED','NOT_ANALYZABLE','REFUNDED')`)
	if err != nil {
		return nil, nil, err
	}
	type dueFile struct{ ID, Path string }
	files := []dueFile{}
	for rows.Next() {
		var file dueFile
		if err := rows.Scan(&file.ID, &file.Path); err != nil {
			rows.Close()
			return nil, nil, err
		}
		files = append(files, file)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	for _, file := range files {
		if err := remove(file.Path); err != nil {
			slog.Error("original deletion failed", "file_id", file.ID)
			CaptureOperationalError("original_deletion_failed", map[string]string{"file_id": file.ID})
			failed = append(failed, file.ID)
			continue
		}
		if _, err := a.DB.Exec(ctx, `UPDATE order_files SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`, file.ID); err != nil {
			slog.Error("original deletion record failed", "file_id", file.ID)
			CaptureOperationalError("original_deletion_record_failed", map[string]string{"file_id": file.ID})
			failed = append(failed, file.ID)
			continue
		}
		deleted = append(deleted, file.ID)
	}
	return deleted, failed, nil
}
