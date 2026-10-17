-- محافظ مسدودی موبایل مشتری (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲).
--
-- دست‌نویس، مثل 0048. خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد و رابط کدام
-- پیام را بدهد.
--
--  - **تاریخچه می‌ماند:** ردیف پاک نمی‌شود (`mobile_blocks_append_only`)؛ ردیف تازه زنده ساخته می‌شود (`mobile_blocks_insert_state`)، و
--    تنها تغییرش بستن یک‌باره است: `unblocked_at` و `unblocked_by` از خالی به پر، بقیه همان (`mobile_blocks_frozen`). مسدودی دوباره ردیف
--    تازه است، و برای هر شماره یک زنده (`mobile_blocks_live`، 0049).
--  - **سفارش تازه نه** (`orders_mobile_blocked`): موبایل تأییدشدهٔ صاحب سفارش (`users.mobile`، همان که `recipient_phone` از آن آمد)
--    مسدودی زنده دارد.
--  - **تلاش پرداخت تازه نه** (`payments_mobile_blocked`): همان، برای صاحب سفارشِ تلاش. سرور هر دو را پیش از کار می‌سنجد و پیام روشن
--    می‌دهد؛ این دو فقط دیوار دوم‌اند، برای مسدودی‌ای که میان سنجش و درج رسید.
--
-- آنچه عمداً سنجیده نمی‌شود: تلاشی که پیش از مسدودی ساخته شد همان‌طور به نتیجه می‌رسد (برگشت از درگاه، استعلام خودکار و «استعلام از
-- درگاه» پنل)، و سفارش پرداخت‌شده همان‌طور چاپ و ارسال می‌شود؛ پول مشتری گرفته شده و برگرداندنش کار دستی است.

-- ── تاریخچه ────────────────────────────────────────────────────────────
CREATE FUNCTION mobile_blocks_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'مسدودی پاک نمی‌شود؛ رفعش کن'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'mobile_blocks_append_only';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.unblocked_at IS NOT NULL OR NEW.unblocked_by IS NOT NULL THEN
      RAISE EXCEPTION 'مسدودی تازه رفع‌شده ساخته نمی‌شود'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'mobile_blocks_insert_state';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.unblocked_at IS NOT NULL
     OR (NEW.id, NEW.mobile, NEW.reason, NEW.order_number, NEW.blocked_by, NEW.blocked_at)
        IS DISTINCT FROM (OLD.id, OLD.mobile, OLD.reason, OLD.order_number, OLD.blocked_by, OLD.blocked_at)
  THEN
    RAISE EXCEPTION 'مسدودی عوض نمی‌شود؛ فقط یک بار رفع می‌شود'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'mobile_blocks_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mobile_blocks_guard BEFORE INSERT OR UPDATE OR DELETE ON mobile_blocks
  FOR EACH ROW EXECUTE FUNCTION mobile_blocks_guard();
--> statement-breakpoint

-- ── سفارش و تلاش پرداخت تازه ───────────────────────────────────────────
--
-- موبایل در متن خطا نمی‌آید: خطا به لاگ سرور می‌رسد.
CREATE FUNCTION orders_mobile_blocked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users u JOIN mobile_blocks b ON b.mobile = u.mobile AND b.unblocked_at IS NULL WHERE u.id = NEW.user_id) THEN
    RAISE EXCEPTION 'موبایل صاحب سفارش % مسدود است؛ سفارش تازه ساخته نمی‌شود', NEW.order_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_mobile_blocked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_mobile_blocked BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_mobile_blocked();
--> statement-breakpoint
CREATE FUNCTION payments_mobile_blocked() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  blocked_order integer;
BEGIN
  SELECT o.order_number INTO blocked_order
  FROM orders o
  JOIN users u ON u.id = o.user_id
  JOIN mobile_blocks b ON b.mobile = u.mobile AND b.unblocked_at IS NULL
  WHERE o.id = NEW.order_id;
  IF FOUND THEN
    RAISE EXCEPTION 'موبایل صاحب سفارش % مسدود است؛ تلاش پرداخت تازه ساخته نمی‌شود', blocked_order
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_mobile_blocked';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_mobile_blocked BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_mobile_blocked();
