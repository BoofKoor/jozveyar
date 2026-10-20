-- محافظ‌های تسویهٔ چاپخانه‌ها (برش ۱۰٫۳، ADR-069؛ سؤال‌های ۲۰۳ و ۳۹۰ تا ۴۰۳).
--
-- دست‌نویس، مثل 0036 و 0058. سهم چاپخانه از هر سفارش پولی است که بعداً به چاپخانه داده می‌شود، پس «منجمد هنگام تخصیص» و «دفتر فقط افزودنی»
-- در خود پایگاه داده درست می‌مانند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **سهم منجمد** (`order_assignments_share`، پیش از درج تخصیص): درصد امروز همان چاپخانه و مبلغ سهم را خود پایگاه داده روی ردیف تخصیص
--    می‌نشاند، از جمع چاپ، کاغذ و صحافی منجمد سفارش (`orders.subtotal_rials`، پیش از تخفیف) به تومان گرد، نیم رو به بالا (سؤال‌های ۳۹۰ تا
--    ۳۹۳). هر چه کد بفرستد نادیده است؛ پس سهم همیشه درصد همان لحظهٔ تخصیص است. ردیف تخصیص از پیش فقط افزودنی است
--    (`order_assignments_append_only`، 0018)، پس سهم هم عوض نمی‌شود. چاپخانه در هر دو راه تخصیص پیش از درج قفل است (`FOR SHARE`)، پس
--    عوض کردن هم‌زمان درصد یا پیش از این تخصیص است یا پس از آن.
--  - **دفتر تسویه** (`partner_ledger_guard`): ردیف تازه باطل‌نشده است (`partner_ledger_insert_state`)؛ سفارش اصلاح روزی به همان چاپخانه
--    سپرده شده (`partner_ledger_order`)؛ ردیف عوض نمی‌شود جز «باطل کردن» یک‌باره (`partner_ledger_frozen` و `partner_ledger_void_once`)؛
--    و پاک نمی‌شود (`partner_ledger_append_only`).

-- ── سهم منجمد هر تخصیص ─────────────────────────────────────────────────────
CREATE FUNCTION order_assignments_share() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bp integer;
  base bigint;
BEGIN
  SELECT share_bp INTO bp FROM print_partners WHERE id = NEW.to_partner_id;
  SELECT subtotal_rials INTO base FROM orders WHERE id = NEW.order_id;
  NEW.share_bp := bp;
  -- ریال × صدم درصد ÷ ۱۰۰٬۰۰۰ = تومان؛ گرد به نزدیک‌ترین تومان، نیم رو به بالا (همه نامنفی)، و دوباره ریال. سفارش همیشه هست (کلید خارجی).
  NEW.share_rials := CASE WHEN bp IS NULL THEN NULL ELSE ((base * bp + 50000) / 100000) * 10 END;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_assignments_share BEFORE INSERT ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION order_assignments_share();
--> statement-breakpoint

-- ── دفتر تسویه: فقط افزودنی، باطل یک بار ────────────────────────────────────
CREATE FUNCTION partner_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'ردیف تازهٔ دفتر تسویه باطل‌شده نیست'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'partner_ledger_insert_state';
    END IF;
    IF NEW.order_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM order_assignments WHERE order_id = NEW.order_id AND to_partner_id = NEW.print_partner_id)
    THEN
      RAISE EXCEPTION 'سفارش این اصلاح هرگز به همین چاپخانه سپرده نشده'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'partner_ledger_order';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ردیف دفتر تسویه % پاک نمی‌شود؛ باطلش کن', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'partner_ledger_append_only';
  END IF;

  IF (NEW.id, NEW.print_partner_id, NEW.kind, NEW.amount_rials, NEW.day, NEW.period_from, NEW.period_until, NEW.tracking, NEW.note,
      NEW.order_id, NEW.created_by, NEW.created_at, NEW.request_id)
     IS DISTINCT FROM
     (OLD.id, OLD.print_partner_id, OLD.kind, OLD.amount_rials, OLD.day, OLD.period_from, OLD.period_until, OLD.tracking, OLD.note,
      OLD.order_id, OLD.created_by, OLD.created_at, OLD.request_id)
  THEN
    RAISE EXCEPTION 'ردیف دفتر تسویه % عوض نمی‌شود؛ باطلش کن و ردیف تازه بنویس', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'partner_ledger_frozen';
  END IF;
  IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL THEN
    RAISE EXCEPTION 'ردیف دفتر تسویه % فقط یک بار باطل می‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'partner_ledger_void_once';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER partner_ledger_guard BEFORE INSERT OR UPDATE OR DELETE ON partner_ledger
  FOR EACH ROW EXECUTE FUNCTION partner_ledger_guard();
