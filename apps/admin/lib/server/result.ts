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
