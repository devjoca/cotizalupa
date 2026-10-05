package app

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A paid order is the only thing an analysis can start from. This drives the
// real worker: nothing before payment, a persisted report after it.
func TestNoAnalysisBeforePaymentInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	t.Setenv("AI_STUB", "1")
	t.Setenv("RAILWAY_ENVIRONMENT_ID", "")
	ctx := context.Background()
	db := isolatedDB(t)
	orderID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,perspective,user_context)
		VALUES($1,'READY_FOR_PAYMENT',$2,'customer','synthetic situation')`,
		orderID, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256)
		VALUES($1,$2,0,$3,'application/pdf',10,'abc')`, uuid.NewString(), orderID, "orders/"+orderID+"/0.pdf"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(ctx, `DELETE FROM reports WHERE order_id=$1`, orderID)
		_, _ = db.Exec(ctx, `DELETE FROM order_files WHERE order_id=$1`, orderID)
		_, _ = db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, orderID)
	})
	service := &App{DB: db, OpenAIModel: defaultAnalysisModel}

	found, err := service.processNext(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if found {
		t.Fatal("analysis started before payment")
	}
	assertOrderState(t, db, orderID, "READY_FOR_PAYMENT", 0)

	if _, err := db.Exec(ctx, `UPDATE orders SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1`, orderID); err != nil {
		t.Fatal(err)
	}
	found, err = service.processNext(ctx)
	if err != nil || !found {
		t.Fatalf("paid order was not processed: found=%v err=%v", found, err)
	}
	assertOrderState(t, db, orderID, "COMPLETED", 1)
}

// A failed attempt goes straight back to PAID for the worker loop; the third
// failure is final, so a paid order never waits on a reclaim timeout.
func TestAnalysisFailureRetriesThenFailsInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	t.Setenv("AI_STUB", "")
	ctx := context.Background()
	db := isolatedDB(t)
	orderID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,perspective,user_context,paid_at)
		VALUES($1,'PAID',$2,'customer','synthetic situation',now())`, orderID, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256)
		VALUES($1,$2,0,$3,'application/pdf',10,'abc')`, uuid.NewString(), orderID, "orders/"+orderID+"/0.pdf"); err != nil {
		t.Fatal(err)
	}
	// No OpenAI key and no stub: every attempt fails without a network call.
	service := &App{DB: db}
	for attempt, want := range []string{"PAID", "PAID", "PROCESSING_FAILED"} {
		found, err := service.processNext(ctx)
		if err != nil || !found {
			t.Fatalf("attempt %d: found=%v err=%v", attempt+1, found, err)
		}
		var status string
		var attempts int
		if err := db.QueryRow(ctx, `SELECT status,attempts FROM orders WHERE id=$1`, orderID).Scan(&status, &attempts); err != nil {
			t.Fatal(err)
		}
		if status != want || attempts != attempt+1 {
			t.Fatalf("attempt %d: status=%s attempts=%d, want %s", attempt+1, status, attempts, want)
		}
	}
	if found, err := service.processNext(ctx); err != nil || found {
		t.Fatalf("failed order was claimed again: found=%v err=%v", found, err)
	}
}

func TestLoadAnalysisManifestRejectsOrderWithoutFiles(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash) VALUES($1,'PROCESSING',$2)`, orderID, uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, orderID) })
	if _, err := (&App{DB: db}).loadAnalysisManifest(ctx, orderID); !errors.Is(err, errInvalidOriginal) {
		t.Fatalf("expected an invalid-manifest error, got %v", err)
	}
}

func assertOrderState(t *testing.T, db *pgxpool.Pool, orderID, wantStatus string, wantReports int) {
	t.Helper()
	var status string
	if err := db.QueryRow(context.Background(), `SELECT status FROM orders WHERE id=$1`, orderID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	var reports int
	if err := db.QueryRow(context.Background(), `SELECT count(*) FROM reports WHERE order_id=$1`, orderID).Scan(&reports); err != nil {
		t.Fatal(err)
	}
	if status != wantStatus || reports != wantReports {
		t.Fatalf("status=%s reports=%d, want %s with %d report(s)", status, reports, wantStatus, wantReports)
	}
}
