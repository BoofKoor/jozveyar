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
import type { KeyCheck, ServiceKeyName } from '@jozveyar/db';
import { SMS_TEMPLATES, paramMark, type SmsPurpose } from '@jozveyar/sms';
import { formatJalaliNumeric, formatNumber, formatTehranTime, jalaliYear, toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import { tehranDay, whenText } from './format';
import type { Seg } from './orders';
import type { CreditView, SmsAlertsView } from './server/settings';

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

/**
 * تنظیم‌های عددی صفحه، با نامشان در `settings`؛ از ۵٫۱ روزهای نگهداری فایل‌های سفارش (ADR-044)، و از ۷٫۱ سقف ۲۴ ساعتهٔ کد و آستانهٔ
 * هشدار اعتبار پیامک (ADR-049).
 */
export const NUMBER_SETTINGS = [
  'order.sla_days',
  'otp.site_hourly_limit',
  'otp.site_daily_limit',
  'order.files_retention_days',
  'sms.credit_alert_days',
] as const;
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
 * مقدار تازهٔ یک کلید: ارقام لاتین و بی فاصلهٔ دو سر؛ ۱ تا ۵۱۲ نویسهٔ دیدنی ASCII، بی فاصله. null اگر نه. شکل ویژهٔ هر کلید
 * (کلید API sms.ir، شناسهٔ قالب عددی) را سرویس با آداپتور می‌سنجد.
 */
export function readKeyValue(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = toLatinDigits(input).trim();
  return new RegExp(`^[\\x21-\\x7E]{1,${KEY_VALUE_MAX}}$`).test(value) ? value : null;
}

/** ۴ نویسهٔ آخر، فقط برای کلید دست‌کم ۸ نویسه‌ای؛ کلید کوتاه‌تر هیچ، تا بخش بزرگی از آن دیده نشود. */
export const keyTail = (value: string): string | null => (value.length >= KEY_TAIL_MIN_LENGTH ? value.slice(-KEY_TAIL) : null);

/**
 * نام و متن‌های هر کلید در صفحه (طرح `m-settings`، برش ۷ سؤال ۱۳۸). `kind`: کلید راز (فقط ۴ نویسهٔ آخر) یا شناسهٔ قالب sms.ir (راز
 * نیست؛ کامل دیده می‌شود، با متن قالب زیرش). `dots` شمار نقطه‌های پیش از ۴ نویسهٔ آخر، مثل طرح. `testable`: «آزمایش» با خود سرویس از
 * ۷٫۱ (sms.ir)؛ کد پذیرندهٔ زیبال در ۷٫۲.
 */
export const KEY_INFO: Record<
  ServiceKeyName,
  {
    label: string;
    field: string;
    about: string;
    test: string;
    dots: number;
    kind: 'secret' | 'template';
    purpose: SmsPurpose | null;
    testable: boolean;
    /** سرویسی که «آزمایش» با آن است، و نامش در متن‌ها (برش ۷٫۲: کد پذیرنده با زیبال). */
    service: 'smsir' | 'zibal';
  }
> = {
  SMS_API_KEY: {
    label: 'کلید API sms.ir',
    field: 'کلید تازه',
    about: 'کلیدی که پنل sms.ir می‌دهد',
    test: 'پیش از ذخیره با خود sms.ir آزموده می‌شود: اعتبار حساب، بی پیامک و بی هزینه. «رد شد» ذخیره نمی‌شود.',
    dots: 8,
    kind: 'secret',
    purpose: null,
    testable: true,
    service: 'smsir',
  },
  SMS_OTP_TEMPLATE: {
    label: 'شناسهٔ قالب کد تأیید',
    field: 'شناسهٔ قالب',
    about: 'قالبی که با همین متن در sms.ir تأیید شد',
    test: 'پیش از ذخیره یک پیامک آزمایشی با پارامترهای نمونه می‌رود.',
    dots: 0,
    kind: 'template',
    purpose: 'otp',
    testable: true,
    service: 'smsir',
  },
  SMS_PAID_TEMPLATE: {
    label: 'شناسهٔ قالب پیامک پرداخت',
    field: 'شناسهٔ قالب',
    about: 'قالبی که با همین متن در sms.ir تأیید شد',
    test: 'پیش از ذخیره یک پیامک آزمایشی با پارامترهای نمونه می‌رود.',
    dots: 0,
    kind: 'template',
    purpose: 'order_paid',
    testable: true,
    service: 'smsir',
  },
  SMS_TRACKING_TEMPLATE: {
    label: 'شناسهٔ قالب پیامک رهگیری',
    field: 'شناسهٔ قالب',
    about: 'قالبی که با همین متن در sms.ir تأیید شد',
    test: 'پیش از ذخیره یک پیامک آزمایشی با پارامترهای نمونه می‌رود.',
    dots: 0,
    kind: 'template',
    purpose: 'tracking',
    testable: true,
    service: 'smsir',
  },
  PAYMENT_MERCHANT_ID: {
    label: 'کد پذیرندهٔ زیبال',
    field: 'کد پذیرندهٔ تازه',
    about: 'کد پذیرنده‌ای که زیبال می‌دهد',
    // برش ۷٫۲ (سؤال ۱۳۸، طرح `m-key-rejected`): «آزمایش و ذخیره»، مثل کلید API sms.ir.
    test: 'آزمایش یک درخواست پرداخت 1,000 تومانی است که کسی به صفحه‌اش نمی‌رود: کد پذیرنده، نشانی برگشت و IP سرور را با هم می‌سنجد. «رد شد» ذخیره نمی‌شود.',
    dots: 4,
    kind: 'secret',
    purpose: null,
    testable: true,
    service: 'zibal',
  },
};

/** «••••c2d8»، یا فقط نقطه برای کلید کوتاه و مقداری که خوانده نشد. */
export const maskText = (dots: number, tail: string | null) => `${'•'.repeat(dots)}${tail ?? ''}`;

/**
 * پارامترهای نمونهٔ پیامک آزمایشی هر قالب (سؤال ۱۳۸): همان که مالک باید روی گوشی ببیند. کد پنج رقمی، سفارش اول سایت، روز تحویل
 * نمونه، و بارکد به شکل واقعی پست.
 */
export const TEMPLATE_SAMPLES: Record<SmsPurpose, readonly string[]> = {
  otp: ['48213'],
  order_paid: ['10001', 'دوشنبه 6 مهر'],
  tracking: ['10027', '118800000000000000000101'],
};

/** سقف «آزمایش» کلیدها (ADR-049): پیامک آزمایشی هزینه دارد. */
export const KEY_TESTS_PER_HOUR = 10;
/** «رسید» آزمایش مقدار تازه چقدر برای «ذخیره» معتبر است. */
export const KEY_RECEIPT_MS = 15 * 60_000;

/** موبایل پیامک آزمایشی در رویداد و صفحه، پوشیده (سؤال ۱۴۱): «0912 ••• 6789». */
export const maskMobile = (mobile: string) => (/^09\d{9}$/.test(mobile) ? `${mobile.slice(0, 4)} ••• ${mobile.slice(7)}` : '•••');

/**
 * «برای حدود N روز» کارت اعتبار پیامک (سؤال ۱۳۷): اعتبار تقسیم بر هزینهٔ روزانهٔ هفت روز گذشته، هر دو به واحد خود sms.ir. بی
 * مصرف در هفتهٔ گذشته null (روز ندارد).
 */
export function creditDays(credit: number, weekCost: number): number | null {
  if (!(weekCost > 0) || !Number.isFinite(credit)) return null;
  return Math.max(0, Math.floor(credit / (weekCost / 7)));
}

/* ───────────────────────── آزمایش کلیدها، متن قالب، اعتبار و شمار کد (برش ۷٫۱، طرح `m-settings`) ───────────────────────── */

const num = (n: number): Seg => ({ num: formatNumber(n) });

/** یک تکهٔ متن قالب: متن، یا جای پارامتر (`#CODE#`). */
export type TemplatePart = string | { mark: string };

/**
 * متن قالب هر شناسه، همان که مالک در sms.ir می‌سازد (طرح `ad-keys__tpl`): سطرها و تکه‌های هر سطر، و نام پارامترها؛ از همان یک منبع
 * `@jozveyar/sms`، پس متنی که پنل نشان می‌دهد همان است که پیامک می‌شود.
 */
export function templateView(purpose: SmsPurpose): { lines: TemplatePart[][]; params: readonly string[] } {
  const lines: TemplatePart[][] = [[]];
  for (const part of SMS_TEMPLATES[purpose].parts as readonly (string | { readonly param: string })[]) {
    if (typeof part !== 'string') {
      lines.at(-1)!.push({ mark: paramMark(part.param) });
      continue;
    }
    part.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines.at(-1)!.push(piece);
    });
  }
  return { lines, params: SMS_TEMPLATES[purpose].params };
}

export interface KeyCheckView {
  tone: 'ok' | 'bad' | 'warn';
  text: Seg[];
}

/** نام سرویس «آزمایش» هر کلید در متن‌ها. */
export const serviceName = (name: ServiceKeyName) => (KEY_INFO[name].service === 'zibal' ? 'زیبال' : 'sms.ir');

/** «رد شد» کد پذیرنده با کد زیبال (برش ۷٫۲، طرح `m-key-rejected`): ۱۱۵ یعنی IP سرور، نه خود کد پذیرنده. */
function zibalRejected(code: number | null): Seg[] {
  if (code === 115) return ['زیبال IP سرور را نپذیرفت (کد ', num(115), ')'];
  return ['زیبال نپذیرفت', ...(code === null ? [] : [' (کد ', num(code), ')'])];
}

/**
 * خط «آخرین آزمایش» یک کلید (طرح `ad-keys__test`، سؤال ۱۳۸): آخرین «آزمایش» مقدار امروز، یا گذاشتن همین مقدار با آزمایش پیش از
 * ذخیره. بی خط وقتی مقدار امروز آزموده نشده: پیش از ۷٫۱، یا پس از «برگرداندن به .env». فقط نتیجه و عدد پاسخ، هرگز مقدار؛ موبایل
 * پیامک آزمایشی همان پوشیدهٔ رویداد. کد پذیرنده از ۷٫۲ با زیبال.
 */
export function keyCheckView(name: ServiceKeyName, check: KeyCheck | null, now: Date): KeyCheckView | null {
  if (!check) return null;
  const when = whenText(check.at, now);
  const detail = check.detail;
  const credit: Seg[] = typeof detail.credit === 'number' ? ['، اعتبار ', num(detail.credit)] : [];
  const template = KEY_INFO[name].kind === 'template';
  const zibal = KEY_INFO[name].service === 'zibal';
  const service = serviceName(name);
  if (check.action === 'settings.key_test') {
    const code = typeof detail.status === 'number' ? detail.status : typeof detail.http === 'number' ? detail.http : null;
    switch (detail.outcome) {
      case 'ok':
        return template
          ? { tone: 'ok', text: [`درست · پیامک آزمایشی ${when} به `, { num: typeof detail.mobile === 'string' ? detail.mobile : '•••' }, ' رفت.'] }
          : { tone: 'ok', text: [`درست · آزمایش ${when}: ${service} پذیرفت`, ...credit, '.'] };
      case 'rejected':
        return zibal
          ? { tone: 'bad', text: [`رد شد · آزمایش ${when}: `, ...zibalRejected(code), '.'] }
          : { tone: 'bad', text: [`رد شد · آزمایش ${when}: sms.ir نپذیرفت`, ...(code === null ? [] : [' (کد ', num(code), ')']), '.'] };
      case 'unavailable':
        return { tone: 'warn', text: [`در دسترس نیست · آزمایش ${when}: ${service} جواب نداد.`] };
      case 'unconfigured':
        return zibal
          ? { tone: 'warn', text: [`آزموده نشد · ${when}: نشانی برگشت (`, { ltr: 'PAYMENT_CALLBACK_URL' }, ') در ', { ltr: '.env' }, ' نیست.'] }
          : { tone: 'warn', text: [`آزموده نشد · ${when}: کلید API sms.ir خالی است یا خوانده نشد.`] };
      default:
        return null;
    }
  }
  if (check.action === 'settings.key_set') {
    if (detail.tested === 'ok') {
      return { tone: 'ok', text: [`درست · پیش از ذخیرهٔ ${when} `, ...(template ? ['پیامک آزمایشی رفت.'] : [`${service} پذیرفت`, ...credit, '.'])] };
    }
    if (detail.tested === 'skipped') {
      return { tone: 'warn', text: [`آزموده نشد · ${when} بی آزمایش ذخیره شد، چون ${service} جواب نداد. با «آزمایش» بسنجش.`] };
    }
  }
  return null;
}

/** کارت «اعتبار پیامک» (سؤال ۱۳۷): کی و از کجا، عدد، «برای حدود N روز»، و یادداشت وقتی عددی نیست. */
export interface CreditCard {
  meta: string | null;
  amount: string | null;
  usage: Seg[] | null;
  note: { tone: 'info' | 'warning' | 'error'; text: Seg[] } | null;
}

/**
 * کارت «اعتبار پیامک» از `CreditView`. عدد همان عدد خود sms.ir است: واحدش در مستندی دیده نشد، پس «تومان» نمی‌خورد؛ «برای حدود N
 * روز» به واحد نیاز ندارد (اعتبار تقسیم بر هزینهٔ پیامک‌های sms.ir در هفت روز گذشته، هر دو به واحد خود sms.ir).
 */
export function creditCard(view: CreditView, now: Date): CreditCard {
  // امروز «ساعت 11:20» (طرح)، وگرنه روزش.
  const stamp = (at: Date) => (tehranDay(at) === tehranDay(now) ? `ساعت ${formatTehranTime(at)}` : whenText(at, now));
  switch (view.state) {
    case 'ok':
      return {
        meta: view.live ? `sms.ir، ${stamp(view.at)}` : `آخرین «آزمایش» کلید API، ${stamp(view.at)}`,
        amount: view.credit === null ? null : formatNumber(view.credit),
        usage:
          view.days !== null
            ? ['برای حدود ', num(view.days), ' روز با مصرف هفتهٔ گذشته (', num(view.week.count), ' پیامک).']
            : ['هفتهٔ گذشته پیامکی با sms.ir نرفت؛ روزهای باقی‌مانده با اولین پیامک‌ها حساب می‌شود.'],
        note: view.credit === null ? { tone: 'warning', text: ['sms.ir عدد اعتبار را نداد.'] } : null,
      };
    case 'rejected':
    case 'unavailable':
      return {
        meta: view.live ? `sms.ir، ${stamp(view.at)}` : `آخرین «آزمایش» کلید API، ${stamp(view.at)}`,
        amount: null,
        usage: null,
        note:
          view.state === 'rejected'
            ? {
                tone: 'error',
                text: ['sms.ir کلید API را نپذیرفت', ...(view.http === null ? [] : [' (کد ', num(view.http), ')']), '؛ کلید را پایین همین صفحه بیازما یا عوض کن.'],
              }
            : { tone: 'warning', text: ['sms.ir جواب نداد و اعتبار خوانده نشد؛ کمی بعد دوباره ببین.'] },
      };
    case 'unconfigured':
      return { meta: null, amount: null, usage: null, note: { tone: 'info', text: ['کلید API sms.ir خالی است یا خوانده نشد؛ با واردکردنش اعتبار دیده می‌شود.'] } };
    case 'untested':
      return {
        meta: null,
        amount: null,
        usage: null,
        note: { tone: 'info', text: ['پیامک‌ها هنوز کنسولی‌اند؛ اعتبار با «آزمایش» کلید API خوانده می‌شود، پایین همین صفحه.'] },
      };
  }
}

/** شمار کد کارت «سقف کد پیامکی»: «ساعت گذشته 18 کد · 24 ساعت گذشته 312 کد». */
export const otpUsageSegs = (usage: { hour: number; day: number }): Seg[] => [
  'ساعت گذشته ',
  num(usage.hour),
  ' کد · ',
  { num: '24' },
  ' ساعت گذشته ',
  num(usage.day),
  ' کد',
];

/** «13:05»، یا «فردا 09:40» اگر روز تهران دیگری است (پنجرهٔ ۲۴ ساعته). */
export const untilText = (until: Date, now: Date) => (tehranDay(until) === tehranDay(now) ? formatTehranTime(until) : `فردا ${formatTehranTime(until)}`);

/**
 * هشدار «سقف کد پیامکی» پیشخوان (طرح `m-dash-alerts`، سؤال ۱۴۰): پر است (هشدار، «تا حدود …»)، یا امروز پر شد و حالا دوباره کد
 * می‌رود (خبر). راه جلو برای مالک «تنظیمات» است؛ متصدی به مالک می‌گوید.
 */
export function otpCapAlert(cap: NonNullable<SmsAlertsView['otpCap']>, now: Date): { tone: 'warning' | 'info'; head: string; text: Seg[] } {
  const window: Seg[] = cap.kind === 'day' ? [' کد در ', { num: '24' }, ' ساعت گذشته'] : [' کد در ساعت گذشته'];
  const since: Seg[] = ['، از ', { num: formatTehranTime(cap.at) }];
  if (cap.until) {
    return {
      tone: 'warning',
      head: 'سقف کد پیامکی کل سایت پر شد:',
      text: [' ', num(cap.limit), ...window, ...since, '. تا حدود ', { num: untilText(cap.until, now) }, ' به هیچ شماره‌ای کد تازه نمی‌رود.'],
    };
  }
  const span: Seg[] = cap.kind === 'day' ? [' کد در ', { num: '24' }, ' ساعت'] : [' کد در یک ساعت'];
  return { tone: 'info', head: 'سقف کد پیامکی کل سایت امروز پر شد:', text: [' ', num(cap.limit), ...span, ...since, '؛ حالا دوباره کد می‌رود.'] };
}
