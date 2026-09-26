-- محافظ‌های پنل ادمین که drizzle نمی‌تواند در اسکیما بیان کند (برش ۴، ADR-038).
--
-- دست‌نویس، مثل 0001_guards و 0006_order_guards و به همان دلیل: سابقه‌ای که کسی به آن تکیه می‌کند باید
-- در پایگاه داده دست‌نخوردنی باشد، نه فقط در کد. هر خطا با نام محدودیت برمی‌گردد (`check_violation` و
-- `CONSTRAINT`)، تا کد و تست بدانند کدام محافظ رد کرد.

-- ── رویداد ادمین فقط افزودنی ─────────────────────────────────────────────
--
-- «چه کسی، کی، چه کاری» فقط وقتی ارزش دارد که کسی نتواند بعداً عوضش کند: نه کد اشتباه در پنل، نه
-- دستی که ردش را پاک کند. درج آزاد است؛ عوض کردن و پاک کردن نه.
CREATE FUNCTION admin_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'رویداد ادمین عوض یا پاک نمی‌شود'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'admin_events_append_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_events_append_only BEFORE UPDATE OR DELETE ON admin_events
  FOR EACH ROW EXECUTE FUNCTION admin_events_append_only();
--> statement-breakpoint

-- ── ادمین پاک نمی‌شود، غیرفعال می‌شود ────────────────────────────────────
--
-- رویدادها، پیوندها و تلاش‌های ورود به ادمین اشاره می‌کنند؛ پاک کردنش یعنی سابقه‌ای بی صاحب.
CREATE FUNCTION admin_users_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ادمین % پاک نمی‌شود؛ غیرفعالش کن', OLD.username
    USING ERRCODE = 'check_violation', CONSTRAINT = 'admin_users_no_delete';
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_users_no_delete BEFORE DELETE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION admin_users_no_delete();
--> statement-breakpoint

-- ── پیوند ثبت یک بار ─────────────────────────────────────────────────────
--
-- پیوندی که مصرف یا کنار گذاشته شد دیگر عوض نمی‌شود: نه دوباره زنده، نه دوباره مصرف. کد این را با
-- `WHERE used_at IS NULL AND revoked_at IS NULL` می‌سنجد؛ این دیوار دوم است.
CREATE FUNCTION admin_invites_final() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.used_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'پیوند ثبت یک‌باره است'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'admin_invites_final';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER admin_invites_final BEFORE UPDATE ON admin_invites
  FOR EACH ROW EXECUTE FUNCTION admin_invites_final();
