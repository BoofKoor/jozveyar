-- پیش‌نمایش مسیر خرید (برش ۷٫۵، ADR-052؛ سؤال‌های ۱۶۷ و ۱۷۰): پیوند یک‌بارهٔ مالک (۱۵ دقیقه) و کوکی پیش‌نمایش (۲۴ ساعت)، از هر دو
-- فقط هش. تنظیم `checkout.audience` بی مهاجرت است (`SETTING_SCHEMAS` و دادهٔ پایه).
--
-- تولیدی (drizzle-kit). محافظ‌های دست‌نویس (شکل هش‌ها، عمر پیوند و کوکی، یک بار باز شدن و بستن، ستون‌های منجمد، پاک‌نشدنی، و یک
-- پیوند باز) در 0034.

CREATE TABLE "checkout_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"link_expires_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"cookie_hash" text,
	"cookie_expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "checkout_previews_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "checkout_previews_cookie_hash_unique" UNIQUE("cookie_hash")
);
