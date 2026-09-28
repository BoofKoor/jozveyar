-- کاربر چاپخانه فقط نقش چاپخانه را دارد (برش ۵٫۳، ADR-042).
--
-- دست‌نویس، مثل 0001: EXCLUDE را drizzle نمی‌شناسد. نقش چاپخانه محدوده دارد (فقط سفارش‌های چاپخانهٔ خودش) و نقش‌های دیگر نه؛
-- ادمینی که هر دو را داشت، محدوده‌اش معلوم نبود. پس برای هر ادمین یا همهٔ ردیف‌های نقشش `print_partner`اند، یا هیچ‌کدام؛ و
-- کلید اصلی (ادمین، نقش) یعنی کاربر چاپخانه دقیقاً یک ردیف دارد، پس یک چاپخانه. یک چاپخانه چند کاربر می‌تواند داشته باشد.
--
-- EXCLUDE، نه تریگر: دو درج هم‌زمان (یکی نقش چاپخانه، یکی نقش دیگر) هم از آن نمی‌گذرند. خطا با نام محدودیت
-- (`exclusion_violation`، `admin_user_roles_partner_alone`). `btree_gist` را 0001 ساخته است.

ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_partner_alone"
  EXCLUDE USING gist ("admin_user_id" WITH =, ("role_id" = 'print_partner') WITH <>);
