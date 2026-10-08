package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
)

var testTokenSecret = reportTokenSecret{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1}

func TestReportTokenSurvivesRestart(t *testing.T) {
	secret, err := parseReportTokenSecret(strings.Repeat("01", 32))
	if err != nil || secret != testTokenSecret {
		t.Fatalf("secret parse failed: %v", err)
	}
	token := secret.token("synthetic-order")
	recovered := testTokenSecret.token("synthetic-order")
	if token != recovered || token.hash() != recovered.hash() {
		t.Fatal("link did not survive restart")
	}
	if parsed, ok := parseReportToken(string(token)); !ok || parsed != token {
		t.Fatal("issued token does not parse")
	}
	changed := reportTokenSecret{2}.token("synthetic-order")
	if token == testTokenSecret.token("another-order") || token == changed {
		t.Fatal("token must depend on both order and secret")
	}
	for _, value := range []string{"", "zz", strings.Repeat("01", 31), strings.Repeat("01", 33)} {
		if _, err := parseReportTokenSecret(value); err == nil {
			t.Fatalf("invalid secret accepted: %q", value)
		}
	}
}

func TestRequiredEmailValidation(t *testing.T) {
	for _, value := range []string{"", "bad", "a@localhost", "Name <a@example.test>", "a@example.test\r\nBcc:x@example.test", "a b@example.test"} {
		if validEmail(value) {
			t.Fatalf("invalid address accepted: %q", value)
		}
	}
	if !validEmail("person+report@example.test") {
		t.Fatal("valid address rejected")
	}
	c := reviewContext{Concern: "Ya pagué un adelanto del 30%."}
	if err := c.normalize(); err == nil {
		t.Fatal("submission without email accepted")
	}
	c.Email = " person@example.test "
	if err := c.normalize(); err != nil || c.Email != "person@example.test" {
		t.Fatal("email normalization failed")
	}
}

func TestSituationIsRequired(t *testing.T) {
	base := reviewContext{Email: "person@example.test"}
	for _, value := range []string{"", "   ", "muy corto", strings.Repeat("a", maxConcernRunes+1)} {
		c := base
		c.Concern = value
		if err := c.normalize(); err == nil {
			t.Fatalf("invalid situation accepted: %q", value)
		}
	}
	c := base
	c.Concern = "  Estoy por   aceptar\n y me preocupa el plazo.  "
	if err := c.normalize(); err != nil || c.Concern != "Estoy por aceptar y me preocupa el plazo." {
		t.Fatalf("valid situation rejected or not cleaned: %q %v", c.Concern, err)
	}
}

// Random links represent legacy orders in tests only.
func newReportToken() (string, string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	digest := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(digest[:]), nil
}
