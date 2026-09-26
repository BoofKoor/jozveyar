/** کد سفارش و نام خانوادگی از ستون «نام گ» فایل پست (ADR-010). */

import { normalizeFa } from './normalize.js';

/* ───────────────────────── فایل پست ───────────────────────── */

/**
 * استخراج کد سفارش از ستون «نام گ» فایل پست.
 *
 * الگو: نام خانوادگی، فاصله، کد. مثال واقعی: `بیک زاده 6098`.
 *
 * دو قید که از دادهٔ واقعی درآمدند و نباید شکسته شوند:
 *  1. **روی فاصله نشکن.** نام خانوادگی می‌تواند چندکلمه‌ای باشد.
 *  2. **این تابع را روی ستون‌های عددی صدا نزن.** ستون وزن هم عدد ۴ رقمی دارد
 *     (۱۲۰۰، ۱۹۸۰، ۳۳۰۰، ۵۱۰۰) و کدها هم ۴ رقمی‌اند (۶۰۰۴ تا ۶۰۹۸)، پس
 *     جست‌وجوی همهٔ ستون‌ها می‌تواند کد یک سفارش را با وزن مرسولهٔ دیگری
 *     تطبیق بدهد و کد رهگیری غلط برای مشتری بفرستد. (ADR-010)
 */
export function extractOrderCodeFromRecipient(recipientName: string): number | null {
  const normalized = normalizeFa(recipientName);
  const match = /(?:^|\s)(\d{3,8})$/.exec(normalized);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** نام خانوادگی، بدون کد سفارش انتهایی. برای نمره‌دهی تطبیق پشتیبان. */
export function recipientSurname(recipientName: string): string {
  return normalizeFa(recipientName).replace(/(?:^|\s)\d{3,8}$/, '').trim();
}
