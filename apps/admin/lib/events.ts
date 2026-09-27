/**
 * رویدادهای ادمین به زبان صفحهٔ «رویدادها» (طرح پنل): چه کسی، کی، چه کاری. خالص و بی JSX، تا تست
 * بی مرورگر بسنجدش؛ صفحه فقط می‌چیندش.
 *
 * - ورود ناموفق پشت‌سرهم با یک نام و یک دلیل یک سطر می‌شود: «5 بار با نام کاربری admin، که چنین کاربری
 *   نیست». دلیل «رمز درست بود، کد نه» جداست: یعنی رمز لو رفته است.
 * - `detail` از پایگاه داده است و هرگز رمز یا کد ندارد؛ نام کاربری تایپ‌شده متن خام است و صفحه جدا
 *   (`bdi`) نشانش می‌دهد.
 */

import type { AdminEventView, OrderStatus } from '@jozveyar/db';

import { tehranDay } from './format';
import { ROLE_NAMES } from './messages';

/** نام وضعیت‌های سفارش در رویدادها؛ همان `STATUS_LABELS` صفحهٔ سفارش (`orders.ts` پایگاه داده را با خودش می‌آورد). */
const STATUS: Record<OrderStatus, string> = {
  awaiting_payment: 'در انتظار پرداخت',
  paid: 'در صف چاپ',
  expired: 'رها شد',
  printing: 'در حال چاپ',
  handed_to_post: 'تحویل پست شد',
  cancelled: 'لغو شد',
};
const statusOf = (value: unknown) => (typeof value === 'string' && value in STATUS ? STATUS[value as OrderStatus] : String(value ?? ''));

/** نام فیلدهای گیرنده در رویداد ویرایش. */
const RECIPIENT: Record<string, string> = { recipientName: 'نام', addressText: 'نشانی', postalCode: 'کد پستی' };

/** تکهٔ متن؛ `{ ltr }` نام کاربری لاتین است و صفحه آن را جدا از جملهٔ فارسی نشان می‌دهد. */
export type Segment = string | { ltr: string };

export interface EventLine {
  id: number;
  at: Date;
  /** کننده؛ null برای تلاش ورود بی نشست، و «سرور» برای دستور روی سرور. */
  who: string | null;
  badge: 'login_failed' | 'code_failed' | null;
  count: number;
  text: Segment[];
}

type Detail = Record<string, unknown>;

const str = (value: unknown) => (typeof value === 'string' ? value : '');

function loginFailed(detail: Detail): Segment[] {
  const name = str(detail.username);
  const who: Segment[] = name ? ['با نام کاربری ', { ltr: name }] : ['بی نام کاربری'];
  const locked = detail.locked === true ? ['؛ حساب قفل شد'] : [];
  switch (detail.reason) {
    case 'unknown':
      return name ? [...who, '، که چنین کاربری نیست'] : who;
    case 'disabled':
      return [...who, '، که غیرفعال است'];
    case 'not_enrolled':
      return [...who, '، که هنوز ثبت نکرده'];
    case 'locked':
      return [...who, '، وقتی حساب قفل بود'];
    case 'code':
      return [...who, '؛ رمز درست بود، کد نه', ...locked];
    case 'replay':
      return [...who, '؛ رمز درست بود، کد تکراری', ...locked];
    default:
      return [...who, ...locked];
  }
}

/** شمارهٔ نسخهٔ تعرفه، جدا از جملهٔ فارسی. */
const versionRef = (value: unknown): Segment[] => [{ ltr: typeof value === 'number' ? String(value) : '' }];

/** «10027»، و اگر سفارش چند جزوه دارد «10027 (جزوهٔ 2)»؛ عدد جدا از جملهٔ فارسی. */
function orderRef(detail: Detail): Segment[] {
  const number = typeof detail.orderNumber === 'number' ? String(detail.orderNumber) : '';
  const item = typeof detail.item === 'number' && detail.item > 1 ? [' (جزوهٔ ', { ltr: String(detail.item) }, ')'] : [];
  return [{ ltr: number }, ...item];
}

function describe(event: AdminEventView): Pick<EventLine, 'badge' | 'text'> {
  const detail = (event.detail ?? {}) as Detail;
  const name = str(detail.username);
  const role = ROLE_NAMES[str(detail.role)];
  switch (event.action) {
    case 'auth.login':
      return { badge: null, text: ['ورود'] };
    case 'auth.logout':
      return { badge: null, text: ['خروج'] };
    case 'auth.login_failed':
      return { badge: 'login_failed', text: loginFailed(detail) };
    case 'auth.code_failed':
      return {
        badge: 'code_failed',
        text: [
          detail.reason === 'replay' ? 'کد تکراری در کار حساس' : 'کد نادرست در کار حساس',
          ...(detail.locked === true ? ['؛ حساب قفل و نشست‌ها بسته شد'] : []),
        ],
      };
    case 'admins.invite':
      return detail.reset === true
        ? { badge: null, text: ['کد ورود تازه برای ', { ltr: name }, ' ساخته شد'] }
        : { badge: null, text: ['پیوند ثبت برای ', { ltr: name }, role ? ` (${role})` : '', ' ساخته شد'] };
    case 'admins.enroll':
      return { badge: null, text: ['ثبت: رمز و برنامهٔ تأیید گذاشته شد'] };
    case 'admins.disable':
      return { badge: null, text: [{ ltr: name }, ' غیرفعال شد'] };
    case 'admins.invite_revoked':
      return { badge: null, text: ['دعوت ', { ltr: name }, ' لغو شد'] };
    case 'orders.pdf_download':
      return { badge: null, text: ['PDF سفارش ', ...orderRef(detail), ' دانلود شد'] };
    case 'orders.pdf_rebuild':
      return { badge: null, text: ['ساختن دوبارهٔ PDF سفارش ', ...orderRef(detail)] };
    case 'orders.status':
      return detail.to === 'cancelled'
        ? { badge: null, text: ['سفارش ', ...orderRef(detail), ' لغو شد'] }
        : { badge: null, text: ['سفارش ', ...orderRef(detail), `: ${statusOf(detail.from)} ← ${statusOf(detail.to)}`] };
    case 'tariff.draft':
      return { badge: null, text: ['پیش‌نویس نسخهٔ ', ...versionRef(detail.version), ' تعرفه ساخته شد، از روی نسخهٔ ', ...versionRef(detail.from)] };
    case 'tariff.draft_save':
      return { badge: null, text: ['پیش‌نویس نسخهٔ ', ...versionRef(detail.version), ' تعرفه ذخیره شد'] };
    case 'tariff.draft_delete':
      return { badge: null, text: ['پیش‌نویس نسخهٔ ', ...versionRef(detail.version), ' تعرفه پاک شد'] };
    case 'tariff.activate':
      return {
        badge: null,
        text: [
          'نسخهٔ ',
          ...versionRef(detail.version),
          detail.again === true ? ' تعرفه دوباره فعال شد' : ' تعرفه فعال شد',
          ...(typeof detail.previous === 'number' ? ['، به جای نسخهٔ ', ...versionRef(detail.previous)] : []),
        ],
      };
    case 'orders.recipient': {
      const changed = Array.isArray(detail.changed) ? detail.changed.map((field) => RECIPIENT[String(field)] ?? String(field)) : [];
      return { badge: null, text: ['گیرندهٔ سفارش ', ...orderRef(detail), ` ویرایش شد${changed.length ? `: ${changed.join('، ')}` : ''}`] };
    }
    default:
      return { badge: null, text: [event.action] };
  }
}

function whoOf(event: AdminEventView): string | null {
  if (event.displayName) return event.displayName;
  return event.adminUserId === null && event.action.startsWith('admins.') ? 'سرور' : null;
}

/** رویدادها (تازه‌ترین اول) به سطر؛ ورود ناموفق پشت‌سرهم و یکسان در یک روز یک سطر با شمار. */
export function eventLines(events: readonly AdminEventView[]): EventLine[] {
  const lines: EventLine[] = [];
  let lastKey: string | null = null;
  for (const event of events) {
    const detail = (event.detail ?? {}) as Detail;
    const key =
      event.action === 'auth.login_failed'
        ? JSON.stringify([tehranDay(event.at), str(detail.username), str(detail.reason), detail.locked === true])
        : null;
    const previous = lines.at(-1);
    if (key !== null && key === lastKey && previous) {
      previous.count += 1;
      continue;
    }
    lastKey = key;
    lines.push({ id: event.id, at: event.at, who: whoOf(event), count: 1, ...describe(event) });
  }
  return lines;
}

/** سطرها به روز تهران، به همان ترتیب. */
export function byDay(lines: readonly EventLine[]): { day: string; at: Date; lines: EventLine[] }[] {
  const days: { day: string; at: Date; lines: EventLine[] }[] = [];
  for (const line of lines) {
    const day = tehranDay(line.at);
    const last = days.at(-1);
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, at: line.at, lines: [line] });
  }
  return days;
}

/** چیپ‌های صفحه: پیشوند کار. هر قدم پنل چیپ خودش را می‌آورد (سفارش از ۴٫۲، تعرفه ۴٫۵، تنظیمات ۴٫۶). */
export const EVENT_KINDS = [
  { kind: '', label: 'همه' },
  { kind: 'auth', label: 'ورود' },
  { kind: 'orders', label: 'سفارش' },
  { kind: 'tariff', label: 'تعرفه' },
  { kind: 'admins', label: 'ادمین‌ها' },
] as const;
