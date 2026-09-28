-- خروجی آمادهٔ چاپ و نگهداری فایل‌های سفارش (برش ۵٫۱، ADR-043 و ADR-044): فایل چاپ هر جلد هر جزوه، برگهٔ سفارش، و زمان
-- پاک شدن فایل‌های سفارش.
--
-- تولیدی (drizzle-kit). `orders_files_deleted_closed` با `status::text`، مثل `orders_handed_at` (0010): مهاجرت‌های یک اجرا یک
-- تراکنش‌اند و مقدارهای تازهٔ 0010 روی پایگاه دادهٔ تازه در همان تراکنش‌اند. محافظ‌ها، تابع اثر انگشت برگه و کارهای سفارش‌های
-- باز در 0016، دست‌نویس.

CREATE TABLE "order_print_files" (
	"order_item_id" uuid NOT NULL,
	"volume" smallint NOT NULL,
	"first_page" integer NOT NULL,
	"last_page" integer NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_print_files_order_item_id_volume_pk" PRIMARY KEY("order_item_id","volume"),
	CONSTRAINT "order_print_files_pages" CHECK ("order_print_files"."volume" >= 1 AND "order_print_files"."first_page" >= 1 AND "order_print_files"."last_page" >= "order_print_files"."first_page"),
	CONSTRAINT "order_print_files_file" CHECK ("order_print_files"."storage_key" LIKE 'orders/%' AND "order_print_files"."size_bytes" > 0 AND "order_print_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "order_tickets" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"preview_key" text NOT NULL,
	"stamp" text NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_tickets_file" CHECK ("order_tickets"."storage_key" LIKE 'orders/%' AND "order_tickets"."preview_key" LIKE 'orders/%' AND "order_tickets"."size_bytes" > 0 AND "order_tickets"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "files_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_print_files" ADD CONSTRAINT "order_print_files_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tickets" ADD CONSTRAINT "order_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_files_deleted_closed" CHECK ("orders"."files_deleted_at" IS NULL OR "orders"."status"::text IN ('handed_to_post', 'cancelled'));