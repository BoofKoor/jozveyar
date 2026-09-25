-- سفارش (برش ۳): جای ارسال، هویت با کد پیامکی، سفارش و پرداخت، پیامک (ADR-033، ADR-034).
--
-- تولیدی (drizzle-kit)، با یک افزوده: دو ردیف `shipping_zones` همین‌جا درج می‌شوند، پیش از کلید
-- خارجی تازهٔ `shipping_rates.zone_id`. نرخ‌های تعرفهٔ موجود به `tehran` و `other` اشاره می‌کنند و
-- بی این دو ردیف، افزودن کلید خارجی روی پایگاه دادهٔ پر می‌شکست. نامشان را `seedReferenceData` از
-- `@jozveyar/geo` به‌روز نگه می‌دارد. محافظ‌های دست‌نویس (قیمت منجمد، پوشش صفحه‌ها) در 0006.

CREATE TYPE "public"."color_mode" AS ENUM('color', 'bw');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'paid', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sides_mode" AS ENUM('single', 'double');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE "cities" (
	"id" integer PRIMARY KEY NOT NULL,
	"province_id" smallint NOT NULL,
	"name_fa" text NOT NULL,
	CONSTRAINT "cities_province_name" UNIQUE("province_id","name_fa"),
	CONSTRAINT "cities_id_province" UNIQUE("id","province_id")
);
--> statement-breakpoint
CREATE TABLE "order_item_sections" (
	"order_item_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"document_id" uuid NOT NULL,
	"page_count" integer NOT NULL,
	CONSTRAINT "order_item_sections_order_item_id_seq_pk" PRIMARY KEY("order_item_id","seq"),
	CONSTRAINT "order_item_sections_positive" CHECK ("order_item_sections"."seq" >= 1 AND "order_item_sections"."page_count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"page_count" integer NOT NULL,
	"copies" integer NOT NULL,
	"sides_mode" "sides_mode" NOT NULL,
	"binding_type_id" text NOT NULL,
	"print_pdf_key" text,
	"print_pdf_bytes" bigint,
	"print_pdf_sha256" text,
	"print_pdf_ready_at" timestamp with time zone,
	CONSTRAINT "order_items_order_seq" UNIQUE("order_id","seq"),
	CONSTRAINT "order_items_positive" CHECK ("order_items"."seq" >= 1 AND "order_items"."page_count" >= 1 AND "order_items"."copies" >= 1)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"note" jsonb
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"checkout_key" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'awaiting_payment' NOT NULL,
	"price_list_version" integer NOT NULL,
	"price_breakdown" jsonb NOT NULL,
	"quote_snapshot" jsonb,
	"subtotal_rials" bigint NOT NULL,
	"discount_rials" bigint DEFAULT 0 NOT NULL,
	"shipping_rials" bigint NOT NULL,
	"vat_rials" bigint DEFAULT 0 NOT NULL,
	"rounding_rials" bigint DEFAULT 0 NOT NULL,
	"total_rials" bigint NOT NULL,
	"est_weight_grams" integer NOT NULL,
	"sla_days" smallint NOT NULL,
	"paid_at" timestamp with time zone,
	"post_handoff_due_at" timestamp with time zone,
	"shipping_method_id" text NOT NULL,
	"shipping_zone_id" text NOT NULL,
	"province_id" smallint NOT NULL,
	"city_id" integer,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_text" text NOT NULL,
	"postal_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "orders_checkout_key_unique" UNIQUE("checkout_key"),
	CONSTRAINT "orders_total_adds_up" CHECK ("orders"."total_rials" = "orders"."subtotal_rials" - "orders"."discount_rials" + "orders"."shipping_rials" + "orders"."vat_rials" + "orders"."rounding_rials"),
	CONSTRAINT "orders_total_positive" CHECK ("orders"."total_rials" > 0),
	CONSTRAINT "orders_paid_has_dates" CHECK ("orders"."status" <> 'paid' OR ("orders"."paid_at" IS NOT NULL AND "orders"."post_handoff_due_at" IS NOT NULL)),
	CONSTRAINT "orders_sla_positive" CHECK ("orders"."sla_days" > 0),
	CONSTRAINT "orders_phone_normalized" CHECK ("orders"."recipient_phone" ~ '^09[0-9]{9}$'),
	CONSTRAINT "orders_postal_code" CHECK ("orders"."postal_code" IS NULL OR "orders"."postal_code" ~ '^[0-9]{10}$'),
	CONSTRAINT "orders_recipient_name" CHECK (length(btrim("orders"."recipient_name")) > 0),
	CONSTRAINT "orders_address_text" CHECK (length(btrim("orders"."address_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "otp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"code_hash" text NOT NULL,
	"session_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "otp_requests_mobile_normalized" CHECK ("otp_requests"."mobile" ~ '^09[0-9]{9}$'),
	CONSTRAINT "otp_requests_attempts" CHECK ("otp_requests"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"amount_rials" bigint NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"authority" text NOT NULL,
	"ref_id" text,
	"card_mask" text,
	"failure_code" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_rials" > 0),
	CONSTRAINT "payments_success_has_ref" CHECK ("payments"."status" <> 'succeeded' OR ("payments"."ref_id" IS NOT NULL AND "payments"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "print_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"page_ranges" jsonb NOT NULL,
	"color_mode" "color_mode" NOT NULL,
	"paper_type_id" text NOT NULL,
	CONSTRAINT "print_rules_item_seq" UNIQUE("order_item_id","seq"),
	CONSTRAINT "print_rules_seq_positive" CHECK ("print_rules"."seq" >= 1)
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL,
	"shipping_zone_id" text NOT NULL,
	CONSTRAINT "provinces_name_fa_unique" UNIQUE("name_fa")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name_fa" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "shipping_zones" ("id", "name_fa") VALUES ('tehran', 'استان تهران'), ('other', 'بقیهٔ کشور');--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"to_mobile" text NOT NULL,
	"purpose" text NOT NULL,
	"body" text,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "users_mobile_normalized" CHECK ("users"."mobile" ~ '^09[0-9]{9}$')
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_sections" ADD CONSTRAINT "order_item_sections_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_sections" ADD CONSTRAINT "order_item_sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_city_province_fk" FOREIGN KEY ("city_id","province_id") REFERENCES "public"."cities"("id","province_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_fk" FOREIGN KEY ("price_list_version","shipping_method_id") REFERENCES "public"."shipping_methods"("price_list_version","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_rules" ADD CONSTRAINT "print_rules_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_sections_document" ON "order_item_sections" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "order_status_events_order" ON "order_status_events" USING btree ("order_id","at");--> statement-breakpoint
CREATE INDEX "orders_user" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_due" ON "orders" USING btree ("status","post_handoff_due_at");--> statement-breakpoint
CREATE INDEX "otp_requests_mobile" ON "otp_requests" USING btree ("mobile","created_at");--> statement-breakpoint
CREATE INDEX "otp_requests_ip" ON "otp_requests" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "otp_requests_created" ON "otp_requests" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_authority" ON "payments" USING btree ("provider","authority");--> statement-breakpoint
CREATE INDEX "payments_order" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sms_messages_to" ON "sms_messages" USING btree ("to_mobile","created_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_order_kind" ON "jobs" USING btree ("order_id","kind");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_one_target" CHECK ("jobs"."document_id" IS NULL OR "jobs"."order_id" IS NULL);