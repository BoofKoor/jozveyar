-- محافظ‌های پیامک پرداخت (برش ۷٫۱، ADR-049).
--
-- دست‌نویس، مثل 0026 و به همان دلیل: پیامک پرداخت از ۷٫۱ مثل رهگیری از صف می‌رود (ردیف «منتظر» در همان تراکنش پرداخت موفق،
-- فرستادن بعد از commit، و «دوباره بفرست» در پنل)، پس «یک پیامک برای هر پرداخت موفق» و «دو بار نه» باید در خود پایگاه داده درست
-- بمانند. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `sms_messages_guard` (بازنویسی 0026): گذار منتظر ← در حال فرستادن ← رفت یا نرفت، و نرفت ← در حال فرستادن، برای پیامک پرداخت هم
--    (`sms_messages_flow`)؛ پیامک کد همچنان پس از درج منجمد است (`sms_messages_frozen`). «در حال فرستادن» پیامک پرداخت فقط برای ردیفی
--    که به پرداخت موفق سفارشی لغونشده وصل است (`sms_messages_live`)؛ رهگیری همان کد زنده. هزینه (`cost`) فقط با «رفت» گذاشته می‌شود.
--  - `payments_sms`: تلاش پرداخت بی پیامک درج می‌شود؛ پیامک فقط در گذار «در انتظار ← موفق» گذاشته می‌شود و بعد عوض نمی‌شود؛ هر
--    گذار به «موفق» پیامک دارد: ردیف تازهٔ منتظر (`order_paid`، بی تلاش) به موبایل گیرندهٔ همان سفارش. «یک پیامک برای هر پرداخت» را
--    شاخص یکتای `payments_sms` (0027) نگه می‌دارد.

-- ── ردیف پیامک: گذار پرداخت هم، مثل رهگیری ───────────────────────────────
CREATE OR REPLACE FUNCTION sms_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.created_at, NEW.to_mobile, NEW.purpose, NEW.body, NEW.params)
       IS DISTINCT FROM (OLD.id, OLD.created_at, OLD.to_mobile, OLD.purpose, OLD.body, OLD.params)
     OR OLD.purpose NOT IN ('tracking', 'order_paid')
  THEN
    RAISE EXCEPTION 'پیامک % عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_frozen';
  END IF;
  IF NEW.status = 'sending' THEN
    IF OLD.status NOT IN ('pending', 'sending', 'failed')
       OR NEW.attempts <> OLD.attempts + 1
       OR NEW.attempted_at IS NULL
       OR NEW.attempted_at < OLD.attempted_at
       OR NEW.sent_at IS NOT NULL
       OR NEW.cost IS DISTINCT FROM OLD.cost
    THEN
      RAISE EXCEPTION 'پیامک % از % دوباره فرستاده نمی‌شود', OLD.id, OLD.status
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_flow';
    END IF;
    IF (OLD.purpose = 'tracking'
          AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = NEW.id AND s.voided_at IS NULL))
       OR (OLD.purpose = 'order_paid'
          AND NOT EXISTS (SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id
                           WHERE p.sms_message_id = NEW.id AND p.status = 'succeeded' AND o.status <> 'cancelled'))
    THEN
      RAISE EXCEPTION 'پیامک % دیگر زنده نیست', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_live';
    END IF;
  ELSIF NOT (
       OLD.status = 'sending'
       AND NEW.status IN ('logged', 'sent', 'failed')
       AND NEW.attempts = OLD.attempts
       AND NEW.attempted_at IS NOT DISTINCT FROM OLD.attempted_at
       AND (NEW.sent_at IS NOT NULL) = (NEW.status IN ('logged', 'sent'))
       AND (NEW.cost IS NOT DISTINCT FROM OLD.cost OR NEW.status IN ('logged', 'sent'))
     )
  THEN
    RAISE EXCEPTION 'پیامک % از % به % نمی‌رود', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_flow';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ── پرداخت موفق: پیامک منتظرش، فقط همان یک بار ─────────────────────────────
CREATE FUNCTION payments_sms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  message sms_messages%ROWTYPE;
  phone text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sms_message_id IS NOT NULL THEN
      RAISE EXCEPTION 'تلاش پرداخت تازه پیامک ندارد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.sms_message_id IS NOT DISTINCT FROM OLD.sms_message_id THEN
    IF NEW.status = 'succeeded' AND OLD.status <> 'succeeded' THEN
      RAISE EXCEPTION 'پرداخت موفق پیامک پرداخت ندارد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.sms_message_id IS NOT NULL OR NEW.sms_message_id IS NULL OR OLD.status <> 'pending' OR NEW.status <> 'succeeded' THEN
    RAISE EXCEPTION 'پیامک پرداخت فقط در گذار «موفق» گذاشته می‌شود و عوض نمی‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
  END IF;
  SELECT * INTO message FROM sms_messages WHERE id = NEW.sms_message_id FOR UPDATE;
  SELECT recipient_phone INTO phone FROM orders WHERE id = NEW.order_id;
  IF message.purpose IS DISTINCT FROM 'order_paid' OR message.to_mobile IS DISTINCT FROM phone
     OR message.status IS DISTINCT FROM 'pending' OR message.attempts <> 0
  THEN
    RAISE EXCEPTION 'پیامک % پیامک تازهٔ پرداخت همین سفارش نیست', NEW.sms_message_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_sms BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_sms();
