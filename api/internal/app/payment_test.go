package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPolarSignatureAndTicket(t *testing.T) {
	secret := "whsec_" + base64.StdEncoding.EncodeToString([]byte("synthetic-test-key"))
	now := time.Unix(1_800_000_000, 0)
	id := "event_1"
	timestamp := fmt.Sprint(now.Unix())
	body, err := json.Marshal(map[string]any{
		"type": "order.paid",
		"data": map[string]any{
			"id": "polar_order_1", "paid": true, "status": "paid", "billing_reason": "purchase",
			"product_id": "product_1", "currency": "usd", "subtotal_amount": 999,
			"discount_amount": 0, "total_amount": 999, "checkout_id": "checkout_1",
			"metadata": map[string]string{"order_id": "123e4567-e89b-42d3-a456-426614174000"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha256.New, []byte("synthetic-test-key"))
	_, _ = fmt.Fprintf(mac, "%s.%s.", id, timestamp)
	_, _ = mac.Write(body)
	signature := "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if !verifyPolarSignature(body, id, timestamp, signature, secret, now) {
		t.Fatal("valid signature rejected")
	}
	if verifyPolarSignature(append(body, ' '), id, timestamp, signature, secret, now) {
		t.Fatal("tampered body accepted")
	}
	if verifyPolarSignature(body, id, timestamp, signature, secret, now.Add(6*time.Minute)) {
		t.Fatal("stale event accepted")
	}
	if _, ok := parsePaidOrder(body, "product_1"); !ok {
		t.Fatal("valid paid order rejected")
	}
	var altered map[string]any
	if err := json.Unmarshal(body, &altered); err != nil {
		t.Fatal(err)
	}
	data := altered["data"].(map[string]any)
	data["total_amount"] = 1400
	extraTax, _ := json.Marshal(altered)
	if _, ok := parsePaidOrder(extraTax, "product_1"); ok {
		t.Fatal("wrong total accepted")
	}
}

func TestWebhookHandlerInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID, checkoutID, eventID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,payment_provider,payment_transaction_id)
		VALUES($1,'PAYMENT_PENDING',$2,'polar',$3)`, orderID, uuid.NewString(), checkoutID)
	if err != nil {
		t.Fatal(err)
	}
	secret := "whsec_" + base64.StdEncoding.EncodeToString([]byte("synthetic-test-key"))
	body, err := json.Marshal(map[string]any{"type": "order.paid", "data": map[string]any{
		"id": "polar_order_1", "paid": true, "status": "paid", "billing_reason": "purchase",
		"product_id": "product_1", "currency": "usd", "subtotal_amount": 999, "discount_amount": 0,
		"total_amount": 999, "checkout_id": checkoutID, "metadata": map[string]string{"order_id": orderID},
	}})
	if err != nil {
		t.Fatal(err)
	}
	timestamp := fmt.Sprint(time.Now().Unix())
	mac := hmac.New(sha256.New, []byte("synthetic-test-key"))
	_, _ = fmt.Fprintf(mac, "%s.%s.", eventID, timestamp)
	_, _ = mac.Write(body)
	signature := "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))
	process := make(chan struct{}, 1)
	handler := polarWebhook(db, secret, "product_1", process)
	request := func(sig string) *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/api/webhooks/polar", bytes.NewReader(body))
		r.Header.Set("webhook-id", eventID)
		r.Header.Set("webhook-timestamp", timestamp)
		r.Header.Set("webhook-signature", sig)
		return r
	}
	bad := httptest.NewRecorder()
	handler(bad, request("v1,invalid"))
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("invalid signature status %d", bad.Code)
	}
	first := httptest.NewRecorder()
	handler(first, request(signature))
	if first.Code != http.StatusOK || len(process) != 1 {
		t.Fatalf("first event status %d process=%d", first.Code, len(process))
	}
	second := httptest.NewRecorder()
	handler(second, request(signature))
	if second.Code != http.StatusOK || len(process) != 1 {
		t.Fatalf("duplicate event status %d process=%d", second.Code, len(process))
	}
}

func TestPaidTransitionInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID, checkoutID, eventID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	_, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,payment_provider,payment_transaction_id)
		VALUES($1,'PAYMENT_PENDING',$2,'polar',$3)`, orderID, uuid.NewString(), checkoutID)
	if err != nil {
		t.Fatal(err)
	}
	event := paidOrderEvent{}
	event.Data.Metadata.OrderID = orderID
	event.Data.CheckoutID = checkoutID
	outcome, err := markPolarPaid(ctx, db, eventID, event)
	if err != nil || outcome != paid {
		t.Fatalf("first event: %v %v", outcome, err)
	}
	outcome, err = markPolarPaid(ctx, db, eventID, event)
	if err != nil || outcome != duplicate {
		t.Fatalf("duplicate event: %v %v", outcome, err)
	}
	var status string
	var events int
	if err := db.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1`, orderID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM payment_events WHERE order_id=$1 AND payload='{}'::jsonb`, orderID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if status != "PAID" || events != 1 {
		t.Fatalf("status=%s events=%d", status, events)
	}
}
