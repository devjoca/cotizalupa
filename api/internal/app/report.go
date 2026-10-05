package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

var reportTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func (a *App) getReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	token := r.PathValue("token")
	if !reportTokenPattern.MatchString(token) {
		writeJSON(w, map[string]string{"status": "NOT_FOUND"})
		return
	}
	digest := sha256.Sum256([]byte(token))
	var orderID, status string
	var deleteAfter time.Time
	err := a.DB.QueryRow(r.Context(), `SELECT id,status,delete_after FROM orders WHERE report_token_hash=$1`, hex.EncodeToString(digest[:])).Scan(&orderID, &status, &deleteAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, map[string]string{"status": "NOT_FOUND"})
		return
	}
	if err != nil {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	switch status {
	case "READY_FOR_PAYMENT":
		if !deleteAfter.After(time.Now()) {
			writeJSON(w, map[string]string{"status": "EXPIRED"})
			return
		}
		writeJSON(w, map[string]any{"status": "READY_FOR_PAYMENT", "amountCents": reviewPriceCents, "currency": "USD"})
		return
	case "REJECTED", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED", "REFUNDED":
		writeJSON(w, map[string]string{"status": status})
		return
	case "PAID", "PROCESSING":
		writeJSON(w, map[string]string{"status": "PROCESSING"})
		return
	case "PROCESSING_FAILED":
		writeJSON(w, map[string]string{"status": "FAILED"})
		return
	case "NOT_ANALYZABLE": // Legacy orders only.
		writeJSON(w, map[string]string{"status": "FAILED"})
		return
	case "COMPLETED":
	default:
		writeJSON(w, map[string]string{"status": "NOT_READY"})
		return
	}
	var result, facts []byte
	err = a.DB.QueryRow(r.Context(), `SELECT result,quotation_facts FROM reports WHERE order_id=$1`, orderID).Scan(&result, &facts)
	if err != nil {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	// parseAnalysis already validated this before it was saved. Re-validating
	// on read would hide old reports whenever the validator tightens.
	var report map[string]json.RawMessage
	if json.Unmarshal(result, &report) != nil || len(report) == 0 || !json.Valid(facts) {
		writeJSON(w, map[string]string{"status": "UNAVAILABLE"})
		return
	}
	report["quotation_facts"] = facts
	writeJSON(w, map[string]any{"status": "COMPLETED", "analysis": report})
}
