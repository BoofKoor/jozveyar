/**
 * گزارش حاشیهٔ ارسال به زبان پنل (برش ۶٫۴، ADR-048؛ طرح پنل `m-ship-report`): ماه شمسی، جمع‌ها، بازه‌های وزن، گرد کردن، و متن
 * کاشی‌ها، جدول‌ها و فرم بازه‌ها. خالص، بی پایگاه داده و بی JSX، تا تست بی مرورگر بسنجدش؛ صفحه فقط می‌چیندش.
 *
 * - **ماه** = ماه شمسی روز «تحویل پست شد» به وقت تهران (ADR-048): مرزها آغاز روز تهران از تقویم `Intl` (`parseJalaliNumeric`)،
 *   همان که روز کاری و فایل پست با آن روز را می‌شناسند؛ ذخیره‌گاه فقط `>= from AND < to` می‌زند.
 * - **پول** (تصمیم ۱۰۴): جمع‌ها `bigint` ریال، بی گذر از عدد اعشاری؛ نمایش تومان گردشده (نیم از صفر دور، تا زیان و سود هم‌اندازه
 *   گرد شوند) و درصد با یک رقم اعشار، هر دو از همان ریال‌ها. جمعِ گردشده ممکن است با جمعِ تکه‌های گردشده یک تومان فرق کند.
 * - **سفارش چندبسته‌ای** (تصمیم ۱۰۰): یک سفارش، با جمع بسته‌های زنده‌اش در برابر کرایهٔ منجمد خودش.
 * - **ردیف بی سفارش** (تصمیم ۱۰۲): منطقه و چاپخانه‌ای که در ماه سفارشی ندارد پنهان است؛ بازه‌های وزن همه می‌مانند، چون تقسیم
 *   وزن‌اند و مالک خودش انتخابشان کرده: بازهٔ خالی خودش خبر است.
 * - **بازه‌ها** (تصمیم ۱۰۱): هر بازه از مرز پایینش تا پیش از مرز بعد، مثل بازه‌های کرایهٔ تعرفه (`quote()`)؛ سنجش فرم هر فیلد جدا،
 *   با پیامش زیر همان فیلد (تصمیم ۱۱۰).
 */

import { REPORT_BOUND_MAX_GRAMS, REPORT_BOUNDS_MAX } from '@jozveyar/contracts';
import type { ShippingReportOrder } from '@jozveyar/db';
import { formatJalali, formatJalaliNumeric, formatNumber, parseJalaliNumeric } from '@jozveyar/text';

import type { Seg } from './orders';
import { parseWholeNumber } from './settings';

/* ───────────────────────── ماه شمسی ───────────────────────── */

export interface JalaliMonth {
  year: number;
  month: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ماه شمسی یک لحظه، به وقت تهران. */
export function monthOf(at: Date): JalaliMonth {
  const [year, month] = formatJalaliNumeric(at).split('/').map(Number);
  return { year: year!, month: month! };
}

/** آغاز ماه (نیمه‌شب روز اولش به وقت تهران). */
export function monthStart({ year, month }: JalaliMonth): Date {
  const start = parseJalaliNumeric(`${year}/${pad(month)}/01`);
  if (!start) throw new RangeError(`ماه ${year}/${month} در تقویم نیست`);
  return start;
}

export const nextMonth = ({ year, month }: JalaliMonth): JalaliMonth => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });

/** بازهٔ ماه برای ذخیره‌گاه: از آغاز ماه تا پیش از آغاز ماه بعد. */
export const monthRange = (month: JalaliMonth) => ({ from: monthStart(month), to: monthStart(nextMonth(month)) });

export const sameMonth = (a: JalaliMonth, b: JalaliMonth) => a.year === b.year && a.month === b.month;

const ordinal = ({ year, month }: JalaliMonth) => year * 12 + month - 1;

/** ماه‌های شمسی از ماه `first` تا ماه `last`، هر دو شامل، قدیمی‌ترین اول. */
export function monthsBetween(first: Date, last: Date): JalaliMonth[] {
  const end = ordinal(monthOf(last));
  const months: JalaliMonth[] = [];
  // سقف فقط جلوی حلقهٔ بی‌پایان دادهٔ خراب را می‌گیرد: صد سال.
  for (let month = monthOf(first); ordinal(month) <= end && months.length < 1200; month = nextMonth(month)) months.push(month);
  return months;
}

/** ماه در نشانی: `1405-07`. */
export const monthKey = ({ year, month }: JalaliMonth) => `${year}-${pad(month)}`;

/** `?month=1405-07` به ماه؛ هر شکل دیگری، یا ماهی بیرون از تقویم، null. */
export function parseMonthKey(value: unknown): JalaliMonth | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const month = { year: Number(match[1]), month: Number(match[2]) };
  if (month.year < 1300 || month.year > 1600 || month.month < 1 || month.month > 12) return null;
  return month;
}

/** «مهر 1405»، و ماه جاری «مهر 1405، تا امروز» (تصمیم ۹۹). */
export function monthLabel(month: JalaliMonth, current: boolean): Seg[] {
  const name = formatJalali(new Date(monthStart(month).getTime() + 43_200_000)).replace(/^\d+ /, '').replace(/ \d+$/, '');
  return [`${name} `, { num: String(month.year) }, ...(current ? ['، تا امروز'] : [])];
}

/* ───────────────────────── پول و عدد ───────────────────────── */

/** تقسیم گردشده، نیم از صفر دور؛ `divisor` مثبت. */
export function roundDiv(value: bigint, divisor: bigint): bigint {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const rounded = (magnitude * 2n + divisor) / (divisor * 2n);
  return negative ? -rounded : rounded;
}

/** جداکنندهٔ هزارگان برای عدد نامنفی: `3,552,072`. */
export function groupDigits(value: bigint): string {
  return (value < 0n ? -value : value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** ریال به تومان گردشده. */
export const tomansOf = (rials: bigint) => roundDiv(rials, 10n);

/** مبلغ نامنفی به تومان: `3,552,072`. */
export const tomansText = (rials: bigint) => groupDigits(tomansOf(rials));

const MINUS = '−';

/** حاشیه با نشانه، مثل طرح: `−322,616`، `+24,741`؛ صفرِ گردشده بی نشانه. */
export function signedTomans(rials: bigint): string {
  const tomans = tomansOf(rials);
  if (tomans === 0n) return '0';
  return `${tomans < 0n ? MINUS : '+'}${groupDigits(tomans)}`;
}

/** درصد `part` از `whole` با یک رقم اعشار و نشانه (`−9.1٪`، `+4.1٪`، `0.0٪`)؛ null وقتی کرایهٔ مشتری صفر است. */
export function percentText(part: bigint, whole: bigint): string | null {
  if (whole <= 0n) return null;
  const tenths = roundDiv(part * 1000n, whole);
  const magnitude = tenths < 0n ? -tenths : tenths;
  const sign = tenths < 0n ? MINUS : tenths > 0n ? '+' : '';
  return `${sign}${magnitude / 10n}.${magnitude % 10n}٪`;
}

/** میانگین گرم، گرد: `1,402`. */
export const averageGrams = (sum: bigint, count: number) => (count > 0 ? groupDigits(roundDiv(sum, BigInt(count))) : null);

/** واقعی ÷ برآورد با دو رقم اعشار (`1.11`)؛ null بی برآورد. */
export function ratioText(actual: bigint, estimate: bigint): string | null {
  if (estimate <= 0n) return null;
  const hundredths = roundDiv(actual * 100n, estimate);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

/* ───────────────────────── جمع‌ها ───────────────────────── */

export interface ReportSums {
  /** سفارش‌های با کد رهگیری. */
  orders: number;
  /** مرسوله‌های زندهٔ همان‌ها. */
  parcels: number;
  /** کرایهٔ منجمد مشتری. */
  paidRials: bigint;
  /** کرایه و مالیاتی که پست گرفت. */
  fareRials: bigint;
  taxRials: bigint;
}

export const tookRials = (sums: ReportSums) => sums.fareRials + sums.taxRials;
/** حاشیه: کرایهٔ مشتری منهای کرایه و مالیات پست؛ منفی یعنی پست بیشتر گرفت. */
export const marginRials = (sums: ReportSums) => sums.paidRials - tookRials(sums);

export interface ReportGroup extends ReportSums {
  /** شناسهٔ منطقه یا چاپخانه؛ `none` برای «بی چاپخانه». */
  key: string;
  label: string;
}

export interface Band {
  min: number;
  /** null یعنی بی سقف. */
  max: number | null;
}

export interface WeightRow {
  band: Band;
  orders: number;
  estimateGrams: bigint;
  actualGrams: bigint;
}

export interface ShippingReport {
  total: ReportSums;
  zones: ReportGroup[];
  partners: ReportGroup[];
  weights: WeightRow[];
  /** «تحویل پست شد»های ماه بی کد رهگیری زنده؛ در هیچ جمعی نیستند. */
  untracked: number;
}

const emptySums = (): ReportSums => ({ orders: 0, parcels: 0, paidRials: 0n, fareRials: 0n, taxRials: 0n });

function add(sums: ReportSums, row: ShippingReportOrder) {
  sums.orders += 1;
  sums.parcels += row.parcels;
  sums.paidRials += row.shippingRials;
  sums.fareRials += row.fareRials;
  sums.taxRials += row.taxRials;
}

/** نام «بی چاپخانه» (سفارش پیش از ۵٫۲، یا بی چاپخانهٔ فعال هنگام پرداخت). */
export const NO_PARTNER = 'بی چاپخانه';

/** بازه‌های وزن از مرزها: `[1000, 3000]` یعنی زیر 1000، 1000 تا پیش از 3000، و از 3000 بی سقف. */
export function bandsOf(bounds: readonly number[]): Band[] {
  return [0, ...bounds].map((min, i) => ({ min, max: bounds[i] ?? null }));
}

/** بازهٔ یک وزن: شمار مرزهایی که از آن بیشتر نیستند؛ وزنِ برابر مرز مال بازهٔ بالاتر است، مثل کرایهٔ تعرفه. */
export const bandIndex = (bounds: readonly number[], grams: number) => bounds.filter((bound) => bound <= grams).length;

/**
 * جمع‌های ماه (تصمیم‌های ۱۰۰ و ۱۰۲): کل، به تفکیک منطقه (به ترتیب `zoneOrder`) و چاپخانه (بیشترین سفارش اول، «بی چاپخانه» آخر)،
 * و وزن واقعی در برابر برآورد در هر بازهٔ برآورد. سفارش بی کد رهگیری فقط شمرده می‌شود (`untracked`).
 */
export function aggregateReport(rows: readonly ShippingReportOrder[], bounds: readonly number[], zoneOrder: readonly string[]): ShippingReport {
  const total = emptySums();
  const zones = new Map<string, ReportGroup>();
  const partners = new Map<string, ReportGroup>();
  const weights: WeightRow[] = bandsOf(bounds).map((band) => ({ band, orders: 0, estimateGrams: 0n, actualGrams: 0n }));
  let untracked = 0;
  for (const row of rows) {
    if (row.parcels === 0) {
      untracked += 1;
      continue;
    }
    add(total, row);
    const zone = zones.get(row.zoneId) ?? { key: row.zoneId, label: row.zoneName, ...emptySums() };
    add(zone, row);
    zones.set(zone.key, zone);
    const partnerKey = row.partner?.id ?? 'none';
    const partner =
      partners.get(partnerKey) ??
      ({ key: partnerKey, label: row.partner ? `${row.partner.name} · ${row.partner.cityName}` : NO_PARTNER, ...emptySums() } satisfies ReportGroup);
    add(partner, row);
    partners.set(partnerKey, partner);
    const weight = weights[bandIndex(bounds, row.estWeightGrams)]!;
    weight.orders += 1;
    weight.estimateGrams += BigInt(row.estWeightGrams);
    weight.actualGrams += BigInt(row.weightGrams);
  }
  const zoneRank = (key: string) => {
    const index = zoneOrder.indexOf(key);
    return index === -1 ? zoneOrder.length : index;
  };
  return {
    total,
    zones: [...zones.values()].sort((a, b) => zoneRank(a.key) - zoneRank(b.key) || a.label.localeCompare(b.label, 'fa')),
    partners: [...partners.values()].sort(
      (a, b) =>
        Number(a.key === 'none') - Number(b.key === 'none') || b.orders - a.orders || a.label.localeCompare(b.label, 'fa'),
    ),
    weights,
    untracked,
  };
}

/* ───────────────────────── بازه‌های وزن: متن و فرم ───────────────────────── */

/** مرزها همه کیلوی درست‌اند؟ آن‌وقت برچسب‌ها کیلو، وگرنه همه گرم، تا یک جدول یک واحد داشته باشد. */
export const inKilos = (bounds: readonly number[]) => bounds.every((grams) => grams % 1000 === 0);

/** «زیر 1 کیلو»، «1 تا 3 کیلو»، «بالای 3 کیلو» (طرح)؛ یا با گرم: «750 تا 1,500 گرم». */
export function bandLabel(band: Band, kilos: boolean): Seg[] {
  const amount = (grams: number): Seg => ({ num: kilos ? String(grams / 1000) : formatNumber(grams) });
  const unit = kilos ? ' کیلو' : ' گرم';
  if (band.min === 0 && band.max === null) return ['همهٔ وزن‌ها'];
  if (band.min === 0) return ['زیر ', amount(band.max!), unit];
  if (band.max === null) return ['بالای ', amount(band.min), unit];
  return [amount(band.min), ' تا ', amount(band.max), unit];
}

/** مرزها در یک جمله: «1 و 3 کیلو»، «750، 1,500 و 3,000 گرم»؛ بی مرز «یک بازه برای همهٔ وزن‌ها». */
export function boundsText(bounds: readonly number[]): Seg[] {
  if (bounds.length === 0) return ['یک بازه برای همهٔ وزن‌ها'];
  const kilos = inKilos(bounds);
  const parts: Seg[] = [];
  bounds.forEach((grams, i) => {
    if (i > 0) parts.push(i === bounds.length - 1 ? ' و ' : '، ');
    parts.push({ num: kilos ? String(grams / 1000) : formatNumber(grams) });
  });
  return [...parts, kilos ? ' کیلو' : ' گرم'];
}

/** خطای یک فیلد فرم بازه‌ها. */
export type BoundError =
  | { code: 'number' }
  | { code: 'positive' }
  | { code: 'too_big' }
  /** از مرز پیش از خودش بیشتر نیست. */
  | { code: 'order'; after: number }
  /** هیچ مرزی نیامد (زیر فیلد اول). */
  | { code: 'empty' };

/** فیلدهای فرم: مرزهای امروز و دو فیلد خالی برای افزودن، تا `REPORT_BOUNDS_MAX` (تصمیم ۱۱۰). */
export const boundFieldCount = (bounds: readonly number[]) => Math.min(REPORT_BOUNDS_MAX, Math.max(bounds.length + 2, 3));

/**
 * فرم «بازه‌ها را عوض کن» (تصمیم‌های ۱۰۱ و ۱۱۰): هر فیلد یک مرز به گرم، ارقام فارسی یا لاتین و جداکنندهٔ هزارگان هم؛ فیلد خالی
 * یعنی نیست (حذف). مرزها مثبت، تا `REPORT_BOUND_MAX_GRAMS`، و هر کدام بیشتر از مرز پیش از خودش؛ خطا کنار همان فیلد، و بی
 * هیچ مرز زیر فیلد اول. فقط `REPORT_BOUNDS_MAX` فیلد اول خوانده می‌شود.
 */
export function readBoundsInput(values: readonly unknown[]): { bounds: number[] } | { errors: (BoundError | null)[] } {
  const fields = values.slice(0, REPORT_BOUNDS_MAX);
  const errors: (BoundError | null)[] = fields.map(() => null);
  const bounds: number[] = [];
  fields.forEach((raw, i) => {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') return;
    const grams = parseWholeNumber(text);
    if (grams === null) errors[i] = { code: 'number' };
    else if (grams < 1) errors[i] = { code: 'positive' };
    else if (grams > REPORT_BOUND_MAX_GRAMS) errors[i] = { code: 'too_big' };
    else if (bounds.length > 0 && grams <= bounds.at(-1)!) errors[i] = { code: 'order', after: bounds.at(-1)! };
    else bounds.push(grams);
  });
  if (bounds.length === 0 && !errors.some((error) => error !== null)) errors[0] = { code: 'empty' };
  return errors.some((error) => error !== null) ? { errors } : { bounds };
}

/** پیام هر خطای فیلد. */
export function boundErrorText(error: BoundError): string {
  switch (error.code) {
    case 'number':
      return 'عدد درست گرم بنویس، مثلاً 1500.';
    case 'positive':
      return 'مرز باید بیشتر از صفر گرم باشد.';
    case 'too_big':
      return `مرز تا ${formatNumber(REPORT_BOUND_MAX_GRAMS)} گرم.`;
    case 'order':
      return `باید از ${formatNumber(error.after)} گرم بیشتر باشد؛ مرزها از کم به زیاد.`;
    case 'empty':
      return 'دست‌کم یک مرز بنویس.';
  }
}
