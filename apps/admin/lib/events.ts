/**
 * رویدادهای ادمین به زبان صفحهٔ «رویدادها» (طرح پنل): چه کسی، کی، چه کاری. خالص و بی JSX، تا تست
 * بی مرورگر بسنجدش؛ صفحه فقط می‌چیندش.
 *
 * - ورود ناموفق پشت‌سرهم با یک نام و یک دلیل یک سطر می‌شود: «5 بار با نام کاربری admin، که چنین کاربری
 *   نیست». دلیل «رمز درست بود، کد نه» جداست: یعنی رمز لو رفته است.
 * - `detail` از پایگاه داده است و هرگز رمز یا کد ندارد؛ نام کاربری تایپ‌شده متن خام است و صفحه جدا
 *   (`bdi`) نشانش می‌دهد.
 */

import type { AdminEventView } from '@jozveyar/db';

import { tehranDay } from './format';
import { ROLE_NAMES } from './messages';

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

/** چیپ‌های صفحه: پیشوند کار. هر قدم پنل چیپ خودش را می‌آورد (سفارش در ۴٫۲، تعرفه ۴٫۵، تنظیمات ۴٫۶). */
export const EVENT_KINDS = [
  { kind: '', label: 'همه' },
  { kind: 'auth', label: 'ورود' },
  { kind: 'admins', label: 'ادمین‌ها' },
] as const;
