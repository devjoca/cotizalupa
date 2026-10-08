package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/mail"
	"regexp"
	"strings"
)

// reportToken is the private link secret; only its tokenHash is stored.
type reportToken string

type tokenHash string

var reportTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func parseReportToken(value string) (reportToken, bool) {
	if !reportTokenPattern.MatchString(value) {
		return "", false
	}
	return reportToken(value), true
}

func (t reportToken) hash() tokenHash {
	digest := sha256.Sum256([]byte(t))
	return tokenHash(hex.EncodeToString(digest[:]))
}

// A stable secret recovers the same private link after a restart. Only its hash
// enters the database; changing the secret cannot recover existing links.
func (a *App) reportToken(orderID string) (string, string, error) {
	if len(a.ReportTokenSecret) != 32 {
		return "", "", errors.New("report_token_secret_missing")
	}
	mac := hmac.New(sha256.New, a.ReportTokenSecret)
	mac.Write([]byte("cotizalupa/report/v1/" + orderID))
	token := reportToken(base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))
	return string(token), string(token.hash()), nil
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
