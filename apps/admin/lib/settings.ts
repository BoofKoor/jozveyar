/**
 * تنظیمات و کلیدها در پنل (برش ۴٫۶؛ طرح پنل `m-settings` و `m-key-edit`، ADR-041): منطق خالص، مشترک صفحه و سرویس، بی نکست
 * و بی پایگاه داده، تا تست بی مرورگر بسنجدش. جزء مرورگری هم می‌تواند بخواندش: از `@jozveyar/db` فقط type.
 *
 *  - **ورودی فارسی‌نرمال:** عدد و تاریخ با ارقام فارسی یا لاتین؛ مناسبت با `tidyInputFa`؛ مقدار کلید با ارقام لاتین و بی فاصلهٔ
 *    دو سر، ولی وگرنه عیناً (کلید API به کوچک و بزرگی حساس است).
 *  - **تاریخ واقعی:** «1405/12/30» شکلش درست است ولی ۱۴۰۵ کبیسه نیست؛ تاریخ با خود تقویم `Intl` سنجیده می‌شود، همان که
 *    روز کاری (`postHandoffDue`) با آن روز را می‌شناسد.
 *  - **فقط ۴ نویسهٔ آخر** هر کلید، و فقط وقتی کلید دست‌کم ۸ نویسه است؛ کلید کوتاه‌تر فقط نقطه.
 */

import type { Holiday } from '@jozveyar/contracts';
import type { ServiceKeyName } from '@jozveyar/db';
import { formatJalaliNumeric, jalaliYear, toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

const DAY_MS = 86_400_000;

/** بیشترین طول مناسبت یک تعطیلی، پس از یکدست شدن. */
export const HOLIDAY_TITLE_MAX = 100;
/** بیشترین طول مقدار یک کلید. */
export const KEY_VALUE_MAX = 512;
/** نویسه‌های آخر کلید که پنل نشان می‌دهد، و کمترین طولی که آنها را نشان می‌دهد. */
export const KEY_TAIL = 4;
export const KEY_TAIL_MIN_LENGTH = 8;
/** روزهای نزدیکی که بی «همه را ببین» دیده می‌شوند (طرح). */
export const HOLIDAYS_SHOWN = 5;
/** از بهمن، نبودن تعطیلی‌های سال بعد هشدار است: نوروز سال بعد در مهلت سفارش‌های اسفند می‌افتد. */
export const NEXT_YEAR_WARNING_MONTH = 11;

/** تنظیم‌های عددی صفحه، با نامشان در `settings`؛ از ۵٫۱ روزهای نگهداری فایل‌های سفارش (ADR-044). */
export const NUMBER_SETTINGS = ['order.sla_days', 'otp.site_hourly_limit', 'order.files_retention_days'] as const;
export type NumberSettingKey = (typeof NUMBER_SETTINGS)[number];
export const isNumberSetting = (value: unknown): value is NumberSettingKey =>
  typeof value === 'string' && (NUMBER_SETTINGS as readonly string[]).includes(value);

/** عدد صحیح تایپ‌شده: ارقام فارسی یا لاتین، با جداکنندهٔ هزارگان یا بی آن؛ null اگر عدد صحیح نیست. */
export function parseWholeNumber(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const digits = toLatinDigits(input).replace(/[,٬\s]/g, '');
  return /^\d{1,7}$/.test(digits) ? Number(digits) : null;
}

/* ───────────────────────── تعطیلی‌ها ───────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * نیمروز تهرانِ یک روز شمسی، یا null اگر چنین روزی در تقویم نیست (ماه ۱۳، ۳۱ مهر، ۳۰ اسفند سال غیرکبیسه). نوروز میان ۱۹ تا
 * ۲۲ مارس است؛ پس حدس از روز چندم سال، و سنجش همان روز و دو روز پیش و پس با خود `Intl`.
 */
export function jalaliDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || year < 1300 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const want = `${year}/${pad(month)}/${pad(day)}`;
  const dayOfYear = month <= 6 ? (month - 1) * 31 + day - 1 : 186 + (month - 7) * 30 + day - 1;
  const guess = Date.UTC(year + 621, 2, 20, 8, 30) + dayOfYear * DAY_MS;
  for (const offset of [0, 1, -1, 2, -2]) {
    const at = new Date(guess + offset * DAY_MS);
    if (formatJalaliNumeric(at) === want) return at;
  }
  return null;
}

/** تاریخ تایپ‌شده: ارقام فارسی یا لاتین، «/» یا «-»، ماه و روز یک یا دو رقمی؛ به شکل `1406/03/25`. */
export function parseJalaliInput(input: unknown): { date: string } | { error: 'holiday_date_format' | 'holiday_date_invalid' } {
  const text = typeof input === 'string' ? toLatinDigits(input).trim() : '';
  const match = /^(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})$/.exec(text);
  if (!match) return { error: 'holiday_date_format' };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!jalaliDate(year, month, day)) return { error: 'holiday_date_invalid' };
  return { date: `${year}/${pad(month)}/${pad(day)}` };
}

export type HolidayFieldError = 'holiday_date_format' | 'holiday_date_invalid' | 'holiday_past' | 'holiday_too_far' | 'holiday_title';

/**
 * تعطیلی تازه: روزی واقعی بعد از امروز و تا پایان سال بعد، با مناسبت ۱ تا ۱۰۰ نویسه. امروز و گذشته روی مهلت هیچ سفارشی اثر
 * ندارند: روز کاری از فردای پرداخت شمرده می‌شود (`postHandoffDue`)، و مهلت سفارش ثبت‌شده با خودش است.
 */
export function readHolidayInput(
  input: { date: unknown; title: unknown },
  now: Date,
): { value: Holiday } | { errors: { date?: HolidayFieldError; title?: HolidayFieldError } } {
  const errors: { date?: HolidayFieldError; title?: HolidayFieldError } = {};
  const parsed = parseJalaliInput(input.date);
  if ('error' in parsed) errors.date = parsed.error;
  else if (parsed.date <= formatJalaliNumeric(now)) errors.date = 'holiday_past';
  else if (Number(parsed.date.slice(0, 4)) > jalaliYear(now) + 1) errors.date = 'holiday_too_far';
  const title = tidyInputFa(typeof input.title === 'string' ? input.title : '');
  if (!title || [...title].length > HOLIDAY_TITLE_MAX) errors.title = 'holiday_title';
  if (errors.date || errors.title || 'error' in parsed) return { errors };
  return { value: { date: parsed.date, title } };
}

/** به ترتیب تاریخ؛ شکل `1405/10/02` با مقایسهٔ متن مرتب می‌شود. */
export const sortHolidays = (list: readonly Holiday[]): Holiday[] => [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export interface HolidaysView {
  /** امروز و بعد، به ترتیب. */
  upcoming: Holiday[];
  /** گذشته، تازه‌ترین اول؛ پاک‌شدنی، بی اثر روی مهلت هیچ سفارشی. */
  past: Holiday[];
  /** سال آخرین روز آینده؛ «همه را ببین (36 روز تا پایان 1406)». */
  lastYear: number | null;
  /** اولین سالی در فهرست که هنوز با تقویم رسمی تطبیق داده نشده. */
  unconfirmedYear: number | null;
  /** از بهمن، سال بعد اگر هیچ روزی در فهرست ندارد. */
  missingYear: number | null;
  /** بیشترین سالی که تعطیلی تازه می‌پذیرد. */
  maxYear: number;
}

const yearOf = (holiday: Holiday) => Number(holiday.date.slice(0, 4));

export function holidaysView(list: readonly Holiday[], officialThrough: number, now: Date): HolidaysView {
  const today = formatJalaliNumeric(now);
  const sorted = sortHolidays(list);
  const upcoming = sorted.filter((h) => h.date >= today);
  const past = sorted.filter((h) => h.date < today).reverse();
  const unconfirmed = sorted.map(yearOf).filter((year) => year > officialThrough);
  const thisYear = jalaliYear(now);
  const month = Number(today.slice(5, 7));
  const missing = month >= NEXT_YEAR_WARNING_MONTH && !sorted.some((h) => yearOf(h) === thisYear + 1);
  return {
    upcoming,
    past,
    lastYear: upcoming.length ? yearOf(upcoming.at(-1)!) : null,
    unconfirmedYear: unconfirmed.length ? Math.min(...unconfirmed) : null,
    missingYear: missing ? thisYear + 1 : null,
    maxYear: thisYear + 1,
  };
}

/* ───────────────────────── کلیدها ───────────────────────── */

/**
 * مقدار تازهٔ یک کلید: ارقام لاتین و بی فاصلهٔ دو سر؛ ۱ تا ۵۱۲ نویسهٔ دیدنی ASCII، بی فاصله. null اگر نه. کلید API،
 * نام قالب و کد پذیرنده همه همین‌اند؛ آزمایش خود مقدار با پنل پیامک و درگاه واقعی در برش ۷.
 */
export function readKeyValue(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = toLatinDigits(input).trim();
  return new RegExp(`^[\\x21-\\x7E]{1,${KEY_VALUE_MAX}}$`).test(value) ? value : null;
}

/** ۴ نویسهٔ آخر، فقط برای کلید دست‌کم ۸ نویسه‌ای؛ کلید کوتاه‌تر هیچ، تا بخش بزرگی از آن دیده نشود. */
export const keyTail = (value: string): string | null => (value.length >= KEY_TAIL_MIN_LENGTH ? value.slice(-KEY_TAIL) : null);

/** نام و متن‌های هر کلید در صفحه (طرح `m-settings`). `dots` شمار نقطه‌های پیش از ۴ نویسهٔ آخر، مثل طرح. */
export const KEY_INFO: Record<ServiceKeyName, { label: string; field: string; about: string; test: string; dots: number }> = {
  SMS_API_KEY: {
    label: 'کلید API کاوه‌نگار',
    field: 'کلید تازه',
    about: 'کلیدی که پنل کاوه‌نگار می‌دهد',
    test: 'آزمایش کلید با خود پنل پیامک واقعی می‌آید.',
    dots: 8,
  },
  SMS_OTP_TEMPLATE: {
    label: 'قالب کد پیامکی کاوه‌نگار',
    field: 'نام قالب',
    about: 'نام قالبی که در پنل کاوه‌نگار تأیید می‌شود',
    test: 'آزمایش قالب با خود پنل پیامک واقعی می‌آید.',
    dots: 4,
  },
  PAYMENT_MERCHANT_ID: {
    label: 'کد پذیرندهٔ زیبال',
    field: 'کد پذیرندهٔ تازه',
    about: 'کد پذیرنده‌ای که زیبال می‌دهد',
    test: 'آزمایش کد پذیرنده با خود درگاه واقعی می‌آید.',
    dots: 4,
  },
};

/** «••••c2d8»، یا فقط نقطه برای کلید کوتاه و مقداری که خوانده نشد. */
export const maskText = (dots: number, tail: string | null) => `${'•'.repeat(dots)}${tail ?? ''}`;
