package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/minio/minio-go/v7"
)

type polarCheckout struct {
	ID                 string `json:"id"`
	URL                string `json:"url"`
	Status             string `json:"status"`
	ProductID          string `json:"product_id"`
	Amount             int    `json:"amount"`
	TotalAmount        int    `json:"total_amount"`
	Currency           string `json:"currency"`
	IsFreeProductPrice bool   `json:"is_free_product_price"`
	IsPaymentRequired  bool   `json:"is_payment_required"`
	ProductPrice       *struct {
		TaxBehavior string `json:"tax_behavior"`
	} `json:"product_price"`
}

var errInvalidOriginal = errors.New("stored original is invalid")

func (a *App) polarRequest(ctx context.Context, method, path string, data any) (polarCheckout, error) {
	var checkout polarCheckout
	var body io.Reader
	if data != nil {
		encoded, err := json.Marshal(data)
		if err != nil {
			return checkout, err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.PolarBaseURL+path, body)
	if err != nil {
		return checkout, err
	}
	req.Header.Set("Authorization", "Bearer "+a.PolarAccessToken)
	req.Header.Set("Polar-Version", "2026-10")
	if data != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 20 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		return checkout, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return checkout, fmt.Errorf("Polar checkout status %d", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&checkout); err != nil {
		return checkout, err
	}
	return checkout, nil
}

func (a *App) storedFilesMatch(ctx context.Context, orderID string) error {
	rows, err := a.DB.Query(ctx, `SELECT blob_path,mime,size_bytes,sha256 FROM order_files WHERE order_id=$1 AND deleted_at IS NULL ORDER BY position`, orderID)
	if err != nil {
		return err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var path, mime, expectedHash string
		var expectedSize int64
		if err := rows.Scan(&path, &mime, &expectedSize, &expectedHash); err != nil {
			return err
		}
		if mime != "application/pdf" && mime != "image/png" && mime != "image/jpeg" {
			return errInvalidOriginal
		}
		object, err := a.Bucket.GetObject(ctx, a.BucketName, path, minio.GetObjectOptions{})
		if err != nil {
			return err
		}
		digest := sha256.New()
		n, err := io.Copy(digest, io.LimitReader(object, expectedSize+1))
		closeErr := object.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		if n != expectedSize || hex.EncodeToString(digest.Sum(nil)) != expectedHash {
			return errInvalidOriginal
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count == 0 || count > 5 {
		return errInvalidOriginal
	}
	return nil
}

func (a *App) checkout(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&input) != nil || !reportTokenPattern.MatchString(input.Token) {
		writeJSON(w, map[string]string{"status": "NOT_FOUND"})
		return
	}
	digest := sha256.Sum256([]byte(input.Token))
	var orderID, status string
	var provider, checkoutID, email *string
	var deleteAfter time.Time
	err := a.DB.QueryRow(r.Context(), `SELECT id,status,payment_provider,payment_transaction_id,delete_after,email FROM orders WHERE report_token_hash=$1`, hex.EncodeToString(digest[:])).Scan(&orderID, &status, &provider, &checkoutID, &deleteAfter, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, map[string]string{"status": "NOT_FOUND"})
		return
	}
	if err != nil {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	if status == "PAYMENT_PENDING" {
		if provider == nil || *provider != "polar" || checkoutID == nil {
			writeJSON(w, map[string]string{"status": "PENDING"})
			return
		}
		checkout, err := a.polarRequest(r.Context(), http.MethodGet, "/v1/checkouts/"+url.PathEscape(*checkoutID), nil)
		if err != nil || checkout.ID != *checkoutID {
			writeJSON(w, map[string]string{"status": "PENDING"})
			return
		}
		if checkout.Status == "open" {
			if email == nil || !validEmail(*email) {
				writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
				return
			}
			writeJSON(w, map[string]string{"status": "CHECKOUT", "url": checkout.URL})
			return
		}
		if checkout.Status != "expired" && checkout.Status != "failed" {
			writeJSON(w, map[string]string{"status": "PENDING"})
			return
		}
		result, err := a.DB.Exec(r.Context(), `UPDATE orders SET status='EXPIRED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id=$2`, orderID, *checkoutID)
		if err != nil || result.RowsAffected() != 1 {
			writeJSON(w, map[string]string{"status": "PENDING"})
			return
		}
		writeJSON(w, map[string]string{"status": "EXPIRED"})
		return
	}
	if email == nil || !validEmail(*email) {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	if status != "READY_FOR_PAYMENT" {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	if !deleteAfter.After(time.Now()) {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	if err := a.storedFilesMatch(r.Context(), orderID); err != nil {
		if errors.Is(err, errInvalidOriginal) {
			_, _ = a.DB.Exec(context.Background(), `UPDATE orders SET status='REJECTED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status=$2`, orderID, status)
			writeJSON(w, map[string]string{"status": "INVALID_FILES"})
			return
		}
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	result, err := a.DB.Exec(r.Context(), `UPDATE orders SET status='PAYMENT_PENDING',payment_provider='polar',payment_transaction_id=NULL,updated_at=now() WHERE id=$1 AND status='READY_FOR_PAYMENT' AND delete_after > now()`, orderID)
	if err != nil || result.RowsAffected() != 1 {
		writeJSON(w, map[string]string{"status": "PENDING"})
		return
	}
	returnURL := a.PublicURL.ResolveReference(&url.URL{Path: "/r/" + input.Token}).String()
	checkout, err := a.polarRequest(r.Context(), http.MethodPost, "/v1/checkouts", map[string]any{
		"products": []string{a.PolarProductID}, "metadata": map[string]string{"order_id": orderID},
		"success_url": returnURL, "return_url": returnURL, "allow_discount_codes": false,
		"allow_trial": false, "currency": "usd", "locale": "es",
	})
	if err != nil || checkout.ID == "" || checkout.URL == "" || checkout.ProductID != a.PolarProductID || checkout.Amount != reviewPriceCents || checkout.TotalAmount != reviewPriceCents || checkout.Currency != "usd" || checkout.IsFreeProductPrice || !checkout.IsPaymentRequired || checkout.ProductPrice == nil || checkout.ProductPrice.TaxBehavior != "inclusive" {
		a.releaseCheckoutFreeze(orderID)
		CaptureOperationalError("polar_checkout_failed", map[string]string{"order_id": orderID})
		writeJSON(w, map[string]string{"status": "PENDING"})
		return
	}
	result, err = a.DB.Exec(r.Context(), `UPDATE orders SET payment_transaction_id=$2,updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id IS NULL`, orderID, checkout.ID)
	if err != nil || result.RowsAffected() != 1 {
		a.releaseCheckoutFreeze(orderID)
		writeJSON(w, map[string]string{"status": "PENDING"})
		return
	}
	writeJSON(w, map[string]string{"status": "CHECKOUT", "url": checkout.URL})
}

// releaseCheckoutFreeze returns a frozen order to READY_FOR_PAYMENT when no
// chargeable checkout was registered. The null transaction-id guard means a
// concurrent request that already registered a checkout is never reopened, and
// because the customer never received a payable URL, no charge can be pending.
func (a *App) releaseCheckoutFreeze(orderID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := a.DB.Exec(ctx, `UPDATE orders SET status='READY_FOR_PAYMENT',payment_provider=NULL,payment_transaction_id=NULL,updated_at=now()
		WHERE id=$1 AND status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id IS NULL`, orderID); err != nil {
		slog.Error("checkout freeze release failed", "order_id", orderID, "error", err.Error())
		CaptureOperationalError("checkout_freeze_release_failed", map[string]string{"order_id": orderID})
	}
}
