-- محافظ‌های خروجی چاپ و نگهداری فایل‌های سفارش (برش ۵٫۱، ADR-043 و ADR-044)، و کارهای سفارش‌های باز پیش از آن.
--
-- دست‌نویس، مثل 0006 و 0011 و به همان دلیل: چیزی که چاپ می‌شود و سفارشی که فایلش رفته باید در پایگاه داده غیرممکن باشد،
-- نه فقط در کارگر و پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `order_ticket_stamp`: اثر انگشت داده‌ای از سفارش که روی برگه می‌آید و پس از پرداخت عوض‌شدنی است. کارگر هنگام ساختن
--    برگه می‌نویسدش و پنل با همین می‌فهمد برگه کهنه است؛ هر دو همین یک تابع را می‌خوانند، پس فهرست فیلدها یک جاست.
--  - `orders_files_deleted`: زمان پاک شدن فایل‌ها یک بار نشسته و عوض نمی‌شود، و سفارشی که فایلش رفته وضعیتش عوض نمی‌شود:
--    برگرداندن به صف چاپ بی فایل ممکن نیست. (فقط سفارش بسته: CHECK `orders_files_deleted_closed` در 0015.)
--  - `order_print_files_frozen`: فایل چاپ ثبت‌شده عوض نمی‌شود.
--  - `order_print_files_cover`، معوق در پایان تراکنش: جلدهای هر جزوه صفحه‌های ۱ تا `page_count` را پشت‌سرهم و دقیقاً یک بار
--    می‌پوشانند، به همان شمار جلد ریز قیمت منجمد. کارگر همهٔ جلدهای یک جزوه را در یک تراکنش می‌نویسد.

-- ── اثر انگشت برگهٔ سفارش ────────────────────────────────────────────────
--
-- نام، موبایل، نشانی و کد پستی گیرنده (ویرایش پنل، ۴٫۳). بقیهٔ برگه (شماره، مهلت، شهر، مشخصات جزوه) منجمد است. با ۵٫۲
-- چاپخانه هم به این فهرست می‌آید.
CREATE FUNCTION order_ticket_stamp(o orders) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(jsonb_build_array(o.recipient_name, o.recipient_phone, o.address_text, o.postal_code)::text)
$$;
--> statement-breakpoint

-- ── قیمت منجمد، جریان وضعیت، و فایل‌های پاک‌شده ─────────────────────────
--
-- همان تابع 0011، با یک بند تازه پیش از جریان وضعیت.
CREATE OR REPLACE FUNCTION orders_price_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.order_number, NEW.public_token, NEW.checkout_key, NEW.user_id, NEW.price_list_version,
      NEW.price_breakdown, NEW.quote_snapshot, NEW.subtotal_rials, NEW.discount_rials,
      NEW.shipping_rials, NEW.vat_rials, NEW.rounding_rials, NEW.total_rials, NEW.est_weight_grams,
      NEW.sla_days, NEW.shipping_method_id, NEW.shipping_zone_id, NEW.province_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.order_number, OLD.public_token, OLD.checkout_key, OLD.user_id, OLD.price_list_version,
      OLD.price_breakdown, OLD.quote_snapshot, OLD.subtotal_rials, OLD.discount_rials,
      OLD.shipping_rials, OLD.vat_rials, OLD.rounding_rials, OLD.total_rials, OLD.est_weight_grams,
      OLD.sla_days, OLD.shipping_method_id, OLD.shipping_zone_id, OLD.province_id, OLD.created_at)
  THEN
    RAISE EXCEPTION 'قیمت سفارش % منجمد است', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_price_frozen';
  END IF;
  IF (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
     OR (OLD.post_handoff_due_at IS NOT NULL AND NEW.post_handoff_due_at IS DISTINCT FROM OLD.post_handoff_due_at)
     OR (OLD.status IN ('paid', 'printing', 'handed_to_post', 'cancelled') AND NEW.status IN ('awaiting_payment', 'expired'))
  THEN
    RAISE EXCEPTION 'پرداخت سفارش % برگشت ندارد', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_payment_final';
  END IF;
  IF OLD.files_deleted_at IS NOT NULL
     AND (NEW.files_deleted_at IS DISTINCT FROM OLD.files_deleted_at OR NEW.status IS DISTINCT FROM OLD.status)
  THEN
    RAISE EXCEPTION 'فایل‌های سفارش % پاک شده‌اند؛ وضعیتش عوض نمی‌شود', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_files_deleted';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'awaiting_payment' AND NEW.status IN ('paid', 'expired'))
    OR (OLD.status = 'paid' AND NEW.status IN ('printing', 'cancelled'))
    OR (OLD.status = 'printing' AND NEW.status IN ('handed_to_post', 'cancelled', 'paid'))
    OR (OLD.status = 'handed_to_post' AND NEW.status = 'printing')
    OR (OLD.status = 'cancelled' AND NEW.status IN ('paid', 'printing'))
  ) THEN
    RAISE EXCEPTION 'سفارش % از % به % نمی‌رود', OLD.order_number, OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_status_flow';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ── فایل چاپ ثبت‌شده منجمد ──────────────────────────────────────────────
CREATE FUNCTION order_print_files_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'فایل چاپ ثبت‌شده عوض نمی‌شود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'order_print_files_frozen';
END $$;
--> statement-breakpoint
CREATE TRIGGER order_print_files_frozen BEFORE UPDATE ON order_print_files
  FOR EACH ROW EXECUTE FUNCTION order_print_files_frozen();
--> statement-breakpoint

-- ── جلدها همهٔ صفحه‌ها را، پشت‌سرهم، به شمار ریز قیمت ─────────────────────
--
-- جلد ۱ از صفحهٔ ۱، هر جلد از صفحهٔ بعد از جلد قبل، جلد آخر تا `page_count`، و شمار جلدها همان `volumes` قلم در ریز قیمت
-- منجمد (`price_breakdown.items[seq - 1]`، ADR-043). جزوه‌ای که هنوز فایل چاپ ندارد چیزی برای سنجیدن ندارد.
CREATE FUNCTION order_print_files_ok(item uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  total integer;
  planned integer;
  files integer;
  misplaced integer;
  covered integer;
BEGIN
  SELECT i.page_count, (o.price_breakdown #>> ARRAY['items', (i.seq - 1)::text, 'volumes'])::integer
    INTO total, planned
    FROM order_items i JOIN orders o ON o.id = i.order_id
   WHERE i.id = item;
  IF NOT FOUND THEN
    RETURN; -- قلم با سفارشش حذف شده
  END IF;

  SELECT count(*), count(*) FILTER (WHERE NOT in_place), max(last_page)
    INTO files, misplaced, covered
    FROM (SELECT last_page,
                 volume = row_number() OVER w AND first_page = coalesce(lag(last_page) OVER w, 0) + 1 AS in_place
            FROM order_print_files
           WHERE order_item_id = item
          WINDOW w AS (ORDER BY volume)) f;

  IF files > 0 AND (misplaced > 0 OR covered <> total OR files IS DISTINCT FROM planned) THEN
    RAISE EXCEPTION 'فایل‌های چاپ جزوه صفحه‌های ۱ تا % را در % جلد پشت‌سرهم نمی‌پوشانند (فایل‌ها: %، نابه‌جا: %، تا صفحهٔ %)',
      total, coalesce(planned::text, '؟'), files, misplaced, covered
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_print_files_cover';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION order_print_files_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM order_print_files_ok(CASE WHEN TG_OP = 'DELETE' THEN OLD.order_item_id ELSE NEW.order_item_id END);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER order_print_files_cover AFTER INSERT OR UPDATE OR DELETE ON order_print_files
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_print_files_check();
--> statement-breakpoint

-- ── سفارش‌های باز پیش از ۵٫۱ ─────────────────────────────────────────────
--
-- PDF جزوه دارند ولی فایل چاپ و برگه نه. کار `prepare_order` تمام‌شده دوباره در صف (کارگر PDF جزوهٔ آماده را از نو
-- نمی‌سازد و فایل چاپ را از همان می‌سازد، پس فایل‌های `uploads/` لازم نیست)، و کار `prepare_ticket` تازه. کار زنده یا
-- شکست‌خورده دست نمی‌خورد: پنل برای شکست‌خورده «دوباره بساز» دارد. `status::text`، مثل 0015.
UPDATE jobs
   SET status = 'queued', attempts = 0, run_after = now(), locked_by = NULL, locked_until = NULL,
       last_error = NULL, finished_at = NULL, updated_at = now()
 WHERE kind = 'prepare_order' AND status = 'done'
   AND order_id IN (SELECT id FROM orders WHERE status::text IN ('paid', 'printing'));
--> statement-breakpoint
INSERT INTO jobs (kind, order_id)
SELECT 'prepare_ticket', id FROM orders WHERE status::text IN ('paid', 'printing')
ON CONFLICT (order_id, kind) DO NOTHING;
