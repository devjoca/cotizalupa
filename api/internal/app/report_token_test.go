package app

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"testing"
)

func TestReportTokenSurvivesRestart(t *testing.T) {
	a := &App{ReportTokenSecret: bytes.Repeat([]byte{1}, 32)}
	b := &App{ReportTokenSecret: bytes.Repeat([]byte{1}, 32)}
	token, hash, err := a.reportToken("synthetic-order")
	recovered, recoveredHash, otherErr := b.reportToken("synthetic-order")
	if err != nil || otherErr != nil || token != recovered || hash != recoveredHash || !reportTokenPattern.MatchString(token) {
		t.Fatal("link did not survive restart")
	}
	other, _, _ := a.reportToken("another-order")
	b.ReportTokenSecret = bytes.Repeat([]byte{2}, 32)
	changed, _, _ := b.reportToken("synthetic-order")
	if token == other || token == changed {
		t.Fatal("token must depend on both order and secret")
	}
	if _, _, err := (&App{}).reportToken("order"); err == nil {
		t.Fatal("missing secret accepted")
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
	c := reviewContext{Perspective: "customer", Concern: "Ya pagué un adelanto del 30%."}
	if err := c.normalize(); err == nil {
		t.Fatal("submission without email accepted")
	}
	c.Email = " person@example.test "
	if err := c.normalize(); err != nil || c.Email != "person@example.test" {
		t.Fatal("email normalization failed")
	}
}

func TestSituationIsRequired(t *testing.T) {
	base := reviewContext{Perspective: "customer", Email: "person@example.test"}
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
