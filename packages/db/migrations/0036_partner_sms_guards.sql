-- محافظ‌های پیامک چاپخانه (برش ۷٫۶، ADR-049؛ سؤال‌های ۱۲۶ و ۱۷۴).
--
-- دست‌نویس، مثل 0026 و 0028 و به همان دلیل: پیامک چاپخانه به موبایل یک طرف بیرونی می‌رود، پس «یک پیامک برای هر تخصیص»، «دو بار نه» و
-- «سفارشی که دیگر در صف چاپ همین چاپخانه نیست، پیامکش هرگز» باید در خود پایگاه داده درست بمانند، نه فقط در پنل. هر خطا با نام محدودیت
-- برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `sms_messages_guard` (بازنویسی 0028): همان گذارها برای پیامک چاپخانه هم (`sms_messages_flow`، `sms_messages_frozen`)؛ «در حال
--    فرستادن» پیامک چاپخانه فقط برای ردیفی که به تخصیص امروز سفارشی وصل است که هنوز «در صف چاپ» همان چاپخانه است
--    (`sms_messages_live`، سؤال ۱۷۴): پیامک سفارشی که جابه‌جا، چاپ یا لغو شد نمی‌رود و «دوباره بفرست» هم ندارد. پرداخت و رهگیری همان 0028.
--  - `order_assignments_partner_sms` (پیش از درج تخصیص): تخصیص به چاپخانه‌ای که موبایل اعلان دارد پیامک دارد: ردیف تازهٔ منتظر
--    (`partner_order`، بی تلاش) به همان موبایل و برای همین سفارش (پارامتر اول شمارهٔ سفارش)؛ تخصیص به چاپخانهٔ بی موبایل پیامک ندارد.
--    موبایل چاپخانه `FOR SHARE` خوانده می‌شود: ویرایش هم‌زمانش منتظر این تراکنش می‌ماند، یا این منتظر آن و بعد شمارهٔ تازه را می‌بیند.
--    «یک پیامک برای هر تخصیص» را شاخص یکتای `order_assignments_sms` (0035) نگه می‌دارد، و ردیف تخصیص (پس پیامکش) عوض نمی‌شود
--    (`order_assignments_append_only`، 0018).

-- ── ردیف پیامک: گذار پیامک چاپخانه هم، تا سفارش در صف چاپ همان چاپخانه است ─────
CREATE OR REPLACE FUNCTION sms_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.created_at, NEW.to_mobile, NEW.purpose, NEW.body, NEW.params)
       IS DISTINCT FROM (OLD.id, OLD.created_at, OLD.to_mobile, OLD.purpose, OLD.body, OLD.params)
     OR OLD.purpose NOT IN ('tracking', 'order_paid', 'partner_order')
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
       OR (OLD.purpose = 'partner_order'
          AND NOT EXISTS (SELECT 1 FROM order_assignments a JOIN orders o ON o.id = a.order_id
                           WHERE a.sms_message_id = NEW.id AND o.status = 'paid' AND o.print_partner_id = a.to_partner_id
                             AND a.id = (SELECT max(b.id) FROM order_assignments b WHERE b.order_id = a.order_id)))
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

-- ── تخصیص: پیامک تازهٔ همین سفارش برای چاپخانهٔ با موبایل، و هیچ برای بقیه ───────
CREATE FUNCTION order_assignments_partner_sms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  phone text;
  number integer;
  message sms_messages%ROWTYPE;
BEGIN
  SELECT notify_mobile INTO phone FROM print_partners WHERE id = NEW.to_partner_id FOR SHARE;
  IF phone IS NULL THEN
    IF NEW.sms_message_id IS NOT NULL THEN
      RAISE EXCEPTION 'چاپخانه‌ای که موبایل اعلان ندارد پیامک سفارش تازه نمی‌گیرد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_partner_sms';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.sms_message_id IS NULL THEN
    RAISE EXCEPTION 'تخصیص به چاپخانه‌ای که موبایل اعلان دارد پیامک سفارش تازه ندارد'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_partner_sms';
  END IF;
  SELECT * INTO message FROM sms_messages WHERE id = NEW.sms_message_id FOR UPDATE;
  SELECT order_number INTO number FROM orders WHERE id = NEW.order_id;
  IF message.purpose IS DISTINCT FROM 'partner_order' OR message.to_mobile IS DISTINCT FROM phone
     OR message.status IS DISTINCT FROM 'pending' OR message.attempts IS DISTINCT FROM 0
     OR message.params ->> 0 IS DISTINCT FROM number::text
  THEN
    RAISE EXCEPTION 'پیامک % پیامک تازهٔ چاپخانه برای همین سفارش نیست', NEW.sms_message_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_partner_sms';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_assignments_partner_sms BEFORE INSERT ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION order_assignments_partner_sms();
