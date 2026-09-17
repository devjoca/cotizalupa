CREATE TABLE "order_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"blob_path" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"pages" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"country" text DEFAULT 'PE' NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"amount_cents" integer,
	"perspective" text,
	"category" text,
	"moment" text,
	"user_context" text,
	"email" text,
	"report_token_hash" text NOT NULL,
	"payment_provider" text,
	"payment_transaction_id" text,
	"precheck_result" jsonb,
	"processing_started_at" timestamp with time zone,
	"delete_after" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"refund_requested_at" timestamp with time zone,
	"fbp" text,
	"fbc" text,
	"client_user_agent" text,
	"client_ip" text,
	"meta_purchase_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_report_token_hash_unique" UNIQUE("report_token_hash")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
	"cost_usd" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_files_order_position_idx" ON "order_files" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_delete_after_idx" ON "orders" USING btree ("delete_after");