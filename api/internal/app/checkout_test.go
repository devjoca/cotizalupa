package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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

func TestCheckoutTaxInheritanceInLocalPostgres(t *testing.T) {
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
		name  string
		tax   *string
		total int
		want  string
	}{
		{"inherited Inclusive default", nil, 999, "CHECKOUT"},
		{"explicit inclusive", &inclusive, 999, "CHECKOUT"},
		{"explicit exclusive", &exclusive, 999, "PENDING"},
		{"location based", &location, 999, "PENDING"},
		{"unknown override", &empty, 999, "PENDING"},
		{"inherited setting with added tax", nil, 1179, "PENDING"},
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
			creates := 0
			polar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodPost {
					creates++
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id": "checkout_1", "url": "https://sandbox.polar.sh/checkout/synthetic", "status": "open",
					"product_id": "product_1", "amount": 999, "total_amount": tc.total, "currency": "usd",
					"is_free_product_price": false, "is_payment_required": true,
					"product_price": map[string]any{"tax_behavior": tc.tax},
				})
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
