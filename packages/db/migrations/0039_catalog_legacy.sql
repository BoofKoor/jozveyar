-- پاک کردن جای پیشین نرخ‌ها (برش ۸٫۳): دو نرخ `price_lists.click_rate_*` و نرخ هر برگ `paper_types.rate_per_sheet_rials`، که 0038
-- برای هر نسخه به `print_rates` و `paper_rates` برد؛ پس از این یک جای هر نرخ. و پیش‌فرض `'a4'` دو ستون اندازه، که فقط ردیف‌های
-- پیش از ۸٫۳ را پر کرد: از این پس اندازهٔ هر بازه و هر جزوه همیشه گفته می‌شود، و فراموش کردنش خطاست، نه A4 بی‌صدا.
--
-- تولیدی (drizzle-kit). `price_lists_frozen` بی این دو ستون پیش‌تر در 0038 بازنویسی شد؛ ستون بی تریگر پاک می‌شود و ردیفی را عوض
-- نمی‌کند.

ALTER TABLE "binding_rate_bands" ALTER COLUMN "paper_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "paper_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "paper_types" DROP COLUMN "rate_per_sheet_rials";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "click_rate_color_rials";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "click_rate_bw_rials";