/**
 * سفارش‌ها به زبان پنل (طرح پنل، برش ۴٫۲ و ۴٫۳؛ ADR-039): کاشی‌های مهلت، ردیف فهرست، وضعیت و مهلت، کار بعدی و
 * گذار هر وضعیت، مشخصات و ریز قیمت منجمد، پرداخت‌ها، PDF جزوه و رویدادهای سفارش. خالص و بی JSX، مثل `events.ts`: تست
 * بی مرورگر و بی ساعت واقعی می‌سنجدش و صفحه فقط می‌چیندش.
 *
 * متن تکه‌تکه است (`Seg`): عدد در `.num` خودش و نام لاتین در `bdi`، تا ترتیب واژه‌ها در متن فارسی به‌هم نریزد
 * (قاعدهٔ «`.num` فقط روی خود عدد»). روزها به وقت تهران‌اند، و مهلت تحویل به پست پایان انحصاری روز است
 * (`postHandoffDue`): مهلتِ «تا پایان امروز» همان آغاز فرداست.
 */

import type { Breakdown, ItemBreakdown } from '@jozveyar/contracts';
import {
  FILE_MARGIN_MS,
  OPEN_STATUSES,
  PANEL_BUCKETS,
  PAYMENT_ATTEMPT_TTL_MS,
  isPaidStatus,
  pdfErrorCode,
  type OrderRow,
  type OrderStatus,
  type PanelBucket,
  type PanelDashboardStats,
  type PanelDueSummary,
  type PanelOrderDetails,
  type PanelOrderItem,
  type PanelOrderLine,
  type PanelPdfJob,
  type PanelSearch,
  type PanelSection,
  type PanelStatusEvent,
  type PaymentRow,
} from '@jozveyar/db';
import {
  formatDeadlineDay,
  formatJalaliWeekday,
  formatNumber,
  formatTehranTime,
  tehranDayStart,
  toLatinDigits,
} from '@jozveyar/text';
import { normalizeIranMobile, tidyInputFa } from '@jozveyar/text/input';

import { tehranDay } from './format';

/** تکهٔ متن: رشته، عدد (`.num`)، یا نام لاتین (`bdi`). */
export type Seg = string | { num: string } | { ltr: string };

const num = (value: number): Seg => ({ num: formatNumber(value) });

/** تکه‌ها با جداکننده؛ `[[a], [b]]` ← `a · b`. */
function joined(parts: Seg[][], separator = ' · '): Seg[] {
  return parts.flatMap((part, i) => (i === 0 ? part : [separator, ...part]));
}

/* ───────────────────────── فهرست: پارامترها و جست‌وجو ───────────────────────── */

export const BUCKET_LABELS: Record<PanelBucket, string> = {
  open: 'باز',
  handed: 'تحویل پست شد',
  cancelled: 'لغو شد',
  awaiting: 'در انتظار پرداخت',
  abandoned: 'رهاشده',
  all: 'همه',
};

/** چیپ نشانی؛ بی چیپ، «باز»، مگر جست‌وجو باشد که در همه می‌گردد. */
export function bucketOf(status: string | undefined, searching: boolean): PanelBucket {
  return (PANEL_BUCKETS as readonly string[]).includes(status ?? '') ? (status as PanelBucket) : searching ? 'all' : 'open';
}

/** شمارهٔ صفحهٔ فهرست؛ هر چیز دیگر یعنی صفحهٔ اول. */
export function pageOf(value: string | undefined): number {
  const page = /^\d{1,4}$/.test(value ?? '') ? Number(value) : 1;
  return page >= 1 ? page : 1;
}

/** شمارهٔ سفارش در نشانی (`/orders/10027`)؛ null اگر شکلش نیست. */
export function orderNumberOf(value: string): number | null {
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
}

/**
 * جست‌وجوی کادر «شمارهٔ سفارش، موبایل یا نام گیرنده»: ارقام فارسی و فاصله و خط تیره مهم نیستند. موبایل کامل
 * (هر شکلی که `normalizeIranMobile` بپذیرد) یعنی همان موبایل؛ عدد یعنی شمارهٔ سفارش یا، از ۴ رقم، ته موبایل؛ و
 * بقیه نام گیرنده، فارسی‌نرمال مثل خود نام (`tidyInputFa`).
 */
export function parseSearch(input: string | undefined): PanelSearch | null {
  const text = tidyInputFa(input ?? '').slice(0, 100);
  if (!text) return null;
  const mobile = normalizeIranMobile(text);
  if (mobile) return { kind: 'mobile', mobile };
  const digits = toLatinDigits(text).replace(/[\s-]/g, '');
  if (/^\d+$/.test(digits)) {
    return {
      kind: 'digits',
      orderNumber: digits.length <= 9 ? Number(digits) : null,
      phoneSuffix: digits.length >= 4 && digits.length <= 11 ? digits : null,
    };
  }
  return { kind: 'name', text };
}

/* ───────────────────────── مهلت تحویل به پست ───────────────────────── */

export type DueKind = 'overdue' | 'today' | 'tomorrow' | 'later';

/** «حالا» و آغاز فردا و پس‌فردا به وقت تهران. */
export interface DayBounds {
  at: Date;
  todayStart: Date;
  tomorrowStart: Date;
  dayAfterStart: Date;
}

export function dayBounds(at: Date): DayBounds {
  return { at, todayStart: tehranDayStart(at), tomorrowStart: tehranDayStart(at, 1), dayAfterStart: tehranDayStart(at, 2) };
}

/** همان مرزهای `dueSummary` پایگاه داده: مهلتی که خودِ «حالا» است، گذشته؛ مهلت امروز همان آغاز فرداست. */
export function dueKind(due: Date, bounds: DayBounds): DueKind {
  const t = due.getTime();
  if (t <= bounds.at.getTime()) return 'overdue';
  if (t <= bounds.tomorrowStart.getTime()) return 'today';
  if (t <= bounds.dayAfterStart.getTime()) return 'tomorrow';
  return 'later';
}

const weekdayOf = (date: Date) => formatJalaliWeekday(date).split(' ')[0]!;

/** برچسب مهلت در ردیف: «دیر شده»، «امروز»، «فردا»، و بعدتر خود روز: «چهارشنبه 15 مهر». */
export function dueBadge(due: Date, bounds: DayBounds): { kind: DueKind; label: string } {
  const kind = dueKind(due, bounds);
  const labels: Record<DueKind, string> = { overdue: 'دیر شده', today: 'امروز', tomorrow: 'فردا', later: formatDeadlineDay(due) };
  return { kind, label: labels[kind] };
}

export interface DueTile {
  kind: DueKind;
  label: string;
  count: number;
  text: string;
}

/**
 * چهار کاشی پیشخوان (طرح پنل): شمارش و یک خط دربارهٔ مهلت. دیرشده‌ها روزی را می‌گویند که مهلتشان تمام شد
 * («دیروز»)، و «بعدتر» روز یا بازهٔ روزها.
 */
export function dueTiles(summary: PanelDueSummary, bounds: DayBounds): DueTile[] {
  const dayOf = (due: Date) => (due.getTime() === bounds.todayStart.getTime() ? 'دیروز' : formatDeadlineDay(due));
  const theirs = (count: number) => (count === 1 ? 'مهلتش' : 'مهلتشان');
  let overdue = 'هیچ سفارشی دیر نشده';
  if (summary.overdueRange) {
    const { earliest, latest } = summary.overdueRange;
    overdue =
      tehranDay(new Date(earliest.getTime() - 1)) === tehranDay(new Date(latest.getTime() - 1))
        ? `${theirs(summary.overdue)} ${dayOf(earliest)} تمام شد`
        : `مهلت قدیمی‌ترینشان ${dayOf(earliest)} تمام شد`;
  }
  let later = 'پس از فردا';
  if (summary.laterRange) {
    const { earliest, latest } = summary.laterRange;
    const [from, to] = [formatDeadlineDay(earliest), formatDeadlineDay(latest)];
    later = from === to ? `تا پایان ${from}` : `${from} تا ${to}`;
  }
  return [
    { kind: 'overdue', label: 'دیر شده', count: summary.overdue, text: overdue },
    { kind: 'today', label: 'امروز', count: summary.today, text: `تا پایان امروز، ${weekdayOf(bounds.at)}` },
    { kind: 'tomorrow', label: 'فردا', count: summary.tomorrow, text: `تا پایان ${formatDeadlineDay(bounds.dayAfterStart)}` },
    { kind: 'later', label: 'بعدتر', count: summary.later, text: later },
  ];
}

/**
 * سطر آمار پیشخوان (طرح پنل): «از این 10 سفارش، 2 در حال چاپ است. هفتهٔ گذشته 41 از 42 سفارش به‌موقع به پست رسید.» هر
 * جمله فقط وقتی چیزی برای گفتن دارد؛ هیچ‌کدام یعنی null.
 */
export function statsSegs(open: number, stats: PanelDashboardStats): Seg[] | null {
  const parts: Seg[][] = [];
  if (open > 0) {
    parts.push(
      stats.printing > 0
        ? ['از این ', num(open), ' سفارش، ', num(stats.printing), ' در حال چاپ است.']
        : ['از این ', num(open), ' سفارش، هنوز هیچ‌کدام در حال چاپ نیست.'],
    );
  }
  if (stats.handed > 0) parts.push(['هفتهٔ گذشته ', num(stats.onTime), ' از ', num(stats.handed), ' سفارش به‌موقع به پست رسید.']);
  return parts.length > 0 ? joined(parts, ' ') : null;
}

/** مدت، با دو واحد بزرگ کنار هم: «12 ساعت و 40 دقیقه»، «1 روز و 3 ساعت»، «40 دقیقه». */
export function durationSegs(ms: number): Seg[] {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  const units: [number, string][] = [
    [Math.floor(minutes / 1440), 'روز'],
    [Math.floor((minutes % 1440) / 60), 'ساعت'],
    [minutes % 60, 'دقیقه'],
  ];
  const first = units.findIndex(([value]) => value > 0);
  if (first === -1) return ['کمتر از یک دقیقه'];
  const shown = [units[first]!, ...(units[first + 1]?.[0] ? [units[first + 1]!] : [])];
  return shown.flatMap(([value, unit], i) => [...(i === 0 ? [] : [' و ']), num(value), ` ${unit}`]);
}

export interface DueCard {
  kind: DueKind;
  title: string;
  /** «پایان دوشنبه 13 مهر». */
  deadline: string;
  /** «12 ساعت و 40 دقیقه مانده»، یا برای دیرشده «3 ساعت دیر». */
  left: Seg[];
}

/** کارت وضعیت سفارش پرداخت‌شده در ستون کنار جزئیات: مهلت و چقدر مانده. */
export function dueCard(due: Date, bounds: DayBounds): DueCard {
  const kind = dueKind(due, bounds);
  const day = formatDeadlineDay(due);
  const titles: Record<DueKind, string> = {
    overdue: 'مهلت تحویل به پست گذشت',
    today: 'تحویل به پست تا امروز',
    tomorrow: 'تحویل به پست تا فردا',
    later: `تحویل به پست تا ${day}`,
  };
  const diff = due.getTime() - bounds.at.getTime();
  return { kind, title: titles[kind], deadline: `پایان ${day}`, left: [...durationSegs(diff), diff <= 0 ? ' دیر' : ' مانده'] };
}

/* ───────────────────────── وضعیت و ردیف ───────────────────────── */

/** سفارش در انتظاری که فایلی از جزوه‌اش پاک شده یا تا حاشیهٔ پرداخت پاک می‌شود: دیگر پرداختنی نیست. */
export function staleSections(sections: readonly PanelSection[], at: Date): boolean {
  return sections.some(
    (s) => s.fileDeletedAt !== null || s.fileExpiresAt === null || s.fileExpiresAt.getTime() < at.getTime() + FILE_MARGIN_MS,
  );
}

export type OrderState = 'queued' | 'printing' | 'handed' | 'cancelled' | 'awaiting' | 'abandoned';

/** وضعیت سفارش در پنل: پس از پرداخت همان وضعیت پایگاه داده؛ پیش از آن «در انتظار پرداخت» تا فایل‌ها زنده‌اند، بعد «رهاشده». */
export function orderState(status: OrderRow['status'], stale: boolean): OrderState {
  switch (status) {
    case 'paid':
      return 'queued';
    case 'printing':
      return 'printing';
    case 'handed_to_post':
      return 'handed';
    case 'cancelled':
      return 'cancelled';
    default:
      return status === 'awaiting_payment' && !stale ? 'awaiting' : 'abandoned';
  }
}

export const STATE_LABELS: Record<OrderState, string> = {
  queued: 'در صف چاپ',
  printing: 'در حال چاپ',
  handed: 'تحویل پست شد',
  cancelled: 'لغو شد',
  awaiting: 'در انتظار پرداخت',
  abandoned: 'رهاشده',
};

/** «باز»: در صف چاپ یا در حال چاپ؛ مهلت تحویل به پست فقط برای این‌ها معنا دارد. */
export const isOpen = (status: OrderRow['status']) => (OPEN_STATUSES as readonly OrderStatus[]).includes(status);

/** ستون وضعیت ردیف؛ کاری که متصدی باید بکند آیکون دارد. */
export function rowState(line: PanelOrderLine): { label: string; icon: 'error' | 'info' | null } {
  const state = orderState(line.status, line.stale);
  if ((state === 'queued' || state === 'printing') && line.pdfJob === 'failed') return { label: 'PDF ساخته نشد', icon: 'error' };
  if (state === 'awaiting' && line.unreturnedPayments > 0) return { label: 'پرداخت بی برگشت', icon: 'info' };
  return { label: STATE_LABELS[state], icon: null };
}

/* ───────────────────────── وضعیت پس از پرداخت: کار بعدی و برگرداندن ───────────────────────── */

/** نام هر وضعیت در رویدادها و فرم‌ها: «در صف چاپ ← در حال چاپ». */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'در انتظار پرداخت',
  paid: 'در صف چاپ',
  expired: 'رها شد',
  printing: 'در حال چاپ',
  handed_to_post: 'تحویل پست شد',
  cancelled: 'لغو شد',
};

/** کارهای وضعیت در پنل (ADR-039): دو کار رو به جلو، لغو، و برگرداندن یک قدم (فقط مالک). */
export type StatusAction = 'start_print' | 'handed_to_post' | 'cancel' | 'revert';

export const isStatusAction = (value: unknown): value is StatusAction =>
  value === 'start_print' || value === 'handed_to_post' || value === 'cancel' || value === 'revert';

/** برگرداندن؟ هر گذار رو به عقب: چاپ به صف، پست به چاپ، و لغو به وضعیتی که پیش از آن بود. */
export function isRevert(from: OrderStatus | null, to: OrderStatus): boolean {
  return (
    (from === 'printing' && to === 'paid') ||
    (from === 'handed_to_post' && to === 'printing') ||
    (from === 'cancelled' && (to === 'paid' || to === 'printing'))
  );
}

/** آخرین رویداد وضعیتی که سفارش را به `to` برد (کی، کدام ادمین، چه دلیلی). */
export function lastMoveTo(events: readonly PanelStatusEvent[], to: OrderStatus): PanelStatusEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) if (events[i]!.toStatus === to) return events[i]!;
  return null;
}

/** دلیل لغو یا برگرداندن، از یادداشت رویداد؛ فقط در پنل. */
export const reasonOf = (event: PanelStatusEvent | null): string | null => {
  const reason = (event?.note as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' && reason ? reason : null;
};

/**
 * گذار هر کار از وضعیتی که ادمین دید (`from`): «شروع چاپ» از صف، «تحویل پست شد» از چاپ، لغو از هر دو، و
 * برگرداندن یک قدم؛ لغو به همان وضعیتی برمی‌گردد که پیش از لغو داشت. null یعنی از `from` ممکن نیست. همان گذارهایی
 * که تریگر `orders_status_flow` پایگاه داده می‌پذیرد.
 */
export function transitionOf(action: StatusAction, from: OrderStatus, events: readonly PanelStatusEvent[]): OrderStatus | null {
  switch (action) {
    case 'start_print':
      return from === 'paid' ? 'printing' : null;
    case 'handed_to_post':
      return from === 'printing' ? 'handed_to_post' : null;
    case 'cancel':
      return from === 'paid' || from === 'printing' ? 'cancelled' : null;
    case 'revert': {
      if (from === 'printing') return 'paid';
      if (from === 'handed_to_post') return 'printing';
      if (from !== 'cancelled') return null;
      const before = lastMoveTo(events, 'cancelled')?.fromStatus;
      return before === 'paid' || before === 'printing' ? before : null;
    }
  }
}

/** بیشترین طول دلیل لغو یا برگرداندن، بعد از نرمال‌سازی. */
export const REASON_MAX = 500;

/** گیرنده تا وقتی به پست نرسیده ویرایش‌شدنی است: در صف چاپ و در حال چاپ. */
export const RECIPIENT_EDITABLE = OPEN_STATUSES;

/** «سیاه‌سفید»، «رنگی»، یا در حالت ترکیبی (چند قاعده، ADR-002) «رنگی و سیاه‌سفید». */
function colorText(modes: readonly string[]): string {
  const color = modes.includes('color');
  const bw = modes.includes('bw');
  return color && bw ? 'رنگی و سیاه‌سفید' : color ? 'رنگی' : 'سیاه‌سفید';
}

/** ستون جزوهٔ ردیف: «3 فایل · 120 صفحه · سیاه‌سفید»، «230 صفحه · سیاه‌سفید، یکرو». دورو پیش‌فرض است و گفته نمی‌شود. */
export function jozveSegs(line: PanelOrderLine): Seg[] {
  const parts: Seg[][] = [];
  if (line.itemCount > 1) parts.push([num(line.itemCount), ' جزوه']);
  if (line.fileCount > 1) parts.push([num(line.fileCount), ' فایل']);
  parts.push([num(line.pageCount), ' صفحه']);
  parts.push([`${colorText(line.colorModes)}${line.sidesModes.includes('single') ? '، یکرو' : ''}`]);
  if (line.copies > 1) parts.push([num(line.copies), ' نسخه']);
  return joined(parts);
}

/* ───────────────────────── جزئیات ───────────────────────── */

const SIDES: Record<string, string> = { double: 'دورو', single: 'یکرو' };

/** بخش ریز قیمت منجمدِ هر قلم (همان ترتیب قلم‌ها). */
export function breakdownOf(order: OrderRow): Breakdown {
  return order.priceBreakdown as Breakdown;
}

export interface Fact {
  label: string;
  value: Seg[];
}

/** مشخصات چاپ یک جزوه: «سیاه‌سفید، دورو · تحریر ۸۰ گرم»، صحافی با صفحه و برگ و جلد، و تعداد. */
export function specFacts(item: PanelOrderItem, priced: ItemBreakdown | undefined): Fact[] {
  const papers = [...new Set(item.rules.map((rule) => rule.paperName ?? rule.paperTypeId))];
  const volumes = priced?.volumes ?? 1;
  return [
    {
      label: 'چاپ',
      value: joined([[`${colorText(item.rules.map((r) => r.colorMode))}، ${SIDES[item.sidesMode] ?? item.sidesMode}`], [papers.join('، ')]]),
    },
    {
      label: 'صحافی',
      value: joined([
        [item.bindingName ?? item.bindingTypeId],
        [
          num(item.pageCount),
          ' صفحه',
          ...(priced ? ['، ', num(priced.sheets), ' برگ'] : []),
          '، ',
          ...(volumes === 1 ? ['یک جلد'] : [num(volumes), ' جلد']),
        ],
      ]),
    },
    { label: 'تعداد', value: [num(item.copies), ' نسخه'] },
  ];
}

export interface SumLine {
  label: Seg[];
  rials: number;
}

/**
 * ریز قیمت منجمد سفارش (قاعدهٔ ۶)، همان ردیف‌های خلاصهٔ سایت: چاپ، کاغذ اگر جدا حساب شده، صحافی، و کرایه؛ بعد
 * تخفیف، مالیات و گرد کردن اگر صفر نیستند. هیچ عددی دوباره حساب نمی‌شود.
 */
export function sumLines(details: PanelOrderDetails): SumLine[] {
  const breakdown = breakdownOf(details.order);
  const many = details.items.length > 1;
  const lines: SumLine[] = [];
  details.items.forEach((item, i) => {
    const priced = breakdown.items[i];
    if (!priced) return;
    const prefix: Seg[] = many ? ['جزوهٔ ', num(i + 1), ': '] : [];
    lines.push({
      label: [
        ...prefix,
        `چاپ ${colorText(item.rules.map((r) => r.colorMode))}، ${SIDES[item.sidesMode] ?? item.sidesMode} · `,
        num(priced.printedSides),
        ' صفحه',
        ...(priced.copies > 1 ? [' · ', num(priced.copies), ' نسخه'] : []),
      ],
      rials: priced.printRials,
    });
    if (priced.paperRials > 0) lines.push({ label: [...prefix, 'کاغذ'], rials: priced.paperRials });
    lines.push({
      label: [
        ...prefix,
        `صحافی ${item.bindingName ?? item.bindingTypeId} · `,
        ...(priced.volumes > 1 ? [num(priced.volumes), ' جلد'] : [num(priced.sheets), ' برگ']),
      ],
      rials: priced.bindingRials,
    });
  });
  lines.push({ label: [shippingText(details)], rials: details.order.shippingRials });
  if (details.order.discountRials > 0) lines.push({ label: ['تخفیف'], rials: -details.order.discountRials });
  if (details.order.vatRials > 0) lines.push({ label: ['مالیات بر ارزش افزوده'], rials: details.order.vatRials });
  if (details.order.roundingRials !== 0) lines.push({ label: ['گرد کردن'], rials: details.order.roundingRials });
  return lines;
}

/** «پست پیشتاز، بقیهٔ کشور». */
export const shippingText = (details: PanelOrderDetails) =>
  `${details.shippingMethodName ?? details.order.shippingMethodId}، ${details.zoneName}`;

/** «خراسان رضوی، مشهد، بلوار سجاد…»؛ بی شهر (شهری که در فهرست نبود)، نام شهر خودش در نشانی است. */
export const addressText = (details: PanelOrderDetails) =>
  [details.provinceName, details.cityName, details.order.addressText].filter(Boolean).join('، ');

/** «0915 234 5678». */
export const phoneText = (phone: string) => (/^\d{11}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone);

/* ───────────────────────── پرداخت‌ها ───────────────────────── */

const PROVIDERS: Record<string, string> = { mock: 'درگاه نمونه', zibal: 'زیبال' };

const FAILURES: Record<string, string> = {
  cancelled: 'مشتری در درگاه انصراف داد',
  declined: 'بانک پرداخت را نپذیرفت',
  verify_failed: 'درگاه پرداخت را تأیید نکرد',
  amount_mismatch: 'مبلغ با سفارش نخواند',
  expired: 'دیرتر از 30 دقیقه برگشت و پذیرفته نشد',
  order_not_payable: 'سفارش دیگر پرداختنی نبود',
};

export type PaymentKind = 'succeeded' | 'failed' | 'unreturned' | 'pending';

export interface PaymentView {
  kind: PaymentKind;
  at: Date;
  meta: Seg[];
}

/**
 * یک تلاش پرداخت. «بی برگشت»: هنوز در انتظار و بیش از مهلت هر تلاش (نیم ساعت) گذشته؛ مشتری به درگاه رفت و
 * برنگشت، و برگشت دیرش هم دیگر پذیرفته نمی‌شود (سؤال ۲۲؛ استعلام از درگاه با برش ۷).
 */
export function paymentView(payment: PaymentRow, at: Date): PaymentView {
  const provider = PROVIDERS[payment.provider] ?? payment.provider;
  if (payment.status === 'succeeded') {
    return {
      kind: 'succeeded',
      at: payment.verifiedAt ?? payment.createdAt,
      meta: [
        provider,
        ...(payment.refId ? [' · کد پیگیری ', { num: payment.refId }] : []),
        ...(payment.cardMask ? [' · کارت ', { num: payment.cardMask }] : []),
      ],
    };
  }
  if (payment.status === 'failed') {
    const code = payment.failureCode ?? '';
    return { kind: 'failed', at: payment.createdAt, meta: [provider, ' · ', FAILURES[code] ?? (code || 'ناموفق')] };
  }
  // همان مرز برگشت سایت (`settle`): تا خود نیم ساعت هنوز پذیرفته می‌شود، بعدش نه.
  const until = new Date(payment.createdAt.getTime() + PAYMENT_ATTEMPT_TTL_MS);
  if (at.getTime() > until.getTime()) {
    return {
      kind: 'unreturned',
      at: payment.createdAt,
      meta: [provider, ' · مشتری به درگاه رفت و برنگشت. بعد از ', num(30), ' دقیقه، برگشت دیرش هم پذیرفته نمی‌شود.'],
    };
  }
  return {
    kind: 'pending',
    at: payment.createdAt,
    meta: [provider, ' · مشتری در درگاه است؛ برگشتش تا ساعت ', { num: formatTehranTime(until) }, ' پذیرفته می‌شود.'],
  };
}

/* ───────────────────────── PDF جزوه ───────────────────────── */

const PDF_ERRORS: Record<string, string> = {
  file_missing: 'فایل مشتری روی استوریج پیدا نشد',
  page_count_mismatch: 'صفحه‌های فایل با شمارش سرور نخواند',
  corrupt_file: 'فایل خراب بود',
  password_protected: 'فایل رمز دارد',
  sections_missing: 'بخش‌های جزوه با سفارش نخواند',
  sections_mismatch: 'بخش‌های جزوه با سفارش نخواند',
  order_not_paid: 'سفارش پرداخت‌شده پیدا نشد',
  order_missing: 'سفارش پرداخت‌شده پیدا نشد',
  order_closed: 'سفارش لغو شده بود',
  transient: 'استوریج یا پایگاه داده جواب نداد',
};

export const pdfFileName = (orderNumber: number, itemSeq: number) => `jozve-${orderNumber}-${itemSeq}.pdf`;

/** تا کی فایل‌های مشتری روی سرورند؛ null یعنی دیگر نیستند. */
export function filesUntil(items: readonly PanelOrderItem[], at: Date): Date | null {
  const sections = items.flatMap((item) => item.sections);
  if (sections.length === 0 || sections.some((s) => s.fileDeletedAt !== null || s.fileExpiresAt === null)) return null;
  const earliest = Math.min(...sections.map((s) => s.fileExpiresAt!.getTime()));
  return earliest > at.getTime() ? new Date(earliest) : null;
}

export type PdfView =
  | { kind: 'unpaid' }
  | { kind: 'closed' }
  | { kind: 'ready'; fileName: string; pages: number; bytes: number | null; readyAt: Date }
  | { kind: 'building'; retrying: boolean }
  | { kind: 'failed'; fileName: string; attempts: number; reason: string; from: Date; to: Date | null; filesUntil: Date | null };

/**
 * PDF یک جزوه: ساخته شده (دانلود، در هر وضعیت پس از پرداخت)، در حال ساختن، یا ساخته نشد با دلیل و تا کی «دوباره
 * بساز» ممکن است (فایل‌های مشتری تا پاک شدنشان). کار `prepare_order` مال کل سفارش است؛ قلمی که ساخته شده، ساخته شده
 * می‌ماند. سفارشی که لغو شد یا به پست رسید و PDFش ساخته نشده، دیگر لازمش ندارد (`closed`).
 */
export function pdfView(details: PanelOrderDetails, item: PanelOrderItem, at: Date): PdfView {
  if (!isPaidStatus(details.order.status)) return { kind: 'unpaid' };
  const fileName = pdfFileName(details.order.orderNumber, item.seq);
  if (item.printPdfReadyAt) {
    return { kind: 'ready', fileName, pages: item.pageCount, bytes: item.printPdfBytes, readyAt: item.printPdfReadyAt };
  }
  if (!isOpen(details.order.status)) return { kind: 'closed' };
  const job: PanelPdfJob | null = details.pdfJob;
  if (job?.status === 'failed') {
    return {
      kind: 'failed',
      fileName,
      attempts: job.attempts,
      reason: PDF_ERRORS[pdfErrorCode(job.lastError) ?? ''] ?? 'خطای ناشناخته',
      from: job.createdAt,
      to: job.finishedAt,
      filesUntil: filesUntil(details.items, at),
    };
  }
  return { kind: 'building', retrying: Boolean(job && job.attempts > 0 && job.lastError) };
}

/** همهٔ جزوه‌های سفارش PDF دارند: «شروع چاپ» فقط بعد از این (طرح: «اول PDF جزوه ساخته شود»). */
export const pdfReady = (details: PanelOrderDetails) =>
  details.items.length > 0 && details.items.every((item) => item.printPdfReadyAt !== null);

/* ───────────────────────── رویدادهای سفارش ───────────────────────── */

const ACTORS: Record<string, string> = { user: 'مشتری', gateway: 'درگاه', system: 'سیستم', admin: 'ادمین' };

/** نام فیلدهای گیرنده در رویداد ویرایش. */
const RECIPIENT_FIELDS: Record<string, string> = { recipientName: 'نام گیرنده', addressText: 'نشانی', postalCode: 'کد پستی' };

export interface TimelineEntry {
  at: Date;
  text: Seg[];
  who: string;
}

/**
 * رویدادهای سفارش به ترتیب زمان (طرح پنل): تغییر وضعیت‌ها (از ۴٫۳ با ادمین: «در صف چاپ ← در حال چاپ»، «لغو شد»، و
 * برگرداندن با دلیلش)، PDF جزوه (ساخته شد، یا ماند)، و کار ادمین‌ها روی همین سفارش (دانلود، «دوباره بساز»، ویرایش
 * گیرنده). تغییر وضعیت ادمین رویداد ادمین هم دارد، ولی یک بار نشان داده می‌شود.
 */
export function orderTimeline(details: PanelOrderDetails): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const event of details.statusEvents) {
    const who = event.adminName ?? ACTORS[event.actor] ?? event.actor;
    const from = event.fromStatus;
    const to = event.toStatus;
    if (from === null) entries.push({ at: event.at, text: ['سفارش ساخته شد'], who });
    else if (from === 'awaiting_payment' && to === 'paid') entries.push({ at: event.at, text: ['پرداخت شد'], who });
    else if (to === 'expired') entries.push({ at: event.at, text: ['رها شد: فایل‌ها دیگر روی سرور نبود'], who });
    else if (isRevert(from, to)) {
      const reason = reasonOf(event);
      entries.push({
        at: event.at,
        text: [`برگرداندن: ${STATUS_LABELS[from]} ← ${STATUS_LABELS[to]}${reason ? `؛ ${reason}` : ''}`],
        who,
      });
    } else if (to === 'cancelled') entries.push({ at: event.at, text: ['لغو شد'], who });
    else entries.push({ at: event.at, text: [`${STATUS_LABELS[from]} ← ${STATUS_LABELS[to]}`], who });
  }
  const many = details.items.length > 1;
  const jozve = (seq: number): Seg[] => (many ? ['جزوهٔ ', num(seq)] : ['جزوه']);
  for (const item of details.items) {
    if (item.printPdfReadyAt) entries.push({ at: item.printPdfReadyAt, text: ['PDF ', ...jozve(item.seq), ' ساخته شد'], who: 'سیستم' });
  }
  const job = details.pdfJob;
  if (job?.status === 'failed' && job.finishedAt) {
    entries.push({ at: job.finishedAt, text: ['ساختن PDF جزوه ناموفق ماند'], who: 'سیستم' });
  }
  for (const event of details.events) {
    const detail = (event.detail ?? {}) as { item?: unknown; changed?: unknown };
    const seq = typeof detail.item === 'number' ? detail.item : 1;
    const who = event.adminName ?? 'ادمین';
    if (event.action === 'orders.status') continue; // همان رویداد وضعیت بالا
    if (event.action === 'orders.pdf_download') entries.push({ at: event.at, text: ['PDF ', ...jozve(seq), ' دانلود شد'], who });
    else if (event.action === 'orders.pdf_rebuild') entries.push({ at: event.at, text: ['ساختن دوبارهٔ PDF جزوه'], who });
    else if (event.action === 'orders.recipient') {
      const changed = Array.isArray(detail.changed) ? detail.changed.map((field) => RECIPIENT_FIELDS[String(field)] ?? String(field)) : [];
      entries.push({ at: event.at, text: [`ویرایش گیرنده${changed.length ? `: ${changed.join('، ')}` : ''}`], who });
    } else entries.push({ at: event.at, text: [event.action], who });
  }
  return entries.map((entry, i) => ({ entry, i })).sort((a, b) => a.entry.at.getTime() - b.entry.at.getTime() || a.i - b.i).map(({ entry }) => entry);
}

/** زمان هر سطر رویداد: اولین سطر هر روز با روز («شنبه 11 مهر 13:57»)، بقیهٔ همان روز فقط ساعت («14:05»). */
export function timelineWhen(entries: readonly { at: Date }[]): { day: string | null; time: string }[] {
  return entries.map((entry, i) => ({
    day: i > 0 && tehranDay(entries[i - 1]!.at) === tehranDay(entry.at) ? null : formatJalaliWeekday(entry.at),
    time: formatTehranTime(entry.at),
  }));
}
