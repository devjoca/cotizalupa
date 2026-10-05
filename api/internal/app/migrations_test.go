package app

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"cotizalupa/internal/migrations"

	"github.com/pressly/goose/v3"
)

func TestMigrations(t *testing.T) {
	if os.Getenv("COTIZALUPA_LOCAL_DB_TEST") != "1" {
		t.Skip("local PostgreSQL test is opt-in")
	}
	ctx := context.Background()
	db, err := sql.Open("pgx", "postgres://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa_test?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, initial := range []bool{false, true} {
		name := "fresh"
		if initial {
			name = "upgrade"
		}
		t.Run(name, func(t *testing.T) {
			if _, err := db.ExecContext(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public"); err != nil {
				t.Fatal(err)
			}
			if initial {
				provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations.Files, goose.WithDisableGlobalRegistry(true))
				if err != nil {
					t.Fatal(err)
				}
				if _, err := provider.UpTo(ctx, 1); err != nil {
					t.Fatal(err)
				}
				if _, err := db.ExecContext(ctx, `INSERT INTO orders(id, status, report_token_hash) VALUES ('00000000-0000-0000-0000-000000000001', 'READY_FOR_PAYMENT', 'synthetic-hash')`); err != nil {
					t.Fatal(err)
				}
			}
			if err := migrations.Up(ctx, db); err != nil {
				t.Fatal(err)
			}
			if err := migrations.Up(ctx, db); err != nil {
				t.Fatalf("repeat migration: %v", err)
			}
			var columns int
			if err := db.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name IN ('report_email_first_attempt_at', 'report_email_last_attempt_at', 'report_email_sent_at', 'report_email_id', 'report_email_last_error')`).Scan(&columns); err != nil {
				t.Fatal(err)
			}
			if columns != 5 {
				t.Fatalf("email columns = %d, want 5", columns)
			}
			if initial {
				var status string
				if err := db.QueryRowContext(ctx, `SELECT status FROM orders WHERE id='00000000-0000-0000-0000-000000000001'`).Scan(&status); err != nil {
					t.Fatal(err)
				}
				if status != "READY_FOR_PAYMENT" {
					t.Fatalf("existing order changed: %s", status)
				}
			}
			var applied int
			if err := db.QueryRowContext(ctx, `SELECT count(*) FROM goose_db_version WHERE version_id > 0 AND is_applied`).Scan(&applied); err != nil {
				t.Fatal(err)
			}
			if applied != 2 {
				t.Fatalf("applied migrations = %d, want 2", applied)
			}
		})
	}
}
