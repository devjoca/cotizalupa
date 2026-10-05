package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestSweepDueOriginalsInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	service := &App{DB: db}

	createDueFile := func() string {
		orderID, fileID := uuid.NewString(), uuid.NewString()
		if _, err := db.Exec(ctx, `INSERT INTO orders(id,status,report_token_hash,delete_after)
			VALUES($1,'EXPIRED',$2,now()-interval '1 day')`, orderID, uuid.NewString()); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, `INSERT INTO order_files(id,order_id,position,blob_path,mime,size_bytes,sha256)
			VALUES($1,$2,0,$3,'application/pdf',10,'abc')`, fileID, orderID, "orders/"+orderID+"/0.pdf"); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_, _ = db.Exec(ctx, `DELETE FROM order_files WHERE order_id=$1`, orderID)
			_, _ = db.Exec(ctx, `DELETE FROM orders WHERE id=$1`, orderID)
		})
		return fileID
	}

	t.Run("records deleted_at only after the bucket deletion succeeds", func(t *testing.T) {
		fileID := createDueFile()
		called := false
		deleted, failed, err := service.sweepDueOriginals(ctx, func(string) error {
			called = true
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
		if !called || !contains(deleted, fileID) || contains(failed, fileID) {
			t.Fatalf("called=%v deleted=%v failed=%v", called, deleted, failed)
		}
		if deletedAt := fileDeletedAt(t, db, fileID); deletedAt == nil {
			t.Fatal("deleted_at not recorded after a successful bucket deletion")
		}
	})

	t.Run("keeps metadata retryable when the bucket deletion fails", func(t *testing.T) {
		fileID := createDueFile()
		deleted, failed, err := service.sweepDueOriginals(ctx, func(string) error {
			return errors.New("bucket unavailable")
		})
		if err != nil {
			t.Fatal(err)
		}
		if contains(deleted, fileID) || !contains(failed, fileID) {
			t.Fatalf("deleted=%v failed=%v", deleted, failed)
		}
		if deletedAt := fileDeletedAt(t, db, fileID); deletedAt != nil {
			t.Fatal("deleted_at recorded without a successful bucket deletion")
		}
	})
}

// Only a completed bucket write may open an order for payment. A fake S3
// endpoint stands in for the bucket so the failure is deterministic.
func TestPrepareReviewStagesOriginalsInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	db := isolatedDB(t)
	bucketStatus := http.StatusOK
	fakeS3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("ETag", `"synthetic"`)
		w.WriteHeader(bucketStatus)
	}))
	t.Cleanup(fakeS3.Close)
	bucket, err := minio.New(strings.TrimPrefix(fakeS3.URL, "http://"), &minio.Options{
		Creds: credentials.NewStaticV4("key", "secret", ""), Region: "auto", BucketLookup: minio.BucketLookupPath, MaxRetries: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	service := &App{DB: db, Bucket: bucket, BucketName: "test", ReportTokenSecret: make([]byte, 32), rate: map[string][]time.Time{}}

	upload := func(ip string) (string, string) {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		_ = writer.WriteField("context", `{"perspective":"customer","concern":"Estoy por aceptar o pagar un adelanto.","email":"cliente@example.com"}`)
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="files"; filename="quote.png"`)
		header.Set("Content-Type", "image/png")
		part, _ := writer.CreatePart(header)
		_, _ = part.Write(onePagePNG)
		_ = writer.Close()
		request := httptest.NewRequest(http.MethodPost, "/api/reviews", &body)
		request.Header.Set("Content-Type", writer.FormDataContentType())
		request.RemoteAddr = ip
		response := httptest.NewRecorder()
		service.prepareReview(response, request)
		var result struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatalf("response %d: %s", response.Code, response.Body.String())
		}
		var status string
		if err := db.QueryRow(ctx, `SELECT status FROM orders ORDER BY created_at DESC LIMIT 1`).Scan(&status); err != nil {
			t.Fatal(err)
		}
		return result.Status, status
	}

	if response, order := upload("192.0.2.1:1"); response != "READY_FOR_PAYMENT" || order != "READY_FOR_PAYMENT" {
		t.Fatalf("successful write: response=%s order=%s", response, order)
	}
	bucketStatus = http.StatusForbidden
	if response, order := upload("192.0.2.2:1"); response != "STORAGE_FAILED" || order != "REJECTED" {
		t.Fatalf("failed write: response=%s order=%s", response, order)
	}
}

func fileDeletedAt(t *testing.T, db *pgxpool.Pool, fileID string) *time.Time {
	t.Helper()
	var deletedAt *time.Time
	if err := db.QueryRow(context.Background(), `SELECT deleted_at FROM order_files WHERE id=$1`, fileID).Scan(&deletedAt); err != nil {
		t.Fatal(err)
	}
	return deletedAt
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
