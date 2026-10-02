-- محافظ‌های `checkout_previews` (برش ۷٫۵، ADR-052، سؤال ۱۷۰).
--
-- دست‌نویس، مثل 0008 برای `admin_invites`: پیوندی که مسیر خرید را با پول و پیامک واقعی برای یک مرورگر باز می‌کند باید در خود پایگاه داده
-- یک‌باره و کوتاه‌عمر بماند، نه فقط در کد. کد همین‌ها را با `WHERE` می‌سنجد (`checkout.ts`)؛ این دیوار دوم است. هر خطا با نام محدودیت
-- برمی‌گردد (`check_violation` و `CONSTRAINT`؛ یک پیوند باز با `unique_violation` و نام شاخص).
--
--  - `checkout_previews_token_hash` و `checkout_previews_cookie_hash`: از پیوند و کوکی فقط هش sha256، ۶۴ رقم hex کوچک.
--  - `checkout_previews_link_ttl`: پیوند دقیقاً ۱۵ دقیقه پس از ساختن منقضی می‌شود.
--  - `checkout_previews_cookie_ttl`: کوکی دقیقاً ۲۴ ساعت پس از باز شدن پیوند.
--  - `checkout_previews_opened`: زمان باز شدن، هش کوکی و انقضای کوکی با هم می‌آیند.
--  - `checkout_previews_insert_state`: ردیف تازه باز نشده و بسته نشده است.
--  - `checkout_previews_frozen`: شناسه، هش پیوند، سازنده، زمان ساختن و انقضای پیوند پس از درج عوض نمی‌شوند.
--  - `checkout_previews_open_once`: باز شدن یک بار است؛ زمان باز شدن و کوکی پس از آن عوض نمی‌شوند.
--  - `checkout_previews_open_window`: باز شدن فقط پیش از انقضای پیوند، و فقط اگر بسته نشده.
--  - `checkout_previews_close_once`: بستن یک بار است.
--  - `checkout_previews_append_only`: ردیف پاک نمی‌شود.
--  - `checkout_previews_one_open`: یک پیوند باز (نه باز شده، نه بسته) در هر زمان؛ پیوند تازه در همان تراکنش بازنشدهٔ قبلی را می‌بندد.

ALTER TABLE checkout_previews ADD CONSTRAINT checkout_previews_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE checkout_previews ADD CONSTRAINT checkout_previews_cookie_hash CHECK (cookie_hash ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE checkout_previews ADD CONSTRAINT checkout_previews_link_ttl CHECK (link_expires_at = created_at + interval '15 minutes');
--> statement-breakpoint
ALTER TABLE checkout_previews ADD CONSTRAINT checkout_previews_cookie_ttl CHECK (cookie_expires_at = opened_at + interval '24 hours');
--> statement-breakpoint
ALTER TABLE checkout_previews ADD CONSTRAINT checkout_previews_opened
  CHECK ((opened_at IS NULL) = (cookie_hash IS NULL) AND (opened_at IS NULL) = (cookie_expires_at IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX checkout_previews_one_open ON checkout_previews ((true)) WHERE opened_at IS NULL AND closed_at IS NULL;
--> statement-breakpoint

CREATE FUNCTION checkout_previews_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'پیوند پیش‌نمایش % پاک نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_append_only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.opened_at IS NOT NULL OR NEW.cookie_hash IS NOT NULL OR NEW.cookie_expires_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'پیوند پیش‌نمایش تازه باز نشده و بسته نشده ساخته می‌شود'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_insert_state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.link_expires_at IS DISTINCT FROM OLD.link_expires_at THEN
    RAISE EXCEPTION 'پیوند پیش‌نمایش % پس از ساختن عوض نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_frozen';
  END IF;

  IF OLD.opened_at IS NOT NULL AND (NEW.opened_at IS DISTINCT FROM OLD.opened_at OR NEW.cookie_hash IS DISTINCT FROM OLD.cookie_hash
     OR NEW.cookie_expires_at IS DISTINCT FROM OLD.cookie_expires_at) THEN
    RAISE EXCEPTION 'پیوند پیش‌نمایش % یک بار باز می‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_open_once';
  END IF;

  IF OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL
     AND (OLD.closed_at IS NOT NULL OR NEW.opened_at < OLD.created_at OR NEW.opened_at >= OLD.link_expires_at) THEN
    RAISE EXCEPTION 'پیوند پیش‌نمایش % بسته شده یا گذشته و باز نمی‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_open_window';
  END IF;

  IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'پیوند پیش‌نمایش % یک بار بسته می‌شود', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'checkout_previews_close_once';
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER checkout_previews_guard BEFORE INSERT OR UPDATE OR DELETE ON checkout_previews
  FOR EACH ROW EXECUTE FUNCTION checkout_previews_guard();
