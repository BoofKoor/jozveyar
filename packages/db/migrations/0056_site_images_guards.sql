-- محافظ‌های تصویرهای سایت (برش ۱۱٫۲، ADR-067).
--
-- دست‌نویس، مثل 0046 و 0054. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.
--
--  - **بارگذاری تازه است** (`site_images_insert_state`): بی نتیجهٔ کارگر و بی روی سایت رفتن ساخته می‌شود.
--  - **بارگذاری عوض نمی‌شود** (`site_images_frozen`): نوع، شماره، فایل‌ها و نامشان، و سازنده؛ عوض‌شدنی فقط نتیجهٔ کارگر و اولین روی سایت رفتن.
--  - **نتیجهٔ کارگر یک بار** (`site_images_build_once`): `built_at` و `error` فقط از هیچ نوشته می‌شوند؛ کار دومی که اجارهٔ اولی را گرفت،
--    نتیجه‌ای را که شاید روی سایت است عوض نمی‌کند.
--  - **ساخته یعنی همهٔ فایل‌ها** (`site_images_files_complete`): بارگذاری بی خطا فقط با همهٔ فایل‌های نوعش ساخته می‌شود (لوگو شش فایل؛ بنر
--    `desktop`، و `mobile` اگر و فقط اگر تصویر گوشی دارد)، و بارگذاری با خطا هیچ فایلی ندارد. پس سایت هرگز لوگوی نیمه‌کاره نمی‌بیند.
--  - **روی سایت یک بار** (`site_images_publish_once`): `published_at` فقط از هیچ نوشته می‌شود.
--  - **روی سایت رفته پاک نمی‌شود** (`site_images_published_kept`): کارگر فقط بارگذاری‌ای را پاک می‌کند که هرگز روی سایت نرفت؛ آنچه رفت
--    می‌ماند تا دوباره گذاشته شود، و تنظیم `content.logo` یا `content.banner` هرگز به ردیفی که نیست اشاره نمی‌کند.
--  - **فایل‌ها فقط با پایان کار** (`site_image_files_once`): فایل فقط برای بارگذاری‌ای نوشته می‌شود که هنوز ساخته نشده (زیر قفل همان ردیف)، با
--    نامی از نوع خودش (`site_image_files_kind`)؛ عوض نمی‌شود، و جز با خود بارگذاری پاک نمی‌شود (`site_image_files_frozen`).

CREATE FUNCTION site_images_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  names text[];
  wanted text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.built_at IS NOT NULL OR NEW.error IS NOT NULL OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'بارگذاری تازهٔ % بی نتیجهٔ کارگر و بی روی سایت رفتن ساخته می‌شود', NEW.kind
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_insert_state';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'بارگذاری % شمارهٔ % روی سایت رفته و پاک نمی‌شود', OLD.kind, OLD.version
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_published_kept';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.main IS DISTINCT FROM OLD.main OR NEW.main_name IS DISTINCT FROM OLD.main_name
     OR NEW.extra IS DISTINCT FROM OLD.extra OR NEW.extra_name IS DISTINCT FROM OLD.extra_name
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'بارگذاری % شمارهٔ % عوض نمی‌شود؛ تصویر تازه بارگذاری کن', OLD.kind, OLD.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_frozen';
  END IF;

  IF OLD.built_at IS NOT NULL AND (NEW.built_at IS DISTINCT FROM OLD.built_at OR NEW.error IS DISTINCT FROM OLD.error) THEN
    RAISE EXCEPTION 'نتیجهٔ کارگر برای بارگذاری % شمارهٔ % یک بار نوشته می‌شود', OLD.kind, OLD.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_build_once';
  END IF;

  IF OLD.built_at IS NULL AND NEW.built_at IS NOT NULL THEN
    SELECT coalesce(array_agg(name ORDER BY name COLLATE "C"), '{}') INTO names FROM site_image_files WHERE image_id = NEW.id;
    IF NEW.error IS NOT NULL THEN
      wanted := '{}';
    ELSIF NEW.kind = 'logo' THEN
      wanted := ARRAY['apple', 'favicon', 'icon192', 'icon512', 'logo', 'og'];
    ELSIF NEW.extra IS NULL THEN
      wanted := ARRAY['desktop'];
    ELSE
      wanted := ARRAY['desktop', 'mobile'];
    END IF;
    IF names IS DISTINCT FROM wanted THEN
      RAISE EXCEPTION 'بارگذاری % شمارهٔ % با فایل‌های % ساخته نمی‌شود؛ باید % باشد', NEW.kind, NEW.version, names, wanted
        USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_files_complete';
    END IF;
  END IF;

  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'زمان روی سایت رفتن بارگذاری % شمارهٔ % یک بار نوشته می‌شود', OLD.kind, OLD.version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_images_publish_once';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_images_guard BEFORE INSERT OR UPDATE OR DELETE ON site_images
  FOR EACH ROW EXECUTE FUNCTION site_images_guard();
--> statement-breakpoint
CREATE FUNCTION site_image_files_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent site_images%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- در cascade بارگذاری دیگر پیدا نمی‌شود و فایل آزادانه می‌رود، مثل `order_notes_append_only` (0043).
    IF NOT EXISTS (SELECT 1 FROM site_images WHERE id = OLD.image_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'فایل % بارگذاری % جز با خود بارگذاری پاک نمی‌شود', OLD.name, OLD.image_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_image_files_frozen';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'فایل % بارگذاری % عوض نمی‌شود', OLD.name, OLD.image_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_image_files_frozen';
  END IF;

  SELECT * INTO parent FROM site_images WHERE id = NEW.image_id FOR UPDATE;
  IF parent.built_at IS NOT NULL THEN
    RAISE EXCEPTION 'بارگذاری % پیش‌تر ساخته شده؛ فایل تازه نمی‌گیرد', NEW.image_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_image_files_once';
  END IF;
  IF NOT ((parent.kind = 'logo' AND NEW.name IN ('logo', 'favicon', 'apple', 'icon192', 'icon512', 'og'))
          OR (parent.kind = 'banner' AND (NEW.name = 'desktop' OR (NEW.name = 'mobile' AND parent.extra IS NOT NULL)))) THEN
    RAISE EXCEPTION 'فایل % مال بارگذاری % از نوع % نیست', NEW.name, NEW.image_id, parent.kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'site_image_files_kind';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER site_image_files_guard BEFORE INSERT OR UPDATE OR DELETE ON site_image_files
  FOR EACH ROW EXECUTE FUNCTION site_image_files_guard();
