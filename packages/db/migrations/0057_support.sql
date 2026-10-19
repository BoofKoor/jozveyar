CREATE TABLE "support_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"admin_user_id" uuid,
	"body" text,
	"request_id" uuid NOT NULL,
	"sms_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_messages_kind" CHECK ("support_messages"."kind" IN ('customer', 'staff', 'closed')),
	CONSTRAINT "support_messages_author" CHECK (("support_messages"."kind" = 'customer') = ("support_messages"."admin_user_id" IS NULL)),
	CONSTRAINT "support_messages_body" CHECK (CASE "support_messages"."kind"
        WHEN 'closed' THEN "support_messages"."body" IS NULL
        ELSE "support_messages"."body" IS NOT NULL AND length("support_messages"."body") <= (CASE "support_messages"."kind" WHEN 'staff' THEN 2000 ELSE 1000 END)
          AND btrim("support_messages"."body", E' \n') <> '' AND "support_messages"."body" = btrim("support_messages"."body", E' \n')
      END),
	CONSTRAINT "support_messages_sms_staff" CHECK ("support_messages"."sms_message_id" IS NULL OR "support_messages"."kind" = 'staff')
);
--> statement-breakpoint
CREATE TABLE "support_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"waiting_since" timestamp with time zone,
	"customer_seen_at" timestamp with time zone,
	CONSTRAINT "support_threads_status" CHECK ("support_threads"."status" IN ('open', 'answered', 'closed')),
	CONSTRAINT "support_threads_waiting" CHECK (("support_threads"."status" = 'open') = ("support_threads"."waiting_since" IS NOT NULL)),
	CONSTRAINT "support_threads_times" CHECK ("support_threads"."last_message_at" >= "support_threads"."created_at" AND ("support_threads"."waiting_since" IS NULL OR ("support_threads"."waiting_since" >= "support_threads"."created_at" AND "support_threads"."waiting_since" <= "support_threads"."last_message_at")))
);
--> statement-breakpoint
ALTER TABLE "service_secrets" DROP CONSTRAINT "service_secrets_name";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_purpose";--> statement-breakpoint
ALTER TABLE "sms_messages" DROP CONSTRAINT "sms_messages_queued";--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_support_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_thread" ON "support_messages" USING btree ("thread_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_request" ON "support_messages" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_messages_sms" ON "support_messages" USING btree ("sms_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_threads_order" ON "support_threads" USING btree ("order_id") WHERE "support_threads"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_threads_general" ON "support_threads" USING btree ("user_id") WHERE "support_threads"."order_id" IS NULL;--> statement-breakpoint
CREATE INDEX "support_threads_user" ON "support_threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "support_threads_inbox" ON "support_threads" USING btree ("status","waiting_since");--> statement-breakpoint
ALTER TABLE "service_secrets" ADD CONSTRAINT "service_secrets_name" CHECK ("service_secrets"."name" IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'SMS_PARTNER_TEMPLATE', 'SMS_SUPPORT_TEMPLATE', 'PAYMENT_MERCHANT_ID'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_purpose" CHECK ("sms_messages"."purpose" IN ('otp', 'order_paid', 'tracking', 'partner_order', 'support_reply'));--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_queued" CHECK ("sms_messages"."status" NOT IN ('pending', 'sending') OR ("sms_messages"."purpose" IN ('tracking', 'order_paid', 'partner_order', 'support_reply') AND "sms_messages"."body" IS NOT NULL));