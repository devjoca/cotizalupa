package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

func TestPublicReportOrderStates(t *testing.T) {
	requireLocalDB(t)
	db := isolatedDB(t)
	service := &App{DB: db, ReportTokenSecret: testTokenSecret}
	// Every order status needs a public answer; a status added without one
	// fails here. COMPLETED has no saved report in this fixture.
	want := map[orderStatus]string{
		statusCreated:          "NOT_READY",
		statusReadyForPayment:  "READY_FOR_PAYMENT",
		statusRejected:         "REJECTED",
		statusPaymentPending:   "PAYMENT_PENDING",
		statusPaid:             "PROCESSING",
		statusProcessing:       "PROCESSING",
		statusCompleted:        "UNAVAILABLE",
		statusProcessingFailed: "FAILED",
		statusExpired:          "EXPIRED",
		statusRefunded:         "REFUNDED",
	}
	for _, status := range orderStatuses {
		wantStatus, ok := want[status]
		if !ok {
			t.Fatalf("no expected public state for %s", status)
		}
		test := struct{ orderStatus, wantStatus string }{string(status), wantStatus}
		t.Run(test.orderStatus, func(t *testing.T) {
			orderID := uuid.NewString()
			token := service.ReportTokenSecret.token(orderID)
			if _, err := db.Exec(context.Background(),
				`INSERT INTO orders(id,status,report_token_hash) VALUES($1,$2,$3)`,
				orderID, test.orderStatus, token.hash()); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/reports/"+string(token), nil)
			request.SetPathValue("token", string(token))
			response := httptest.NewRecorder()
			service.getReport(response, request)
			var result struct {
				Status string `json:"status"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if response.Code != http.StatusOK || result.Status != test.wantStatus {
				t.Fatalf("order %s: HTTP %d, status %s; want HTTP 200, status %s",
					test.orderStatus, response.Code, result.Status, test.wantStatus)
			}
			if response.Header().Get("Cache-Control") != "no-store" ||
				response.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
				t.Fatal("private order state lost its cache or indexing protection")
			}
		})
	}
}
