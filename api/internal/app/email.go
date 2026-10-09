package app

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"time"
)

//go:embed report_email.html
var reportEmailHTML string

var reportEmailTemplate = template.Must(template.New("report-ready").Parse(reportEmailHTML))

func renderReportEmail(reportURL string) (string, error) {
	link, err := url.Parse(reportURL)
	if err != nil {
		return "", errors.New("email_request_invalid")
	}
	var output bytes.Buffer
	err = reportEmailTemplate.Execute(&output, struct {
		ReportURL       string
		IllustrationURL string
	}{reportURL, link.ResolveReference(&url.URL{Path: "/email/report-ready.png"}).String()})
	return output.String(), err
}

type resendMailer struct {
	APIKey string
	From   string
	Client *http.Client
}

// Send only the access link: quotation content never enters the email provider.
// A stable order key makes retries within Resend's 24-hour window idempotent.
func (m resendMailer) sendReport(ctx context.Context, orderID, recipient, reportURL string) (string, error) {
	if m.APIKey == "" || m.From == "" {
		return "", errors.New("email_not_configured")
	}
	const subject = "Tu reporte de CotizaLupa está listo"
	text := "Tu reporte está listo. Puedes abrirlo en este enlace privado:\n\n" + reportURL + "\n\nPuedes guardar el reporte como PDF desde esa página. Guarda este correo y cuida el enlace: quien lo tenga podrá leer tu reporte.\n\nSi necesitas ayuda, escribe a soporte@cotizalupa.com."
	markup, err := renderReportEmail(reportURL)
	if err != nil {
		return "", errors.New("email_request_invalid")
	}
	body, err := json.Marshal(struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
		HTML    string   `json:"html"`
	}{
		From: m.From, To: []string{recipient}, Subject: subject, Text: text,
		HTML: markup,
	})
	if err != nil {
		return "", errors.New("email_request_invalid")
	}
	requestCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return "", errors.New("email_request_invalid")
	}
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "report-ready/"+orderID)
	client := m.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(req)
	if err != nil {
		return "", errors.New("email_provider_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		// Provider errors can contain recipients and links; retain only a code.
		return "", errors.New("email_provider_rejected")
	}
	var accepted struct {
		ID string `json:"id"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&accepted) != nil || accepted.ID == "" {
		return "", errors.New("email_provider_response_invalid")
	}
	return accepted.ID, nil
}

// The claim is persisted before sending. Concurrent drains and the report job
// cannot send the same order together; a crashed attempt can be retried later.
func (a *App) deliverReportEmail(ctx context.Context, orderID string) error {
	var recipient, expectedHash string
	err := a.DB.QueryRow(ctx, `UPDATE orders SET
 report_email_first_attempt_at=coalesce(report_email_first_attempt_at,now()),
 report_email_last_attempt_at=now()
 WHERE id=$1 AND status='COMPLETED' AND email IS NOT NULL AND report_email_sent_at IS NULL
 AND completed_at > now()-interval '30 days'
 AND (report_email_last_attempt_at IS NULL OR report_email_last_attempt_at < now()-interval '2 minutes')
 AND (report_email_first_attempt_at IS NULL OR report_email_first_attempt_at > now()-interval '23 hours')
 RETURNING email,report_token_hash`, orderID).Scan(&recipient, &expectedHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	token := a.ReportTokenSecret.token(orderID)
	if token.hash() != tokenHash(expectedHash) {
		err = errors.New("email_link_unrecoverable")
	}
	var providerID string
	if err == nil {
		if a.PublicURL == nil {
			err = errors.New("email_public_url_missing")
		} else {
			link := a.PublicURL.ResolveReference(&url.URL{Path: "/r/" + string(token)}).String()
			providerID, err = a.Mailer.sendReport(ctx, orderID, recipient, link)
		}
	}
	// Persist the receipt even if the analysis context ended while Resend replied.
	receiptCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err != nil {
		_, dbErr := a.DB.Exec(receiptCtx, `UPDATE orders SET report_email_last_error=$2 WHERE id=$1 AND report_email_sent_at IS NULL`, orderID, err.Error())
		if dbErr != nil {
			return errors.New("email_receipt_failed")
		}
		return err
	}
	_, err = a.DB.Exec(receiptCtx, `UPDATE orders SET report_email_sent_at=now(),report_email_id=$2,report_email_last_error=NULL,email=NULL WHERE id=$1 AND report_email_sent_at IS NULL`, orderID, providerID)
	return err
}

func (a *App) recoverReportEmails(ctx context.Context) error {
	rows, err := a.DB.Query(ctx, `SELECT id FROM orders WHERE status='COMPLETED' AND email IS NOT NULL AND report_email_sent_at IS NULL
 AND completed_at > now()-interval '30 days'
 AND (report_email_last_attempt_at IS NULL OR report_email_last_attempt_at < now()-interval '2 minutes')
 AND (report_email_first_attempt_at IS NULL OR report_email_first_attempt_at > now()-interval '23 hours')
 ORDER BY completed_at LIMIT 100`)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, id := range ids {
		if err := a.deliverReportEmail(ctx, id); err != nil {
			CaptureOperationalError("report_email_failed", map[string]string{"order_id": id})
		}
	}
	return nil
}
