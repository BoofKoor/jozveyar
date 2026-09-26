/**
 * نتیجهٔ سرویس‌های مسیر خرید: یا مقدار، یا شکست با وضعیت HTTP، کد و جزئیاتی که رابط لازم دارد (مثلاً
 * `retryAfterSeconds` یا `attemptsLeft`). همان شکل `Result` سرویس آپلود، با کد شکست باز.
 */

import type { CheckoutErrorCode } from '@jozveyar/contracts/checkout';

export type Failure = { ok: false; status: number; error: CheckoutErrorCode } & Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | Failure;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = (status: number, error: CheckoutErrorCode, extra: Record<string, unknown> = {}): Failure => ({
  ...extra,
  ok: false,
  status,
  error,
});
