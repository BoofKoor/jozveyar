/**
 * متنی که کاربر در مسیر خرید تایپ می‌کند (برش ۳): نشانی، نام گیرنده و شمارهٔ موبایل. هم سرور می‌خواندش و
 * هم تکهٔ تنبل مسیر خرید در مرورگر.
 *
 * جدا از بقیهٔ بسته و بیرون از `index.ts`، چون فقط مسیر خرید و سرور لازمش دارند.
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
