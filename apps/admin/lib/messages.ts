/**
 * پیام هر شکست سرویس پنل، به فارسی و با «کار بعدی» (تز محصول: هیچ بن‌بستی). ورود یک پیام برای نام و رمز
 * و کد دارد و نمی‌گوید کدام اشتباه بود.
 */

import type { AdminErrorCode } from './server/result';

export const MESSAGES: Record<AdminErrorCode, string> = {
  invalid_credentials: 'نام کاربری، رمز یا کد درست نیست. دوباره امتحان کن.',
  account_locked: 'تلاش ناموفق زیاد شد.',
  too_many_attempts: 'تلاش ورود از این شبکه زیاد شد. یک ساعت دیگر دوباره امتحان کن.',
  wrong_code: 'کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.',
  code_used: 'این کد یک بار به کار رفته است. چند ثانیه صبر کن و کد بعدی برنامه را بزن.',
  invite_invalid: 'این پیوند دیگر کار نمی‌کند.',
  password_too_short: 'رمز دست‌کم 12 نویسه باشد.',
  password_too_long: 'رمز حداکثر 200 نویسه باشد.',
  password_mismatch: 'تکرار رمز با خود رمز یکی نیست.',
  password_is_username: 'رمز نباید خود نام کاربری باشد.',
  invalid_username: 'نام کاربری 3 تا 32 نویسه: حرف لاتین کوچک، رقم، نقطه، خط تیره یا زیرخط، و اولش حرف.',
  invalid_display_name: 'نام را بنویس (حداکثر 100 نویسه).',
  invalid_role: 'نقش را انتخاب کن.',
  username_taken: 'این نام کاربری را ادمین دیگری دارد.',
  forbidden: 'این کار فقط با مالک پنل است.',
  not_found: 'این ادمین پیدا نشد، یا وضعیتش همین حالا عوض شد.',
  self: 'این کار برای حساب خودت نیست.',
  last_owner: 'آخرین مالک پنل غیرفعال نمی‌شود.',
  order_not_found: 'این سفارش پیدا نشد.',
  pdf_not_ready: 'PDF این جزوه هنوز ساخته نشده است.',
  pdf_not_failed: 'PDF این جزوه همین حالا در صف ساختن است، یا ساخته شده.',
  files_gone: 'فایل‌های مشتری دیگر روی سرور نیستند، پس PDF دوباره ساخته نمی‌شود. با مشتری تماس بگیر.',
  storage_unavailable: 'استوریج الان جواب نمی‌دهد. چند دقیقهٔ دیگر دوباره دانلود کن؛ اگر ماند، لاگ سرور می‌گوید چرا.',
  invalid_transition: 'این کار از وضعیت این سفارش ممکن نیست. صفحه را دوباره باز کن.',
  status_changed: 'وضعیت این سفارش همین حالا عوض شد؛ وضعیت تازه را ببین و اگر هنوز لازم است، دوباره بزن.',
  print_needs_pdf: 'اول PDF جزوه ساخته شود؛ بعد چاپ را شروع کن.',
  reason_required: 'دلیل را بنویس.',
  reason_too_long: 'دلیل حداکثر 500 نویسه باشد.',
  invalid_recipient: 'نام، نشانی یا کد پستی درست نیست.',
  recipient_locked: 'سفارش به پست رسیده یا لغو شده؛ نشانی دیگر عوض نمی‌شود.',
  tariff_not_found: 'این نسخهٔ تعرفه پیدا نشد.',
  not_draft: 'این نسخه دیگر پیش‌نویس نیست: فعال شده و ویرایش نمی‌شود. برای تغییر، نسخهٔ تازه بساز.',
  invalid_draft: 'پیش‌نویس خطا دارد؛ اول خطا را درست کن.',
  draft_changed: 'پیش‌نویس همین حالا جای دیگری ذخیره شد. صفحه را دوباره باز کن تا تازه‌ترینش را ببینی؛ تغییرهای این صفحه ذخیره نشد.',
  tariff_changed: 'تعرفهٔ فعال یا این نسخه همین حالا عوض شد؛ تغییرها را دوباره ببین و اگر هنوز لازم است، دوباره فعال کن.',
  already_active: 'این نسخه همین حالا فعال است.',
  unavailable: 'پنل الان نمی‌تواند این کار را بکند. چند دقیقهٔ دیگر امتحان کن؛ اگر ماند، لاگ سرور می‌گوید چرا.',
};

export const messageOf = (code: string | undefined) =>
  code && code in MESSAGES ? MESSAGES[code as AdminErrorCode] : MESSAGES.unavailable;

export const ROLE_NAMES: Record<string, string> = { owner: 'مالک', operator: 'متصدی' };

export const roleName = (roles: readonly string[]) => roles.map((role) => ROLE_NAMES[role] ?? role).join('، ');
