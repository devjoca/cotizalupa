package app

import (
	"context"
	"database/sql"
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
