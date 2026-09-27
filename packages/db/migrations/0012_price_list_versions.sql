-- نسخه‌های تعرفه در پنل (برش ۴٫۵، ADR-040): زمان اولین فعال شدن، ادمینی که پیش‌نویس را ساخت، و نسخه‌ای که پیش‌نویس
-- از رویش ساخته شد؛ و نمایهٔ سفارش‌های هر نسخه.
--
-- تولیدی (drizzle-kit). پر کردن `activated_at` نسخه‌های پیشین و محافظ تغییرناپذیری در 0013، دست‌نویس: مهاجرت
-- دست‌نویس drizzle ستون تازه را در snapshot نمی‌برد، پس ستون اینجا و محافظ آنجا (مثل 0010 و 0011).

ALTER TABLE "price_lists" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "based_on" integer;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_based_on_fk" FOREIGN KEY ("based_on") REFERENCES "public"."price_lists"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_price_list" ON "orders" USING btree ("price_list_version");