-- درگاه زیبال (برش ۷٫۲، ADR-050؛ سؤال‌های ۱۴۴ تا ۱۴۸): کلید برگشت تصادفی هر تلاش (`return_key`، سؤال ۱۴۵)، شناسهٔ سفارش نزد درگاه
-- (`gateway_order_id`، یکتا برای هر درگاه و برای زیبال اجباری)، مبلغی که `verify` نهایی کرد (`verified_amount_rials`؛ موفق یعنی برابر
-- مبلغ)، آخرین وضعیت و پرسش درگاه (`gateway_*`، برای «در حال بررسی»، استعلام خودکار و «پول مشتری برمی‌گردد»)، نخستین برگشت مرورگر
-- (`returned_at`)، و آنچه تلاش را بست (`settled_via`).
--
-- تولیدی (drizzle-kit)، به‌علاوهٔ یک UPDATE پیش از CHECK مبلغ: پرداخت‌های موفق پیش از ۷٫۲ (درگاه نمونه؛ فقط توسعه و CI، سایت زنده سفارشی
-- ندارد) مبلغ تأییدشده‌شان همان مبلغ است. کلید برگشت تلاش‌های قدیم پیش‌فرض تصادفی همین ستون است. گذار، ستون‌های منجمد و «مبلغ در درج
-- برابر جمع سفارش» تریگرند و در 0030، دست‌نویس.

ALTER TABLE "payments" ADD COLUMN "return_key" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_order_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_amount_rials" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_status" smallint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_error" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "settled_via" text;--> statement-breakpoint
UPDATE "payments" SET "verified_amount_rials" = "amount_rials" WHERE "status" = 'succeeded';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_return_key" ON "payments" USING btree ("return_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_order" ON "payments" USING btree ("provider","gateway_order_id");--> statement-breakpoint
CREATE INDEX "payments_pending" ON "payments" USING btree ("created_at") WHERE "payments"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_return_key" CHECK ("payments"."return_key" ~ '^[0-9a-f]{32}$');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gateway_order_id" CHECK (("payments"."gateway_order_id" IS NULL OR length("payments"."gateway_order_id") BETWEEN 1 AND 64)
       AND ("payments"."provider" <> 'zibal' OR "payments"."gateway_order_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_success_amount" CHECK ("payments"."status" <> 'succeeded' OR coalesce("payments"."verified_amount_rials" = "payments"."amount_rials", false));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gateway_error" CHECK ("payments"."gateway_error" IS NULL OR "payments"."gateway_error" ~ '^(unavailable|rejected|malformed|unconfigured)(:-?[0-9]{1,9})?$');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_settled_via" CHECK ("payments"."settled_via" IS NULL OR ("payments"."settled_via" IN ('callback', 'auto', 'panel') AND "payments"."status" <> 'pending'));