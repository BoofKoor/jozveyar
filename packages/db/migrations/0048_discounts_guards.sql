-- محافظ تخفیف (برش ۱۱٫۴، ADR-062).
--
-- دست‌نویس، مثل 0013، 0032 و 0046. خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ
-- رد کرد و رابط کدام پیام را بدهد.
--
--  - **پله‌ها مثل بقیهٔ ردیف‌های نسخه:** فقط در پیش‌نویس (`price_list_rows_frozen`، 0013)، و هر نسخه تا ۵ پله (`discount_tiers_max`، همان
--    `DISCOUNT_TIERS_MAX` قرارداد).
--  - **کد:** متن، سازنده و زمان ساختن هرگز عوض نمی‌شوند، و شرط‌ها (نوع، درصد، سقف، مبلغ و حداقل) از اولین سفارشی که کد را گرفت
--    (`discount_codes_frozen`)، تا ریز قیمت منجمد هر سفارش همان شرطی باشد که کد امروز نشان می‌دهد؛ کد پاک نمی‌شود، خاموش می‌شود
--    (`discount_codes_append_only`).
--  - **ظرفیت (سؤال ۳۰۱):** سفارشی که کد را گرفته یا پرداخت شده (هر وضعیت پس از پرداخت، لغوشده هم: لغو استفاده را برنمی‌گرداند)، یا
--    در انتظار پرداخت است با رزرو زنده، یعنی خودش یا تلاش پرداختی در راهش در مهلت یک تلاش ساخته شده (`payment_attempt_ttl`، همان
--    `PAYMENT_ATTEMPT_TTL_MS`). ظرفیت زیر قفل ردیف کد سنجیده می‌شود (`discount_code_room`)، پس دو درخواست هم‌زمان پشت هم‌اند و هرگز
--    هر دو آخرین جا را نمی‌گیرند: با ساختن سفارش (روشن و در روز اعتبار هم، `orders_discount_code_valid`)، با هر تلاش پرداخت تازه، و
--    با پرداخت شدن، که فقط پرداخت‌شده‌ها را می‌شمارد (`discount_codes_total_limit` و `discount_codes_customer_limit`). سرور پیش از `verify`
--    همان سنجش رزرو را زیر همان قفل می‌کند (`settle`)، پس محافظ پرداخت شدن فقط دیوار دوم است.
--  - **سفارش:** کد سفارش هم مثل قیمتش منجمد است (`orders_price_frozen`، همان تابع 0032 با یک ستون تازه).
--
-- ترتیب قفل‌ها همه‌جا سفارش و بعد کد است (برگشت از درگاه: تلاش، سفارش، کد؛ تلاش تازه: سفارش، کد)، تا دو تراکنش منتظر هم نمانند.

-- ── پله‌ها ─────────────────────────────────────────────────────────────
CREATE TRIGGER discount_tiers_frozen BEFORE INSERT OR UPDATE OR DELETE ON discount_tiers
  FOR EACH ROW EXECUTE FUNCTION price_list_rows_frozen();
--> statement-breakpoint
CREATE FUNCTION discount_tiers_max() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM discount_tiers WHERE price_list_version = NEW.price_list_version) > 5 THEN
    RAISE EXCEPTION 'نسخهٔ % تعرفه بیش از ۵ پلهٔ تخفیف دارد', NEW.price_list_version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'discount_tiers_max';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER discount_tiers_max AFTER INSERT OR UPDATE ON discount_tiers
  FOR EACH ROW EXECUTE FUNCTION discount_tiers_max();
--> statement-breakpoint

-- ── کد ─────────────────────────────────────────────────────────────────
CREATE FUNCTION discount_codes_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'کد تخفیف % پاک نمی‌شود؛ خاموشش کن', OLD.code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'discount_codes_append_only';
  END IF;
  IF (NEW.id, NEW.code, NEW.created_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.code, OLD.created_by, OLD.created_at)
     OR ((NEW.kind, NEW.percent, NEW.max_discount_rials, NEW.amount_rials, NEW.min_order_rials)
           IS DISTINCT FROM (OLD.kind, OLD.percent, OLD.max_discount_rials, OLD.amount_rials, OLD.min_order_rials)
         AND EXISTS (SELECT 1 FROM orders WHERE discount_code_id = OLD.id))
  THEN
    RAISE EXCEPTION 'شرط‌های کد تخفیف % پس از اولین سفارش عوض نمی‌شوند؛ کد تازه بساز', OLD.code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'discount_codes_frozen';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER discount_codes_guard BEFORE UPDATE OR DELETE ON discount_codes
  FOR EACH ROW EXECUTE FUNCTION discount_codes_guard();
--> statement-breakpoint

-- ── ظرفیت ──────────────────────────────────────────────────────────────
--
-- مهلت هر تلاش پرداخت (سؤال ۱۴۴): پس از آن `verify` هرگز نمی‌خورد، پس رزرو هم پس از آن زنده نیست. تست یکپارچگی برابرش را با
-- `PAYMENT_ATTEMPT_TTL_MS` می‌سنجد.
CREATE FUNCTION payment_attempt_ttl() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '10 minutes' $$;
--> statement-breakpoint
-- سفارش‌هایی که از ظرفیت کد گرفته‌اند، همه و این مشتری، بی قفل: پرداخت‌شده‌ها، و با `reserved` رزروهای زنده هم. `except_order` خود
-- سفارشی است که سنجیده می‌شود. پیام روشن مسیر خرید و شمارهای پنل از همین‌اند، و `discount_code_room` همین را زیر قفل.
CREATE FUNCTION discount_code_taken(code_id uuid, room_user uuid, except_order uuid, reserved boolean)
RETURNS TABLE (taken bigint, taken_by_user bigint) LANGUAGE sql STABLE AS $$
  SELECT count(*), count(*) FILTER (WHERE o.user_id = room_user)
  FROM orders o
  WHERE o.discount_code_id = code_id
    AND o.id IS DISTINCT FROM except_order
    AND (o.status::text IN ('paid', 'printing', 'handed_to_post', 'cancelled')
         OR (reserved AND o.status::text = 'awaiting_payment'
             AND (o.created_at > now() - payment_attempt_ttl()
                  OR EXISTS (SELECT 1 FROM payments p
                             WHERE p.order_id = o.id AND p.status = 'pending' AND p.created_at > now() - payment_attempt_ttl()))))
$$;
--> statement-breakpoint
-- جا برای یک سفارش دیگر با این کد، برای این مشتری: null یعنی هست، وگرنه نام محدودیتی که پر است. ردیف کد را تا پایان تراکنش قفل
-- می‌کند. `reserved` رزروهای زنده را هم می‌شمارد؛ بی آن فقط پرداخت‌شده‌ها (دیوار پرداخت شدن).
CREATE FUNCTION discount_code_room(code_id uuid, room_user uuid, except_order uuid, reserved boolean) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  c discount_codes%ROWTYPE;
  taken bigint;
  taken_by_user bigint;
BEGIN
  SELECT * INTO c FROM discount_codes WHERE id = code_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'orders_discount_code_valid';
  END IF;
  SELECT t.taken, t.taken_by_user INTO taken, taken_by_user FROM discount_code_taken(code_id, room_user, except_order, reserved) t;
  IF c.total_limit IS NOT NULL AND taken >= c.total_limit THEN
    RETURN 'discount_codes_total_limit';
  END IF;
  IF taken_by_user >= c.per_customer_limit THEN
    RETURN 'discount_codes_customer_limit';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION orders_discount_code_room() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c discount_codes%ROWTYPE;
  refused text;
BEGIN
  IF NEW.discount_code_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM discount_codes WHERE id = NEW.discount_code_id FOR UPDATE;
    IF NOT c.enabled OR (c.valid_from IS NOT NULL AND now() < c.valid_from) OR (c.valid_until IS NOT NULL AND now() >= c.valid_until) THEN
      RAISE EXCEPTION 'کد تخفیف % امروز به کار نمی‌رود', c.code
        USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_discount_code_valid';
    END IF;
    refused := discount_code_room(NEW.discount_code_id, NEW.user_id, NEW.id, true);
  ELSIF OLD.status::text = 'awaiting_payment' AND NEW.status::text = 'paid' THEN
    refused := discount_code_room(NEW.discount_code_id, NEW.user_id, NEW.id, false);
  END IF;
  IF refused IS NOT NULL THEN
    RAISE EXCEPTION 'کد تخفیف سفارش % دیگر جا ندارد', NEW.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = refused;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_discount_code_room BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_discount_code_room();
--> statement-breakpoint
-- هر تلاش پرداخت تازه رزرو را تازه می‌کند، اگر جا هست. سفارش اول قفل می‌شود، بعد کد، به همان ترتیب برگشت از درگاه.
CREATE FUNCTION payments_discount_code_room() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  o orders%ROWTYPE;
  refused text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = NEW.order_id AND discount_code_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO o FROM orders WHERE id = NEW.order_id FOR UPDATE;
  refused := discount_code_room(o.discount_code_id, o.user_id, o.id, true);
  IF refused IS NOT NULL THEN
    RAISE EXCEPTION 'کد تخفیف سفارش % دیگر جا ندارد', o.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = refused;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_discount_code_room BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_discount_code_room();
--> statement-breakpoint

-- ── کد سفارش منجمد است ─────────────────────────────────────────────────
--
-- همان تابع 0032، با `discount_code_id` در فهرست ستون‌های منجمد.
CREATE OR REPLACE FUNCTION orders_price_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.order_number, NEW.public_token, NEW.checkout_key, NEW.user_id, NEW.price_list_version,
      NEW.price_breakdown, NEW.quote_snapshot, NEW.subtotal_rials, NEW.discount_rials,
      NEW.shipping_rials, NEW.vat_rials, NEW.rounding_rials, NEW.total_rials, NEW.est_weight_grams,
      NEW.sla_days, NEW.shipping_method_id, NEW.shipping_zone_id, NEW.province_id, NEW.created_at,
      NEW.discount_code_id)
     IS DISTINCT FROM
     (OLD.order_number, OLD.public_token, OLD.checkout_key, OLD.user_id, OLD.price_list_version,
      OLD.price_breakdown, OLD.quote_snapshot, OLD.subtotal_rials, OLD.discount_rials,
      OLD.shipping_rials, OLD.vat_rials, OLD.rounding_rials, OLD.total_rials, OLD.est_weight_grams,
      OLD.sla_days, OLD.shipping_method_id, OLD.shipping_zone_id, OLD.province_id, OLD.created_at,
      OLD.discount_code_id)
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
