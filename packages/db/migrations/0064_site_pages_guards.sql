-- محافظ‌های صفحه‌های فرود و «تعرفه» (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۱، ۴۳۷ و ۴۶۲ تا ۴۶۶).
--
-- دست‌نویس، مثل 0054 و 0062. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.
--
--  - **نسخه** (`site_page_versions_guard`): پاک نمی‌شود (`_append_only`)؛ تنها تغییر «پس گرفتن» زمان‌دار است، یک بار (`_withdraw_once`)، فقط
--    پیش از رسیدنش (`_withdraw_live`) و بی دست زدن به هیچ ستون دیگر (`_frozen`). درج زیر قفل ردیف صفحه است، پس دو انتشار یک صفحه پشت هم‌اند:
--    شماره‌ها پشت‌سرهم (`_sequence`)، تازه بی «پس گرفتن» (`_insert_state`)، و تا زمان‌داری در راه است نسخهٔ تازه‌ای نه (`_one_pending`)، تا
--    «کدام روی سایت است» همیشه یک جواب داشته باشد.
--  - **«تعرفه»** (`_tariff`): نشانی `tarefe`، هرگز برداشتن، و متن خالی فقط برگشت به متن پیش‌فرض.
--  - **صفحهٔ فرود** (`_landing`): متن خالی فقط برداشتن؛ نشانی هر نسخه را همین صفحه پیش‌تر گرفته (`_slug_claim`، `site_page_slugs`)؛ برداشتن فقط
--    صفحه‌ای که همین حالا با متن روی سایت است، و با همان نشانی (`_removal`)؛ مقصد ۳۰۱ صفحه‌ای که هست.
--  - **برگرداندن راست می‌گوید** (`_restored_same`): همان متن و همان نشانی نسخهٔ N همین صفحه.
--  - **هر نسخه تغییری است** (`_noop`): همان متن، نشانی و برداشتنِ آخرین نسخهٔ پس‌گرفته‌نشده چیزی را عوض نمی‌کند.
--  - **نشانی‌ها** (`site_page_slugs_guard`): نشانی‌ای که مال صفحه‌ای شد نه عوض می‌شود نه پاک، تا نشانی قبلی هرگز صفحهٔ دیگری نشود.
--  - **صفحه** (`site_pages_guard`): نوعش عوض نمی‌شود، و صفحه‌ای که نسخه دارد پاک نمی‌شود (`_has_versions`).
--  - **پیش‌نویس** (`site_page_drafts_guard`): پایه ۰ یا نسخه‌ای از همان صفحه.

CREATE FUNCTION site_page_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  page_kind site_page_kind;
  last_row site_page_versions%ROWTYPE;
  live_row site_page_versions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'نسخهٔ % صفحهٔ % پاک نمی‌شود', OLD.version, OLD.page_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_append_only';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.page_id, NEW.version, NEW.slug, NEW.content, NEW.restored_from, NEW.removal, NEW.moved_to, NEW.live_from, NEW.created_by, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.page_id, OLD.version, OLD.slug, OLD.content, OLD.restored_from, OLD.removal, OLD.moved_to, OLD.live_from, OLD.created_by, OLD.created_at)
       OR NEW.withdrawn_at IS NULL THEN
      RAISE EXCEPTION 'نسخهٔ % صفحهٔ % عوض نمی‌شود؛ نسخهٔ تازه منتشر کن', OLD.version, OLD.page_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_frozen';
    END IF;
    IF OLD.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'نسخهٔ % صفحهٔ % پیش‌تر پس گرفته شد', OLD.version, OLD.page_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_withdraw_once';
    END IF;
    IF OLD.live_from <= now() THEN
      RAISE EXCEPTION 'نسخهٔ % صفحهٔ % روی سایت رفته؛ پس گرفته نمی‌شود', OLD.version, OLD.page_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_withdraw_live';
    END IF;
    RETURN NEW;
  END IF;

  -- درج: زیر قفل ردیف صفحه، تا دو انتشار هم‌زمان یک صفحه پشت هم باشند.
  SELECT kind INTO page_kind FROM site_pages WHERE id = NEW.page_id FOR UPDATE;

  IF NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by IS NOT NULL THEN
    RAISE EXCEPTION 'نسخهٔ تازه پس‌گرفته نیست'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_insert_state';
  END IF;

  SELECT * INTO last_row FROM site_page_versions WHERE page_id = NEW.page_id ORDER BY version DESC LIMIT 1;
  IF NEW.version <> coalesce(last_row.version, 0) + 1 THEN
    RAISE EXCEPTION 'نسخهٔ تازهٔ صفحهٔ % شمارهٔ % است، نه %', NEW.page_id, coalesce(last_row.version, 0) + 1, NEW.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_sequence';
  END IF;

  IF EXISTS (
    SELECT 1 FROM site_page_versions
     WHERE page_id = NEW.page_id AND withdrawn_at IS NULL AND live_from > NEW.created_at
  ) THEN
    RAISE EXCEPTION 'صفحهٔ % نسخهٔ زمان‌داری در راه دارد؛ اول آن را پس بگیر', NEW.page_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_one_pending';
  END IF;

  IF page_kind = 'tariff' THEN
    IF NEW.slug <> 'tarefe' OR NEW.removal IS NOT NULL OR (NEW.content IS NULL AND NEW.restored_from IS DISTINCT FROM 0) THEN
      RAISE EXCEPTION '«تعرفه» نشانی tarefe دارد و برداشته نمی‌شود'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_tariff';
    END IF;
  ELSE
    IF (NEW.content IS NULL) <> (NEW.removal IS NOT NULL) THEN
      RAISE EXCEPTION 'متن خالی صفحهٔ فرود فقط برداشتن است'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_landing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM site_page_slugs WHERE slug = NEW.slug AND page_id = NEW.page_id) THEN
      RAISE EXCEPTION 'نشانی % مال صفحهٔ % نیست', NEW.slug, NEW.page_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_slug_claim';
    END IF;
    IF NEW.removal IS NOT NULL THEN
      -- برداشتن: صفحه همین حالا با متن روی سایت است، و همان نشانی برداشته می‌شود.
      SELECT * INTO live_row FROM site_page_versions
       WHERE page_id = NEW.page_id AND withdrawn_at IS NULL AND live_from <= NEW.created_at
       ORDER BY version DESC LIMIT 1;
      IF live_row.id IS NULL OR live_row.content IS NULL OR live_row.slug <> NEW.slug THEN
        RAISE EXCEPTION 'صفحهٔ % با نشانی % روی سایت نیست تا برداشته شود', NEW.page_id, NEW.slug
          USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_removal';
      END IF;
    END IF;
  END IF;

  IF NEW.restored_from IS NOT NULL AND NEW.restored_from > 0 AND NOT EXISTS (
    SELECT 1 FROM site_page_versions
     WHERE page_id = NEW.page_id AND version = NEW.restored_from
       AND content IS NOT NULL AND content IS NOT DISTINCT FROM NEW.content AND slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'نسخهٔ % صفحهٔ % برگرداندهٔ نسخهٔ % نیست', NEW.version, NEW.page_id, NEW.restored_from
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_restored_same';
  END IF;

  SELECT * INTO last_row FROM site_page_versions
   WHERE page_id = NEW.page_id AND withdrawn_at IS NULL ORDER BY version DESC LIMIT 1;
  IF last_row.id IS NOT NULL
     AND last_row.content IS NOT DISTINCT FROM NEW.content
     AND last_row.slug = NEW.slug
     AND last_row.removal IS NOT DISTINCT FROM NEW.removal
     AND last_row.moved_to IS NOT DISTINCT FROM NEW.moved_to THEN
    RAISE EXCEPTION 'نسخهٔ تازهٔ صفحهٔ % همان آخرین نسخه است', NEW.page_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_versions_noop';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_page_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON site_page_versions
  FOR EACH ROW EXECUTE FUNCTION site_page_versions_guard();
--> statement-breakpoint

CREATE FUNCTION site_page_slugs_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'نشانی % پاک نمی‌شود', OLD.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_slugs_append_only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'نشانی % عوض نمی‌شود', OLD.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_slugs_frozen';
  END IF;
  IF (SELECT kind FROM site_pages WHERE id = NEW.page_id) <> 'landing' THEN
    RAISE EXCEPTION 'فقط صفحهٔ فرود نشانی می‌گیرد'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_slugs_landing';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_page_slugs_guard BEFORE INSERT OR UPDATE OR DELETE ON site_page_slugs
  FOR EACH ROW EXECUTE FUNCTION site_page_slugs_guard();
--> statement-breakpoint

CREATE FUNCTION site_pages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'صفحهٔ % عوض نمی‌شود', OLD.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_pages_frozen';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM site_page_versions WHERE page_id = OLD.id) THEN
    RAISE EXCEPTION 'صفحهٔ % نسخه دارد و پاک نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_pages_has_versions';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_pages_guard BEFORE UPDATE OR DELETE ON site_pages
  FOR EACH ROW EXECUTE FUNCTION site_pages_guard();
--> statement-breakpoint

CREATE FUNCTION site_page_drafts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.base_version <> 0 AND NOT EXISTS (
    SELECT 1 FROM site_page_versions WHERE page_id = NEW.page_id AND version = NEW.base_version
  ) THEN
    RAISE EXCEPTION 'پیش‌نویس صفحهٔ % از نسخهٔ % است که نیست', NEW.page_id, NEW.base_version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_page_drafts_base_exists';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_page_drafts_guard BEFORE INSERT OR UPDATE OF page_id, base_version ON site_page_drafts
  FOR EACH ROW EXECUTE FUNCTION site_page_drafts_guard();
