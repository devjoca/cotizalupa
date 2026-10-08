package app

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

type claimedOrder struct {
	ID       string
	Attempts int
	Concern  *string // nil only for a row the upload path could not write
}

func (a *App) claimNext(ctx context.Context) (*claimedOrder, error) {
	var order claimedOrder
	err := a.DB.QueryRow(ctx, `UPDATE orders SET status='PROCESSING',processing_started_at=now(),attempts=attempts+1,updated_at=now()
		WHERE id=(SELECT id FROM orders WHERE status='PAID' OR
		(status='PROCESSING' AND processing_started_at < now()-interval '15 minutes' AND attempts<3)
		ORDER BY paid_at FOR UPDATE SKIP LOCKED LIMIT 1)
		RETURNING id,attempts,user_context`).Scan(&order.ID, &order.Attempts, &order.Concern)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &order, nil
}

func (a *App) saveReport(ctx context.Context, orderID string, outcome analysisOutcome) error {
	full, err := json.Marshal(outcome.Result)
	if err != nil {
		return err
	}
	var report map[string]json.RawMessage
	if err := json.Unmarshal(full, &report); err != nil {
		return err
	}
	facts := report["quotation_facts"]
	delete(report, "quotation_facts")
	result, err := json.Marshal(report)
	if err != nil {
		return err
	}
	var id string
	err = a.DB.QueryRow(ctx, `WITH eligible AS MATERIALIZED (
		SELECT id FROM orders WHERE id=$1 AND status IN ('PROCESSING','COMPLETED') FOR UPDATE
	), saved AS (
		INSERT INTO reports(id,order_id,model,reasoning_effort,prompt_version,schema_version,result,quotation_facts,input_tokens,output_tokens,latency_ms)
		SELECT gen_random_uuid(),id,$2,'medium','v1','v1',$3::jsonb,$4::jsonb,$5,$6,$7 FROM eligible
		ON CONFLICT (order_id) DO NOTHING RETURNING order_id
	), completed AS (
		UPDATE orders SET status='COMPLETED',completed_at=now(),delete_after=now(),user_context=NULL,updated_at=now()
		WHERE id IN (SELECT id FROM eligible) AND status='PROCESSING' RETURNING id
	) SELECT id FROM eligible LIMIT 1`, orderID, outcome.Model, string(result), string(facts), outcome.InputTokens, outcome.OutputTokens, outcome.LatencyMs).Scan(&id)
	return err
}

const maxAnalysisAttempts = 3

// failAnalysis requeues the order as PAID so the worker loop retries it at
// once; the third failure, or bad order data, is final. Error messages here
// are operational codes and provider statuses, never document content.
func (a *App) failAnalysis(ctx context.Context, order claimedOrder, err error) {
	// The job context may already be expired; the transition must still land.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	tags := map[string]string{"order_id": order.ID, "attempt": strconv.Itoa(order.Attempts), "reason": err.Error()}
	if !errors.Is(err, errInvalidOriginal) && order.Attempts < maxAnalysisAttempts {
		slog.Warn("analysis attempt failed, retrying", "order_id", order.ID, "attempt", order.Attempts, "reason", err.Error())
		if _, updateErr := a.DB.Exec(ctx, `UPDATE orders SET status='PAID',updated_at=now() WHERE id=$1 AND status='PROCESSING'`, order.ID); updateErr != nil {
			CaptureOperationalError("analysis_requeue_failed", tags)
		}
		return
	}
	code := "analysis_failed"
	if errors.Is(err, errInvalidOriginal) {
		code = "order_data_invalid"
	}
	if _, updateErr := a.DB.Exec(ctx, `UPDATE orders SET status='PROCESSING_FAILED',last_error=$2,user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status='PROCESSING'`, order.ID, code); updateErr != nil {
		slog.Error("analysis failure transition failed", "order_id", order.ID)
		CaptureOperationalError("analysis_failure_transition_failed", tags)
		return
	}
	slog.Error("analysis failed", "order_id", order.ID, "code", code, "reason", err.Error())
	CaptureOperationalError(code, tags)
}

func (a *App) processNext(ctx context.Context) (bool, error) {
	order, err := a.claimNext(ctx)
	if err != nil || order == nil {
		return false, err
	}
	if order.Concern == nil {
		a.failAnalysis(ctx, *order, errInvalidOriginal)
		return true, nil
	}
	files, err := a.loadOrderFiles(ctx, order.ID)
	if err != nil {
		a.failAnalysis(ctx, *order, err)
		return true, nil
	}
	outcome, err := a.analyze(ctx, files, analysisContext{Situation: *order.Concern})
	if err != nil {
		a.failAnalysis(ctx, *order, err)
		return true, nil
	}
	if err := a.saveReport(ctx, order.ID, outcome); err != nil {
		a.failAnalysis(ctx, *order, err)
		return true, nil
	}
	if err := a.deliverReportEmail(ctx, order.ID); err != nil {
		CaptureOperationalError("report_email_failed", map[string]string{"order_id": order.ID})
	}
	return true, nil
}

func (a *App) work(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-a.process:
		}
		for {
			jobCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
			found, err := a.processNext(jobCtx)
			cancel()
			if err != nil {
				slog.Error("claim or processing failed")
				CaptureOperationalError("job_claim_failed", nil)
				break
			}
			if !found {
				break
			}
		}
	}
}
