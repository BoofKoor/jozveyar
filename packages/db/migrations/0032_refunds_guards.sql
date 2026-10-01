-- محافظ‌های `refunds` (برش ۷٫۳، ADR-051).
--
-- دست‌نویس، مثل 0030: بازپرداخت پول جابه‌جا می‌کند، پس اینکه چه چیزی برمی‌گردد و چقدر باید در خود پایگاه داده درست بماند، نه فقط در
-- کد. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `refunds_cancelled_only`: فقط سفارش «لغو شد».
--  - `refunds_paid_only`: فقط پرداخت «موفق» همان سفارش برمی‌گردد.
--  - `refunds_within_payment`: جمع بازپرداخت‌های در جریان و برگشت‌داده‌شدهٔ هر پرداخت از مبلغ آن بیشتر نمی‌شود.
--  - `refunds_insert_state`: راه درگاه «در حال برگشت» و بی پاسخ درگاه درج می‌شود (ردیف پیش از درخواست، سؤال ۱۵۴)؛ دستی همان «برگشت داده
--    شد» (CHECK `refunds_method`).
--  - `refunds_frozen`: سفارش، پرداخت، مبلغ، کارمزد، راه، ادمین، زمان ساختن، روز و یادداشت پس از درج عوض نمی‌شوند؛ شناسهٔ درگاه فقط یک بار
--    گذاشته می‌شود.
--  - `refunds_flow`: گذار فقط «در حال برگشت» ← «برگشت داده شد» یا «برنگشت»؛ این دو نهایی‌اند و ردیف دیگر عوض نمی‌شود.
--  - `refunds_append_only`: ردیف پاک نمی‌شود.
--  - `orders_status_flow` (بند تازه): سفارشی که بازپرداخت زنده دارد (در جریان یا برگشت‌داده‌شده) از «لغو شد» برنمی‌گردد.
--
-- قفل: درج بازپرداخت سطر سفارش را `FOR SHARE` و سطر پرداخت را `FOR UPDATE` می‌گیرد؛ پس برگرداندن هم‌زمان لغو (`UPDATE orders`) منتظر
-- می‌ماند و پس از commit بازپرداخت را می‌بیند، و دو درج هم‌زمان برای یک پرداخت جمع را پشت‌سرهم می‌سنجند. یکی در جریان برای هر پرداخت
-- همان `refunds_one_pending` (0031) است.

CREATE FUNCTION refunds_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  order_state order_status;
  pay record;
  live bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO order_state FROM orders WHERE id = NEW.order_id FOR SHARE;
    IF order_state IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'سفارش % لغو نشده؛ بازپرداخت ندارد', NEW.order_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_cancelled_only';
    END IF;
    SELECT order_id, status, amount_rials INTO pay FROM payments WHERE id = NEW.payment_id FOR UPDATE;
    IF pay.order_id IS DISTINCT FROM NEW.order_id OR pay.status IS DISTINCT FROM 'succeeded' THEN
      RAISE EXCEPTION 'پرداخت % پرداخت موفق سفارش % نیست', NEW.payment_id, NEW.order_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_paid_only';
    END IF;
    SELECT coalesce(sum(amount_rials), 0) INTO live FROM refunds
      WHERE payment_id = NEW.payment_id AND status IN ('pending', 'succeeded');
    IF live + NEW.amount_rials > pay.amount_rials THEN
      RAISE EXCEPTION 'بازپرداخت‌های پرداخت % از مبلغش بیشتر می‌شود', NEW.payment_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_within_payment';
    END IF;
    IF NEW.method = 'gateway' AND (NEW.status IS DISTINCT FROM 'pending' OR NEW.gateway_ref IS NOT NULL OR NEW.reference IS NOT NULL
         OR NEW.gateway_status IS NOT NULL OR NEW.gateway_error IS NOT NULL OR NEW.gateway_checked_at IS NOT NULL OR NEW.raw IS NOT NULL)
    THEN
      RAISE EXCEPTION 'بازپرداخت از درگاه پیش از درخواست ساخته می‌شود، بی پاسخ درگاه'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_insert_state';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'بازپرداخت % پاک نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_append_only';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'بازپرداخت % بسته شده و عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_flow';
  END IF;
  IF (NEW.id, NEW.order_id, NEW.payment_id, NEW.amount_rials, NEW.fee_rials, NEW.method, NEW.admin_user_id, NEW.created_at,
      NEW.refunded_on, NEW.note)
       IS DISTINCT FROM
     (OLD.id, OLD.order_id, OLD.payment_id, OLD.amount_rials, OLD.fee_rials, OLD.method, OLD.admin_user_id, OLD.created_at,
      OLD.refunded_on, OLD.note)
     OR (OLD.gateway_ref IS NOT NULL AND NEW.gateway_ref IS DISTINCT FROM OLD.gateway_ref)
  THEN
    RAISE EXCEPTION 'بازپرداخت % عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE OR DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION refunds_guard();
--> statement-breakpoint

-- ── سفارش با بازپرداخت زنده از «لغو شد» برنمی‌گردد ─────────────────────────
--
-- همان تابع 0016، با یک بند تازه پس از جریان وضعیت.
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
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (SELECT 1 FROM refunds WHERE order_id = OLD.id AND status IN ('pending', 'succeeded'))
  THEN
    RAISE EXCEPTION 'پول سفارش % برگشته یا در راه برگشت است؛ لغوش برنمی‌گردد', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_status_flow';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
