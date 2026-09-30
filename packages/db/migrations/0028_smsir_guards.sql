-- محافظ‌های پیامک پرداخت از صف و هزینهٔ پیامک (برش ۷٫۱، ADR-049).
--
-- دست‌نویس، مثل 0026 و به همان دلیل: پیامک پرداخت به موبایل مشتری می‌رود و هزینه دارد، پس «یک پیامک برای هر پرداخت موفق»، «دو بار
-- نه» و «سفارش لغوشده پیامک پرداخت نمی‌گیرد» باید در خود پایگاه داده درست بمانند، نه فقط در وب و پنل. هر خطا با نام محدودیت برمی‌گردد
-- (`check_violation` و `CONSTRAINT`).
--
--  - `sms_messages_guard` (بازنویسی 0026): پیامک پرداخت هم مثل رهگیری از صف است، با همان گذارها (`sms_messages_flow`): منتظر ← در حال
--    فرستادن؛ در حال فرستادن ← رفت، نرفت، یا دوباره در حال فرستادن؛ نرفت ← در حال فرستادن («دوباره بفرست»). «در حال فرستادن» فقط برای
--    پیامکی که هنوز رفتنی است (`sms_messages_live`): رهگیری با کد رهگیری زنده (همان 0026)، و پرداخت با پرداخت موفقی که به آن وصل است و
--    سفارشی که «در صف چاپ» یا «در حال چاپ» است؛ سفارش لغوشده یا به پست رسیده پیامک «پرداخت شد» نمی‌گیرد. پیامک کد و هر پیامکی که از
--    صف نیست همان منجمد 0026. هزینه (`cost`) تریگر نمی‌خواهد: CHECK `sms_messages_cost` (0027) آن را فقط برای «رفت» می‌پذیرد، و «رفت»
--    فقط از «در حال فرستادن» می‌آید و پایان است.
--  - `payments_sms` (پیش از به‌روز شدن پرداخت): پرداختی که همین حالا موفق می‌شود پیامک پرداخت دارد، در همان UPDATE: ردیف تازهٔ منتظر
--    هدف `order_paid`، به موبایل همان سفارش، هنوز فرستاده‌نشده و وصل به هیچ پرداخت دیگری (یک پیامک برای هر پرداخت). پیامک پرداخت پس از
--    آن عوض نمی‌شود. پرداختی که پیش از ۷٫۱ موفق شد پیامکی ندارد و همان می‌ماند. پرداختی که یکراست موفق درج شود (فقط دادهٔ تست؛ کد همیشه
--    «در انتظار» درج می‌کند) این تریگر را نمی‌بیند؛ گذار پرداخت محافظ `payments_flow` برنامهٔ ۷٫۲ است (ADR-050).

-- ── ردیف پیامک: گذار رهگیری و پرداخت ─────────────────────────────────
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
    THEN
      RAISE EXCEPTION 'پیامک % از % دوباره فرستاده نمی‌شود', OLD.id, OLD.status
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_flow';
    END IF;
    IF OLD.purpose = 'tracking'
       AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = NEW.id AND s.voided_at IS NULL)
    THEN
      RAISE EXCEPTION 'پیامک % کد رهگیری زنده ندارد', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_live';
    END IF;
    IF OLD.purpose = 'order_paid'
       AND NOT EXISTS (
         SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.sms_message_id = NEW.id AND p.status = 'succeeded' AND o.status IN ('paid', 'printing'))
    THEN
      RAISE EXCEPTION 'پیامک % پرداخت موفقی ندارد یا سفارشش دیگر در صف یا در حال چاپ نیست', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_live';
    END IF;
  ELSIF NOT (
       OLD.status = 'sending'
       AND NEW.status IN ('logged', 'sent', 'failed')
       AND NEW.attempts = OLD.attempts
       AND NEW.attempted_at IS NOT DISTINCT FROM OLD.attempted_at
       AND (NEW.sent_at IS NOT NULL) = (NEW.status IN ('logged', 'sent'))
     )
  THEN
    RAISE EXCEPTION 'پیامک % از % به % نمی‌رود', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'sms_messages_flow';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- ── پرداخت موفق: یک پیامک پرداخت، در همان UPDATE ────────────────────────
CREATE FUNCTION payments_sms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  message sms_messages%ROWTYPE;
  phone text;
BEGIN
  IF NEW.sms_message_id IS NOT DISTINCT FROM OLD.sms_message_id THEN
    IF OLD.status <> 'succeeded' AND NEW.status = 'succeeded' THEN
      RAISE EXCEPTION 'پرداخت % موفق می‌شود ولی پیامک پرداخت ندارد', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.sms_message_id IS NOT NULL OR OLD.status <> 'pending' OR NEW.status <> 'succeeded' THEN
    RAISE EXCEPTION 'پیامک پرداخت % فقط همراه موفق شدنش، و یک بار', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
  END IF;
  SELECT * INTO message FROM sms_messages WHERE id = NEW.sms_message_id FOR UPDATE;
  SELECT recipient_phone INTO phone FROM orders WHERE id = NEW.order_id;
  IF message.purpose IS DISTINCT FROM 'order_paid'
     OR message.to_mobile IS DISTINCT FROM phone
     OR message.status IS DISTINCT FROM 'pending'
     OR message.attempts <> 0
     OR EXISTS (SELECT 1 FROM payments p WHERE p.sms_message_id = NEW.sms_message_id AND p.id <> NEW.id)
  THEN
    RAISE EXCEPTION 'پیامک % پیامک پرداخت تازهٔ همین سفارش نیست', NEW.sms_message_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_sms';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_sms BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_sms();
