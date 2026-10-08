package app

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestReportEmailRecoveryInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	t.Setenv("AI_STUB", "1")
	t.Setenv("RAILWAY_ENVIRONMENT_ID", "")
	db := isolatedDB(t)
	ctx := context.Background()
	origin, _ := url.Parse("https://example.test")
	service := &App{DB: db, ReportTokenSecret: testTokenSecret, PublicURL: origin, OpenAIModel: "synthetic-model"}
	order := uuid.NewString()
	token := service.ReportTokenSecret.token(order)
	_, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,email,user_context) VALUES($1,'PAID',$2,'person@example.test','synthetic situation')`, order, token.hash())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256) VALUES($1,$2,0,'synthetic','application/pdf',10,'abc')`, uuid.NewString(), order)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	fail := true
	service.Mailer = resendMailer{APIKey: "synthetic", From: "reports@example.test", Client: &http.Client{Transport: emailTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		// Another drain reaches the order while its provider request is active.
		if err := service.deliverReportEmail(ctx, order); err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "/r/"+string(token)) {
			t.Fatal("restart link mismatch")
		}
		if fail {
			return nil, errors.New("synthetic outage")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"synthetic-receipt"}`))}, nil
	})}}
	if found, err := service.processNext(ctx); !found || err != nil {
		t.Fatalf("processing failed: %v", err)
	}
	assertOrderState(t, db, order, "COMPLETED", 1)
	if found, err := service.processNext(ctx); found || err != nil {
		t.Fatal("email failure reran analysis")
	}
	if err := service.recoverReportEmails(ctx); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("active email claim allowed duplicate attempt")
	}
	_, err = db.Exec(ctx, `UPDATE orders SET report_email_last_attempt_at=now()-interval '3 minutes' WHERE id=$1`, order)
	if err != nil {
		t.Fatal(err)
	}
	fail = false
	restarted := &App{DB: db, ReportTokenSecret: service.ReportTokenSecret, PublicURL: origin, OpenAIModel: service.OpenAIModel, Mailer: service.Mailer}
	if err := restarted.recoverReportEmails(ctx); err != nil {
		t.Fatal(err)
	}
	if err := restarted.recoverReportEmails(ctx); err != nil {
		t.Fatal(err)
	}
	var sent bool
	var email *string
	var receipt string
	if err := db.QueryRow(ctx, `SELECT report_email_sent_at IS NOT NULL,email,report_email_id FROM orders WHERE id=$1`, order).Scan(&sent, &email, &receipt); err != nil {
		t.Fatal(err)
	}
	if !sent || email != nil || receipt != "synthetic-receipt" || calls != 2 {
		t.Fatal("delivery receipt or recipient cleanup failed")
	}
	assertOrderState(t, db, order, "COMPLETED", 1)
	// An uncertain old request is held for manual review, never silently resent.
	_, err = db.Exec(ctx, `UPDATE orders SET email='person@example.test',report_email_sent_at=NULL,report_email_first_attempt_at=now()-interval '25 hours',report_email_last_attempt_at=now()-interval '24 hours' WHERE id=$1`, order)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarted.deliverReportEmail(ctx, order); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatal("retried outside provider idempotency window")
	}
}

func TestCheckoutRequiresEmailInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	db := isolatedDB(t)
	token, hash, _ := newReportToken()
	_, err := db.Exec(context.Background(), `INSERT INTO orders(id,status,report_token_hash) VALUES($1,'READY_FOR_PAYMENT',$2)`, uuid.NewString(), hash)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	(&App{DB: db}).checkout(response, httptest.NewRequest(http.MethodPost, "/api/checkouts", strings.NewReader(`{"token":"`+token+`"}`)))
	if !strings.Contains(response.Body.String(), "UNAVAILABLE") {
		t.Fatal("checkout without delivery email was allowed")
	}
}
