/** نمایش عدد، پول، وزن، حجم و فهرست صفحه‌ها با ارقام لاتین («147 صفحه»، «245,000 تومان»). */

/* ───────────────────────── نمایش عدد ───────────────────────── */

/** ریال به تومان. تعرفه و نمایش تومان است، ذخیره‌سازی ریال. */
export function rialsToTomans(rials: number): number {
  return rials / 10;
}

/** تومان به ریال — فقط در لایهٔ ورودی ادمین استفاده می‌شود. */
export function tomansToRials(tomans: number): number {
  return Math.round(tomans * 10);
}

/**
 * یک قالب‌ساز برای همه، ساخته در اولین استفاده. ساختن `Intl.NumberFormat` گران است و فلوی سفارش
 * با هر پیام کارگر تحلیل ده‌ها عدد را دوباره می‌نویسد: قالب‌ساز تازه برای هر عدد، در بازهٔ انداختن فایل
 * تا اولین قیمت ده‌ها میلی‌ثانیه (با پردازندهٔ ۴× کند) کار رشتهٔ اصلی بود (docs/UI.md، ۴ب).
 */
let numberFormat: Intl.NumberFormat | undefined;

/** جداکنندهٔ هزارگان با ارقام لاتین: `245,000`. */
export function formatNumber(value: number): string {
  numberFormat ??= new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  return numberFormat.format(value);
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

/**
 * کارت پوشیده‌ای که درگاه گفت («603799******1234»، برش ۷٫۲) در چهار گروه چهارتایی با «•»، مثل طرح: «6037 99•• •••• 1234»؛ هر طول
 * دیگر فقط با «•». سایت و پنل هر دو همین.
 */
export function formatCardMask(mask: string): string {
  const chars = mask.replace(/[\s-]/g, '').replace(/[*xX]/g, '•');
  return chars.length === 16 ? chars.match(/.{4}/g)!.join(' ') : chars;
}

/** جمع فارسی بدون «ها»ی اضافه: `147 صفحه`. فارسی شکل جمع عددی ندارد. */
export function pluralFa(count: number, noun: string): string {
  return `${formatNumber(count)} ${noun}`;
}

/** بخش‌های فهرست شمارهٔ صفحه‌ها، همان که `formatPages` می‌نویسد. */
export interface PageListParts {
  /** یک صفحه («صفحهٔ 2»)، نه چند («صفحه‌های …»). */
  single: boolean;
  /** بخش‌های نام‌برده، به ترتیب: `[از، تا]`؛ صفحهٔ تنها `[n, n]`. */
  runs: [number, number][];
  /** صفحه‌هایی که نام برده نشدند: «و N صفحهٔ دیگر». */
  rest: number;
}

/**
 * بخش‌های فهرست شمارهٔ صفحه‌ها (`formatPages`)، برای جایی که هر عدد جدا نشان داده می‌شود (پنل، با `.num`؛ برش ۸٫۱):
 * بازه‌های پشت‌سرهم از سه صفحه یک بخش‌اند، و بیش از `maxItems` بخش در `rest` شمرده می‌شود. null یعنی صفحه‌ای نیست.
 */
export function pageListParts(pages: readonly number[], maxItems = 6): PageListParts | null {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const items: { run: [number, number]; count: number }[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1;
    const run = j - i + 1;
    if (run >= 3) {
      items.push({ run: [sorted[i]!, sorted[j]!], count: run });
    } else {
      for (let k = i; k <= j; k += 1) items.push({ run: [sorted[k]!, sorted[k]!], count: 1 });
    }
    i = j + 1;
  }
  return {
    single: sorted.length === 1,
    runs: items.slice(0, maxItems).map((item) => item.run),
    rest: items.slice(maxItems).reduce((sum, item) => sum + item.count, 0),
  };
}

/**
 * فهرست شمارهٔ صفحه‌ها برای هشدار: `صفحهٔ 2`، `صفحه‌های 3، 7 و 12`، و بازهٔ پشت‌سرهم
 * به‌صورت `صفحه‌های 1 تا 40 و 52`. بیش از `maxItems` بخش کوتاه می‌شود:
 * `… و 38 صفحهٔ دیگر` — کاربر باید جا را پیدا کند، نه فهرست را بخواند.
 */
export function formatPages(pages: readonly number[], maxItems = 6): string {
  const list = pageListParts(pages, maxItems);
  if (!list) return '';
  const parts = list.runs.map(([first, last]) =>
    first === last ? formatNumber(first) : `${formatNumber(first)} تا ${formatNumber(last)}`,
  );
  if (list.rest > 0) parts.push(`${formatNumber(list.rest)} صفحهٔ دیگر`);
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join('، ')} و ${parts.at(-1)!}`;
  return `${list.single ? 'صفحهٔ' : 'صفحه‌های'} ${joined}`;
}
