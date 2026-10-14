-- پر کردن و محافظ‌های کاتالوگ چاپ (برش ۸٫۳، سؤال‌های ۱۸۳ تا ۱۸۶).
--
-- دست‌نویس، مثل 0001، 0006 و 0013 و به همان دلیل: قیمت هر نسخهٔ تعرفه و مشخصات هر جزوهٔ سفارش منجمدند (قاعدهٔ ۶)، پس باید در
-- خود پایگاه داده درست بمانند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **پر کردن، پیش از انجماد:** هر نسخهٔ امروز تعرفه، فعال‌شده یا پیش‌نویس، نرخ هر رو A4 را با همان دو نرخ برای یکرو و دورو
--    می‌گیرد (`click_rate_*`)، و هر کاغذش نرخ هر برگ A4 را (`rate_per_sheet_rials`)؛ بازه‌های صحافی با پیش‌فرض 0037 A4 شدند. پس
--    قیمت هیچ نسخه‌ای و هیچ سفارشی عوض نمی‌شود (سؤال ۱۸۴: «نسخه‌های قدیم با یک نرخ برای یکرو و دورو، فقط A4»). تریگرهای انجماد دو
--    جدول تازه بعد از همین درج‌اند، چون ردیف نسخهٔ فعال‌شده را رد می‌کنند.
--  - **انجماد:** `print_rates` و `paper_rates` مثل بقیهٔ ردیف‌های نسخه (`price_list_rows_frozen`، 0013): فقط در پیش‌نویس.
--  - **`print_rates_complete`** (معوق، پایان تراکنش): هر اندازهٔ هر نسخه هیچ نرخی ندارد یا هر چهار حالت را، تا اندازهٔ نیمه‌کاره‌ای
--    که موتور قیمت نمی‌خواند (`printRateSchema`) هرگز ذخیره نشود.
--  - **`binding_rate_bands_no_overlap`** (بازنویسی 0001): همپوشانی فقط میان بازه‌های یک اندازه؛ A4 و A5 هر کدام بازه‌های خودشان.
--  - **`price_lists_frozen`** (بازنویسی 0013): همان، بی دو ستون `click_rate_*` که 0039 پاک می‌کند.
--  - **`order_items_frozen`** (بازنویسی 0006): اندازهٔ کاغذ جزوه هم، مثل صفحه، نسخه، دورو و صحافی.

-- ── پر کردن نسخه‌های امروز ──────────────────────────────────────────────
INSERT INTO print_rates (price_list_version, paper_size, sides_mode, color_mode, rate_rials)
SELECT p.version, 'a4', s.mode, c.mode,
       CASE c.mode WHEN 'color' THEN p.click_rate_color_rials ELSE p.click_rate_bw_rials END
FROM price_lists p
CROSS JOIN (VALUES ('single'::sides_mode), ('double'::sides_mode)) AS s(mode)
CROSS JOIN (VALUES ('color'::color_mode), ('bw'::color_mode)) AS c(mode);
--> statement-breakpoint
INSERT INTO paper_rates (price_list_version, paper_type_id, paper_size, rate_rials)
SELECT price_list_version, id, 'a4', rate_per_sheet_rials FROM paper_types;
--> statement-breakpoint

-- ── انجماد ردیف‌های تازهٔ نسخه ───────────────────────────────────────────
CREATE TRIGGER print_rates_frozen BEFORE INSERT OR UPDATE OR DELETE ON print_rates
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER paper_rates_frozen BEFORE INSERT OR UPDATE OR DELETE ON paper_rates
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint

-- ── هر اندازه هیچ یا هر چهار نرخ ─────────────────────────────────────────
--
-- معوق، چون ذخیرهٔ پیش‌نویس ردیف‌ها را یکی‌یکی پاک و درج می‌کند؛ حکم با پایان تراکنش. پاک شدن پیش‌نویس با cascade همهٔ ردیف‌ها را
-- می‌برد، پس صفر است و پذیرفته.
CREATE FUNCTION print_rates_size_complete(v integer, s paper_size) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM print_rates WHERE price_list_version = v AND paper_size = s;
  IF n NOT IN (0, 4) THEN
    RAISE EXCEPTION 'نرخ چاپ % نسخهٔ % تعرفه نیمه‌کاره است: % حالت از 4', upper(s::text), v, n
      USING ERRCODE = 'check_violation', CONSTRAINT = 'print_rates_complete';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION print_rates_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM print_rates_size_complete(OLD.price_list_version, OLD.paper_size);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM print_rates_size_complete(NEW.price_list_version, NEW.paper_size);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER print_rates_complete AFTER INSERT OR UPDATE OR DELETE ON print_rates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION print_rates_complete();
--> statement-breakpoint

-- ── بازه‌های صحافی: همپوشانی در هر اندازه ────────────────────────────────
--
-- همان 0001، با اندازه: «۱ تا ۵۰» منگنهٔ A4 و «۱ تا ۵۰» منگنهٔ A5 دو قیمت برای یک جزوه نیستند.
ALTER TABLE binding_rate_bands DROP CONSTRAINT binding_rate_bands_no_overlap;
--> statement-breakpoint
ALTER TABLE binding_rate_bands
  ADD CONSTRAINT binding_rate_bands_no_overlap
  EXCLUDE USING gist (
    price_list_version WITH =,
    binding_type_id WITH =,
    paper_size WITH =,
    int4range(min_sheets, max_sheets + 1) WITH &&
  );
--> statement-breakpoint

-- ── سرِ نسخه، بی ستون‌های نرخ پیشین ──────────────────────────────────────
--
-- همان 0013، بی `click_rate_color_rials` و `click_rate_bw_rials`: نرخ‌ها حالا ردیف‌های `print_rates`اند و انجماد خودشان را دارند.
-- ستون تازه‌ای که به `price_lists` بیاید، به فهرست پایین هم می‌آید.
CREATE OR REPLACE FUNCTION price_lists_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'نسخهٔ % تعرفه یک بار فعال شده و پاک نمی‌شود', OLD.version
        USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.activated_at IS NOT NULL
       AND (NEW.version, NEW.label, NEW.settings, NEW.created_at, NEW.activated_at, NEW.created_by, NEW.based_on)
           IS DISTINCT FROM
           (OLD.version, OLD.label, OLD.settings, OLD.created_at, OLD.activated_at, OLD.created_by, OLD.based_on)
    THEN
      RAISE EXCEPTION 'نسخهٔ % تعرفه یک بار فعال شده و عوض نمی‌شود؛ نسخهٔ تازه بساز', OLD.version
        USING ERRCODE = 'check_violation', CONSTRAINT = 'price_lists_frozen';
    END IF;
  END IF;
  IF NEW.is_active AND NEW.activated_at IS NULL THEN
    NEW.activated_at := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ── مشخصات جزوه، با اندازه ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION order_items_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.order_id, NEW.seq, NEW.page_count, NEW.copies, NEW.sides_mode, NEW.paper_size, NEW.binding_type_id)
     IS DISTINCT FROM
     (OLD.order_id, OLD.seq, OLD.page_count, OLD.copies, OLD.sides_mode, OLD.paper_size, OLD.binding_type_id)
  THEN
    RAISE EXCEPTION 'مشخصات جزوه منجمد است'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_items_frozen';
  END IF;
  RETURN NEW;
END $$;
