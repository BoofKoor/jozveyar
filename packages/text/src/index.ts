/**
 * متن فارسی و اعداد.
 *
 * دو کار جدا که به هم می‌رسند:
 *  - **نرمال‌سازی**: هر متنی که از کاربر یا از فایل پست می‌آید باید یکدست شود،
 *    وگرنه «ميردريكوندي» و «میردریکوندی» دو رشتهٔ متفاوت‌اند و تطبیق شکست می‌خورد.
 *  - **نمایش**: قیمت و تعداد با ارقام لاتین («147 صفحه»، «245,000 تومان»)،
 *    تاریخ شمسی. این تصمیم بریف است و در کل UI رعایت می‌شود.
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

/* ───────────────────────── نمایش عدد ───────────────────────── */

/** ریال به تومان. تعرفه و نمایش تومان است، ذخیره‌سازی ریال. */
export function rialsToTomans(rials: number): number {
  return rials / 10;
}

/** تومان به ریال — فقط در لایهٔ ورودی ادمین استفاده می‌شود. */
export function tomansToRials(tomans: number): number {
  return Math.round(tomans * 10);
}

/** جداکنندهٔ هزارگان با ارقام لاتین: `245,000`. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

/** مبلغ به تومان برای نمایش: `245,000 تومان`. ورودی **ریال** است. */
export function formatTomans(rials: number, withUnit = true): string {
  const text = formatNumber(Math.round(rialsToTomans(rials)));
  return withUnit ? `${text} تومان` : text;
}

/**
 * عدد و واحدش، جدا. رابط عدد را در span خودش ایزوله می‌کند و واحد فارسی را بیرون آن
 * می‌گذارد: `.num` روی کل «14 کیلوبایت» جهتش را چپ‌به‌راست می‌کند و «کیلوبایت 14» دیده می‌شود.
 */
export interface Measure {
  value: string;
  unit: string;
}

/** وزن: `530` و `گرم`، یا `2.4` و `کیلوگرم`. */
export function weightParts(grams: number): Measure {
  if (grams < 1000) return { value: formatNumber(Math.round(grams)), unit: 'گرم' };
  const kg = grams / 1000;
  return { value: kg.toFixed(kg < 10 ? 1 : 0), unit: 'کیلوگرم' };
}

/** وزن خوانا: `530 گرم` یا `2.4 کیلوگرم`. */
export function formatWeight(grams: number): string {
  const { value, unit } = weightParts(grams);
  return `${value} ${unit}`;
}

const BYTE_UNITS = ['کیلوبایت', 'مگابایت', 'گیگابایت'] as const;

/** حجم فایل با ارقام لاتین: `14` و `کیلوبایت`، یا `2.4` و `مگابایت`. */
export function bytesParts(bytes: number): Measure {
  if (bytes < 1024) return { value: String(bytes), unit: 'بایت' };
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return { value: value.toFixed(value < 10 ? 1 : 0), unit: BYTE_UNITS[unitIndex]! };
}

/** حجم فایل خوانا با ارقام لاتین. */
export function formatBytes(bytes: number): string {
  const { value, unit } = bytesParts(bytes);
  return `${value} ${unit}`;
}

/** جمع فارسی بدون «ها»ی اضافه: `147 صفحه`. فارسی شکل جمع عددی ندارد. */
export function pluralFa(count: number, noun: string): string {
  return `${formatNumber(count)} ${noun}`;
}

/**
 * فهرست شمارهٔ صفحه‌ها برای هشدار: `صفحهٔ 2`، `صفحه‌های 3، 7 و 12`، و بازهٔ پشت‌سرهم
 * به‌صورت `صفحه‌های 1 تا 40 و 52`. بیش از `maxItems` بخش کوتاه می‌شود:
 * `… و 38 صفحهٔ دیگر` — کاربر باید جا را پیدا کند، نه فهرست را بخواند.
 */
export function formatPages(pages: readonly number[], maxItems = 6): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const items: { text: string; count: number }[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1;
    const run = j - i + 1;
    if (run >= 3) {
      items.push({ text: `${formatNumber(sorted[i]!)} تا ${formatNumber(sorted[j]!)}`, count: run });
    } else {
      for (let k = i; k <= j; k += 1) items.push({ text: formatNumber(sorted[k]!), count: 1 });
    }
    i = j + 1;
  }

  const shown = items.slice(0, maxItems);
  const rest = items.slice(maxItems).reduce((sum, item) => sum + item.count, 0);
  const parts = shown.map((item) => item.text);
  if (rest > 0) parts.push(`${formatNumber(rest)} صفحهٔ دیگر`);

  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join('، ')} و ${parts.at(-1)!}`;
  return `${sorted.length === 1 ? 'صفحهٔ' : 'صفحه‌های'} ${list}`;
}

/* ───────────────────────── تاریخ شمسی ───────────────────────── */

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/**
 * تاریخ شمسی با ارقام لاتین: `25 شهریور 1405`.
 *
 * از `Intl` با تقویم فارسی استفاده می‌کند — در Node 22 و همهٔ مرورگرهای هدف
 * موجود است و نیازی به کتابخانهٔ تبدیل تقویم نیست.
 */
export function formatJalali(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const month = Number(get('month'));
  const monthName = JALALI_MONTHS[month - 1] ?? String(month);
  return `${Number(get('day'))} ${monthName} ${get('year').replace(/\D/g, '')}`;
}

/**
 * سال شمسی به عدد: `1405`؛ برای «©» پاورقی. سال به وقت تهران عوض می‌شود، نه UTC: نوروز ۱۴۰۵
 * ساعت ۲۰:۳۰ روز ۲۰ مارس به وقت UTC آمد، یعنی نیمه‌شب تهران.
 */
export function jalaliYear(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'year')?.value.replace(/\D/g, ''));
}

/** تاریخ شمسی عددی: `1405/06/25`. همان شکلی که در فایل پست می‌آید. */
export function formatJalaliNumeric(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tehran',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year').replace(/\D/g, '')}/${get('month')}/${get('day')}`;
}
