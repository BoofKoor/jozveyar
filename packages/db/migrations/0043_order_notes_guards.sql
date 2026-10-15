-- محافظ یادداشت‌های داخلی سفارش (برش ۹٫۳، ADR-058).
--
-- دست‌نویس، مثل 0018 و 0041: یادداشت مثل تاریخچهٔ تخصیص رد کار است، پس در خود پایگاه داده فقط افزودنی است، نه فقط در پنل. خطا با نام
-- محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **`order_notes_append_only`:** یادداشت عوض و پاک نمی‌شود، جز با پاک شدن خود سفارش: در cascade سفارش دیگر پیدا نمی‌شود و ردیف
--    آزادانه می‌رود، مثل `order_assignments_append_only` (0018). اشتباه با یادداشت تازه درست می‌شود (سؤال ۱۹۵)، و «چاپخانه هم ببیند»
--    هم با همان: یادداشتی که چاپخانه دید، دیده شده است.

CREATE FUNCTION order_notes_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM orders WHERE id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'یادداشت سفارش عوض یا پاک نمی‌شود؛ یادداشت تازه بنویس'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'order_notes_append_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER order_notes_append_only BEFORE UPDATE OR DELETE ON order_notes
  FOR EACH ROW EXECUTE FUNCTION order_notes_append_only();
