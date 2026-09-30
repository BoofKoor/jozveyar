-- محافظ‌های پیامک رهگیری (برش ۶٫۳، ADR-047).
--
-- دست‌نویس، مثل 0022 و 0024 و به همان دلیل: پیامک رهگیری به موبایل مشتری می‌رود، پس «یک پیامک برای هر مرسوله»، «دو بار نه» و
-- «کد کنارگذاشته هرگز» باید در خود پایگاه داده درست بمانند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و
-- `CONSTRAINT`).
--
--  - `sms_messages_guard`: ردیف پیامک کد و پرداخت پس از درج عوض نمی‌شود؛ ردیف رهگیری فقط وضعیتش، و به این ترتیب
--    (`sms_messages_flow`): منتظر ← در حال فرستادن؛ در حال فرستادن ← رفت، نرفت، یا دوباره در حال فرستادن (فرستنده‌ای که افتاد)؛ نرفت ←
--    در حال فرستادن («دوباره بفرست»). «رفت» پایان است. هر «در حال فرستادن» یک تلاش بیشتر و زمانش را دارد، و فقط برای ردیفی که کد
--    رهگیری زنده‌ای به آن وصل است (`sms_messages_live`): کد کنارگذاشته پیامک نمی‌گیرد. شماره، هدف، متن، پارامترها و زمان ساختن
--    منجمدند (`sms_messages_frozen`).
--  - `shipments_sms` (پیش از درج مرسوله، پس از `shipments_insert` به ترتیب نام): از ۶٫۳ هر مرسولهٔ تازه پیامک دارد، از هدف `tracking` و
--    به موبایل همان سفارش. یا ردیف تازهٔ منتظری که به هیچ مرسولهٔ دیگری وصل نیست (یک پیامک برای هر مرسوله)، یا — سؤال ۶۷ — همان
--    ردیفی که پیش‌تر برای همین سفارش و همین بارکد «رفت»؛ و اگر چنین ردیفی هست، فقط همان: همان کد برای همان سفارش پیامک دوباره
--    نمی‌گیرد.
--  - `shipments_frozen` (بازنویسی 0022): پیامک مرسوله هم منجمد است.

-- ── ردیف پیامک: فقط گذار وضعیت رهگیری ─────────────────────────────────
CREATE FUNCTION sms_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.created_at, NEW.to_mobile, NEW.purpose, NEW.body, NEW.params)
       IS DISTINCT FROM (OLD.id, OLD.created_at, OLD.to_mobile, OLD.purpose, OLD.body, OLD.params)
     OR OLD.purpose <> 'tracking'
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
    IF NOT EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = NEW.id AND s.voided_at IS NULL) THEN
      RAISE EXCEPTION 'پیامک % کد رهگیری زنده ندارد', OLD.id
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
CREATE TRIGGER sms_messages_guard BEFORE UPDATE ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION sms_messages_guard();
--> statement-breakpoint

-- ── مرسولهٔ تازه: یک پیامک، و همان کد برای همان سفارش دو بار نه ───────────
CREATE FUNCTION shipments_sms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  message sms_messages%ROWTYPE;
  phone text;
  earlier bigint;
BEGIN
  IF NEW.sms_message_id IS NULL THEN
    RAISE EXCEPTION 'مرسولهٔ سفارش پیامک رهگیری ندارد'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_sms';
  END IF;
  SELECT * INTO message FROM sms_messages WHERE id = NEW.sms_message_id FOR UPDATE;
  SELECT recipient_phone INTO phone FROM orders WHERE id = NEW.order_id;
  IF message.purpose IS DISTINCT FROM 'tracking' OR message.to_mobile IS DISTINCT FROM phone THEN
    RAISE EXCEPTION 'پیامک مرسوله رهگیری همین سفارش نیست'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_sms';
  END IF;
  -- سؤال ۶۷: همین کد پیش‌تر برای همین سفارش پیامک شد و رفت؛ فقط همان.
  SELECT s.sms_message_id INTO earlier
    FROM shipments s JOIN sms_messages m ON m.id = s.sms_message_id
   WHERE s.order_id = NEW.order_id AND s.barcode = NEW.barcode AND m.status IN ('logged', 'sent')
   ORDER BY s.created_at DESC
   LIMIT 1;
  IF earlier IS NOT NULL THEN
    IF NEW.sms_message_id <> earlier THEN
      RAISE EXCEPTION 'کد % برای همین سفارش پیش‌تر پیامک شده؛ پیامک دوباره نمی‌رود', NEW.barcode
        USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_sms_once';
    END IF;
  ELSIF message.status <> 'pending' OR message.attempts <> 0
     OR EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = NEW.sms_message_id)
  THEN
    -- یک پیامک برای هر مرسوله: ردیف تازه، هنوز فرستاده‌نشده و بی مرسولهٔ دیگر.
    RAISE EXCEPTION 'پیامک % مال مرسولهٔ دیگری است یا تازه نیست', NEW.sms_message_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_sms';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shipments_sms BEFORE INSERT ON shipments
  FOR EACH ROW EXECUTE FUNCTION shipments_sms();
--> statement-breakpoint

-- ── مرسوله: پیامکش هم منجمد (بازنویسی 0022) ────────────────────────────
CREATE OR REPLACE FUNCTION shipments_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
  ELSIF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
    AND (NEW.id, NEW.order_id, NEW.barcode, NEW.import_id, NEW.row_no, NEW.weight_grams, NEW.fare_rials, NEW.tax_rials,
         NEW.post_day, NEW.matched_by, NEW.handed_order, NEW.admin_user_id, NEW.created_at, NEW.sms_message_id)
        IS NOT DISTINCT FROM
        (OLD.id, OLD.order_id, OLD.barcode, OLD.import_id, OLD.row_no, OLD.weight_grams, OLD.fare_rials, OLD.tax_rials,
         OLD.post_day, OLD.matched_by, OLD.handed_order, OLD.admin_user_id, OLD.created_at, OLD.sms_message_id)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'مرسوله عوض یا پاک نمی‌شود؛ فقط یک بار کنار می‌رود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'shipments_frozen';
END $$;
