-- +goose Up
CREATE TABLE "order_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"blob_path" text NOT NULL,
	"mime" text NOT NULL CHECK ("mime" IN ('application/pdf','image/png','image/jpeg')),
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"pages" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL CHECK ("status" IN ('CREATED','READY_FOR_PAYMENT','REJECTED','PAYMENT_PENDING','PAID',
		'PROCESSING','COMPLETED','PROCESSING_FAILED','EXPIRED','REFUNDED')),
	"user_context" text,
	"email" text,
	"report_email_first_attempt_at" timestamp with time zone,
	"report_email_last_attempt_at" timestamp with time zone,
	"report_email_sent_at" timestamp with time zone,
	"report_email_id" text,
	"report_email_last_error" text,
	"report_token_hash" text NOT NULL,
	"payment_provider" text,
	"payment_transaction_id" text,
	"meta_fbc" text,
	"meta_purchase_last_attempt_at" timestamp with time zone,
	"meta_purchase_sent_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"delete_after" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_report_token_hash_unique" UNIQUE("report_token_hash")
);


CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"order_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id")
);


CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"model" text,
	"reasoning_effort" text,
	"prompt_version" text,
	"schema_version" text,
	"result" jsonb NOT NULL,
	"quotation_facts" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_order_id_unique" UNIQUE("order_id")
);


ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "reports" ADD CONSTRAINT "reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "order_files_order_position_idx" ON "order_files" USING btree ("order_id","position");

CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");

CREATE INDEX "orders_delete_after_idx" ON "orders" USING btree ("delete_after");

CREATE INDEX "orders_meta_purchase_due_idx" ON "orders" USING btree ("paid_at")
	WHERE "meta_fbc" IS NOT NULL AND "meta_purchase_sent_at" IS NULL;
