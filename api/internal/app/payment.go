package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const reviewPriceCents = 999

type paidOrderEvent struct {
	Type string `json:"type"`
	Data struct {
		ID             string `json:"id"`
		Paid           bool   `json:"paid"`
		Status         string `json:"status"`
		BillingReason  string `json:"billing_reason"`
		ProductID      string `json:"product_id"`
		Currency       string `json:"currency"`
		SubtotalAmount int    `json:"subtotal_amount"`
		DiscountAmount int    `json:"discount_amount"`
		TotalAmount    int    `json:"total_amount"`
		CheckoutID     string `json:"checkout_id"`
		Metadata       struct {
			OrderID string `json:"order_id"`
		} `json:"metadata"`
	} `json:"data"`
}

func verifyPolarSignature(body []byte, id, timestamp, signature, secret string, now time.Time) bool {
	if id == "" || signature == "" || !strings.HasPrefix(secret, "whsec_") {
		return false
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || seconds <= 0 || now.Sub(time.Unix(seconds, 0)) > 5*time.Minute || time.Unix(seconds, 0).Sub(now) > 5*time.Minute {
		return false
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil || len(key) == 0 {
		return false
	}
	mac := hmac.New(sha256.New, key)
	_, _ = fmt.Fprintf(mac, "%s.%s.", id, timestamp)
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	for _, item := range strings.Fields(signature) {
		version, encoded, ok := strings.Cut(item, ",")
		if !ok || version != "v1" {
			continue
		}
		actual, err := base64.StdEncoding.DecodeString(encoded)
		if err == nil && hmac.Equal(actual, expected) {
			return true
		}
	}
	return false
}

func parsePaidOrder(body []byte, productID string) (paidOrderEvent, bool) {
	var event paidOrderEvent
	if json.Unmarshal(body, &event) != nil || event.Type != "order.paid" {
		return event, false
	}
	d := event.Data
	if !d.Paid || d.Status != "paid" || d.BillingReason != "purchase" ||
		d.ProductID != productID || strings.ToUpper(d.Currency) != "USD" ||
		d.SubtotalAmount != reviewPriceCents || d.TotalAmount != reviewPriceCents ||
		d.DiscountAmount != 0 || d.ID == "" || d.CheckoutID == "" ||
		len(d.Metadata.OrderID) != 36 || uuid.Validate(d.Metadata.OrderID) != nil {
		return event, false
	}
	return event, true
}

type paymentOutcome int

const (
	paid paymentOutcome = iota
	duplicate
	unmatched
)

func markPolarPaid(ctx context.Context, db *pgxpool.Pool, eventID string, event paidOrderEvent) (paymentOutcome, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return unmatched, err
	}
	defer tx.Rollback(ctx)
	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payment_events WHERE provider_event_id=$1)`, eventID).Scan(&exists)
	if err != nil {
		return unmatched, err
	}
	if exists {
		return duplicate, tx.Commit(ctx)
	}
	var status, provider string
	var checkoutID *string
	err = tx.QueryRow(ctx, `SELECT status, coalesce(payment_provider,''), payment_transaction_id FROM orders WHERE id=$1 FOR UPDATE`, event.Data.Metadata.OrderID).Scan(&status, &provider, &checkoutID)
	if errors.Is(err, pgx.ErrNoRows) {
		return unmatched, nil
	}
	if err != nil {
		return unmatched, err
	}
	if provider != "polar" || checkoutID == nil || *checkoutID != event.Data.CheckoutID {
		return unmatched, nil
	}
	if status != "PAYMENT_PENDING" {
		if status == "PAID" || status == "PROCESSING" || status == "COMPLETED" {
			return duplicate, tx.Commit(ctx)
		}
		return unmatched, nil
	}
	var inserted string
	err = tx.QueryRow(ctx, `INSERT INTO payment_events(id,provider,provider_event_id,order_id,event_type,payload)
		VALUES (gen_random_uuid(),'polar',$1,$2,'order.paid','{}'::jsonb)
		ON CONFLICT (provider_event_id) DO NOTHING RETURNING id`, eventID, event.Data.Metadata.OrderID).Scan(&inserted)
	if errors.Is(err, pgx.ErrNoRows) {
		return duplicate, tx.Commit(ctx)
	}
	if err != nil {
		return unmatched, err
	}
	command, err := tx.Exec(ctx, `UPDATE orders SET status='PAID', paid_at=now(), updated_at=now()
		WHERE id=$1 AND status='PAYMENT_PENDING'`, event.Data.Metadata.OrderID)
	if err != nil {
		return unmatched, err
	}
	if command.RowsAffected() != 1 {
		return unmatched, errors.New("paid transition lost its row lock")
	}
	return paid, tx.Commit(ctx)
}

func polarWebhook(db *pgxpool.Pool, secret, productID string, process chan<- struct{}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		id, timestamp, signature := r.Header.Get("webhook-id"), r.Header.Get("webhook-timestamp"), r.Header.Get("webhook-signature")
		if !verifyPolarSignature(body, id, timestamp, signature, secret, time.Now()) {
			http.Error(w, "invalid signature", http.StatusBadRequest)
			return
		}
		var kind struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(body, &kind) != nil {
			http.Error(w, "invalid event", http.StatusBadRequest)
			return
		}
		if kind.Type != "order.paid" {
			w.WriteHeader(http.StatusOK)
			return
		}
		event, ok := parsePaidOrder(body, productID)
		if !ok {
			// A signed order.paid that fails the ticket checks may still be money
			// received; an operator must look at it in Polar.
			CaptureOperationalError("polar_paid_event_invalid", map[string]string{"event_id": id, "polar_order_id": event.Data.ID, "checkout_id": event.Data.CheckoutID})
			http.Error(w, "invalid paid order", http.StatusUnprocessableEntity)
			return
		}
		outcome, err := markPolarPaid(r.Context(), db, id, event)
		if err != nil {
			CaptureOperationalError("polar_webhook_failed", map[string]string{"event_id": id})
			http.Error(w, "payment unavailable", http.StatusInternalServerError)
			return
		}
		if outcome == unmatched {
			// Verified payment with no order to process: money in, no report out.
			CaptureOperationalError("polar_payment_unmatched", map[string]string{"event_id": id, "order_id": event.Data.Metadata.OrderID, "checkout_id": event.Data.CheckoutID})
			http.Error(w, "unmatched payment", http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusOK)
		if outcome == paid {
			select {
			case process <- struct{}{}:
			default:
			}
		}
	}
}
