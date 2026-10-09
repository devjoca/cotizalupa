package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

var metaPixelIDPattern = regexp.MustCompile(`^[0-9]{1,30}$`)
var metaFBCPattern = regexp.MustCompile(`^fb\.1\.[0-9]{13}\.[A-Za-z0-9_-]{1,500}$`)

func validMetaPixelID(value string) bool { return metaPixelIDPattern.MatchString(value) }
func validMetaFBC(value string) bool     { return value == "" || metaFBCPattern.MatchString(value) }

type metaClient struct {
	PixelID     string
	AccessToken string
	BaseURL     string // Test server only; production uses Meta's Graph API.
	Client      *http.Client
}

func (m metaClient) sendPurchase(ctx context.Context, orderID, fbc, sourceURL string, paidAt time.Time) error {
	if !metaFBCPattern.MatchString(fbc) {
		return errors.New("meta_purchase_fbc_invalid")
	}
	body, err := json.Marshal(map[string]any{"data": []any{map[string]any{
		"event_name": "Purchase", "event_time": paidAt.Unix(), "event_id": orderID,
		"action_source": "website", "event_source_url": sourceURL,
		"user_data":   map[string]string{"fbc": fbc},
		"custom_data": map[string]any{"currency": "USD", "value": 9.99},
	}}})
	if err != nil {
		return errors.New("meta_purchase_request_invalid")
	}
	base := m.BaseURL
	if base == "" {
		base = "https://graph.facebook.com"
	}
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodPost, base+"/v26.0/"+m.PixelID+"/events", bytes.NewReader(body))
	if err != nil {
		return errors.New("meta_purchase_request_invalid")
	}
	req.Header.Set("Authorization", "Bearer "+m.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	client := m.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(req)
	if err != nil {
		return errors.New("meta_purchase_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("meta_purchase_rejected")
	}
	var accepted struct {
		EventsReceived int `json:"events_received"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&accepted) != nil || accepted.EventsReceived != 1 {
		return errors.New("meta_purchase_response_invalid")
	}
	return nil
}

// A persisted claim prevents simultaneous workers from sending the same order.
// The stable event_id makes a retry identifiable after an uncertain response.
func (a *App) deliverMetaPurchase(ctx context.Context, meta metaClient, orderID string) error {
	var fbc string
	var paidAt time.Time
	err := a.DB.QueryRow(ctx, `UPDATE orders SET meta_purchase_last_attempt_at=now()
		WHERE id=$1 AND paid_at IS NOT NULL AND paid_at > now()-interval '6 days'
		AND meta_fbc IS NOT NULL AND meta_purchase_sent_at IS NULL
		AND (meta_purchase_last_attempt_at IS NULL OR meta_purchase_last_attempt_at < now()-interval '2 minutes')
		RETURNING meta_fbc,paid_at`, orderID).Scan(&fbc, &paidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if a.PublicURL == nil {
		return errors.New("meta_public_url_missing")
	}
	source := a.PublicURL.ResolveReference(&url.URL{Path: "/"}).String()
	if err := meta.sendPurchase(ctx, orderID, fbc, source, paidAt); err != nil {
		return err
	}
	receiptCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = a.DB.Exec(receiptCtx, `UPDATE orders SET meta_purchase_sent_at=now(),meta_fbc=NULL
		WHERE id=$1 AND meta_purchase_sent_at IS NULL`, orderID)
	return err
}

func (a *App) recoverMetaPurchases(ctx context.Context, meta metaClient) error {
	rows, err := a.DB.Query(ctx, `SELECT id FROM orders WHERE paid_at IS NOT NULL
		AND paid_at > now()-interval '6 days' AND meta_fbc IS NOT NULL AND meta_purchase_sent_at IS NULL
		AND (meta_purchase_last_attempt_at IS NULL OR meta_purchase_last_attempt_at < now()-interval '2 minutes')
		ORDER BY paid_at LIMIT 100`)
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
		if err := a.deliverMetaPurchase(ctx, meta, id); err != nil {
			CaptureOperationalError("meta_purchase_failed", map[string]string{"order_id": id})
		}
	}
	return nil
}

func (a *App) workMetaPurchases(ctx context.Context, meta metaClient) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		if err := a.recoverMetaPurchases(ctx, meta); err != nil && ctx.Err() == nil {
			CaptureOperationalError("meta_purchase_recovery_failed", nil)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
