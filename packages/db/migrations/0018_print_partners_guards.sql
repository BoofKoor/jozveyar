-- محافظ‌های چاپخانه‌ها و تخصیص سفارش (برش ۵٫۲، ADR-042)، و اثر انگشت برگه با چاپخانه.
--
-- دست‌نویس، مثل 0006، 0011 و 0016 و به همان دلیل: اینکه سفارش را کدام چاپخانه چاپ می‌کند و این از کجا آمد، باید در خود
-- پایگاه داده درست بماند، نه فقط در پنل؛ از ۵٫۳ چاپخانه با همین ستون فقط سفارش‌های خودش را می‌بیند. هر خطا با نام محدودیت
-- برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - `orders_print_partner`: چاپخانهٔ سفارش فقط وقتی سفارش (پس از همان به‌روزرسانی) «در صف چاپ» است عوض می‌شود، فقط به
--    چاپخانهٔ فعال، و خالی نمی‌شود. چاپخانه با `FOR SHARE` خوانده می‌شود: غیرفعال کردنِ هم‌زمانش یا منتظر این تراکنش می‌ماند
--    یا این منتظر آن، و بعد رد می‌شود.
--  - `order_assignments_chain` و `order_assignments_recorded` (معوق): هر تخصیص از همان چاپخانه‌ای است که ردیف قبلی به آن
--    رسید، و در پایان تراکنش آخرین ردیف هر سفارش همان چاپخانهٔ امروزش است؛ پس تاریخچه کامل است، نه فقط افزودنی.
--  - `order_assignments_append_only`: ردیف تخصیص عوض و پاک نمی‌شود، جز با پاک شدن خود سفارش (cascade).
--  - `print_partners_guard`: چاپخانه پاک نمی‌شود (غیرفعال می‌شود)، و با سفارش باز غیرفعال نمی‌شود.
--  - `order_ticket_stamp`: نام و شهر چاپخانه هم روی برگه می‌آیند.
--
-- «شروع چاپ» فقط با چاپخانه، مثل «فقط با فایل چاپ» (`print_needs_pdf`، 5.1)، قاعدهٔ سرویس پنل است، نه این‌جا: سفارش‌های پیش از
-- ۵٫۲ و تست‌هایی که وضعیت را با SQL جابه‌جا می‌کنند چاپخانه ندارند.

-- ── چاپخانهٔ سفارش: فقط در صف چاپ، فقط فعال، هرگز خالی ───────────────────
CREATE FUNCTION orders_print_partner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.print_partner_id IS NULL THEN
    RAISE EXCEPTION 'چاپخانهٔ سفارش % خالی نمی‌شود', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_partner_kept';
  END IF;
  IF NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'چاپخانهٔ سفارش % فقط در «در صف چاپ» عوض می‌شود، نه در %', OLD.order_number, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_partner_queued';
  END IF;
  PERFORM 1 FROM print_partners WHERE id = NEW.print_partner_id AND deactivated_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'چاپخانه‌ای که سفارش % به آن می‌رود فعال نیست', OLD.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_partner_active';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_print_partner BEFORE UPDATE ON orders
  FOR EACH ROW WHEN (OLD.print_partner_id IS DISTINCT FROM NEW.print_partner_id)
  EXECUTE FUNCTION orders_print_partner();
--> statement-breakpoint

-- ── تاریخچهٔ تخصیص: زنجیره، و آخرین ردیف همان چاپخانهٔ امروز ────────────
CREATE FUNCTION order_assignments_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous uuid;
BEGIN
  SELECT to_partner_id INTO previous FROM order_assignments WHERE order_id = NEW.order_id ORDER BY id DESC LIMIT 1;
  IF previous IS DISTINCT FROM NEW.from_partner_id THEN
    RAISE EXCEPTION 'تخصیص تازه از همان چاپخانه‌ای نیست که سفارش داشت'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_chain';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_assignments_chain BEFORE INSERT ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION order_assignments_chain();
--> statement-breakpoint
CREATE FUNCTION order_assignments_ok(o uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  number integer;
  current_partner uuid;
  recorded uuid;
BEGIN
  SELECT order_number, print_partner_id INTO number, current_partner FROM orders WHERE id = o;
  IF NOT FOUND THEN
    RETURN; -- سفارش در همین تراکنش پاک شد
  END IF;
  SELECT to_partner_id INTO recorded FROM order_assignments WHERE order_id = o ORDER BY id DESC LIMIT 1;
  IF recorded IS DISTINCT FROM current_partner THEN
    RAISE EXCEPTION 'چاپخانهٔ سفارش % با آخرین ردیف تخصیصش نمی‌خواند', number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_recorded';
  END IF;
END $$;
--> statement-breakpoint
-- هر شاخه فقط برای جدول خودش اجرا می‌شود: `NEW.order_id` در ردیف `orders` نیست.
CREATE FUNCTION order_assignments_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    PERFORM order_assignments_ok(NEW.id);
  ELSE
    PERFORM order_assignments_ok(NEW.order_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_partner_recorded AFTER UPDATE ON orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.print_partner_id IS DISTINCT FROM NEW.print_partner_id)
  EXECUTE FUNCTION order_assignments_check();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER order_assignments_recorded AFTER INSERT ON order_assignments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_assignments_check();
--> statement-breakpoint

-- ── تاریخچهٔ تخصیص فقط افزودنی ───────────────────────────────────────────
--
-- پاک شدن فقط با خود سفارش: در cascade، سفارش دیگر پیدا نمی‌شود و ردیف آزادانه می‌رود (مثل ردیف‌های پیش‌نویس تعرفه، 0013).
CREATE FUNCTION order_assignments_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'تاریخچهٔ تخصیص سفارش عوض یا پاک نمی‌شود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'order_assignments_append_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER order_assignments_append_only BEFORE UPDATE OR DELETE ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION order_assignments_append_only();
--> statement-breakpoint

-- ── چاپخانه پاک نمی‌شود، و با سفارش باز غیرفعال نمی‌شود ───────────────────
--
-- سفارش‌ها و تاریخچهٔ تخصیص به چاپخانه اشاره می‌کنند (کلید خارجی هم جلوی پاک کردنش را می‌گیرد؛ این برای چاپخانه‌ای است که
-- هنوز سفارشی ندارد). سفارش باز یعنی در صف چاپ یا در حال چاپ؛ خواندنش در تراکنش خودِ غیرفعال کردن است، پس تخصیصی که پیش‌تر
-- commit شد دیده می‌شود، و تخصیص بعدی پشت قفل ردیف چاپخانه می‌ماند (`orders_print_partner`).
CREATE FUNCTION print_partners_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'چاپخانهٔ «%» پاک نمی‌شود؛ غیرفعالش کن', OLD.name
      USING ERRCODE = 'check_violation', CONSTRAINT = 'print_partners_no_delete';
  END IF;
  IF OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM orders WHERE print_partner_id = OLD.id AND status IN ('paid', 'printing'))
  THEN
    RAISE EXCEPTION 'چاپخانهٔ «%» سفارش باز دارد و غیرفعال نمی‌شود', OLD.name
      USING ERRCODE = 'check_violation', CONSTRAINT = 'print_partners_open_orders';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER print_partners_guard BEFORE UPDATE OR DELETE ON print_partners
  FOR EACH ROW EXECUTE FUNCTION print_partners_guard();
--> statement-breakpoint

-- ── اثر انگشت برگه، با چاپخانه ──────────────────────────────────────────
--
-- همان 0016، به‌علاوهٔ نام و شهر چاپخانه‌ای که زیر مهلت روی برگه می‌آید. جابه‌جایی و ویرایش چاپخانه کار برگه را در همان تراکنش
-- دوباره در صف می‌گذارند (`packages/db/src/panel.ts` و `partners.ts`).
CREATE OR REPLACE FUNCTION order_ticket_stamp(o orders) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(jsonb_build_array(o.recipient_name, o.recipient_phone, o.address_text, o.postal_code, p.name, c.name_fa)::text)
    FROM (SELECT o.print_partner_id AS id) own
    LEFT JOIN print_partners p ON p.id = own.id
    LEFT JOIN cities c ON c.id = p.city_id
$$;
--> statement-breakpoint

-- اثر انگشت برگهٔ هر سفارش عوض شد، پس برگهٔ ساخته‌شدهٔ سفارش‌های باز دوباره در صف، مثل 0016. کار زنده یا شکست‌خورده دست
-- نمی‌خورد: پنل برای شکست‌خورده «دوباره بساز» دارد. `status::text`، مثل 0015.
UPDATE jobs
   SET status = 'queued', attempts = 0, run_after = now(), locked_by = NULL, locked_until = NULL,
       last_error = NULL, finished_at = NULL, updated_at = now()
 WHERE kind = 'prepare_ticket' AND status = 'done'
   AND order_id IN (SELECT id FROM orders WHERE status::text IN ('paid', 'printing'));
