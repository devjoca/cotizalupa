package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestMetaPurchaseOnlyAfterVerifiedPaymentInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	orderID, checkoutID := uuid.NewString(), uuid.NewString()
	fbc := "fb.1.1791500000000.synthetic_click_123"
	_, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,payment_provider,payment_transaction_id,meta_fbc)
		VALUES($1,'PAYMENT_PENDING',$2,'polar',$3,$4)`, orderID, uuid.NewString(), checkoutID, fbc)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	fail := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer synthetic-token" || r.URL.Path != "/v26.0/12345/events" {
			t.Fatal("Meta request authentication or path changed")
		}
		body, _ := io.ReadAll(r.Body)
		var payload struct {
			Data []struct {
				EventName      string `json:"event_name"`
				EventID        string `json:"event_id"`
				EventTime      int64  `json:"event_time"`
				EventSourceURL string `json:"event_source_url"`
				UserData       struct {
					FBC string `json:"fbc"`
				} `json:"user_data"`
				CustomData struct {
					Currency string  `json:"currency"`
					Value    float64 `json:"value"`
				} `json:"custom_data"`
			} `json:"data"`
		}
		if json.Unmarshal(body, &payload) != nil || len(payload.Data) != 1 {
			t.Fatal("invalid Meta event")
		}
		event := payload.Data[0]
		if event.EventName != "Purchase" || event.EventID != orderID || event.EventTime == 0 ||
			event.EventSourceURL != "https://cotizalupa.example/" || event.UserData.FBC != fbc ||
			event.CustomData.Currency != "USD" || event.CustomData.Value != 9.99 ||
			strings.Contains(string(body), "/r/") || strings.Contains(string(body), "@") {
			t.Fatal("Meta event contains wrong purchase data or private content")
		}
		if fail {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{"events_received":1}`))
	}))
	defer server.Close()
	origin, _ := url.Parse("https://cotizalupa.example")
	meta := metaClient{PixelID: "12345", AccessToken: "synthetic-token", BaseURL: server.URL}
	service := &App{DB: db, PublicURL: origin, Meta: &meta}
	if err := service.deliverMetaPurchase(ctx, meta, orderID); err != nil || calls != 0 {
		t.Fatal("unpaid order sent to Meta")
	}
	event := paidOrderEvent{}
	event.Data.Metadata.OrderID, event.Data.CheckoutID = orderID, checkoutID
	if outcome, err := markPolarPaid(ctx, db, uuid.NewString(), event); err != nil || outcome != paid {
		t.Fatalf("paid transition failed: %v %v", outcome, err)
	}
	if err := service.deliverMetaPurchase(ctx, meta, orderID); err == nil || calls != 1 {
		t.Fatal("provider rejection did not preserve retry")
	}
	if err := service.deliverMetaPurchase(ctx, meta, orderID); err != nil || calls != 1 {
		t.Fatal("active claim sent duplicate event")
	}
	if _, err := db.Exec(ctx, `UPDATE orders SET meta_purchase_last_attempt_at=now()-interval '3 minutes' WHERE id=$1`, orderID); err != nil {
		t.Fatal(err)
	}
	fail = false
	if err := service.recoverMetaPurchases(ctx, meta); err != nil || calls != 2 {
		t.Fatalf("Meta retry failed: %v calls=%d", err, calls)
	}
	if err := service.recoverMetaPurchases(ctx, meta); err != nil || calls != 2 {
		t.Fatal("sent event was retried")
	}
	var sent bool
	var stored *string
	if err := db.QueryRow(ctx, `SELECT meta_purchase_sent_at IS NOT NULL,meta_fbc FROM orders WHERE id=$1`, orderID).Scan(&sent, &stored); err != nil {
		t.Fatal(err)
	}
	if !sent || stored != nil {
		t.Fatal("Meta receipt or click cleanup failed")
	}
}

func TestMetaClickValidation(t *testing.T) {
	valid := reviewContext{Perspective: "customer", Email: "person@example.test", Concern: "Synthetic concern about delivery", AdFBC: "fb.1.1791500000000.synthetic_click_123"}
	if err := valid.normalize(); err != nil || valid.AdFBC == "" {
		t.Fatalf("valid click dropped: %v", err)
	}
	invalid := valid
	invalid.AdFBC = "fb.1.1791500000000.bad click\n"
	if err := invalid.normalize(); err != nil || invalid.AdFBC != "" {
		t.Fatalf("invalid click reached storage: %v", err)
	}
	if !validMetaPixelID("12345") || validMetaPixelID("12345/events") {
		t.Fatal("pixel ID validation changed")
	}
}
