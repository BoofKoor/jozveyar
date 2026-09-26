/**
 * رمز پیش از هش یکدست می‌شود: NFKC، ي و ك عربی فارسی، ارقام لاتین. همان رمز از صفحه‌کلید دیگری (ویندوز
 * با «ي» عربی، گوشی با ارقام فارسی) همان هش را می‌دهد. فاصله و نیم‌فاصله دست نمی‌خورند؛ بخشی از رمزند.
 *
 * جدا از `password.ts`، تا سرویس ورود و دستور سرور (`scripts/cli.ts`) بی کتابخانهٔ بومی argon2 هم بار شوند.
 */

import { toLatinDigits } from '@jozveyar/text';

export function normalizePassword(password: string): string {
  return toLatinDigits(password.normalize('NFKC')).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
}
