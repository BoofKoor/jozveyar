-- جریان وضعیت سفارش پس از پرداخت (برش ۴٫۳، ADR-039)، در همان تریگر قیمت منجمد (0006).
--
-- دست‌نویس، مثل 0006 و به همان دلیل: سفارشی که پرداخت نشده نباید «در حال چاپ» شود، و «تحویل پست شد» بی چاپ نه؛ این
-- باید در پایگاه داده غیرممکن باشد، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `orders_payment_final` حالا همهٔ وضعیت‌های پس از پرداخت را می‌پوشاند: هیچ‌کدام به «در انتظار» یا «منقضی» برنمی‌گردد.
--  - `orders_status_flow`: فقط این گذارها. رو به جلو «در صف چاپ» ← «در حال چاپ» ← «تحویل پست شد»، و «لغو شد» از دو
--    وضعیت اول؛ و برگرداندن یک قدم (فقط مالک، در پنل): «در حال چاپ» ← «در صف چاپ»، «تحویل پست شد» ← «در حال چاپ»، و
--    «لغو شد» ← وضعیتی که پیش از لغو داشت.
--
-- بدنهٔ تابع plpgsql فقط هنگام اجرا خوانده می‌شود، پس مقدارهای تازهٔ 0010 اینجا به کار می‌روند، حتی در همان تراکنش
-- مهاجرت؛ این اجرا هیچ ردیف `orders`ی را عوض نمی‌کند.
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
