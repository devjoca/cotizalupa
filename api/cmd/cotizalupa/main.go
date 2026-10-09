package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cotizalupa/internal/app"
	"cotizalupa/internal/migrations"

	"github.com/pressly/goose/v3"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if len(os.Args) > 1 && (os.Args[1] == "migrate" || os.Args[1] == "migration-create") {
		if err := migrationCommand(ctx, os.Args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, "migration command failed:", err)
			os.Exit(1)
		}
		return
	}
	app.InitMonitoring()
	service, err := app.New(ctx)
	if err != nil {
		slog.Error("startup failed", "error", err.Error())
		app.CaptureOperationalError("startup_failed", nil)
		app.FlushMonitoring(2 * time.Second)
		os.Exit(1)
	}
	defer service.Close()
	if len(os.Args) > 1 && os.Args[1] == "drain" {
		err = service.Drain(ctx)
	} else {
		err = service.Run(ctx)
	}
	if err != nil {
		slog.Error("service failed", "error", err.Error())
		app.CaptureOperationalError("service_failed", nil)
		app.FlushMonitoring(2 * time.Second)
		os.Exit(1)
	}
}

func migrationCommand(ctx context.Context, args []string) error {
	if args[0] == "migration-create" {
		if len(args) != 2 {
			return fmt.Errorf("usage: migration-create NAME")
		}
		return goose.Create(nil, "internal/migrations", args[1], "sql")
	}
	if len(args) != 1 {
		return fmt.Errorf("usage: migrate")
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		if os.Getenv("RAILWAY_ENVIRONMENT_ID") != "" {
			return fmt.Errorf("DATABASE_URL is required")
		}
		dbURL = "postgres://cotizalupa:cotizalupa@127.0.0.1:55432/cotizalupa?sslmode=disable"
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return fmt.Errorf("invalid DATABASE_URL")
	}
	defer db.Close()
	// Connection errors can contain credentials, so keep those out of output.
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("database connection failed")
	}
	if err := migrations.Up(ctx, db); err != nil {
		return err
	}
	fmt.Println("Database migrations applied.")
	return nil
}
