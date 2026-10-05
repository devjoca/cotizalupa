-- +goose Up
ALTER TABLE "orders" ADD COLUMN "report_email_first_attempt_at" timestamp with time zone;

ALTER TABLE "orders" ADD COLUMN "report_email_last_attempt_at" timestamp with time zone;

ALTER TABLE "orders" ADD COLUMN "report_email_sent_at" timestamp with time zone;

ALTER TABLE "orders" ADD COLUMN "report_email_id" text;

ALTER TABLE "orders" ADD COLUMN "report_email_last_error" text;
