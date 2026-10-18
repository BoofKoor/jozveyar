-- محافظ‌های متن‌های سایت (برش ۱۱٫۱، ADR-065، سؤال ۲۸۸).
--
-- دست‌نویس، مثل 0041 و 0052. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.
--
--  - **نسخه پاک نمی‌شود** (`site_content_versions_append_only`) و **عوض نمی‌شود** (`site_content_versions_frozen`): رد هر تغییری که روی سایت
--    رفت می‌ماند، و «برگرداندن» نسخه‌ای تازه است.
--  - **شماره‌ها پشت‌سرهم** (`site_content_versions_sequence`): هر نسخه دقیقاً یکی پس از آخرین نسخهٔ همان نوع؛ آخرین نسخه همان است که سایت
--    نشان می‌دهد، پس جای خالی یا نسخهٔ «پیش‌تر» تازه معنایی ندارد.
--  - **برگرداندن راست می‌گوید** (`site_content_versions_restored_same`): نسخه‌ای که از نسخهٔ N برگردانده شد، دقیقاً متن نسخهٔ N همان نوع را
--    دارد؛ برگشت به پیش‌فرض (۰) را CHECK `site_content_versions_default` (0053) می‌سنجد.
--  - **هر نسخه تغییری است** (`site_content_versions_noop`): نسخهٔ تازه با همان متن آخرین نسخه (برگشت دوباره به پیش‌فرض هم) چیزی را روی سایت
--    عوض نمی‌کند. متن پیش‌فرض در کد است، پس انتشار متنی برابر آن را سرویس پنل می‌گیرد.
--  - **پیش‌نویس از نسخه‌ای که هست** (`site_content_drafts_base_exists`): `base_version` صفر (متن پیش‌فرض بی نسخه) یا نسخه‌ای از همان نوع.

CREATE FUNCTION site_content_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_version integer;
  last_content jsonb;
  has_last boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'نسخهٔ % متن % پاک نمی‌شود', OLD.version, OLD.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_versions_append_only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'نسخهٔ % متن % عوض نمی‌شود؛ نسخهٔ تازه منتشر کن', OLD.version, OLD.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_versions_frozen';
  END IF;

  SELECT version, content, true INTO last_version, last_content, has_last
    FROM site_content_versions WHERE kind = NEW.kind ORDER BY version DESC LIMIT 1;
  IF NEW.version <> coalesce(last_version, 0) + 1 THEN
    RAISE EXCEPTION 'نسخهٔ تازهٔ متن % شمارهٔ % است، نه %', NEW.kind, coalesce(last_version, 0) + 1, NEW.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_versions_sequence';
  END IF;
  IF NEW.restored_from IS NOT NULL AND NEW.restored_from > 0 AND NOT EXISTS (
    SELECT 1 FROM site_content_versions
     WHERE kind = NEW.kind AND version = NEW.restored_from AND content IS NOT DISTINCT FROM NEW.content
  ) THEN
    RAISE EXCEPTION 'نسخهٔ % متن % برگرداندهٔ نسخهٔ % نیست', NEW.version, NEW.kind, NEW.restored_from
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_versions_restored_same';
  END IF;
  IF has_last AND last_content IS NOT DISTINCT FROM NEW.content THEN
    RAISE EXCEPTION 'نسخهٔ تازهٔ متن % همان آخرین نسخه است', NEW.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_versions_noop';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_content_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON site_content_versions
  FOR EACH ROW EXECUTE FUNCTION site_content_versions_guard();
--> statement-breakpoint

CREATE FUNCTION site_content_drafts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.base_version <> 0 AND NOT EXISTS (
    SELECT 1 FROM site_content_versions WHERE kind = NEW.kind AND version = NEW.base_version
  ) THEN
    RAISE EXCEPTION 'پیش‌نویس متن % از نسخهٔ % است که نیست', NEW.kind, NEW.base_version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_content_drafts_base_exists';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_content_drafts_guard BEFORE INSERT OR UPDATE OF kind, base_version ON site_content_drafts
  FOR EACH ROW EXECUTE FUNCTION site_content_drafts_guard();
