/**
 * نتیجهٔ سرویس‌های پنل: یا مقدار، یا شکست با وضعیت HTTP، کد و جزئیاتی که صفحه لازم دارد (مثلاً
 * `lockedUntil`). همان شکل `Result` سایت (`apps/web/lib/server/result.ts`)، با کدهای پنل.
 */

export type AdminErrorCode =
  /** ورود: یک پیام برای نام، رمز و کد؛ نمی‌گوید کدام اشتباه بود. */
  | 'invalid_credentials'
  | 'account_locked'
  | 'too_many_attempts'
  /** کد برنامهٔ تأیید در کار حساس یا ثبت. */
  | 'wrong_code'
  | 'code_used'
  | 'invite_invalid'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_mismatch'
  | 'password_is_username'
  | 'invalid_username'
  | 'invalid_display_name'
  | 'invalid_role'
  | 'username_taken'
  | 'forbidden'
  | 'not_found'
  | 'self'
  | 'last_owner'
  /** سفارش‌ها (۴٫۲). */
  | 'order_not_found'
  | 'pdf_not_ready'
  | 'pdf_not_failed'
  | 'files_gone'
  | 'storage_unavailable'
  /** وضعیت سفارش و گیرنده (۴٫۳). */
  | 'invalid_transition'
  | 'status_changed'
  | 'print_needs_pdf'
  | 'reason_required'
  | 'reason_too_long'
  | 'invalid_recipient'
  | 'recipient_locked'
  /** فایل چاپ، برگه و نگهداری (۵٫۱). */
  | 'ticket_not_ready'
  | 'ticket_not_failed'
  | 'files_deleted'
  /** چاپخانهٔ سفارش و جابه‌جایی (۵٫۲). */
  | 'print_needs_partner'
  | 'order_partner_changed'
  | 'assign_closed'
  | 'partner_required'
  | 'partner_inactive'
  /** زبانهٔ «چاپخانه‌ها» (۵٫۲). */
  | 'partner_not_found'
  | 'invalid_partner_name'
  | 'city_required'
  | 'invalid_city'
  | 'partner_name_taken'
  | 'partner_changed'
  | 'partner_is_default'
  | 'partner_has_orders'
  /** تعرفه (۴٫۵). */
  | 'tariff_not_found'
  | 'not_draft'
  | 'invalid_draft'
  | 'draft_changed'
  | 'tariff_changed'
  | 'already_active'
  /** تنظیمات و کلیدها (۴٫۶). */
  | 'setting_not_found'
  | 'invalid_setting'
  | 'setting_changed'
  | 'invalid_holiday'
  | 'holiday_exists'
  | 'holiday_missing'
  | 'key_not_found'
  | 'invalid_key_value'
  | 'key_changed'
  /** ارسال: ورود فایل پست (۶٫۱). */
  | 'post_file_required'
  | 'post_file_too_large'
  | 'post_file_same'
  | 'import_not_found'
  | 'import_changed'
  | 'import_closed'
  | 'import_not_committed'
  | 'order_has_shipment'
  /** صف تأیید، دادن دستی و کنار گذاشتن یک کد (۶٫۲). */
  | 'row_not_found'
  | 'row_closed'
  | 'choice_required'
  | 'order_number_invalid'
  | 'shipment_order_changed'
  | 'blocked_cancelled'
  | 'blocked_before_payment'
  | 'blocked_needs_partner'
  | 'blocked_needs_print'
  | 'barcode_elsewhere'
  | 'shipment_not_found'
  | 'shipment_voided'
  /** «دوباره بفرست» پیامک رهگیری (۶٫۳). */
  | 'sms_not_failed'
  /** بازه‌های وزن گزارش ارسال (۶٫۴): خطای هر فیلد در `errors`. */
  | 'invalid_bands'
  /** پیکربندی سرور (مثلاً `SECRETS_KEY` عوض شده). */
  | 'unavailable';

export type Failure = { ok: false; status: number; error: AdminErrorCode } & Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | Failure;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (status: number, error: AdminErrorCode, extra: Record<string, unknown> = {}): Failure => ({
  ...extra,
  ok: false,
  status,
  error,
});
