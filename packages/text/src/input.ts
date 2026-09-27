/**
 * متنی که کاربر در مسیر خرید تایپ می‌کند (برش ۳): نشانی، نام گیرنده و شمارهٔ موبایل. هم سرور می‌خواندش و
 * هم تکهٔ تنبل مسیر خرید در مرورگر؛ و از برش ۴٫۳ پنل ادمین، که نشانی گیرنده را با همان قاعده ویرایش می‌کند.
 *
 * جدا از بقیهٔ بسته و بیرون از `index.ts`، چون فقط مسیر خرید، سرور و پنل لازمش دارند.
 */

import { toLatinDigits } from './normalize.js';

/** نویسه‌های نامرئی جز نیم‌فاصله: فاصلهٔ صفر، اتصال، علامت‌ها و جاسازی‌های جهت، BOM. */
const INVISIBLE = /[​‍‎‏‪-‮⁦-⁩﻿]/g;

/**
 * متنی که کاربر تایپ کرده و عیناً نمایش یا چاپ می‌شود — نشانی و نام گیرنده (برش ۳): ي و ك عربی فارسی
 * می‌شوند، ارقام لاتین، نویسهٔ نامرئی جز نیم‌فاصله پاک، نیم‌فاصلهٔ کنار فاصله یا تکراری پاک، و هر فاصله
 * و خط تازه یک فاصله.
 *
 * برخلاف `tidyFa` و `normalizeFa`، «آ»، همزه و اعراب دست نمی‌خورند: آن دو برای مقایسه‌اند، و اینجا
 * «وکیل‌آباد» روی برچسب پست نباید «وکیل‌اباد» شود، یا «مؤسسه» «موسسه».
 */
export function tidyInputFa(input: string): string {
  return toLatinDigits(input.normalize('NFC'))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .replace(/‌+/g, '‌')
    .replace(/ ?‌ ?/g, (match) => (match === '‌' ? match : ' '))
    .trim()
    .replace(/^‌+|‌+$/g, '');
}

/**
 * شمارهٔ موبایل ایران به یک شکل واحد: `09123456789`.
 *
 * `+98`، `0098`، `98`، با فاصله و خط تیره، و ارقام فارسی همه پذیرفته می‌شوند.
 * null یعنی شمارهٔ موبایل ایران معتبری نیست.
 */
export function normalizeIranMobile(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[^\d+]/g, '');
  let rest = digits;
  if (rest.startsWith('+98')) rest = rest.slice(3);
  else if (rest.startsWith('0098')) rest = rest.slice(4);
  else if (rest.startsWith('98') && rest.length === 12) rest = rest.slice(2);
  else if (rest.startsWith('0')) rest = rest.slice(1);
  if (!/^9\d{9}$/.test(rest)) return null;
  return `0${rest}`;
}

/* ───────────────────────── گیرندهٔ سفارش ───────────────────────── */

export interface RecipientInput {
  name: string;
  addressText: string;
  postalCode: string | null;
}

export interface Recipient {
  name: string;
  addressText: string;
  /** ده رقم لاتین، یا null. */
  postalCode: string | null;
}

/** نام فیلدی که غلط است، به همان شکل `fields` پاسخ ۴۰۰ سرور. */
export type RecipientField = 'recipient.name' | 'recipient.addressText' | 'recipient.postalCode';

/** کمینه و بیشینهٔ طول، بعد از نرمال‌سازی. */
export const RECIPIENT_LIMITS = {
  name: { min: 2, max: 100 },
  addressText: { min: 10, max: 500 },
} as const;

/**
 * گیرندهٔ سفارش: نرمال‌سازی و سنجش، یک قاعده برای مرورگر، سرور و پنل (برش ۳ج؛ از ۴٫۳ اینجا).
 *
 * سرور منبع حقیقت است و موقع «پرداخت» همین را دوباره می‌سنجد (`apps/web/lib/server/checkout.ts`)؛ مرورگر همین را
 * موقع «ادامه — موبایل و پرداخت» صدا می‌زند تا غلط تایپی کد پستی همان‌جا گفته شود، نه سه قدم بعد؛ و ویرایش نشانی
 * در پنل (`apps/admin/lib/server/orders.ts`) هم همین. چند کد جدا برای یک قاعده روزی از هم جدا می‌شدند.
 *
 * نرمال‌سازی «آ» و همزه را نگه می‌دارد (`tidyInputFa`): این متن روی برچسب پست چاپ می‌شود. خروجی: گیرندهٔ
 * نرمال‌شده، و فیلدهایی که قاعده را نمی‌خوانند؛ خالی یعنی پذیرفته.
 */
export function checkRecipient(input: RecipientInput): { value: Recipient; fields: RecipientField[] } {
  const fields: RecipientField[] = [];
  const name = tidyInputFa(input.name);
  if (name.length < RECIPIENT_LIMITS.name.min || name.length > RECIPIENT_LIMITS.name.max) fields.push('recipient.name');
  const addressText = tidyInputFa(input.addressText);
  if (addressText.length < RECIPIENT_LIMITS.addressText.min || addressText.length > RECIPIENT_LIMITS.addressText.max) {
    fields.push('recipient.addressText');
  }
  const digits = toLatinDigits(input.postalCode ?? '').replace(/[\s-]/g, '');
  const postalCode = digits === '' ? null : digits;
  if (postalCode !== null && !/^\d{10}$/.test(postalCode)) fields.push('recipient.postalCode');
  return { value: { name, addressText, postalCode }, fields };
}
