CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_rials" bigint NOT NULL,
	"fee_rials" bigint,
	"method" text NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"gateway_ref" text,
	"reference" text,
	"refunded_on" timestamp with time zone,
	"note" text,
	"gateway_status" smallint,
	"gateway_error" text,
	"gateway_checked_at" timestamp with time zone,
	"failure_reason" text,
	"settled_via" text,
	"admin_user_id" uuid NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_rials" > 0),
	CONSTRAINT "refunds_method" CHECK (("refunds"."method" = 'gateway' AND "refunds"."fee_rials" IS NOT NULL AND "refunds"."fee_rials" >= 0 AND "refunds"."refunded_on" IS NULL AND "refunds"."note" IS NULL)
       OR ("refunds"."method" = 'manual' AND "refunds"."fee_rials" IS NULL AND "refunds"."status" = 'succeeded' AND "refunds"."reference" IS NOT NULL
           AND "refunds"."refunded_on" IS NOT NULL AND "refunds"."gateway_ref" IS NULL AND "refunds"."gateway_status" IS NULL AND "refunds"."gateway_error" IS NULL
           AND "refunds"."gateway_checked_at" IS NULL AND "refunds"."settled_via" IS NULL AND "refunds"."raw" IS NULL)),
	CONSTRAINT "refunds_finished" CHECK (("refunds"."status" = 'pending') = ("refunds"."finished_at" IS NULL)
       AND ("refunds"."status" = 'failed') = ("refunds"."failure_reason" IS NOT NULL)
       AND ("refunds"."settled_via" IS NULL OR ("refunds"."settled_via" IN ('request', 'auto', 'panel') AND "refunds"."status" <> 'pending'))
       AND ("refunds"."method" = 'manual' OR "refunds"."status" = 'pending' OR "refunds"."settled_via" IS NOT NULL)),
	CONSTRAINT "refunds_failure_reason" CHECK ("refunds"."failure_reason" IS NULL OR "refunds"."failure_reason" IN ('balance', 'ip', 'token', 'unconfigured', 'not_found', 'other')),
	CONSTRAINT "refunds_reference" CHECK ("refunds"."reference" IS NULL OR "refunds"."reference" ~ '^[0-9A-Za-z-]{3,40}$'),
	CONSTRAINT "refunds_gateway_ref" CHECK ("refunds"."gateway_ref" IS NULL OR "refunds"."gateway_ref" ~ '^[0-9A-Za-z_-]{1,64}$'),
	CONSTRAINT "refunds_note" CHECK ("refunds"."note" IS NULL OR length(btrim("refunds"."note")) BETWEEN 1 AND 200),
	CONSTRAINT "refunds_refunded_on" CHECK ("refunds"."refunded_on" IS NULL OR "refunds"."refunded_on" <= "refunds"."created_at"),
	CONSTRAINT "refunds_gateway_error" CHECK ("refunds"."gateway_error" IS NULL OR "refunds"."gateway_error" ~ '^(unavailable|rejected|malformed|unconfigured)(:-?[0-9]{1,9})?$')
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order" ON "refunds" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "refunds_payment" ON "refunds" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_one_pending" ON "refunds" USING btree ("payment_id") WHERE "refunds"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "refunds_pending" ON "refunds" USING btree ("created_at") WHERE "refunds"."status" = 'pending';