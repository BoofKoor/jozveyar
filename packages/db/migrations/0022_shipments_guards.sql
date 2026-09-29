-- محافظ‌های ورود فایل پست و مرسوله‌ها (برش ۶٫۱، ADR-045، ADR-046).
--
-- دست‌نویس، مثل 0006، 0011، 0016 و 0018 و به همان دلیل: کد رهگیری به موبایل مشتری می‌رود و «تحویل پست شد» سند تعهد ماست؛ پس
-- اینکه کدام بسته مال کدام سفارش است و از کدام فایل آمد باید در خود پایگاه داده درست بماند، نه فقط در پنل. هر خطا با نام محدودیت
-- برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `shipment_imports_flow`: وضعیت ورود فقط reading ← read، unreadable یا discarded؛ read ← committed یا discarded؛
--    committed ← reverted. `shipment_imports_frozen`: نام، اندازه، sha256، حامل، چاپخانه و واردکننده عوض نمی‌شوند؛ `raw` فقط
--    پاک می‌شود، جدول‌ها و فرمت یک بار با «خوانده شد» می‌آیند، و زمان‌ها و کسانِ هر گذار یک بار. `shipment_imports_no_delete`:
--    ورود پاک نمی‌شود؛ پیامکی که رفت و مرسولهٔ کنارگذاشته به آن اشاره می‌کنند.
--  - `shipment_imports_revert_voids` (معوق): ورودی که برگشت، در پایان همان تراکنش مرسولهٔ زنده ندارد.
--  - `shipment_import_rows_committed`: سطر فقط برای ورود «ثبت شد». `shipment_import_rows_frozen`: سطر عوض و پاک نمی‌شود، جز
--    پاک شدن متن سطری که مرسولهٔ ما نشد (N روز بعد، کارگر) و cascade پاک شدن سفارش.
--  - `shipments_import_committed`، `shipments_row` و `shipments_partner_scope`: مرسوله فقط از ورود «ثبت شد»، از سطری با همان
--    بارکد، وزن، کرایه، مالیات و روز (و اگر قطعی، همان سفارشِ حکم)، و از ورود چاپخانه فقط برای سفارش همان چاپخانه.
--  - `shipments_frozen`: مرسوله عوض و پاک نمی‌شود، جز «کنار گذاشتن» یک بار و cascade پاک شدن سفارش.
--  - `shipments_order_handed` (معوق، از هر دو سو، مثل تاریخچهٔ تخصیص در 0018): در پایان هر تراکنش، سفارشی که مرسولهٔ زنده دارد
--    «تحویل پست شد» است. پس مرسوله فقط برای چنین سفارشی ثبت می‌شود، و چنین سفارشی (مثلاً با برگرداندن یک قدم، ADR-039) از آن
--    بیرون نمی‌رود مگر مرسوله‌اش در همان تراکنش کنار برود.

-- ── ورود: گذار وضعیت، ستون‌های منجمد، پاک‌نشدنی ─────────────────────────
CREATE FUNCTION shipment_imports_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ورود فایل پست پاک نمی‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_imports_no_delete';
  END IF;
  IF (NEW.id, NEW.carrier, NEW.filename, NEW.size_bytes, NEW.sha256, NEW.print_partner_id, NEW.created_by, NEW.created_at)
       IS DISTINCT FROM
     (OLD.id, OLD.carrier, OLD.filename, OLD.size_bytes, OLD.sha256, OLD.print_partner_id, OLD.created_by, OLD.created_at)
     -- بایت خام فقط پاک می‌شود؛ فایل دیگری جایش نمی‌نشیند.
     OR (NEW.raw IS NOT NULL AND NEW.raw IS DISTINCT FROM OLD.raw)
     -- جدول‌ها و فرمت یک بار، با «خوانده شد»؛ بعد فقط پاک.
     OR (NEW.tables IS NOT NULL AND NEW.tables IS DISTINCT FROM OLD.tables AND NOT (OLD.status = 'reading' AND NEW.status = 'read'))
     OR (NEW.format IS DISTINCT FROM OLD.format AND NOT (OLD.format IS NULL AND OLD.status = 'reading' AND NEW.status = 'read'))
     -- هر گذار زمان و کسش را یک بار می‌نویسد.
     OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
     OR (OLD.error_code IS NOT NULL AND NEW.error_code IS DISTINCT FROM OLD.error_code)
     OR (OLD.committed_at IS NOT NULL AND (NEW.committed_at, NEW.committed_by) IS DISTINCT FROM (OLD.committed_at, OLD.committed_by))
     OR (OLD.discarded_at IS NOT NULL AND (NEW.discarded_at, NEW.discarded_by) IS DISTINCT FROM (OLD.discarded_at, OLD.discarded_by))
     OR (OLD.reverted_at IS NOT NULL
         AND (NEW.reverted_at, NEW.reverted_by, NEW.revert_reason) IS DISTINCT FROM (OLD.reverted_at, OLD.reverted_by, OLD.revert_reason))
     OR (OLD.purged_at IS NOT NULL AND NEW.purged_at IS DISTINCT FROM OLD.purged_at)
  THEN
    RAISE EXCEPTION 'ورود فایل پست % عوض نمی‌شود', OLD.filename
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_imports_frozen';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'reading' AND NEW.status IN ('read', 'unreadable', 'discarded'))
    OR (OLD.status = 'read' AND NEW.status IN ('committed', 'discarded'))
    OR (OLD.status = 'committed' AND NEW.status = 'reverted')
  ) THEN
    RAISE EXCEPTION 'ورود فایل پست % از % به % نمی‌رود', OLD.filename, OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_imports_flow';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shipment_imports_guard BEFORE UPDATE OR DELETE ON shipment_imports
  FOR EACH ROW EXECUTE FUNCTION shipment_imports_guard();
--> statement-breakpoint

-- ── ورودی که برگشت، مرسولهٔ زنده ندارد (معوق) ───────────────────────────
CREATE FUNCTION shipment_imports_revert_voids() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM shipments WHERE import_id = NEW.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'ورود فایل پست % برگشت ولی مرسولهٔ زنده دارد', NEW.filename
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_imports_revert_voids';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER shipment_imports_revert_voids AFTER UPDATE ON shipment_imports
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'reverted' AND OLD.status <> 'reverted')
  EXECUTE FUNCTION shipment_imports_revert_voids();
--> statement-breakpoint

-- ── سطرها: فقط برای ورود ثبت‌شده، و منجمد ──────────────────────────────
CREATE FUNCTION shipment_import_rows_committed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  import_status text;
BEGIN
  SELECT status INTO import_status FROM shipment_imports WHERE id = NEW.import_id FOR SHARE;
  IF import_status IS DISTINCT FROM 'committed' THEN
    RAISE EXCEPTION 'سطر فقط برای ورود ثبت‌شده، نه %', import_status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_committed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shipment_import_rows_committed BEFORE INSERT ON shipment_import_rows
  FOR EACH ROW EXECUTE FUNCTION shipment_import_rows_committed();
--> statement-breakpoint
-- متن سطر فقط پاک می‌شود، و فقط برای سطری که مرسولهٔ ما نشد (ADR-045). پاک شدن ردیف فقط با خود سفارش (cascade).
CREATE FUNCTION shipment_import_rows_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
  ELSIF (NEW.import_id, NEW.row_no, NEW.barcode, NEW.order_number, NEW.weight_grams, NEW.fare_rials, NEW.tax_rials,
         NEW.post_day, NEW.post_status, NEW.verdict, NEW.reason, NEW.order_id)
          IS NOT DISTINCT FROM
        (OLD.import_id, OLD.row_no, OLD.barcode, OLD.order_number, OLD.weight_grams, OLD.fare_rials, OLD.tax_rials,
         OLD.post_day, OLD.post_status, OLD.verdict, OLD.reason, OLD.order_id)
    AND (NEW.cells IS NULL OR NEW.cells IS NOT DISTINCT FROM OLD.cells)
    AND (NEW.name_g IS NULL OR NEW.name_g IS NOT DISTINCT FROM OLD.name_g)
    AND (NEW.destination IS NULL OR NEW.destination IS NOT DISTINCT FROM OLD.destination)
    AND ((NEW.cells, NEW.name_g, NEW.destination) IS NOT DISTINCT FROM (OLD.cells, OLD.name_g, OLD.destination)
         OR OLD.verdict IN ('unmatched', 'invalid', 'inactive', 'total'))
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'سطر ورود فایل پست عوض یا پاک نمی‌شود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'shipment_import_rows_frozen';
END $$;
--> statement-breakpoint
CREATE TRIGGER shipment_import_rows_frozen BEFORE UPDATE OR DELETE ON shipment_import_rows
  FOR EACH ROW EXECUTE FUNCTION shipment_import_rows_frozen();
--> statement-breakpoint

-- ── مرسوله: از سطر همان ورود ثبت‌شده، در محدودهٔ واردکننده ────────────────
CREATE FUNCTION shipments_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  import_row shipment_imports%ROWTYPE;
  source shipment_import_rows%ROWTYPE;
  order_partner uuid;
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
     OR (NEW.matched_by = 'rule' AND (source.verdict <> 'matched' OR source.order_id IS DISTINCT FROM NEW.order_id))
     OR NEW.voided_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'مرسوله با سطر % فایل پست نمی‌خواند', NEW.row_no
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
--> statement-breakpoint
CREATE TRIGGER shipments_insert BEFORE INSERT ON shipments
  FOR EACH ROW EXECUTE FUNCTION shipments_insert();
--> statement-breakpoint
-- فقط «کنار گذاشتن»، یک بار. پاک شدن فقط با خود سفارش (cascade).
CREATE FUNCTION shipments_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
  ELSIF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
    AND (NEW.id, NEW.order_id, NEW.barcode, NEW.import_id, NEW.row_no, NEW.weight_grams, NEW.fare_rials, NEW.tax_rials,
         NEW.post_day, NEW.matched_by, NEW.handed_order, NEW.admin_user_id, NEW.created_at)
        IS NOT DISTINCT FROM
        (OLD.id, OLD.order_id, OLD.barcode, OLD.import_id, OLD.row_no, OLD.weight_grams, OLD.fare_rials, OLD.tax_rials,
         OLD.post_day, OLD.matched_by, OLD.handed_order, OLD.admin_user_id, OLD.created_at)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'مرسوله عوض یا پاک نمی‌شود؛ فقط یک بار کنار می‌رود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_frozen';
END $$;
--> statement-breakpoint
CREATE TRIGGER shipments_frozen BEFORE UPDATE OR DELETE ON shipments
  FOR EACH ROW EXECUTE FUNCTION shipments_frozen();
--> statement-breakpoint

-- ── مرسولهٔ زنده فقط برای سفارش «تحویل پست شد» (معوق، از هر دو سو) ──────
CREATE FUNCTION shipments_order_ok(o uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  number integer;
  current_status text;
BEGIN
  SELECT order_number, status::text INTO number, current_status FROM orders WHERE id = o;
  IF NOT FOUND THEN
    RETURN; -- سفارش در همین تراکنش پاک شد
  END IF;
  IF current_status <> 'handed_to_post' AND EXISTS (SELECT 1 FROM shipments WHERE order_id = o AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'سفارش % کد رهگیری زنده دارد ولی «تحویل پست شد» نیست (%)', number, current_status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_order_handed';
  END IF;
END $$;
--> statement-breakpoint
-- هر شاخه فقط برای جدول خودش اجرا می‌شود: `NEW.order_id` در ردیف `orders` نیست.
CREATE FUNCTION shipments_order_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    PERFORM shipments_order_ok(NEW.id);
  ELSE
    PERFORM shipments_order_ok(NEW.order_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_shipments_handed AFTER UPDATE ON orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION shipments_order_check();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER shipments_order_handed AFTER INSERT ON shipments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION shipments_order_check();
