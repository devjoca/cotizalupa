package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
)

// A stable secret recovers the same private link after a restart. Only its hash
// enters the database; changing the secret cannot recover existing links.
func (a *App) reportToken(orderID string) (string, string, error) {
	if len(a.ReportTokenSecret) != 32 {
		return "", "", errors.New("report_token_secret_missing")
	}
	mac := hmac.New(sha256.New, a.ReportTokenSecret)
	mac.Write([]byte("cotizalupa/report/v1/" + orderID))
	token := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	digest := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(digest[:]), nil
}

func validEmail(value string) bool {
	if len(value) == 0 || len(value) > 254 || strings.ContainsAny(value, " \t\r\n<>") {
		return false
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value {
		return false
	}
	_, domain, ok := strings.Cut(value, "@")
	return ok && strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}
