-- محافظ خروجی PDF گزارش‌ها (برش ۱۰٫۲، ADR-061).
--
-- دست‌نویس، مثل 0041 و 0043. خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **`report_exports_frozen`:** گزارشی که خواسته شد (نوع، داده، نام فایل، دسترسی خواهنده، خواهنده و زمان) همان است که PDF با آن
--    ساخته و دانلودش با آن سنجیده می‌شود؛ پس از درج عوض نمی‌شود، تا PDFی که کسی دانلود می‌کند همان گزارشی باشد که خودش در پنل دید و
--    رویدادش ثبت شد، و دسترسی‌ای که دانلود دوباره می‌خواهد همان که گزارش با آن ساخته شد.
--  - **`report_exports_finish_once`:** نتیجه (PDF یا خطا) یک بار نوشته می‌شود: کارگری که اجاره‌اش گذشت و کار دوم همان خروجی را دوباره
--    ساخت، PDFی را که شاید دانلود شده رونویسی نمی‌کند. پاک شدن ردیف (پس از یک روز، `retention.py`) آزاد است.

CREATE FUNCTION report_exports_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.report IS DISTINCT FROM OLD.report OR NEW.context IS DISTINCT FROM OLD.context
     OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.money IS DISTINCT FROM OLD.money
     OR NEW.print_partner_id IS DISTINCT FROM OLD.print_partner_id OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at THEN
    RAISE EXCEPTION 'خروجی گزارش % پس از درخواست عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'report_exports_frozen';
  END IF;
  IF OLD.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'نتیجهٔ خروجی گزارش % یک بار نوشته می‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'report_exports_finish_once';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER report_exports_guard BEFORE UPDATE ON report_exports
  FOR EACH ROW EXECUTE FUNCTION report_exports_guard();
