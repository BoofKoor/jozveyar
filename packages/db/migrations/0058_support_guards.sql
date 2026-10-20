-- محافظ‌های گفت‌وگوی پشتیبانی (برش ۱۲٫۱، ADR-068؛ سؤال‌های ۳۰۹ تا ۳۱۲ و ۳۱۶).
--
-- دست‌نویس، مثل 0036 و 0043. پیام مشتری بخشی از تاریخچهٔ سفارش است و پاسخ ما با پیامک به موبایل مشتری می‌رود، پس «فقط افزودنی»، «حال فقط با
-- پیام» و «سقف هر مشتری» در خود پایگاه داده درست می‌مانند، نه فقط در سایت و پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و
-- `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.
--
--  - **گفت‌وگوی تازه** (`support_threads_insert_state`): «باز»، با انتظار و آخرین پیام همان لحظهٔ ساختن؛ مشتری با اولین پیامش می‌سازدش.
--  - **صاحب سفارش** (`support_threads_owner`): گفت‌وگوی یک سفارش فقط مال همان مشتری‌ای است که سفارش را داد؛ و «سؤال کلی» فقط برای مشتری‌ای
--    که سفارشی دارد (`support_threads_customer`، سؤال ۳۰۶: پرسش پیش از سفارش راهش «تماس» است).
--  - **عوض نمی‌شود** (`support_threads_frozen`): مشتری، سفارش و زمان ساختن.
--  - **حال فقط با پیام** (`support_threads_state`): حال، انتظار و آخرین پیام را فقط تریگر `support_messages_apply` پس از هر پیام عوض می‌کند
--    (`pg_trigger_depth`)؛ پنل و سایت مستقیم نه. «دیده شد» مشتری عوض‌شدنی است، ولی فقط جلو می‌رود (`support_threads_seen`).
--  - **پاک نمی‌شود** (`support_threads_kept`): گفت‌وگوی سفارش فقط با پاک شدن خود سفارش (cascade، فقط تست‌ها)، و «سؤال کلی» هرگز.
--  - **پیام فقط افزودنی** (`support_messages_append_only`): پیام عوض و پاک نمی‌شود، جز با پاک شدن گفت‌وگویش (همان `order_notes`، 0043).
--  - **ترتیب** (`support_messages_order`): پیام تازه پیش از آخرین پیام گفت‌وگو نیست.
--  - **بستن یک بار** (`support_messages_close_once`): گفت‌وگوی بسته دوباره بسته نمی‌شود؛ پیام تازهٔ مشتری یا پاسخ ما بازش می‌کند.
--  - **سقف هر مشتری** (سؤال ۳۱۰): ۱۰ پیام در ساعت (`support_messages_rate`)، و پیامی که گفت‌وگوی چهارمی را «باز» کند نه
--    (`support_messages_open_threads`). شمارش زیر قفل مشورتی همان مشتری است، پس دو پیام هم‌زمان هر دو از سقف رد نمی‌شوند.
--  - **پیامک پاسخ** (`support_messages_sms`، سؤال ۳۱۲): پیامکی که به پاسخ وصل می‌شود ردیف تازهٔ «منتظر» همین هدف (`support_reply`، بی تلاش)
--    است، به موبایل همین مشتری و با موضوع همین گفت‌وگو («سفارش 10027» یا «سؤال کلی»).
--  - `sms_messages_guard` (بازنویسی 0036): همان گذارها برای پیامک پاسخ هم (`sms_messages_flow`، `sms_messages_frozen`)؛ و «در حال فرستادن» آن
--    فقط تا مشتری همان پاسخ را ندیده (`sms_messages_live`): پیامک پاسخی که مشتری خواند دیگر نمی‌رود و «دوباره بفرست» هم ندارد. بقیه همان 0036.

-- ── گفت‌وگو ───────────────────────────────────────────────────────────────
CREATE FUNCTION support_threads_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.waiting_since IS DISTINCT FROM NEW.created_at OR NEW.last_message_at IS DISTINCT FROM NEW.created_at
       OR (NEW.customer_seen_at IS NOT NULL AND NEW.customer_seen_at < NEW.created_at)
    THEN
      RAISE EXCEPTION 'گفت‌وگوی تازه «باز» و با همان لحظهٔ ساختن شروع می‌شود'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_insert_state';
    END IF;
    IF NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE id = NEW.order_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'گفت‌وگوی سفارش فقط مال همان مشتری است که سفارش را داد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_owner';
    END IF;
    IF NEW.order_id IS NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = NEW.user_id) THEN
      RAISE EXCEPTION '«سؤال کلی» فقط برای مشتری‌ای که سفارشی دارد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_customer';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'گفت‌وگوی پشتیبانی % پاک نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_kept';
  END IF;

  IF (NEW.id, NEW.user_id, NEW.order_id, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.order_id, OLD.created_at) THEN
    RAISE EXCEPTION 'گفت‌وگوی پشتیبانی % عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_frozen';
  END IF;
  IF (NEW.status, NEW.waiting_since, NEW.last_message_at) IS DISTINCT FROM (OLD.status, OLD.waiting_since, OLD.last_message_at)
     AND pg_trigger_depth() < 2
  THEN
    RAISE EXCEPTION 'حال گفت‌وگوی % فقط با پیام عوض می‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_state';
  END IF;
  IF NEW.customer_seen_at IS DISTINCT FROM OLD.customer_seen_at
     AND (NEW.customer_seen_at IS NULL OR NEW.customer_seen_at < coalesce(OLD.customer_seen_at, '-infinity'::timestamptz))
  THEN
    RAISE EXCEPTION '«دیده شد» گفت‌وگوی % فقط جلو می‌رود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_threads_seen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER support_threads_guard BEFORE INSERT OR UPDATE OR DELETE ON support_threads
  FOR EACH ROW EXECUTE FUNCTION support_threads_guard();
--> statement-breakpoint

-- ── پیام: فقط افزودنی ────────────────────────────────────────────────────────
CREATE FUNCTION support_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM support_threads WHERE id = OLD.thread_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'پیام پشتیبانی عوض یا پاک نمی‌شود؛ پیام تازه بنویس'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_append_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER support_messages_guard BEFORE UPDATE OR DELETE ON support_messages
  FOR EACH ROW EXECUTE FUNCTION support_messages_guard();
--> statement-breakpoint

-- ── پیام تازه: ترتیب، بستن، سقف مشتری و پیامک پاسخ ─────────────────────────────
-- پیش از درج و بی هیچ نوشتنی: با `ON CONFLICT DO NOTHING` تریگر پیش از درج برای ردیف تکراری هم اجرا می‌شود، پس هر نوشتنی جایش پس از درج
-- است (`support_messages_apply`).
CREATE FUNCTION support_messages_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  thread support_threads%ROWTYPE;
  owner_mobile text;
  number integer;
  message sms_messages%ROWTYPE;
BEGIN
  -- پیام مشتری اول قفل مشورتی همان مشتری را می‌گیرد و بعد ردیف گفت‌وگو را، همان ترتیب `post` در `support.ts`؛ پاسخ و بستن فقط ردیف را.
  -- پس هیچ دو راهی قفل‌های هم را به ترتیب وارونه نمی‌خواهند.
  IF NEW.kind = 'customer' THEN
    PERFORM pg_advisory_xact_lock(hashtext('support_customer'), hashtext(t.user_id::text)) FROM support_threads t WHERE t.id = NEW.thread_id;
  END IF;
  SELECT * INTO thread FROM support_threads WHERE id = NEW.thread_id FOR UPDATE;
  IF NEW.created_at < thread.last_message_at THEN
    RAISE EXCEPTION 'پیام تازهٔ گفت‌وگوی % پیش از آخرین پیامش نیست', NEW.thread_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_order';
  END IF;

  IF NEW.kind = 'closed' AND thread.status = 'closed' THEN
    RAISE EXCEPTION 'گفت‌وگوی % همین حالا بسته است', NEW.thread_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_close_once';
  END IF;

  IF NEW.kind = 'customer' THEN
    IF (SELECT count(*) FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
         WHERE t.user_id = thread.user_id AND m.kind = 'customer' AND m.created_at > NEW.created_at - interval '1 hour') >= 10
    THEN
      RAISE EXCEPTION 'مشتری در یک ساعت بیش از ۱۰ پیام نمی‌فرستد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_rate';
    END IF;
    -- این پیام گفت‌وگو را تازه «باز» می‌کند اگر پاسخ‌داده یا بسته است، یا همین حالا ساخته شد و پیامی ندارد؛ با سه باز دیگر، چهارمی است.
    IF (thread.status <> 'open' OR NOT EXISTS (SELECT 1 FROM support_messages WHERE thread_id = thread.id))
       AND (SELECT count(*) FROM support_threads t WHERE t.user_id = thread.user_id AND t.status = 'open' AND t.id <> thread.id) >= 3
    THEN
      RAISE EXCEPTION 'مشتری بیش از سه گفت‌وگوی باز ندارد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_open_threads';
    END IF;
  END IF;

  IF NEW.sms_message_id IS NOT NULL THEN
    SELECT mobile INTO owner_mobile FROM users WHERE id = thread.user_id;
    SELECT order_number INTO number FROM orders WHERE id = thread.order_id;
    SELECT * INTO message FROM sms_messages WHERE id = NEW.sms_message_id FOR UPDATE;
    IF message.purpose IS DISTINCT FROM 'support_reply' OR message.to_mobile IS DISTINCT FROM owner_mobile
       OR message.status IS DISTINCT FROM 'pending' OR message.attempts IS DISTINCT FROM 0
       OR message.params ->> 0 IS DISTINCT FROM (CASE WHEN thread.order_id IS NULL THEN 'سؤال کلی' ELSE 'سفارش ' || number END)
    THEN
      RAISE EXCEPTION 'پیامک % پیامک تازهٔ پاسخ همین گفت‌وگو نیست', NEW.sms_message_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'support_messages_sms';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER support_messages_check BEFORE INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION support_messages_check();
--> statement-breakpoint

-- ── حال گفت‌وگو پس از هر پیام ─────────────────────────────────────────────────
CREATE FUNCTION support_messages_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'customer' THEN
    UPDATE support_threads
       SET status = 'open',
           waiting_since = CASE WHEN status = 'open' THEN waiting_since ELSE NEW.created_at END,
           last_message_at = NEW.created_at
     WHERE id = NEW.thread_id;
  ELSIF NEW.kind = 'staff' THEN
    UPDATE support_threads SET status = 'answered', waiting_since = NULL, last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  ELSE
    UPDATE support_threads SET status = 'closed', waiting_since = NULL WHERE id = NEW.thread_id;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER support_messages_apply AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION support_messages_apply();
--> statement-breakpoint

-- ── ردیف پیامک: گذار پیامک پاسخ هم، تا مشتری همان پاسخ را ندیده ─────────────────
CREATE OR REPLACE FUNCTION sms_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.created_at, NEW.to_mobile, NEW.purpose, NEW.body, NEW.params)
       IS DISTINCT FROM (OLD.id, OLD.created_at, OLD.to_mobile, OLD.purpose, OLD.body, OLD.params)
     OR OLD.purpose NOT IN ('tracking', 'order_paid', 'partner_order', 'support_reply')
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
       OR (OLD.purpose = 'support_reply'
          AND NOT EXISTS (SELECT 1 FROM support_messages m JOIN support_threads t ON t.id = m.thread_id
                           WHERE m.sms_message_id = NEW.id
                             AND (t.customer_seen_at IS NULL OR t.customer_seen_at < m.created_at)))
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
