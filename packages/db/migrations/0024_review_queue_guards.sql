-- محافظ‌های صف تأیید (برش ۶٫۲، ADR-045 و ADR-046).
--
-- دست‌نویس، مثل 0022 و به همان دلیل: کد رهگیری به موبایل مشتری می‌رود، پس اینکه کدام کد از کدام سطر و با چه تصمیمی آمد باید در
-- خود پایگاه داده درست بماند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
-- «سطر در صف» یعنی: ورودش «ثبت شد»، حکمش `review` است یا مرسوله‌ای گرفته که کنار رفت، مرسولهٔ زنده ندارد و «هیچ‌کدام» نخورده.
--
--  - `shipment_import_rows_frozen` (بازنویسی 0022): سطر عوض و پاک نمی‌شود، جز
--    - «هیچ‌کدام»، یک بار و فقط برای سطری که در صف است (`shipment_import_rows_dismiss`)؛
--    - پاک شدن متن سطری که مرسولهٔ ما نشد: «پیدا نشد»، «خوانده نشد»، «غیرفعال»، «جمع کل»، و از ۶٫۲ سطری که «هیچ‌کدام» خورد؛ سطری
--      که مرسوله‌ای گرفت، حتی کنارگذاشته، نه (سابقهٔ کدی که به مشتری رسید)؛
--    - و cascade پاک شدن سفارش.
--  - `shipments_insert` (بازنویسی 0022)، `shipments_row`: مرسولهٔ `rule` فقط اولین مرسولهٔ سطر قطعی است، پس کدی که کنار رفت خودش
--    برنمی‌گردد؛ `review` («همین است») فقط از سطری که در صف است و «هیچ‌کدام» نخورده؛ `manual` (دادن دستی) از سطر قطعی، صف تأیید یا
--    پیدا نشد، «هیچ‌کدام» خورده هم، چون راه برگشت اشتباهِ «هیچ‌کدام» همین است؛ و هیچ مرسوله‌ای از تکراری، خوانده نشد، غیرفعال یا
--    «جمع کل». بقیه همان 0022: ورود «ثبت شد»، همان بارکد، وزن، کرایه، مالیات و روز سطر، و از ورود چاپخانه فقط سفارش همان چاپخانه.

-- ── سطر: «هیچ‌کدام» یک بار و فقط در صف؛ متن فقط برای سطری که مرسولهٔ ما نشد ─────
CREATE OR REPLACE FUNCTION shipment_import_rows_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  import_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'سطر ورود فایل پست عوض یا پاک نمی‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_frozen';
  END IF;
  -- حکم، اعداد، شماره و سفارش سطر هرگز عوض نمی‌شوند؛ «هیچ‌کدام» پس از نوشته شدن هم نه.
  IF (NEW.import_id, NEW.row_no, NEW.barcode, NEW.order_number, NEW.weight_grams, NEW.fare_rials, NEW.tax_rials,
      NEW.post_day, NEW.post_status, NEW.verdict, NEW.reason, NEW.order_id)
       IS DISTINCT FROM
     (OLD.import_id, OLD.row_no, OLD.barcode, OLD.order_number, OLD.weight_grams, OLD.fare_rials, OLD.tax_rials,
      OLD.post_day, OLD.post_status, OLD.verdict, OLD.reason, OLD.order_id)
     OR (OLD.dismissed_at IS NOT NULL
         AND (NEW.dismissed_at, NEW.dismissed_by) IS DISTINCT FROM (OLD.dismissed_at, OLD.dismissed_by))
  THEN
    RAISE EXCEPTION 'سطر ورود فایل پست عوض یا پاک نمی‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_frozen';
  END IF;
  IF OLD.dismissed_at IS NULL AND NEW.dismissed_at IS NOT NULL THEN
    -- ورود زیر قفل اشتراکی: برگرداندن هم‌زمانش (FOR UPDATE) پیش یا پس از این است، نه وسطش.
    SELECT status INTO import_status FROM shipment_imports WHERE id = OLD.import_id FOR SHARE;
    IF import_status IS DISTINCT FROM 'committed'
       OR EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = OLD.import_id AND s.row_no = OLD.row_no AND s.voided_at IS NULL)
       OR NOT (OLD.verdict = 'review'
               OR EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = OLD.import_id AND s.row_no = OLD.row_no))
    THEN
      RAISE EXCEPTION 'سطر % فایل پست در صف تأیید نیست و «هیچ‌کدام» نمی‌گیرد', OLD.row_no
        USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_dismiss';
    END IF;
  END IF;
  -- متن سطر فقط پاک می‌شود، و فقط برای سطری که مرسولهٔ ما نشد (ADR-045): نام و مقصد مشتری‌های دیگر چاپخانه.
  IF (NEW.cells, NEW.name_g, NEW.destination) IS DISTINCT FROM (OLD.cells, OLD.name_g, OLD.destination)
     AND NOT (
       (NEW.cells IS NULL OR NEW.cells IS NOT DISTINCT FROM OLD.cells)
       AND (NEW.name_g IS NULL OR NEW.name_g IS NOT DISTINCT FROM OLD.name_g)
       AND (NEW.destination IS NULL OR NEW.destination IS NOT DISTINCT FROM OLD.destination)
       AND (OLD.verdict IN ('unmatched', 'invalid', 'inactive', 'total') OR NEW.dismissed_at IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = OLD.import_id AND s.row_no = OLD.row_no)
     )
  THEN
    RAISE EXCEPTION 'متن سطر % فایل پست پاک نمی‌شود: سطر مرسولهٔ ما شد، یا هنوز در صف تأیید است', OLD.row_no
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ── مرسوله: `rule` اولین کد سطر قطعی؛ `review` فقط از صف؛ `manual` از قطعی، صف یا پیدا نشد ──────
CREATE OR REPLACE FUNCTION shipments_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  import_row shipment_imports%ROWTYPE;
  source shipment_import_rows%ROWTYPE;
  order_partner uuid;
  had_shipment boolean;
BEGIN
  SELECT * INTO import_row FROM shipment_imports WHERE id = NEW.import_id FOR SHARE;
  IF import_row.status IS DISTINCT FROM 'committed' THEN
    RAISE EXCEPTION 'مرسوله فقط از ورود ثبت‌شده'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_import_committed';
  END IF;
  SELECT * INTO source FROM shipment_import_rows WHERE import_id = NEW.import_id AND row_no = NEW.row_no;
  IF NOT FOUND
     OR (source.barcode, source.weight_grams, source.fare_rials, source.tax_rials, source.post_day)
          IS DISTINCT FROM (NEW.barcode, NEW.weight_grams, NEW.fare_rials, NEW.tax_rials, NEW.post_day)
     OR NEW.voided_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'مرسوله با سطر % فایل پست نمی‌خواند', NEW.row_no
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_row';
  END IF;
  had_shipment := EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = NEW.import_id AND s.row_no = NEW.row_no);
  IF (CASE NEW.matched_by
        -- «ثبت»: اولین کد سطر قطعی، برای سفارش همان حکم.
        WHEN 'rule' THEN source.verdict = 'matched' AND source.order_id IS NOT DISTINCT FROM NEW.order_id AND NOT had_shipment
        -- «همین است»: سطر صف تأیید، یا سطری که کدش کنار رفت (کد فقط از قطعی، صف یا پیدا نشد)؛ نه سطری که «هیچ‌کدام» خورد.
        WHEN 'review' THEN (source.verdict = 'review' OR had_shipment) AND source.dismissed_at IS NULL
        -- دادن دستی: قطعی (کدش کنار رفته؛ کد زنده را `shipments_live_row` می‌گیرد)، صف تأیید یا پیدا نشد.
        WHEN 'manual' THEN source.verdict IN ('matched', 'review', 'unmatched')
        ELSE false
      END) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'مرسولهٔ % از سطر % فایل پست ساخته نمی‌شود (حکم %)', NEW.matched_by, NEW.row_no, source.verdict
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_row';
  END IF;
  IF import_row.print_partner_id IS NOT NULL THEN
    SELECT print_partner_id INTO order_partner FROM orders WHERE id = NEW.order_id FOR SHARE;
    IF order_partner IS DISTINCT FROM import_row.print_partner_id THEN
      RAISE EXCEPTION 'از فایل پست چاپخانه فقط سفارش‌های همان چاپخانه'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_partner_scope';
    END IF;
  END IF;
  RETURN NEW;
END $$;
