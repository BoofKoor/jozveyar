-- محافظ‌های قالب برگه‌ها (برش ۹٫۲، ADR-057).
--
-- دست‌نویس، مثل 0013 و 0032 و به همان دلیل: نسخه‌ای که مالک بارگذاری کرد همان است که پیش‌نمایشش دیده و فعالش کرده، پس باید در خود
-- پایگاه داده همان بماند، نه فقط در پنل. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`).
--
--  - **`ticket_templates_insert_state`:** نسخهٔ تازه بی فعال شدن و بی پیش‌نمایش؛ فعال شدن و پیش‌نمایش هر کدام راه خودشان را دارند. «فعال» بی
--    اولین فعال شدن را خود CHECK `ticket_templates_activated` می‌گیرد، پس اینجا فقط `activated_at`.
--  - **`ticket_templates_frozen`:** متن، نوع، شماره و سازنده هرگز عوض نمی‌شوند؛ زمان اولین فعال شدن یک بار نوشته می‌شود.
--  - **`ticket_templates_append_only`:** نسخه پاک نمی‌شود: برگه‌ها به آن اشاره می‌کنند و برگشت یعنی فعال کردن دوباره‌اش.
--  - **`order_tickets_template_kind`:** برگه با قالب بیجک بیجک است و با قالب برگهٔ اول برگهٔ اول، نه جابه‌جا.

CREATE FUNCTION ticket_templates_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'نسخهٔ % قالب % پاک نمی‌شود', OLD.version, OLD.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_templates_append_only';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.activated_at IS NOT NULL OR NEW.preview_at IS NOT NULL OR NEW.preview_order_number IS NOT NULL
       OR NEW.preview_pages IS NOT NULL OR NEW.preview_pdf_key IS NOT NULL OR NEW.preview_png_key IS NOT NULL
       OR NEW.preview_error IS NOT NULL OR cardinality(NEW.preview_blocked) > 0 THEN
      RAISE EXCEPTION 'نسخهٔ تازهٔ قالب غیرفعال و بی پیش‌نمایش ساخته می‌شود'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_templates_insert_state';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.version IS DISTINCT FROM OLD.version OR NEW.html IS DISTINCT FROM OLD.html
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.file_name IS DISTINCT FROM OLD.file_name
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at)
     OR (OLD.activated_at IS NULL AND NEW.activated_at IS NOT NULL AND NOT NEW.is_active) THEN
    RAISE EXCEPTION 'نسخهٔ % قالب % عوض نمی‌شود؛ نسخهٔ تازه بارگذاری کن', OLD.version, OLD.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ticket_templates_frozen';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ticket_templates_guard BEFORE INSERT OR UPDATE OR DELETE ON ticket_templates
  FOR EACH ROW EXECUTE FUNCTION ticket_templates_guard();
--> statement-breakpoint

CREATE FUNCTION order_tickets_template_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bijak_template_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM ticket_templates WHERE id = NEW.bijak_template_id AND kind = 'bijak') THEN
    RAISE EXCEPTION 'قالب بیجک برگهٔ سفارش % قالب بیجک نیست', NEW.order_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_tickets_template_kind';
  END IF;
  IF NEW.first_page_template_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM ticket_templates WHERE id = NEW.first_page_template_id AND kind = 'first_page') THEN
    RAISE EXCEPTION 'قالب برگهٔ اول برگهٔ سفارش % قالب برگهٔ اول نیست', NEW.order_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'order_tickets_template_kind';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_tickets_template_kind BEFORE INSERT OR UPDATE OF bijak_template_id, first_page_template_id ON order_tickets
  FOR EACH ROW EXECUTE FUNCTION order_tickets_template_kind();
