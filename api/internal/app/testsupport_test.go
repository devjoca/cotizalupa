package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"mime/multipart"
	"net/textproto"
	"os"
	"strings"
	"testing"

	"cotizalupa/internal/migrations"

	"github.com/jackc/pgx/v5/pgxpool"
)

const localDatabaseURL = "postgres://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa_test?sslmode=disable"

// requireLocalDB gates tests that need Docker PostgreSQL, matching the opt-in
// flag the rest of the suite uses.
func requireLocalDB(t *testing.T) {
	t.Helper()
	if os.Getenv("COTIZALUPA_LOCAL_DB_TEST") != "1" {
		t.Skip("local PostgreSQL test is opt-in")
	}
}

// isolatedDB resets the dedicated cotizalupa_test database to the shipped
// migration and returns a pool bound to it. Tests never share the development
// database, so they cannot see or disturb its rows. Not safe for parallel use.
func isolatedDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, localDatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	// Shipped foreign keys reference "public", so the fresh schema
	// must be public rather than a per-test schema.
	for _, statement := range []string{"DROP SCHEMA IF EXISTS public CASCADE", "CREATE SCHEMA public"} {
		if _, err := pool.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	migrationDB, err := sql.Open("pgx", localDatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer migrationDB.Close()
	if err := migrations.Up(ctx, migrationDB); err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	return pool
}

// onePagePNG is a 1x1 PNG used by the mechanical-validation tests.
var onePagePNG = func() []byte {
	data, err := base64.StdEncoding.DecodeString(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	)
	if err != nil {
		panic(err)
	}
	return data
}()

// syntheticPDF builds a small, structurally complete PDF in memory, the same
// shape the previous fixture generator produced. No customer document is used.
func syntheticPDF(pages [][]string) []byte {
	objects := []string{"", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"}
	kids := make([]int, 0, len(pages))
	for _, lines := range pages {
		pageID := len(objects) + 1
		streamID := pageID + 1
		kids = append(kids, pageID)
		content := "BT /F1 12 Tf 50 740 Td"
		for _, line := range lines {
			escaped := strings.NewReplacer("\\", "\\\\", "(", "\\(", ")", "\\)").Replace(line)
			content += fmt.Sprintf("\n(%s) Tj\n0 -20 Td", escaped)
		}
		content += "\nET"
		objects = append(objects,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>", streamID),
			fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content),
		)
	}
	objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
	references := make([]string, 0, len(kids))
	for _, id := range kids {
		references = append(references, fmt.Sprintf("%d 0 R", id))
	}
	objects[1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(references, " "), len(kids))
	pdf := "%PDF-1.4\n"
	offsets := make([]int, 0, len(objects))
	for i, object := range objects {
		offsets = append(offsets, len(pdf))
		pdf += fmt.Sprintf("%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := len(pdf)
	pdf += fmt.Sprintf("xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets {
		pdf += fmt.Sprintf("%010d 00000 n \n", offset)
	}
	pdf += fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return []byte(pdf)
}

// multipartPart renders a single form part and returns it for validateFile.
func multipartPart(t *testing.T, field, filename, contentType string, content []byte) *multipart.Part {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", fmt.Sprintf("form-data; name=%q; filename=%q", field, filename))
	if contentType != "" {
		header.Set("Content-Type", contentType)
	}
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	next, err := multipart.NewReader(&body, writer.Boundary()).NextPart()
	if err != nil {
		t.Fatal(err)
	}
	return next
}

// validateUpload runs one file through validateFile and cleans up its temp file.
func validateUpload(t *testing.T, filename, contentType string, content []byte, position int, remaining int64) (preparedFile, error) {
	t.Helper()
	file, err := validateFile(context.Background(), multipartPart(t, "files", filename, contentType, content), position, remaining)
	if file.Temp != nil {
		path := file.Temp.Name()
		t.Cleanup(func() {
			_ = file.Temp.Close()
			_ = os.Remove(path)
		})
	}
	return file, err
}
