/** تاریخ شمسی و روز کاری (ADR-013)، به وقت تهران. */

import { toLatinDigits } from './normalize.js';

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

let tehranTime: Intl.DateTimeFormat | undefined;

/** ساعت و دقیقه به وقت تهران، ۲۴ ساعته با ارقام لاتین: `09:05`، `23:40` (پنل ادمین، برش ۴). */
export function formatTehranTime(date: Date): string {
  tehranTime ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = tehranTime.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** نام روزهای هفته، به ترتیب `getUTCDay` (۰ یکشنبه). */
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

/** «دوشنبه 6 مهر»: روز هفته و تاریخ شمسی بی سال، به وقت تهران. */
export function formatJalaliWeekday(date: Date): string {
  const weekday = new Date(tehranWall(date)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${formatJalali(date).replace(/ \d+$/, '')}`;
}

/* ───────────────────────── روز کاری ───────────────────────── */

const DAY_MS = 86_400_000;

/**
 * ساخته در اولین استفاده، مثل `formatNumber`: این پکیج در باندل اولیه است (نرمال‌سازی نام فایل) و
 * ساختن `Intl` در بار شدن ماژول کار رشتهٔ اصلی پیش از اولین قیمت می‌شد.
 */
let tehranClock: Intl.DateTimeFormat | undefined;

/**
 * ساعت دیواری تهران برای یک لحظه، به شکل عدد UTC: `Date.UTC` همان سال و ماه و روز و ساعتی که در
 * تهران خوانده می‌شود. روی این عدد حساب روز ساده است (هر روز ۸۶٬۴۰۰٬۰۰۰)، و `getUTCDay`ش روز هفتهٔ
 * تهران است، هر منطقهٔ زمانی‌ای که سرور داشته باشد.
 */
function tehranWall(instant: Date): number {
  tehranClock ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts: Record<string, number> = {};
  for (const part of tehranClock.formatToParts(instant)) parts[part.type] = Number(part.value);
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

/** برعکس `tehranWall`: لحظه‌ای که ساعت تهران این را نشان می‌دهد. */
function fromTehranWall(wall: number): Date {
  const guess = new Date(wall - 3.5 * 3_600_000);
  return new Date(wall - (tehranWall(guess) - guess.getTime()));
}

/**
 * روز کاری چاپخانه و پست: شنبه تا چهارشنبه. پنجشنبه، جمعه و تعطیلی رسمی نه (تصمیم ۱۴۰۵/۰۷/۰۴).
 * `holidays` تاریخ‌های شمسی به شکل `formatJalaliNumeric` است (`1405/10/02`)، از `calendar.holidays`
 * در `settings`.
 */
export function isWorkingDay(date: Date, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(tehranWall(date)).getUTCDay();
  if (weekday === 4 || weekday === 5) return false;
  return !holidays.has(formatJalaliNumeric(date));
}

/**
 * مهلت تحویل به پست (ADR-013): پایان `workingDays`اُمین روز کاری **بعد از** روز پرداخت، به وقت
 * تهران. روز پرداخت شمرده نمی‌شود، هر ساعتی که باشد: پرداخت شنبه با ۲ روز یعنی تا پایان دوشنبه.
 *
 * خروجی پایان انحصاری روز است، یعنی نیمه‌شبِ آغاز روز بعد، تا مقایسهٔ «هنوز وقت هست؟» ساده باشد
 * (`now < due`). برای نوشتن روزش `formatDeadlineDay`.
 */
export function postHandoffDue(paidAt: Date, workingDays: number, holidays: ReadonlySet<string>): Date {
  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new RangeError(`روز کاری باید عدد صحیح مثبت باشد، نه ${workingDays}`);
  }
  let day = Math.floor(tehranWall(paidAt) / DAY_MS) * DAY_MS;
  let counted = 0;
  // هیچ سالی بیش از چند روز تعطیل پشت‌سرهم ندارد؛ سقف فقط جلوی حلقهٔ بی‌پایان فهرست خراب را می‌گیرد.
  for (let guard = 0; counted < workingDays; guard += 1) {
    if (guard > 366) throw new RangeError('در یک سال روز کاری کافی پیدا نشد؛ فهرست تعطیلی‌ها را ببینید.');
    day += DAY_MS;
    if (isWorkingDay(fromTehranWall(day + DAY_MS / 2), holidays)) counted += 1;
  }
  return fromTehranWall(day + DAY_MS);
}

/**
 * آغاز روز تهران (نیمه‌شب) برای یک لحظه، یا `days` روز بعدش: `tehranDayStart(now, 1)` آغاز فرداست. مهلت تحویل
 * به پست پایان انحصاری روز است، پس مهلتِ «تا پایان امروز» همان آغاز فرداست (پیشخوان پنل، برش ۴٫۲).
 */
export function tehranDayStart(date: Date, days = 0): Date {
  return fromTehranWall((Math.floor(tehranWall(date) / DAY_MS) + days) * DAY_MS);
}

/** روزی که یک مهلت انحصاری (مثل `postHandoffDue`) در آن تمام می‌شود: «دوشنبه 6 مهر». */
export function formatDeadlineDay(deadline: Date): string {
  return formatJalaliWeekday(new Date(deadline.getTime() - 1));
}

/**
 * نیمه‌شب نوروز ۱۴۰۵ به وقت تهران: ۲۰:۳۰ UTC روز ۲۰ مارس ۲۰۲۶ (`jalaliYear`). عدد، نه `Date.UTC(…)`: این ماژول در
 * باندل اولیهٔ سایت است و فراخوانی سطح ماژول با tree-shaking نمی‌افتد.
 */
const NOWRUZ_1405 = 1_774_038_600_000;

/**
 * تاریخ شمسی عددی، مثل ستون «تاریخ ثبت» فایل پست (`1405/06/22`)، به آغاز همان روز تهران؛ `null` اگر چنین روزی
 * نیست (ماه ۱۳، ۳۱ مهر، ۳۰ اسفند سال غیرکبیسه) یا شکلش این نیست (برش ۶). برعکس `formatJalaliNumeric` و با همان
 * تقویم `Intl`: تخمین از نوروز ۱۴۰۵، بعد سنجیدن چند روز دوروبرش؛ پس کتابخانهٔ تبدیل تقویم لازم نیست.
 */
export function parseJalaliNumeric(text: string): Date | null {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(toLatinDigits(text).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > (month <= 6 ? 31 : 30)) return null;
  const want = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  const dayOfYear = month <= 6 ? (month - 1) * 31 + day - 1 : 186 + (month - 7) * 30 + day - 1;
  const guess = NOWRUZ_1405 + (Math.round((year - 1405) * 365.2422) + dayOfYear) * DAY_MS;
  // میانگین سال شمسی ۳۶۵٫۲۴۲۲ روز است و سال واقعی ۳۶۵ یا ۳۶۶؛ فاصلهٔ تخمین تا روز درست از یکی دو روز بیشتر نمی‌شود.
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const start = tehranDayStart(new Date(guess + offset * DAY_MS + DAY_MS / 2));
    if (formatJalaliNumeric(start) === want) return start;
  }
  return null;
}
