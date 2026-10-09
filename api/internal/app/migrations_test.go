package app

import (
	"context"
	"database/sql"
	"regexp"
	"slices"
	"testing"

	"cotizalupa/internal/migrations"
)

func TestInitialMigrationInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	pool := isolatedDB(t)
	db, err := sql.Open("pgx", localDatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrations.Up(ctx, db); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	var applied int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM goose_db_version WHERE version_id > 0 AND is_applied`).Scan(&applied); err != nil {
		t.Fatal(err)
	}
	if applied != 1 {
		t.Fatalf("applied migrations = %d, want 1", applied)
	}
	var columns int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name IN (
		'report_email_first_attempt_at', 'report_email_last_attempt_at', 'report_email_sent_at', 'report_email_id', 'report_email_last_error',
		'meta_fbc', 'meta_purchase_last_attempt_at', 'meta_purchase_sent_at')`).Scan(&columns); err != nil {
		t.Fatal(err)
	}
	if columns != 8 {
		t.Fatalf("email and Meta columns = %d, want 8", columns)
	}
}

// The Go status and file-kind lists must be exactly what the schema accepts.
func TestSchemaChecksMatchGoTypesInLocalPostgres(t *testing.T) {
	requireLocalDB(t)
	ctx := context.Background()
	pool := isolatedDB(t)
	quoted := regexp.MustCompile(`'([^']+)'`)
	allowed := func(table, column string) []string {
		var definition string
		if err := pool.QueryRow(ctx, `SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
			JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
			WHERE c.contype='c' AND c.conrelid=$1::regclass AND a.attname=$2`, table, column).Scan(&definition); err != nil {
			t.Fatalf("%s.%s check: %v", table, column, err)
		}
		var values []string
		for _, match := range quoted.FindAllStringSubmatch(definition, -1) {
			values = append(values, match[1])
		}
		slices.Sort(values)
		return values
	}
	var statuses, mimes []string
	for _, status := range orderStatuses {
		statuses = append(statuses, string(status))
	}
	for _, kind := range fileKinds {
		mimes = append(mimes, kind.mime)
	}
	slices.Sort(statuses)
	slices.Sort(mimes)
	if got := allowed("orders", "status"); !slices.Equal(got, statuses) {
		t.Fatalf("orders.status check = %v, Go = %v", got, statuses)
	}
	if got := allowed("order_files", "mime"); !slices.Equal(got, mimes) {
		t.Fatalf("order_files.mime check = %v, Go = %v", got, mimes)
	}
}
