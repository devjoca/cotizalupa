package app

import (
	"bytes"
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
	service := &App{DB: db, ReportTokenSecret: bytes.Repeat([]byte{1}, 32)}
	for _, test := range []struct {
		orderStatus string
		wantStatus  string
	}{
		{"CREATED", "NOT_READY"},
		{"READY_FOR_PAYMENT", "READY_FOR_PAYMENT"},
		{"REJECTED", "REJECTED"},
		{"PAYMENT_PENDING", "PAYMENT_PENDING"},
		{"PAID", "PROCESSING"},
		{"PROCESSING", "PROCESSING"},
		{"PROCESSING_FAILED", "FAILED"},
		{"EXPIRED", "EXPIRED"},
		{"REFUNDED", "REFUNDED"},
	} {
		t.Run(test.orderStatus, func(t *testing.T) {
			orderID := uuid.NewString()
			token, hash, err := service.reportToken(orderID)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(context.Background(),
				`INSERT INTO orders(id,status,report_token_hash) VALUES($1,$2,$3)`,
				orderID, test.orderStatus, hash); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/reports/"+token, nil)
			request.SetPathValue("token", token)
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
