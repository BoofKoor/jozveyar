/**
 * نرمال‌سازی متن فارسی و ارقام، برای مقایسه و تطبیق (نام فایل، فایل پست، جست‌وجوی شهر).
 *
 * همین تکه در باندل اولیهٔ صفحهٔ اصلی است (ترتیب نام فایل‌های جزوه، `lib/jozve.ts`)؛ پس جز نرمال‌سازی چیزی
 * اینجا نمی‌آید (index.ts).
 */

/* ───────────────────────── نرمال‌سازی ───────────────────────── */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** نیم‌فاصله، فاصلهٔ صفر، و علامت‌های جهت‌دهی که چشم نمی‌بیند ولی مقایسه می‌شکند. */
const ZERO_WIDTH = /[​‌‍‎‏﻿]/g;

/** ارقام فارسی و عربی به لاتین. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const arabic = ARABIC_INDIC.indexOf(char);
    if (arabic !== -1) {
      out += String(arabic);
      continue;
    }
    const persian = PERSIAN_INDIC.indexOf(char);
    if (persian !== -1) {
      out += String(persian);
      continue;
    }
    out += char;
  }
  return out;
}

/** ارقام لاتین به فارسی — فقط برای جایی که عمداً ارقام فارسی می‌خواهیم. */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => PERSIAN_INDIC[Number(d)]!);
}

/**
 * یکدست‌سازی حروف عربی به فارسی.
 *
 * `ي` عربی و `ی` فارسی دو کدپوینت متفاوت با ظاهر یکسان‌اند و همین‌طور `ك` و `ک`.
 * صفحه‌کلیدهای مختلف هر دو را تولید می‌کنند.
 */
export function unifyLetters(input: string): string {
  return input
    .replace(/ي/g, 'ی') // ي → ی
    .replace(/ى/g, 'ی') // ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/[ً-ْٰ]/g, ''); // اعراب
}

/**
 * نرمال‌سازی کامل برای **مقایسه و تطبیق**، نه برای نمایش.
 *
 * خروجی: حروف یکدست، ارقام لاتین، بدون اعراب و نویسهٔ نامرئی، فاصله‌های تک،
 * بدون فاصلهٔ ابتدا و انتها.
 */
export function normalizeFa(input: string): string {
  return toLatinDigits(unifyLetters(input.normalize('NFC')))
    .replace(ZERO_WIDTH, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** نرمال‌سازی برای نمایش: نویسهٔ نامرئی و اعراب پاک می‌شود، نیم‌فاصله می‌ماند. */
export function tidyFa(input: string): string {
  return unifyLetters(input.normalize('NFC')).replace(/[ \t]+/g, ' ').trim();
}
