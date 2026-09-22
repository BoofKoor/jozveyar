-- محافظ‌هایی که drizzle نمی‌تواند در اسکیما بیان کند.
--
-- این فایل دست‌نویس است و عمداً جدا از مهاجرت تولیدی نگه داشته شده، تا اجرای
-- بعدی `drizzle-kit generate` آن را دور نیندازد.
--
-- همهٔ اینها یک ایدهٔ مشترک دارند: چیزی که خراب شدنش **قیمت را عوض می‌کند**
-- باید در پایگاه داده غیرممکن باشد، نه اینکه در کد چک شود. کدی که «اولین
-- بازهٔ منطبق را برمی‌دارد» یک تعرفهٔ خراب را پنهان می‌کند و قیمت غلط می‌دهد؛
-- پایگاه داده‌ای که اجازهٔ درجش را نمی‌دهد، همان موقع در پنل ادمین خطا می‌دهد.

-- برای ترکیب تساوی (روی شناسه) با همپوشانی بازه در یک محدودیت، لازم است.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- ── بازه‌های صحافی، بر حسب برگ ───────────────────────────────────────────
--
-- دو بازهٔ همپوشان برای یک نوع صحافی یعنی یک سند دو قیمت دارد.
-- بازه در قرارداد دوسرشامل است (`minSheets` تا `maxSheets`)، پس بازهٔ پستگرس
-- به صورت `[min, max+1)` ساخته می‌شود تا «۱ تا ۱۵۰» و «۱۵۱ تا ۳۰۰» همپوشان
-- شمرده نشوند.
ALTER TABLE "binding_rate_bands"
  ADD CONSTRAINT "binding_rate_bands_no_overlap"
  EXCLUDE USING gist (
    "price_list_version" WITH =,
    "binding_type_id" WITH =,
    int4range("min_sheets", "max_sheets" + 1) WITH &&
  );
--> statement-breakpoint

ALTER TABLE "binding_rate_bands"
  ADD CONSTRAINT "binding_rate_bands_sane_range" CHECK ("min_sheets" <= "max_sheets");
--> statement-breakpoint

-- ── نرخ‌های ارسال، بر حسب وزن ────────────────────────────────────────────
--
-- اینجا بازه بالا-باز است (`minWeightGrams` تا زیر `maxWeightGrams`)، پس
-- `int4range` پیش‌فرض `[)` دقیقاً همان چیزی است که لازم داریم.
--
-- `NULL` یعنی بدون سقف و `int4range(x, NULL)` هم یعنی همان — پس بازهٔ آخر
-- خودش با همه چیزِ بالاتر همپوشانی می‌دهد و نمی‌شود دو بازهٔ باز تعریف کرد.
ALTER TABLE "shipping_rates"
  ADD CONSTRAINT "shipping_rates_no_overlap"
  EXCLUDE USING gist (
    "price_list_version" WITH =,
    "method_id" WITH =,
    "zone_id" WITH =,
    int4range("min_weight_grams", "max_weight_grams") WITH &&
  );
--> statement-breakpoint

ALTER TABLE "shipping_rates"
  ADD CONSTRAINT "shipping_rates_sane_range"
  CHECK ("max_weight_grams" IS NULL OR "min_weight_grams" < "max_weight_grams");
--> statement-breakpoint

-- ── دقیقاً یک تعرفهٔ فعال ────────────────────────────────────────────────
--
-- دو تعرفهٔ فعال یعنی قیمت به این بستگی دارد که کوئری کدام ردیف را اول
-- برگرداند — یعنی قیمت غیرقطعی.
CREATE UNIQUE INDEX "price_lists_one_active"
  ON "price_lists" ("is_active") WHERE "is_active";
