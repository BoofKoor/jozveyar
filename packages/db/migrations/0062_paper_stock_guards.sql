-- محافظ‌ها و تریگرهای موجودی کاغذ (برش ۱۰٫۴، ADR-070؛ سؤال ۲۰۴، پاسخ «همهٔ چاپخانه‌ها»، و اجرا ۴۰۴ تا ۴۲۰).
--
-- دست‌نویس، مثل 0060. موجودی هر قلم جمع ردیف‌های `paper_stock_moves` است، پس «فقط افزودنی» و «کم شدن با هر شروع چاپ» در خود پایگاه داده
-- درست می‌مانند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **برگ هر سفارش** (`order_paper_sheets`): برای هر کاغذ و اندازه، جمع برگ × نسخهٔ جزوه‌ها از ریز قیمت منجمد (`price_breakdown.items[].sheets`،
--    همان عدد «برگ» گزارش تولید)؛ کاغذ هر جزوه کاغذ قاعدهٔ اول آن است (سؤال ۴۰۷؛ مسیر خرید برای هر جزوه یک کاغذ می‌سازد، مثل وزن در موتور قیمت).
--  - **کم شدن و برگشت** (`orders_paper_stock`، پس از تغییر وضعیت سفارش): «در صف چاپ» ← «در حال چاپ» از هر راهی (دکمهٔ پنل یا «همین است» فایل
--    پست) برای هر قلمی که چاپخانهٔ همان سفارش پیگیری می‌کند ردیف `print` می‌نویسد؛ رسیدن به «در صف چاپ» (برگرداندن از «در حال چاپ»، یا از «لغو
--    شد») هر ردیف چاپی را که هنوز برنگشته با ردیف `unprint` برمی‌گرداند، چون در صف یعنی هنوز چاپ نشده. لغو برنمی‌گرداند: کاغذ مصرف شده (سؤال
--    ۴۰۸)، و برگشت لغو به «در حال چاپ» هم دوباره کم نمی‌کند. ردیف‌ها به ترتیب شناسهٔ قلم نوشته می‌شوند تا دو شروع چاپ هم‌زمان قلم‌ها را به یک
--    ترتیب قفل کنند.
--  - **دفتر** (`paper_stock_moves_guard`): پیش از هر درج قلم قفل است (`FOR NO KEY UPDATE`)، پس شمارش و چاپ هم‌زمان پشت هم‌اند؛ ردیف چاپ و برگشت
--    را فقط همان تریگر می‌نویسد (`paper_stock_moves_automatic`)؛ چاپ فقط برای سفارش همان چاپخانه (`paper_stock_moves_order`)؛ برگشت فقط همان
--    ردیف چاپ، همان قلم و همان سفارش، با همان برگ‌ها (`paper_stock_moves_undo`)؛ تغییر شمارش را خود پایگاه داده از موجودی همان لحظه می‌نشاند و هر
--    چه کد بفرستد نادیده است؛ و ردیف نه عوض می‌شود نه پاک (`paper_stock_moves_append_only`).
--  - **قلم** (`paper_stock_items_guard`): پاک نمی‌شود (`paper_stock_items_no_delete`) و جز آستانه عوض نمی‌شود (`paper_stock_items_frozen`).

-- ── برگ هر کاغذ و اندازهٔ یک سفارش ─────────────────────────────────────────
CREATE FUNCTION order_paper_sheets(p_order uuid)
RETURNS TABLE (paper_type_id text, paper_size paper_size, sheets bigint)
LANGUAGE sql STABLE AS $$
  SELECT r.paper_type_id, i.paper_size, sum((o.price_breakdown -> 'items' -> (i.seq - 1) ->> 'sheets')::bigint * i.copies)::bigint
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
    JOIN LATERAL (SELECT p.paper_type_id FROM print_rules p WHERE p.order_item_id = i.id ORDER BY p.seq LIMIT 1) r ON true
   WHERE o.id = p_order
   GROUP BY r.paper_type_id, i.paper_size
$$;
--> statement-breakpoint

-- ── قلم: پاک‌نشدنی، و جز آستانه منجمد ───────────────────────────────────────
CREATE FUNCTION paper_stock_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'قلم موجودی % پاک نمی‌شود؛ آستانه‌اش را خالی کن', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_items_no_delete';
  END IF;
  IF (NEW.id, NEW.print_partner_id, NEW.paper_type_id, NEW.paper_size, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.print_partner_id, OLD.paper_type_id, OLD.paper_size, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'قلم موجودی % جز آستانه عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_items_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER paper_stock_items_guard BEFORE UPDATE OR DELETE ON paper_stock_items
  FOR EACH ROW EXECUTE FUNCTION paper_stock_items_guard();
--> statement-breakpoint

-- ── دفتر موجودی: فقط افزودنی ────────────────────────────────────────────────
CREATE FUNCTION paper_stock_moves_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  partner uuid;
  balance bigint;
  undone paper_stock_moves%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ردیف موجودی % عوض و پاک نمی‌شود؛ ردیف تازه بنویس', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_moves_append_only';
  END IF;
  -- قلمی که نیست را کلید خارجی رد می‌کند.
  SELECT s.print_partner_id INTO partner FROM paper_stock_items s WHERE s.id = NEW.item_id FOR NO KEY UPDATE;
  IF NEW.kind IN ('print', 'unprint') THEN
    -- فقط از درون `orders_paper_stock`: درج مستقیم کد عمق یک دارد.
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'ردیف چاپ و برگشت را فقط تغییر وضعیت سفارش می‌نویسد'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_moves_automatic';
    END IF;
    IF NEW.kind = 'print' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.print_partner_id = partner) THEN
      RAISE EXCEPTION 'سفارش این ردیف چاپ به چاپخانهٔ همین قلم سپرده نشده'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_moves_order';
    END IF;
    IF NEW.kind = 'unprint' THEN
      SELECT * INTO undone FROM paper_stock_moves m WHERE m.id = NEW.undoes;
      IF NOT FOUND OR undone.kind <> 'print' OR undone.item_id <> NEW.item_id OR undone.order_id <> NEW.order_id
         OR undone.delta_sheets <> -NEW.delta_sheets
      THEN
        RAISE EXCEPTION 'ردیف برگشت باید همان ردیف چاپ همین قلم و سفارش را با همان برگ‌ها برگرداند'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'paper_stock_moves_undo';
      END IF;
    END IF;
  ELSIF NEW.kind = 'count' THEN
    -- شمارش موجودی واقعی است؛ تغییر از موجودی همین لحظه، زیر همان قفل.
    SELECT coalesce(sum(m.delta_sheets), 0) INTO balance FROM paper_stock_moves m WHERE m.item_id = NEW.item_id;
    NEW.delta_sheets := NEW.counted_sheets - balance;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER paper_stock_moves_guard BEFORE INSERT OR UPDATE OR DELETE ON paper_stock_moves
  FOR EACH ROW EXECUTE FUNCTION paper_stock_moves_guard();
--> statement-breakpoint

-- ── کم شدن با «شروع چاپ» و برگشت با برگرداندن ─────────────────────────────
CREATE FUNCTION orders_paper_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'paid' AND NEW.status = 'printing' AND NEW.print_partner_id IS NOT NULL THEN
    INSERT INTO paper_stock_moves (item_id, kind, delta_sheets, order_id)
    SELECT s.id, 'print', -n.sheets, NEW.id
      FROM order_paper_sheets(NEW.id) n
      JOIN paper_stock_items s
        ON s.print_partner_id = NEW.print_partner_id AND s.paper_type_id = n.paper_type_id AND s.paper_size = n.paper_size
     WHERE n.sheets > 0
     ORDER BY s.id;
  ELSIF NEW.status = 'paid' THEN
    -- از «در حال چاپ» (برگرداندن) یا «لغو شد»؛ از «در انتظار پرداخت» هیچ ردیف چاپی نیست.
    INSERT INTO paper_stock_moves (item_id, kind, delta_sheets, order_id, undoes)
    SELECT m.item_id, 'unprint', -m.delta_sheets, m.order_id, m.id
      FROM paper_stock_moves m
     WHERE m.order_id = NEW.id AND m.kind = 'print'
       AND NOT EXISTS (SELECT 1 FROM paper_stock_moves u WHERE u.undoes = m.id)
     ORDER BY m.item_id, m.id;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_paper_stock AFTER UPDATE OF status ON orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION orders_paper_stock();
