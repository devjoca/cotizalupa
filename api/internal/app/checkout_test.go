package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
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

func TestCheckoutCreationInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	original := []byte("synthetic quotation")
	digest := sha256.Sum256(original)
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("ETag", `"synthetic"`)
		w.Header().Set("Last-Modified", time.Now().UTC().Format(http.TimeFormat))
		_, _ = w.Write(original)
	}))
	defer fakeS3.Close()
	bucket, err := minio.New(strings.TrimPrefix(fakeS3.URL, "http://"), &minio.Options{
		Creds: credentials.NewStaticV4("key", "secret", ""), Region: "auto", BucketLookup: minio.BucketLookupPath, MaxRetries: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	inclusive, exclusive, location, empty := "inclusive", "exclusive", "location", ""
	for _, tc := range []struct {
		name       string
		tax        *string
		total      int
		want       string
		reason     string
		httpStatus int
		overrides  map[string]any
	}{
		{name: "inherited Inclusive default", total: 999, want: "CHECKOUT"},
		{name: "explicit inclusive", tax: &inclusive, total: 999, want: "CHECKOUT"},
		{name: "explicit exclusive", tax: &exclusive, total: 999, want: "UNAVAILABLE", reason: "tax_behavior_not_inclusive"},
		{name: "location based", tax: &location, total: 999, want: "UNAVAILABLE", reason: "tax_behavior_not_inclusive"},
		{name: "unknown override", tax: &empty, total: 999, want: "UNAVAILABLE", reason: "tax_behavior_not_inclusive"},
		{name: "inherited setting with added tax", total: 1179, want: "UNAVAILABLE", reason: "total_amount_mismatch"},
		{name: "unauthorized", want: "UNAVAILABLE", reason: "polar_http_401", httpStatus: 401},
		{name: "invalid request", want: "UNAVAILABLE", reason: "polar_http_422", httpStatus: 422},
		{name: "provider failure", want: "UNAVAILABLE", reason: "polar_http_500", httpStatus: 500},
		{name: "malformed response", want: "UNAVAILABLE", reason: "polar_request_failed", httpStatus: 200},
		{name: "missing checkout ID", total: 999, want: "UNAVAILABLE", reason: "missing_checkout_id", overrides: map[string]any{"id": ""}},
		{name: "missing URL", total: 999, want: "UNAVAILABLE", reason: "missing_checkout_url", overrides: map[string]any{"url": ""}},
		{name: "wrong product", total: 999, want: "UNAVAILABLE", reason: "product_mismatch", overrides: map[string]any{"product_id": "other"}},
		{name: "wrong amount", total: 999, want: "UNAVAILABLE", reason: "amount_mismatch", overrides: map[string]any{"amount": 1000}},
		{name: "wrong currency", total: 999, want: "UNAVAILABLE", reason: "currency_mismatch", overrides: map[string]any{"currency": "pen"}},
		{name: "free price", total: 999, want: "UNAVAILABLE", reason: "free_product_price", overrides: map[string]any{"is_free_product_price": true}},
		{name: "no payment required", total: 999, want: "UNAVAILABLE", reason: "payment_not_required", overrides: map[string]any{"is_payment_required": false}},
		{name: "missing price", total: 999, want: "UNAVAILABLE", reason: "missing_product_price", overrides: map[string]any{"product_price": nil}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			orderID := uuid.NewString()
			token, hash, err := newReportToken()
			if err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,email) VALUES($1,'READY_FOR_PAYMENT',$2,'fixture@example.com')`, orderID, hash)
			if err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(ctx, `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256) VALUES($1,$2,0,'synthetic','image/jpeg',$3,$4)`, uuid.NewString(), orderID, len(original), hex.EncodeToString(digest[:]))
			if err != nil {
				t.Fatal(err)
			}
			var logs bytes.Buffer
			previousLogger := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
			t.Cleanup(func() { slog.SetDefault(previousLogger) })
			creates := 0
			polar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodPost {
					creates++
				}
				if tc.httpStatus != 0 {
					w.WriteHeader(tc.httpStatus)
					_, _ = w.Write([]byte("private-provider-body"))
					return
				}
				payload := map[string]any{
					"id": "checkout_1", "url": "https://sandbox.polar.sh/checkout/synthetic", "status": "open",
					"product_id": "product_1", "amount": 999, "total_amount": tc.total, "currency": "usd",
					"is_free_product_price": false, "is_payment_required": true,
					"product_price":  map[string]any{"tax_behavior": tc.tax},
					"customer_email": "private-customer@example.com", "client_secret": "private-provider-secret",
				}
				for key, value := range tc.overrides {
					payload[key] = value
				}
				_ = json.NewEncoder(w).Encode(payload)
			}))
			defer polar.Close()
			publicURL, _ := url.Parse("http://localhost:3002")
			service := &App{DB: db, Bucket: bucket, BucketName: "test", PolarBaseURL: polar.URL, PolarProductID: "product_1", PublicURL: publicURL}
			input, _ := json.Marshal(map[string]string{"token": token})
			call := func() string {
				response := httptest.NewRecorder()
				service.checkout(response, httptest.NewRequest(http.MethodPost, "/api/checkouts", bytes.NewReader(input)))
				var output map[string]string
				if err := json.Unmarshal(response.Body.Bytes(), &output); err != nil {
					t.Fatal(err)
				}
				return output["status"]
			}
			if got := call(); got != tc.want {
				t.Fatalf("checkout result = %s, want %s", got, tc.want)
			}
			if tc.reason != "" {
				var event struct {
					Message string `json:"msg"`
					Reason  string `json:"reason"`
					OrderID string `json:"order_id"`
				}
				if err := json.Unmarshal(logs.Bytes(), &event); err != nil || event.Message != "polar_checkout_failed" || event.Reason != tc.reason || event.OrderID != orderID {
					t.Fatalf("unexpected operational diagnostic: %s (%v)", logs.String(), err)
				}
			}
			for _, private := range []string{token, "private-provider-body", "private-customer@example.com", "private-provider-secret", "https://sandbox.polar.sh/checkout/synthetic", "synthetic quotation"} {
				if strings.Contains(logs.String(), private) {
					t.Fatal("operational logs contain private checkout data")
				}
			}
			var status string
			var checkoutID *string
			if err := db.QueryRow(ctx, `SELECT status,payment_transaction_id FROM orders WHERE id=$1`, orderID).Scan(&status, &checkoutID); err != nil {
				t.Fatal(err)
			}
			if tc.want == "CHECKOUT" {
				if status != "PAYMENT_PENDING" || checkoutID == nil || *checkoutID != "checkout_1" {
					t.Fatalf("checkout not registered: %s %v", status, checkoutID)
				}
				if got := call(); got != "CHECKOUT" || creates != 1 {
					t.Fatalf("retry created another checkout: result=%s creates=%d", got, creates)
				}
			} else if status != "READY_FOR_PAYMENT" || checkoutID != nil {
				t.Fatalf("failed checkout froze order: %s %v", status, checkoutID)
			}
		})
	}
}
