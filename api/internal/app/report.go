package app

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type reportResponse struct {
	Status      string                     `json:"status"`
	AmountCents int                        `json:"amountCents,omitempty"`
	Currency    string                     `json:"currency,omitempty"`
	Analysis    map[string]json.RawMessage `json:"analysis,omitempty"`
}

// reportState is a public report state without a payload. The two states that
// carry one are built only by payableReport and completedReport.
type reportState string

const (
	reportNotFound       reportState = "NOT_FOUND"
	reportUnavailable    reportState = "UNAVAILABLE"
	reportNotReady       reportState = "NOT_READY"
	reportRejected       reportState = "REJECTED"
	reportPaymentPending reportState = "PAYMENT_PENDING"
	reportProcessing     reportState = "PROCESSING"
	reportExpired        reportState = "EXPIRED"
	reportFailed         reportState = "FAILED"
	reportRefunded       reportState = "REFUNDED"
)

func (s reportState) response() reportResponse { return reportResponse{Status: string(s)} }

func payableReport() reportResponse {
	return reportResponse{Status: "READY_FOR_PAYMENT", AmountCents: reviewPriceCents, Currency: "USD"}
}

func completedReport(analysis map[string]json.RawMessage) reportResponse {
	return reportResponse{Status: "COMPLETED", Analysis: analysis}
}

func (a *App) getReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	token, ok := parseReportToken(r.PathValue("token"))
	if !ok {
		writeJSON(w, reportNotFound.response())
		return
	}
	var orderID, rawStatus string
	var deleteAfter time.Time
	err := a.DB.QueryRow(r.Context(), `SELECT id,status,delete_after FROM orders WHERE report_token_hash=$1`, token.hash()).Scan(&orderID, &rawStatus, &deleteAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, reportNotFound.response())
		return
	}
	if err != nil {
		writeJSON(w, reportUnavailable.response())
		return
	}
	status, err := parseOrderStatus(rawStatus)
	if err != nil {
		writeJSON(w, reportUnavailable.response())
		return
	}
	switch status {
	case statusCreated:
		writeJSON(w, reportNotReady.response())
	case statusReadyForPayment:
		if !deleteAfter.After(time.Now()) {
			writeJSON(w, reportExpired.response())
			return
		}
		writeJSON(w, payableReport())
	case statusRejected:
		writeJSON(w, reportRejected.response())
	case statusPaymentPending:
		writeJSON(w, reportPaymentPending.response())
	case statusPaid, statusProcessing:
		writeJSON(w, reportProcessing.response())
	case statusProcessingFailed:
		writeJSON(w, reportFailed.response())
	case statusExpired:
		writeJSON(w, reportExpired.response())
	case statusRefunded:
		writeJSON(w, reportRefunded.response())
	case statusCompleted:
		a.writeCompletedReport(w, r, orderID)
	default:
		writeJSON(w, reportUnavailable.response())
	}
}

func (a *App) writeCompletedReport(w http.ResponseWriter, r *http.Request, orderID string) {
	var result, facts []byte
	if err := a.DB.QueryRow(r.Context(), `SELECT result,quotation_facts FROM reports WHERE order_id=$1`, orderID).Scan(&result, &facts); err != nil {
		writeJSON(w, reportUnavailable.response())
		return
	}
	// parseAnalysis already validated this before it was saved. Re-validating
	// on read would hide old reports whenever the validator tightens.
	var report map[string]json.RawMessage
	if json.Unmarshal(result, &report) != nil || len(report) == 0 || !json.Valid(facts) {
		writeJSON(w, reportUnavailable.response())
		return
	}
	report["quotation_facts"] = facts
	writeJSON(w, completedReport(report))
}
