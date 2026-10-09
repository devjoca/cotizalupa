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
		TaxBehavior *string `json:"tax_behavior"`
	} `json:"product_price"`
}

type polarCheckoutRequest struct {
	Products           []string          `json:"products"`
	Metadata           map[string]string `json:"metadata"`
	SuccessURL         string            `json:"success_url"`
	ReturnURL          string            `json:"return_url"`
	AllowDiscountCodes bool              `json:"allow_discount_codes"`
	AllowTrial         bool              `json:"allow_trial"`
	Currency           string            `json:"currency"`
	Locale             string            `json:"locale"`
}

var errInvalidOriginal = errors.New("stored original is invalid")

type polarHTTPError int

func (status polarHTTPError) Error() string {
	return fmt.Sprintf("Polar checkout status %d", status)
}

// polarRequest sends data as the JSON body when it is non-nil.
func (a *App) polarRequest(ctx context.Context, method, path string, data *polarCheckoutRequest) (polarCheckout, error) {
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
		return checkout, polarHTTPError(response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&checkout); err != nil {
		return checkout, err
	}
	return checkout, nil
}

// Reasons are fixed codes so provider payloads and request errors never enter logs.
func (a *App) checkoutFailureReason(checkout polarCheckout, err error) string {
	if err != nil {
		var status polarHTTPError
		if errors.As(err, &status) {
			return fmt.Sprintf("polar_http_%d", status)
		}
		return "polar_request_failed"
	}
	switch {
	case checkout.ID == "":
		return "missing_checkout_id"
	case checkout.URL == "":
		return "missing_checkout_url"
	case checkout.ProductID != a.PolarProductID:
		return "product_mismatch"
	case checkout.Amount != reviewPriceCents:
		return "amount_mismatch"
	case checkout.TotalAmount != reviewPriceCents:
		return "total_amount_mismatch"
	case checkout.Currency != "usd":
		return "currency_mismatch"
	case checkout.IsFreeProductPrice:
		return "free_product_price"
	case !checkout.IsPaymentRequired:
		return "payment_not_required"
	case checkout.ProductPrice == nil:
		return "missing_product_price"
	case checkout.ProductPrice.TaxBehavior != nil && *checkout.ProductPrice.TaxBehavior != "inclusive":
		return "tax_behavior_not_inclusive"
	default:
		return ""
	}
}

func (a *App) storedFilesMatch(ctx context.Context, orderID string) error {
	files, err := a.loadOrderFiles(ctx, orderID)
	if err != nil {
		return err
	}
	for _, file := range files {
		object, err := a.Bucket.GetObject(ctx, a.BucketName, file.Path, minio.GetObjectOptions{})
		if err != nil {
			return err
		}
		digest := sha256.New()
		n, err := io.Copy(digest, io.LimitReader(object, file.Size+1))
		closeErr := object.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		if n != file.Size || hex.EncodeToString(digest.Sum(nil)) != file.SHA256 {
			return errInvalidOriginal
		}
	}
	return nil
}

type checkoutResponse struct {
	Status string `json:"status"`
	URL    string `json:"url,omitempty"`
}

// checkoutState is a checkout answer without a payable URL; only
// checkoutRedirect carries one.
type checkoutState string

const (
	checkoutNotFound     checkoutState = "NOT_FOUND"
	checkoutUnavailable  checkoutState = "UNAVAILABLE"
	checkoutPending      checkoutState = "PENDING"
	checkoutExpired      checkoutState = "EXPIRED"
	checkoutInvalidFiles checkoutState = "INVALID_FILES"
)

func (s checkoutState) response() checkoutResponse { return checkoutResponse{Status: string(s)} }

func checkoutRedirect(url string) checkoutResponse {
	return checkoutResponse{Status: "CHECKOUT", URL: url}
}

func (a *App) checkout(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&input) != nil {
		writeJSON(w, checkoutNotFound.response())
		return
	}
	token, ok := parseReportToken(input.Token)
	if !ok {
		writeJSON(w, checkoutNotFound.response())
		return
	}
	var orderID, rawStatus string
	var provider, checkoutID, email *string
	var deleteAfter time.Time
	err := a.DB.QueryRow(r.Context(), `SELECT id,status,payment_provider,payment_transaction_id,delete_after,email FROM orders WHERE report_token_hash=$1`, token.hash()).Scan(&orderID, &rawStatus, &provider, &checkoutID, &deleteAfter, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, checkoutNotFound.response())
		return
	}
	if err != nil {
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	status, err := parseOrderStatus(rawStatus)
	if err != nil {
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	if status == statusPaymentPending {
		if provider == nil || *provider != "polar" || checkoutID == nil {
			writeJSON(w, checkoutPending.response())
			return
		}
		checkout, err := a.polarRequest(r.Context(), http.MethodGet, "/v1/checkouts/"+url.PathEscape(*checkoutID), nil)
		if err != nil || checkout.ID != *checkoutID {
			writeJSON(w, checkoutPending.response())
			return
		}
		if checkout.Status == "open" {
			if email == nil || !validEmail(*email) {
				writeJSON(w, checkoutUnavailable.response())
				return
			}
			writeJSON(w, checkoutRedirect(checkout.URL))
			return
		}
		if checkout.Status != "expired" && checkout.Status != "failed" {
			writeJSON(w, checkoutPending.response())
			return
		}
		result, err := a.DB.Exec(r.Context(), `UPDATE orders SET status='EXPIRED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id=$2`, orderID, *checkoutID)
		if err != nil || result.RowsAffected() != 1 {
			writeJSON(w, checkoutPending.response())
			return
		}
		writeJSON(w, checkoutExpired.response())
		return
	}
	if email == nil || !validEmail(*email) {
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	if status != statusReadyForPayment {
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	if !deleteAfter.After(time.Now()) {
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	if err := a.storedFilesMatch(r.Context(), orderID); err != nil {
		if errors.Is(err, errInvalidOriginal) {
			_, _ = a.DB.Exec(context.Background(), `UPDATE orders SET status='REJECTED',delete_after=now(),user_context=NULL,email=NULL,updated_at=now() WHERE id=$1 AND status=$2`, orderID, status)
			writeJSON(w, checkoutInvalidFiles.response())
			return
		}
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	result, err := a.DB.Exec(r.Context(), `UPDATE orders SET status='PAYMENT_PENDING',payment_provider='polar',payment_transaction_id=NULL,updated_at=now() WHERE id=$1 AND status='READY_FOR_PAYMENT' AND delete_after > now()`, orderID)
	if err != nil || result.RowsAffected() != 1 {
		writeJSON(w, checkoutPending.response())
		return
	}
	returnURL := a.PublicURL.ResolveReference(&url.URL{Path: "/r/" + string(token)}).String()
	checkout, err := a.polarRequest(r.Context(), http.MethodPost, "/v1/checkouts", &polarCheckoutRequest{
		Products: []string{a.PolarProductID}, Metadata: map[string]string{"order_id": orderID},
		SuccessURL: returnURL, ReturnURL: returnURL, Currency: "usd", Locale: "es",
	})
	// A null price override inherits the organization's required Inclusive default.
	// An explicit override must also be inclusive; signed payment totals are checked separately.
	if reason := a.checkoutFailureReason(checkout, err); reason != "" {
		a.releaseCheckoutFreeze(orderID)
		slog.Error("polar_checkout_failed", "order_id", orderID, "reason", reason)
		CaptureOperationalError("polar_checkout_failed", map[string]string{"order_id": orderID, "reason": reason})
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	result, err = a.DB.Exec(r.Context(), `UPDATE orders SET payment_transaction_id=$2,updated_at=now() WHERE id=$1 AND status='PAYMENT_PENDING' AND payment_provider='polar' AND payment_transaction_id IS NULL`, orderID, checkout.ID)
	if err != nil || result.RowsAffected() != 1 {
		a.releaseCheckoutFreeze(orderID)
		slog.Error("polar_checkout_failed", "order_id", orderID, "reason", "checkout_registration_failed")
		CaptureOperationalError("polar_checkout_failed", map[string]string{"order_id": orderID, "reason": "checkout_registration_failed"})
		writeJSON(w, checkoutUnavailable.response())
		return
	}
	writeJSON(w, checkoutRedirect(checkout.URL))
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
