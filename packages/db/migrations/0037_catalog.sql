-- کاتالوگ چاپ (برش ۸٫۳، سؤال‌های ۱۸۳ تا ۱۸۶): اندازهٔ کاغذ (`paper_size`: A4، A5 و A3)؛ نرخ هر رو برای هر اندازه × یکرو یا
-- دورو × رنگ (`print_rates`)؛ نرخ هر برگ هر کاغذ برای هر اندازه (`paper_rates`)؛ بازه‌های صحافی هر اندازه
-- (`binding_rate_bands.paper_size`)؛ کمینهٔ برگ و «بالای سقف چند جلد یا نمی‌خورد» هر صحافی (`binding_types.min_sheets` و
-- `splits_volumes`)؛ و اندازهٔ هر جزوهٔ سفارش (`order_items.paper_size`).
--
-- تولیدی (drizzle-kit)، با یک جابه‌جایی دستی پیش از اجرای اول: ستون `paper_size` بازه‌ها پیش از کلید اصلی تازه‌اش، که drizzle
-- برعکس نوشته بود. پیش‌فرض‌های `'a4'` فقط ردیف‌های امروز را پر می‌کنند (همه A4 بودند) و در 0039 می‌روند. پر کردن جدول‌های تازه
-- برای نسخه‌های امروز، همپوشانی بازه‌ها با اندازه، و محافظ‌های تازه در 0038، دست‌نویس؛ پاک شدن ستون‌های پیشین در 0039.

CREATE TYPE "public"."paper_size" AS ENUM('a4', 'a5', 'a3');--> statement-breakpoint
CREATE TABLE "paper_rates" (
	"price_list_version" integer NOT NULL,
	"paper_type_id" text NOT NULL,
	"paper_size" "paper_size" NOT NULL,
	"rate_rials" bigint NOT NULL,
	CONSTRAINT "paper_rates_price_list_version_paper_type_id_paper_size_pk" PRIMARY KEY("price_list_version","paper_type_id","paper_size"),
	CONSTRAINT "paper_rates_nonnegative" CHECK ("paper_rates"."rate_rials" >= 0)
);
--> statement-breakpoint
CREATE TABLE "print_rates" (
	"price_list_version" integer NOT NULL,
	"paper_size" "paper_size" NOT NULL,
	"sides_mode" "sides_mode" NOT NULL,
	"color_mode" "color_mode" NOT NULL,
	"rate_rials" bigint NOT NULL,
	CONSTRAINT "print_rates_price_list_version_paper_size_sides_mode_color_mode_pk" PRIMARY KEY("price_list_version","paper_size","sides_mode","color_mode"),
	CONSTRAINT "print_rates_positive" CHECK ("print_rates"."rate_rials" > 0)
);
--> statement-breakpoint
ALTER TABLE "binding_rate_bands" DROP CONSTRAINT "binding_rate_bands_price_list_version_binding_type_id_min_sheets_pk";--> statement-breakpoint
ALTER TABLE "binding_rate_bands" ADD COLUMN "paper_size" "paper_size" DEFAULT 'a4' NOT NULL;--> statement-breakpoint
ALTER TABLE "binding_rate_bands" ADD CONSTRAINT "binding_rate_bands_price_list_version_binding_type_id_paper_size_min_sheets_pk" PRIMARY KEY("price_list_version","binding_type_id","paper_size","min_sheets");--> statement-breakpoint
ALTER TABLE "binding_types" ADD COLUMN "min_sheets" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "binding_types" ADD COLUMN "splits_volumes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "paper_size" "paper_size" DEFAULT 'a4' NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_rates" ADD CONSTRAINT "paper_rates_paper_type_fk" FOREIGN KEY ("price_list_version","paper_type_id") REFERENCES "public"."paper_types"("price_list_version","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_rates" ADD CONSTRAINT "print_rates_price_list_version_price_lists_version_fk" FOREIGN KEY ("price_list_version") REFERENCES "public"."price_lists"("version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "binding_types" ADD CONSTRAINT "binding_types_sheets" CHECK ("binding_types"."min_sheets" >= 1 AND "binding_types"."max_sheets_per_volume" >= "binding_types"."min_sheets");