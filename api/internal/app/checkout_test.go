package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestResolvedExpiredCheckoutCannotBeRetried(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID, checkoutID := uuid.NewString(), uuid.NewString()
	token, tokenHash, err := newReportToken()
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,payment_provider,payment_transaction_id,user_context)
		VALUES($1,'PAYMENT_PENDING',$2,'polar',$3,'synthetic context')`, orderID, tokenHash, checkoutID)
	if err != nil {
		t.Fatal(err)
	}
	polar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/checkouts/"+checkoutID {
			t.Errorf("unexpected Polar request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": checkoutID, "status": "expired"})
	}))
	defer polar.Close()
	app := &App{DB: db, PolarBaseURL: polar.URL}
	input, _ := json.Marshal(map[string]string{"token": token})
	response := httptest.NewRecorder()
	app.checkout(response, httptest.NewRequest(http.MethodPost, "/api/checkouts", bytes.NewReader(input)))
	var output map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil || output["status"] != "EXPIRED" {
		t.Fatalf("expected EXPIRED, got %s (%v)", response.Body.String(), err)
	}
	var status string
	var contextValue *string
	if err := db.QueryRow(ctx, `SELECT status,user_context FROM orders WHERE id=$1`, orderID).Scan(&status, &contextValue); err != nil || status != "EXPIRED" || contextValue != nil {
		t.Fatalf("order did not close after verified expiry: %s (%v)", status, err)
	}
	response = httptest.NewRecorder()
	app.checkout(response, httptest.NewRequest(http.MethodPost, "/api/checkouts", bytes.NewReader(input)))
	if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil || output["status"] != "UNAVAILABLE" {
		t.Fatalf("closed order accepted retry: %s (%v)", response.Body.String(), err)
	}
}

// A checkout that never registered a chargeable transaction must not strand the
// order in PAYMENT_PENDING.
func TestCheckoutFreezeReleaseInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	app := &App{DB: db}

	insertPending := func(checkoutID *string) string {
		orderID := uuid.NewString()
		if _, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,payment_provider,payment_transaction_id)
			VALUES($1,'PAYMENT_PENDING',$2,'polar',$3)`, orderID, uuid.NewString(), checkoutID); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, orderID) })
		return orderID
	}

	t.Run("returns an order with no registered checkout to READY_FOR_PAYMENT", func(t *testing.T) {
		orderID := insertPending(nil)
		app.releaseCheckoutFreeze(orderID)
		var status string
		var provider, checkoutID *string
		if err := db.QueryRow(ctx, `SELECT status,payment_provider,payment_transaction_id FROM orders WHERE id=$1`, orderID).
			Scan(&status, &provider, &checkoutID); err != nil {
			t.Fatal(err)
		}
		if status != "READY_FOR_PAYMENT" || provider != nil || checkoutID != nil {
			t.Fatalf("freeze not released: status=%s provider=%v checkout=%v", status, provider, checkoutID)
		}
	})

	t.Run("never reopens an order with a registered checkout", func(t *testing.T) {
		checkoutID := uuid.NewString()
		orderID := insertPending(&checkoutID)
		app.releaseCheckoutFreeze(orderID)
		var status, provider string
		var stored *string
		if err := db.QueryRow(ctx, `SELECT status,coalesce(payment_provider,''),payment_transaction_id FROM orders WHERE id=$1`, orderID).
			Scan(&status, &provider, &stored); err != nil {
			t.Fatal(err)
		}
		if status != "PAYMENT_PENDING" || provider != "polar" || stored == nil || *stored != checkoutID {
			t.Fatalf("registered checkout was reopened: status=%s provider=%s checkout=%v", status, provider, stored)
		}
	})
}
