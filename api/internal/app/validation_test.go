package app

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestValidateFileMechanicalRules(t *testing.T) {
	validPDF := syntheticPDF([][]string{{"COTIZACION SINTETICA", "Precio total: PEN 1800."}})

	t.Run("accepts a one-page PDF and computes sha256", func(t *testing.T) {
		file, err := validateUpload(t, "quote.pdf", "application/pdf", validPDF, 0, maxOrderBytes)
		if err != nil {
			t.Fatal(err)
		}
		if file.Mime != "application/pdf" || file.Pages == nil || *file.Pages != 1 {
			t.Fatalf("unexpected result: %+v", file)
		}
		if file.Size != int64(len(validPDF)) || file.Position != 0 {
			t.Fatalf("unexpected size or position: %+v", file)
		}
		if len(file.SHA256) != 64 {
			t.Fatalf("sha256 not hex-encoded: %q", file.SHA256)
		}
	})

	t.Run("rejects an eleven-page PDF", func(t *testing.T) {
		pages := make([][]string, 11)
		for i := range pages {
			pages[i] = []string{"PAGINA SINTETICA"}
		}
		if _, err := validateUpload(t, "quote.pdf", "application/pdf", syntheticPDF(pages), 0, maxOrderBytes); err == nil {
			t.Fatal("eleven-page PDF accepted")
		}
	})

	t.Run("rejects bytes that claim to be a PDF but cannot be parsed", func(t *testing.T) {
		if _, err := validateUpload(t, "quote.pdf", "application/pdf", []byte("%PDF-1.7\nnot-a-real-pdf"), 0, maxOrderBytes); err == nil {
			t.Fatal("broken PDF accepted")
		}
	})

	t.Run("accepts a PNG and rejects implausible dimensions", func(t *testing.T) {
		file, err := validateUpload(t, "quote.png", "image/png", onePagePNG, 0, maxOrderBytes)
		if err != nil || file.Mime != "image/png" || file.Pages != nil {
			t.Fatalf("valid PNG rejected: %+v (%v)", file, err)
		}
		huge := bytes.Clone(onePagePNG)
		binary.BigEndian.PutUint32(huge[16:20], 100_000)
		if _, err := validateUpload(t, "quote.png", "image/png", huge, 0, maxOrderBytes); err == nil {
			t.Fatal("implausible image dimensions accepted")
		}
	})

	t.Run("accepts a small JPEG", func(t *testing.T) {
		jpeg, err := os.ReadFile(filepath.Join("..", "..", "..", "fixtures", "valid-tiny.jpg"))
		if err != nil {
			t.Fatal(err)
		}
		file, err := validateUpload(t, "quote.jpg", "image/jpeg", jpeg, 0, maxOrderBytes)
		if err != nil || file.Mime != "image/jpeg" {
			t.Fatalf("valid JPEG rejected: %+v (%v)", file, err)
		}
	})

	t.Run("rejects a claimed MIME that does not match the bytes", func(t *testing.T) {
		if _, err := validateUpload(t, "quote.pdf", "application/pdf", onePagePNG, 0, maxOrderBytes); err == nil {
			t.Fatal("MIME mismatch accepted")
		}
	})

	t.Run("rejects a file beyond the remaining size budget", func(t *testing.T) {
		if _, err := validateUpload(t, "quote.png", "image/png", onePagePNG, 0, int64(len(onePagePNG)-1)); err == nil {
			t.Fatal("oversized upload accepted")
		}
	})

	t.Run("rejects an unexpected form field", func(t *testing.T) {
		part := multipartPart(t, "context", "quote.png", "image/png", onePagePNG)
		file, err := validateFile(t.Context(), part, 0, maxOrderBytes)
		if file.Temp != nil {
			_ = file.Temp.Close()
			_ = os.Remove(file.Temp.Name())
		}
		if err == nil {
			t.Fatal("unexpected form field accepted")
		}
	})
}

// multipartUploadBody builds a request body with explicit per-file MIME types,
// so validateFile sees the same headers a browser would send.
func multipartUploadBody(t *testing.T, mime, name string, contents [][]byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for i, content := range contents {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", fmt.Sprintf("form-data; name=%q; filename=%q", "files", fmt.Sprintf("%s-%d", name, i)))
		header.Set("Content-Type", mime)
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, writer.FormDataContentType()
}

func TestPrepareReviewRejectsSixthFileBeforePersisting(t *testing.T) {
	// DB and bucket are nil: reaching either would panic, proving the count
	// limit rejects the upload before any persistence work.
	service := &App{rate: map[string][]time.Time{}}
	body, contentType := multipartUploadBody(t, "image/png", "quote.png", [][]byte{
		onePagePNG, onePagePNG, onePagePNG, onePagePNG, onePagePNG, onePagePNG,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/reviews", body)
	request.Header.Set("Content-Type", contentType)
	response := httptest.NewRecorder()
	service.prepareReview(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("sixth file status %d (%s)", response.Code, response.Body.String())
	}
}

func TestAllowPrepareLimits(t *testing.T) {
	t.Run("caps an IP's submissions per hour and resets after", func(t *testing.T) {
		service := &App{rate: map[string][]time.Time{}}
		now := time.Unix(1_800_000_000, 0)
		for i := 0; i < uploadsPerIPPerHour; i++ {
			if !service.allowPrepare("ip", now) {
				t.Fatalf("submission %d denied", i+1)
			}
			service.donePrepare()
		}
		if service.allowPrepare("ip", now) {
			t.Fatal("submission over the hourly cap allowed")
		}
		if !service.allowPrepare("ip", now.Add(time.Hour)) {
			t.Fatal("submission denied after the window elapsed")
		}
	})

	t.Run("caps concurrent preparation and releases a slot", func(t *testing.T) {
		service := &App{rate: map[string][]time.Time{}}
		now := time.Unix(1_800_000_000, 0)
		for i := 0; i < concurrentPreparations; i++ {
			if !service.allowPrepare(fmt.Sprint("ip-", i), now) {
				t.Fatalf("concurrent submission %d denied", i+1)
			}
		}
		if service.allowPrepare("extra", now) {
			t.Fatal("submission over the concurrency cap allowed")
		}
		service.donePrepare()
		if !service.allowPrepare("extra", now) {
			t.Fatal("released slot not reused")
		}
	})
}

func TestRequestIPIgnoresClientSuppliedForwardedEntries(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/reviews", nil)
	request.Header.Set("X-Forwarded-For", "203.0.113.9, 198.51.100.7")
	if ip := requestIP(request); ip != "198.51.100.7" {
		t.Fatalf("got %q, want the proxy-appended address", ip)
	}
}
