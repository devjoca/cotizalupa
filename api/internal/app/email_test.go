package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type emailTransport func(*http.Request) (*http.Response, error)

func (f emailTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestResendReportLinkHasStableIdempotencyKey(t *testing.T) {
	const link = "https://example.test/r/synthetic-private-link"
	calls := 0
	client := &http.Client{Transport: emailTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != http.MethodPost || r.URL.String() != "https://api.resend.com/emails" || r.Header.Get("Idempotency-Key") != "report-ready/synthetic-order" {
			t.Fatal("email endpoint or idempotency key mismatch")
		}
		var payload map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if len(payload) != 5 || !strings.Contains(string(payload["text"]), link) || !strings.Contains(string(payload["html"]), link) {
			t.Fatal("email must contain only sender, recipient, subject and link-based message")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"synthetic-email"}`))}, nil
	})}
	mailer := resendMailer{APIKey: "synthetic-key", From: "reportes@example.test", Client: client}
	for i := 0; i < 2; i++ {
		id, err := mailer.sendReport(context.Background(), "synthetic-order", "recipient@example.test", link)
		if err != nil || id != "synthetic-email" {
			t.Fatalf("expected accepted email, got %q (%v)", id, err)
		}
	}
	if calls != 2 {
		t.Fatal("retry did not reach the same provider boundary")
	}
}

func TestResendFailureDoesNotExposeProviderData(t *testing.T) {
	client := &http.Client{Transport: emailTransport(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("provider failure with synthetic private content")
	})}
	_, err := (resendMailer{APIKey: "synthetic-key", From: "reportes@example.test", Client: client}).sendReport(context.Background(), "order", "recipient@example.test", "https://example.test/r/private")
	if err == nil || err.Error() != "email_provider_unavailable" {
		t.Fatal("provider details escaped the email adapter")
	}
}
