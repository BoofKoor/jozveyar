-- ورود فایل پست و مرسوله‌ها (برش ۶٫۱، ADR-045، ADR-046): `shipment_imports` (هر فایل با بایت‌های خامش)، `shipment_import_rows` (سطرها
-- و حکم‌ها، در تراکنش «ثبت») و `shipments` (هر بسته با کد رهگیری، وزن، کرایه و مالیات واقعی)؛ و ستون `jobs.shipment_import_id` برای
-- کار `read_post_file` کارگر، که `jobs_one_target` را به سه هدف می‌برد.
--
-- تولیدی (drizzle-kit): جدول‌ها، CHECKها، ایندکس‌های یکتای جزئی (همان فایل یک بار، بارکد و سطر یکتا میان مرسوله‌های زنده) و
-- کلیدهای خارجی. گذار وضعیت، فقط‌افزودنی و «مرسولهٔ زنده فقط در تحویل پست شد» تریگرند و در 0022، دست‌نویس.

CREATE TABLE "shipment_import_rows" (
	"import_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"cells" jsonb,
	"barcode" text,
	"order_number" integer,
	"name_g" text,
	"destination" text,
	"weight_grams" integer,
	"fare_rials" bigint,
	"tax_rials" bigint,
	"post_day" timestamp with time zone,
	"post_status" text,
	"verdict" text NOT NULL,
	"reason" text,
	"order_id" uuid,
	CONSTRAINT "shipment_import_rows_import_id_row_no_pk" PRIMARY KEY("import_id","row_no"),
	CONSTRAINT "shipment_import_rows_row_no" CHECK ("shipment_import_rows"."row_no" > 0),
	CONSTRAINT "shipment_import_rows_verdict" CHECK ("shipment_import_rows"."verdict" IN ('matched', 'review', 'unmatched', 'duplicate', 'invalid', 'inactive', 'total')),
	CONSTRAINT "shipment_import_rows_barcode" CHECK ("shipment_import_rows"."barcode" IS NULL OR "shipment_import_rows"."barcode" ~ '^[0-9]{24}$'),
	CONSTRAINT "shipment_import_rows_matched" CHECK ("shipment_import_rows"."verdict" <> 'matched' OR ("shipment_import_rows"."barcode" IS NOT NULL AND "shipment_import_rows"."order_id" IS NOT NULL AND "shipment_import_rows"."weight_grams" > 0 AND "shipment_import_rows"."fare_rials" >= 0 AND "shipment_import_rows"."tax_rials" >= 0 AND "shipment_import_rows"."post_day" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shipment_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrier" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"raw" "bytea",
	"status" text DEFAULT 'reading' NOT NULL,
	"format" text,
	"tables" jsonb,
	"error_code" text,
	"print_partner_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"committed_by" uuid,
	"committed_at" timestamp with time zone,
	"discarded_by" uuid,
	"discarded_at" timestamp with time zone,
	"reverted_by" uuid,
	"reverted_at" timestamp with time zone,
	"revert_reason" text,
	"purged_at" timestamp with time zone,
	CONSTRAINT "shipment_imports_carrier" CHECK ("shipment_imports"."carrier" = 'iran_post'),
	CONSTRAINT "shipment_imports_status" CHECK ("shipment_imports"."status" IN ('reading', 'read', 'unreadable', 'committed', 'discarded', 'reverted')),
	CONSTRAINT "shipment_imports_format" CHECK ("shipment_imports"."format" IS NULL OR "shipment_imports"."format" IN ('html', 'csv', 'xlsx')),
	CONSTRAINT "shipment_imports_filename" CHECK (char_length("shipment_imports"."filename") BETWEEN 1 AND 255),
	CONSTRAINT "shipment_imports_size" CHECK ("shipment_imports"."size_bytes" BETWEEN 1 AND 2097152),
	CONSTRAINT "shipment_imports_sha256" CHECK ("shipment_imports"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "shipment_imports_raw" CHECK ("shipment_imports"."raw" IS NULL OR octet_length("shipment_imports"."raw") = "shipment_imports"."size_bytes"),
	CONSTRAINT "shipment_imports_read" CHECK (("shipment_imports"."status" = 'unreadable') = ("shipment_imports"."error_code" IS NOT NULL)),
	CONSTRAINT "shipment_imports_committed" CHECK (("shipment_imports"."status" IN ('committed', 'reverted')) = ("shipment_imports"."committed_at" IS NOT NULL) AND ("shipment_imports"."committed_at" IS NULL) = ("shipment_imports"."committed_by" IS NULL)),
	CONSTRAINT "shipment_imports_discarded" CHECK (("shipment_imports"."status" = 'discarded') = ("shipment_imports"."discarded_at" IS NOT NULL)),
	CONSTRAINT "shipment_imports_reverted" CHECK (("shipment_imports"."status" = 'reverted') = ("shipment_imports"."reverted_at" IS NOT NULL) AND ("shipment_imports"."reverted_at" IS NULL) = ("shipment_imports"."reverted_by" IS NULL) AND ("shipment_imports"."reverted_at" IS NULL) = ("shipment_imports"."revert_reason" IS NULL)),
	CONSTRAINT "shipment_imports_revert_reason" CHECK ("shipment_imports"."revert_reason" IS NULL OR length(btrim("shipment_imports"."revert_reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"import_id" uuid NOT NULL,
	"row_no" integer NOT NULL,
	"weight_grams" integer NOT NULL,
	"fare_rials" bigint NOT NULL,
	"tax_rials" bigint NOT NULL,
	"post_day" timestamp with time zone NOT NULL,
	"matched_by" text NOT NULL,
	"handed_order" boolean DEFAULT false NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "shipments_barcode" CHECK ("shipments"."barcode" ~ '^[0-9]{24}$'),
	CONSTRAINT "shipments_matched_by" CHECK ("shipments"."matched_by" IN ('rule', 'review', 'manual')),
	CONSTRAINT "shipments_measures" CHECK ("shipments"."weight_grams" > 0 AND "shipments"."fare_rials" >= 0 AND "shipments"."tax_rials" >= 0),
	CONSTRAINT "shipments_voided" CHECK (("shipments"."voided_at" IS NULL) = ("shipments"."voided_by" IS NULL) AND ("shipments"."voided_at" IS NULL) = ("shipments"."void_reason" IS NULL)),
	CONSTRAINT "shipments_void_reason" CHECK ("shipments"."void_reason" IS NULL OR length(btrim("shipments"."void_reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_one_target";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "shipment_import_id" uuid;--> statement-breakpoint
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_import_id_shipment_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."shipment_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_import_rows" ADD CONSTRAINT "shipment_import_rows_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_print_partner_id_print_partners_id_fk" FOREIGN KEY ("print_partner_id") REFERENCES "public"."print_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_committed_by_admin_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_discarded_by_admin_users_id_fk" FOREIGN KEY ("discarded_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_imports" ADD CONSTRAINT "shipment_imports_reverted_by_admin_users_id_fk" FOREIGN KEY ("reverted_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_voided_by_admin_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_row_fk" FOREIGN KEY ("import_id","row_no") REFERENCES "public"."shipment_import_rows"("import_id","row_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_import_rows_order" ON "shipment_import_rows" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_imports_created" ON "shipment_imports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_imports_one_file" ON "shipment_imports" USING btree ("sha256") WHERE "shipment_imports"."status" IN ('reading', 'read', 'committed');--> statement-breakpoint
CREATE INDEX "shipments_order" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_live_barcode" ON "shipments" USING btree ("barcode") WHERE "shipments"."voided_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_live_row" ON "shipments" USING btree ("import_id","row_no") WHERE "shipments"."voided_at" IS NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_shipment_import_id_shipment_imports_id_fk" FOREIGN KEY ("shipment_import_id") REFERENCES "public"."shipment_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_shipment_import_kind" ON "jobs" USING btree ("shipment_import_id","kind");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_one_target" CHECK (num_nonnulls("jobs"."document_id", "jobs"."order_id", "jobs"."shipment_import_id") <= 1);