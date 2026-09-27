-- تعرفه‌ای که یک بار فعال شد، دیگر عوض نمی‌شود (برش ۴٫۵، ADR-040).
--
-- دست‌نویس، مثل 0001، 0006 و 0011 و به همان دلیل: قیمت سفارش منجمد است و `price_list_version` را نگه می‌دارد
-- (قاعدهٔ ۶)؛ نسخه‌ای که سایت با آن قیمت داد و سفارش به آن اشاره می‌کند باید در خود پایگاه داده دست‌نخوردنی باشد، نه
-- فقط در پنل. ویرایش فقط در پیش‌نویس (`activated_at` خالی)؛ برگشت یعنی فعال کردن دوبارهٔ نسخهٔ قبل، پس `is_active`
-- تنها ستونی است که در نسخهٔ فعال‌شده جابه‌جا می‌شود. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و
-- `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.

-- ── نسخه‌هایی که پیش از این مهاجرت فعال بودند ──────────────────────────
--
-- نسخهٔ فعال امروز (۱)، و هر نسخه‌ای که سفارشی به آن اشاره می‌کند: سفارش فقط با نسخهٔ فعال ساخته می‌شود. زمان ساختن
-- ردیف نزدیک‌ترین عددی است که داریم؛ تعرفهٔ پایه با بالا آمدن وب نشست و همان لحظه فعال شد.
UPDATE price_lists p SET activated_at = p.created_at
WHERE p.activated_at IS NULL
  AND (p.is_active OR EXISTS (SELECT 1 FROM orders o WHERE o.price_list_version = p.version));
--> statement-breakpoint

-- دیوار دوم: نسخهٔ فعال بی زمان فعال شدن نیست. تریگر پایین خودش آن را می‌نویسد، پس این فقط بی تریگر می‌افتد.
ALTER TABLE price_lists ADD CONSTRAINT price_lists_active_activated CHECK (NOT is_active OR activated_at IS NOT NULL);
--> statement-breakpoint

-- ── سرِ نسخه ───────────────────────────────────────────────────────────
--
-- فعال شدن زمانش را یک بار می‌نویسد، اگر کسی ننوشته باشد (درج فعال، یا SQL تست). نسخهٔ فعال‌شده جز `is_active` هیچ
-- ستونی را عوض نمی‌کند و پاک نمی‌شود؛ پیش‌نویس پاک می‌شود، با ردیف‌هایش (cascade). ستون تازه‌ای که به `price_lists`
-- بیاید، به فهرست پایین هم می‌آید.
CREATE FUNCTION price_lists_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
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
       AND (NEW.version, NEW.label, NEW.click_rate_color_rials, NEW.click_rate_bw_rials, NEW.settings, NEW.created_at,
            NEW.activated_at, NEW.created_by, NEW.based_on)
           IS DISTINCT FROM
           (OLD.version, OLD.label, OLD.click_rate_color_rials, OLD.click_rate_bw_rials, OLD.settings, OLD.created_at,
            OLD.activated_at, OLD.created_by, OLD.based_on)
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
CREATE TRIGGER price_lists_frozen BEFORE INSERT OR UPDATE OR DELETE ON price_lists
  FOR EACH ROW EXECUTE FUNCTION price_lists_frozen();
--> statement-breakpoint

-- ── ردیف‌های نسخه ──────────────────────────────────────────────────────
--
-- کاغذ، صحافی و بازه‌هایش، و روش‌ها و نرخ‌های ارسال: درج، عوض کردن و پاک کردن فقط در پیش‌نویس. سرِ نسخه با
-- `FOR SHARE` خوانده می‌شود، فعال‌شده یا نه: فعال شدنِ هم‌زمان (`UPDATE` همان ردیف) یا منتظر این تراکنش می‌ماند یا
-- این منتظر آن، و بعد از فعال شدن هیچ ردیفی به نسخه نمی‌رسد. در پاک شدن پیش‌نویس با cascade، سرِ نسخه دیگر پیدا
-- نمی‌شود و ردیف آزادانه پاک می‌شود.
CREATE FUNCTION price_list_rows_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v integer;
  activated timestamptz;
BEGIN
  FOREACH v IN ARRAY (CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.price_list_version]
      WHEN 'DELETE' THEN ARRAY[OLD.price_list_version]
      ELSE ARRAY[OLD.price_list_version, NEW.price_list_version]
    END)
  LOOP
    SELECT activated_at INTO activated FROM price_lists WHERE version = v FOR SHARE;
    IF activated IS NOT NULL THEN
      RAISE EXCEPTION 'نسخهٔ % تعرفه یک بار فعال شده؛ ردیف‌هایش عوض نمی‌شوند', v
        USING ERRCODE = 'check_violation', CONSTRAINT = 'price_list_rows_frozen';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER paper_types_frozen BEFORE INSERT OR UPDATE OR DELETE ON paper_types
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER binding_types_frozen BEFORE INSERT OR UPDATE OR DELETE ON binding_types
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER binding_rate_bands_frozen BEFORE INSERT OR UPDATE OR DELETE ON binding_rate_bands
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER shipping_methods_frozen BEFORE INSERT OR UPDATE OR DELETE ON shipping_methods
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE TRIGGER shipping_rates_frozen BEFORE INSERT OR UPDATE OR DELETE ON shipping_rates
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
