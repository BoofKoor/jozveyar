/**
 * «سفارش‌های من» و پیام به پشتیبانی (برش ۱۲٫۱، ADR-068؛ طرح `docs/ui/mockups/account.html`، سؤال‌های ۳۰۵ تا ۳۱۶): شکل نمای فهرست سفارش‌ها،
 * گفت‌وگو و «پیام تازه» برای صفحه‌های سرور، و متن زمان‌ها و `next` ورود. خالص و بی وابستگی سرور، تا تست بی ساعت واقعی بسنجدش و فرم‌های
 * کلاینت type را از همین بگیرند.
 */

import type { OrderStatus } from '@jozveyar/contracts/checkout';
import { formatJalali, formatJalaliNumeric, formatJalaliWeekday, formatTehranTime, jalaliYear } from '@jozveyar/text';

/** نشانی «سفارش‌های من»، همان که پیامک پاسخ می‌گوید (`jozveyar.com/orders`). */
export const ACCOUNT_PATH = '/orders';
/** سفارش در هر صفحهٔ فهرست (سؤال ۳۰۷). */
export const ORDERS_PAGE_SIZE = 20;
/** سفارش‌های «دربارهٔ کدام سفارش؟» پیام تازه (سؤال ۳۰۹). */
export const RECENT_ORDERS = 3;
/** سقف متن پیام مشتری (سؤال ۳۱۰)، همان `SUPPORT_CUSTOMER_MAX` پایگاه داده؛ تست سرور برابری‌شان را می‌سنجد. */
export const MESSAGE_MAX = 1000;

/** کار بعدی هر کارت فهرست (سؤال ۳۰۷). */
export type AccountNext =
  | { kind: 'pay' }
  | { kind: 'checking' }
  /** در صف چاپ یا در حال چاپ، با روز تحویل به پست (`dueText`). */
  | { kind: 'paid' | 'printing'; due: string | null }
  /** «تحویل پست شد» با روزش، و کد هر بستهٔ زنده با پیوند سایت پست. */
  | { kind: 'handed'; day: string; parcels: { barcode: string; trackingUrl: string }[] }
  | { kind: 'refunded'; amountRials: number; day: string }
  | { kind: 'refunding'; amountRials: number }
  | { kind: 'cancelled' };

export interface AccountOrderCard {
  number: number;
  token: string;
  status: OrderStatus;
  /** روز پرداخت، یا ساختن برای پرداخت‌نشده: «امروز 11:02»، «شنبه 11 مهر». */
  day: string;
  fileCount: number;
  pageCount: number;
  totalRials: number;
  next: AccountNext;
}

export type ThreadStatus = 'open' | 'answered' | 'closed';

export interface AccountThreadLine {
  id: number;
  orderNumber: number | null;
  status: ThreadStatus;
  /** پاسخی که مشتری هنوز ندیده: «پاسخ تازه». */
  fresh: boolean;
  /** آخرین پیام: «تو» یا «پشتیبانی»، زمانش و تکه‌ای از متن. */
  last: { staff: boolean; when: string; body: string } | null;
}

export interface AccountOrdersView {
  mobile: string;
  orders: AccountOrderCard[];
  page: number;
  pages: number;
  threads: AccountThreadLine[];
  /** «پشتیبانی به پیامت … پاسخ داد» بالای فهرست: تازه‌ترین گفت‌وگو با پاسخ ندیده. */
  fresh: { threadId: number; orderNumber: number | null } | null;
}

export interface AccountMessage {
  id: number;
  kind: 'customer' | 'staff' | 'closed';
  body: string | null;
  when: string;
  /** پاسخی که پیش از همین بار دیدن رسیده بود و مشتری هنوز ندیده بود: «تازه». */
  fresh: boolean;
}

export interface AccountThreadView {
  id: number;
  orderNumber: number | null;
  /** پیوند «دیدن سفارش …» با وضعیتش؛ «سؤال کلی» هیچ. */
  order: { number: number; token: string; status: OrderStatus } | null;
  status: ThreadStatus;
  messages: AccountMessage[];
  mobile: string;
  /** ساعت پاسخ‌گویی همان «تماس»، برای «پیامت رسید»؛ null یعنی مالک نگذاشته. */
  hours: string | null;
}

/** یک گزینهٔ «دربارهٔ کدام سفارش؟». */
export interface MessageChoice {
  /** شمارهٔ سفارش، یا `general`. */
  value: string;
  orderNumber: number | null;
  /** «پرداخت شد · شنبه 11 مهر»، «دربارهٔ هیچ سفارشی نیست». */
  note: string;
}

export interface NewMessageView {
  mobile: string;
  choices: MessageChoice[];
  selected: string;
  /** ساعت پاسخ‌گویی همان «تماس»؛ null یعنی مالک نگذاشته. */
  hours: string | null;
  /** سفارشی که از صفحه‌اش آمد، برای «برگشت». */
  from: { number: number; token: string } | null;
}

/** برچسب وضعیت هر سفارش، همان صفحهٔ سفارش. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'در انتظار پرداخت',
  paid: 'پرداخت شد',
  printing: 'در حال چاپ',
  handed_to_post: 'تحویل پست شد',
  cancelled: 'لغو شد',
  expired: 'منقضی',
};

const DAY_MS = 86_400_000;
const tehranDay = (at: Date) => formatJalaliNumeric(at);
const sameDay = (a: Date, b: Date) => tehranDay(a) === tehranDay(b);
const yesterdayOf = (now: Date) => new Date(now.getTime() - DAY_MS);
const tomorrowOf = (now: Date) => new Date(now.getTime() + DAY_MS);
/** روز بی سال، و از سال دیگر با سال. */
const dateOf = (at: Date, now: Date) => (jalaliYear(at) === jalaliYear(now) ? formatJalaliWeekday(at) : formatJalali(at));

/**
 * روز کارت فهرست و آخرین پیام هر گفت‌وگو: «امروز 11:02»، «دیروز 23:40»، «شنبه 11 مهر»، و از سال دیگر «28 اسفند 1404».
 */
export function cardDay(at: Date, now: Date): string {
  if (sameDay(at, now)) return `امروز ${formatTehranTime(at)}`;
  if (sameDay(at, yesterdayOf(now))) return `دیروز ${formatTehranTime(at)}`;
  return dateOf(at, now);
}

/** زمان پیام: «امروز، 10:42»، «دیروز، 23:40»، «یکشنبه 12 مهر، 21:14»، و از سال دیگر «28 اسفند 1404، 09:00». */
export function messageWhen(at: Date, now: Date): string {
  const time = formatTehranTime(at);
  if (sameDay(at, now)) return `امروز، ${time}`;
  if (sameDay(at, yesterdayOf(now))) return `دیروز، ${time}`;
  return `${dateOf(at, now)}، ${time}`;
}

/** نام روز یک لحظه، بی ساعت: «امروز»، «دیروز»، «شنبه 4 مهر»، و از سال دیگر «28 اسفند 1404». */
export function dayName(at: Date, now: Date): string {
  if (sameDay(at, now)) return 'امروز';
  if (sameDay(at, yesterdayOf(now))) return 'دیروز';
  return dateOf(at, now);
}

/** روزی که مهلت انحصاری تحویل به پست در آن تمام می‌شود، نسبت به امروز: «امروز، دوشنبه 13 مهر»، «فردا، …»، «سه‌شنبه 14 مهر». */
export function dueText(due: Date, now: Date): string {
  const day = new Date(due.getTime() - 1);
  if (sameDay(day, now)) return `امروز، ${formatJalaliWeekday(day)}`;
  if (sameDay(day, tomorrowOf(now))) return `فردا، ${formatJalaliWeekday(day)}`;
  return dateOf(day, now);
}

/** تکه‌ای از متن پیام برای فهرست: یک خط، تا این‌قدر نویسه. */
export function snippet(body: string, max = 90): string {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max).trimEnd()}…`;
}

const SAFE_NEXT = [/^\/order\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, /^\/orders(\/messages\/(new(\?order=\d{1,9})?|\d{1,15}))?$/];

/**
 * مقصد پس از ورود (سؤال ۳۰۸): فقط صفحهٔ سفارش و صفحه‌های «سفارش‌های من» همین سایت، به همان شکلی که سایت می‌سازد؛ هر چیز دیگر (نشانی
 * بیرونی، `//` یا `/\`، پارامتر دیگر) null، یعنی همان فهرست.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  return SAFE_NEXT.some((pattern) => pattern.test(value)) ? value : null;
}
