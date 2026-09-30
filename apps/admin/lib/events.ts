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
import { formatNumber } from '@jozveyar/text';

import { tehranDay } from './format';
import { ROLE_NAMES } from './messages';
import { boundsText } from './report';
import { KEY_INFO } from './settings';

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
  badge: 'login_failed' | 'code_failed' | 'test_rejected' | null;
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

/** نام تنظیم‌های عددی در رویدادها. */
const SETTING_NAMES: Record<string, string> = {
  'order.sla_days': 'روز کاری تحویل به پست',
  'otp.site_hourly_limit': 'سقف ساعتی کد پیامکی کل سایت',
  'otp.site_daily_limit': 'سقف روزانهٔ کد پیامکی کل سایت',
  'order.files_retention_days': 'روزهای نگهداری فایل‌های سفارش',
  'sms.credit_alert': 'آستانهٔ هشدار اعتبار پیامک',
};

/** عدد یا تاریخ، جدا از جملهٔ فارسی. */
const ltrOf = (value: unknown): Segment => ({ ltr: typeof value === 'number' || typeof value === 'string' ? String(value) : '' });

/** نام کلید در صفحه («کد پذیرندهٔ زیبال»)؛ نام ناشناس همان نام خام. */
const keyName = (value: unknown) => (typeof value === 'string' && value in KEY_INFO ? KEY_INFO[value as keyof typeof KEY_INFO].label : String(value ?? ''));

/**
 * بازه‌های وزن گزارش ارسال (۶٫۴) در رویداد: «بازه‌های کرایهٔ تعرفه»، یا مرزها («750، 1,500 و 3,000 گرم»)، هر عدد جدا از جملهٔ
 * فارسی؛ همان `boundsText` صفحهٔ گزارش.
 */
function bandsRef(value: unknown): Segment[] {
  if (!Array.isArray(value) || !value.every((grams) => typeof grams === 'number')) return ['بازه‌های کرایهٔ تعرفه'];
  return boundsText(value).map((seg) => (typeof seg === 'string' ? seg : { ltr: 'num' in seg ? seg.num : '' }));
}

function settingUpdate(detail: Detail): Segment[] {
  if (detail.key === 'calendar.official_through') return ['تعطیلی‌های ', ltrOf(detail.to), ' با تقویم رسمی تطبیق داده شد'];
  if (detail.key === 'report.weight_bands') return ['بازه‌های وزن گزارش ارسال: ', ...bandsRef(detail.from), ' ← ', ...bandsRef(detail.to)];
  const amount = (value: unknown): Segment => ({ ltr: typeof value === 'number' ? formatNumber(value) : String(value ?? '') });
  return [`${SETTING_NAMES[str(detail.key)] ?? str(detail.key)}: `, amount(detail.from), ' ← ', amount(detail.to)];
}

/** «10027»، و اگر سفارش چند جزوه دارد «10027 (جزوهٔ 2)»؛ عدد جدا از جملهٔ فارسی. */
function orderRef(detail: Detail): Segment[] {
  const number = typeof detail.orderNumber === 'number' ? String(detail.orderNumber) : '';
  const item = typeof detail.item === 'number' && detail.item > 1 ? [' (جزوهٔ ', { ltr: String(detail.item) }, ')'] : [];
  return [{ ltr: number }, ...item];
}

/** «10013 و 10017»، «10013، 10017 و 10021»: هر شماره جدا از جملهٔ فارسی. */
function numbersOf(value: unknown): Segment[] {
  const numbers = Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];
  return numbers.flatMap((n, i): Segment[] => [...(i === 0 ? [] : [i === numbers.length - 1 ? ' و ' : '، ']), { ltr: String(n) }]);
}

/** شمار حکم‌های «ثبت» فایل پست، به ترتیب طرح: «9 کد رهگیری، 4 سطر در صف تأیید، 1 پیدا نشد، 1 تکراری». */
function commitCounts(detail: Detail): Segment[] {
  const counts = (detail.counts ?? {}) as Record<string, unknown>;
  const parts: [unknown, string][] = [
    [detail.shipments, ' کد رهگیری'],
    [counts.review, ' سطر در صف تأیید'],
    [counts.unmatched, ' پیدا نشد'],
    [counts.duplicate, ' تکراری'],
    [counts.invalid, ' خوانده نشد'],
    [counts.inactive, ' غیرفعال در پست'],
  ];
  return parts
    .filter(([n], i) => i === 0 || (typeof n === 'number' && n > 0))
    .flatMap(([n, label], i): Segment[] => [...(i === 0 ? [] : ['، ']), { ltr: String(typeof n === 'number' ? n : 0) }, label]);
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
    case 'admins.invite': {
      // کاربر چاپخانه (۵٫۳) با نام چاپخانه‌اش، طرح: «پیوند ثبت برای حسن (چاپخانه، چاپ نور) ساخته شد».
      const partner = str((detail.partner as Detail | undefined)?.name);
      return detail.reset === true
        ? { badge: null, text: ['کد ورود تازه برای ', { ltr: name }, ' ساخته شد'] }
        : { badge: null, text: ['پیوند ثبت برای ', { ltr: name }, role ? ` (${role}${partner ? `، ${partner}` : ''})` : '', ' ساخته شد'] };
    }
    case 'admins.enroll':
      return { badge: null, text: ['ثبت: رمز و برنامهٔ تأیید گذاشته شد'] };
    case 'admins.disable':
      return { badge: null, text: [{ ltr: name }, ' غیرفعال شد'] };
    case 'admins.invite_revoked':
      return { badge: null, text: ['دعوت ', { ltr: name }, ' لغو شد'] };
    case 'orders.pdf_download':
      return { badge: null, text: ['PDF اصلی سفارش ', ...orderRef(detail), ' دانلود شد'] };
    case 'orders.print_download': {
      const volume =
        typeof detail.volume === 'number' && typeof detail.volumes === 'number' && detail.volumes > 1
          ? [' جلد ', { ltr: String(detail.volume) }]
          : [];
      return { badge: null, text: ['فایل چاپ سفارش ', ...orderRef(detail), ...volume, ' دانلود شد'] };
    }
    case 'orders.ticket_download':
      return { badge: null, text: ['برگهٔ سفارش ', ...orderRef(detail), ' دانلود شد'] };
    case 'orders.pdf_rebuild':
      return { badge: null, text: ['ساختن دوبارهٔ فایل چاپ سفارش ', ...orderRef(detail)] };
    case 'orders.ticket_rebuild':
      return { badge: null, text: ['ساختن دوبارهٔ برگهٔ سفارش ', ...orderRef(detail)] };
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
    case 'settings.update':
      return { badge: null, text: settingUpdate(detail) };
    case 'settings.holiday_add':
      return { badge: null, text: ['تعطیلی ', ltrOf(detail.date), ` افزوده شد: ${str(detail.title)}`] };
    case 'settings.holiday_remove':
      return { badge: null, text: ['تعطیلی ', ltrOf(detail.date), ` حذف شد: ${str(detail.title)}`] };
    case 'settings.key_set':
      return { badge: null, text: [`کلید «${keyName(detail.name)}» ${detail.from === 'empty' ? 'وارد شد' : 'عوض شد'}`] };
    case 'settings.key_revert':
      return { badge: null, text: [`کلید «${keyName(detail.name)}» به `, { ltr: '.env' }, ' برگشت'] };
    case 'settings.key_test': {
      // «آزمایش» کلید sms.ir (۷٫۱، سؤال ۱۳۹؛ طرح): نام و نتیجه، هرگز مقدار.
      const credit = typeof detail.credit === 'number' ? Math.floor(detail.credit) : null;
      const http = typeof detail.http === 'number' ? [' (پاسخ ', { ltr: String(detail.http) }, ')'] : [];
      const result: Segment[] =
        detail.result === 'ok'
          ? credit !== null
            ? ['درست، اعتبار ', { ltr: formatNumber(credit) }, ' پیامک']
            : ['درست، پیامک آزمایشی رفت']
          : detail.result === 'rejected'
            ? ['رد شد', ...http]
            : detail.result === 'unconfigured'
              ? ['آزموده نشد، کلید API خالی بود']
              : ['sms.ir جواب نداد', ...http];
      return {
        badge: detail.result === 'rejected' ? 'test_rejected' : null,
        text: [`«${keyName(detail.name)}» آزموده شد: `, ...result],
      };
    }
    case 'orders.assign': {
      // نام‌ها همان لحظه در جزئیات رویداد نشسته‌اند (۵٫۲): چاپخانه‌ای که بعداً نامش عوض شد، اینجا همان نام آن روز است.
      const from = (detail.from ?? null) as { name?: unknown } | null;
      const to = (detail.to ?? {}) as { name?: unknown };
      const why = str(detail.reason) ? `؛ ${str(detail.reason)}` : '';
      return {
        badge: null,
        text: from
          ? ['سفارش ', ...orderRef(detail), ` از «${str(from.name)}» به «${str(to.name)}» رفت${why}`]
          : ['سفارش ', ...orderRef(detail), ` به «${str(to.name)}» سپرده شد${why}`],
      };
    }
    case 'partners.create':
      return { badge: null, text: [`چاپخانهٔ «${str(detail.name)}» در ${str(detail.city)} افزوده شد`] };
    case 'partners.update': {
      const previous = (detail.previous ?? {}) as { name?: unknown; city?: unknown };
      const changed = Array.isArray(detail.changed) ? detail.changed : [];
      const parts = [
        ...(changed.includes('name') ? [`نام «${str(previous.name)}» ← «${str(detail.name)}»`] : []),
        ...(changed.includes('city') ? [`شهر ${str(previous.city)} ← ${str(detail.city)}`] : []),
      ];
      return { badge: null, text: [`چاپخانهٔ «${str(detail.name)}» ویرایش شد${parts.length ? `: ${parts.join('، ')}` : ''}`] };
    }
    case 'partners.default': {
      const previous = (detail.previous ?? null) as { name?: unknown } | null;
      return {
        badge: null,
        text: [`چاپخانهٔ «${str(detail.name)}» پیش‌فرض شد${previous ? `، به جای «${str(previous.name)}»` : ''}`],
      };
    }
    case 'partners.deactivate':
      return { badge: null, text: [`چاپخانهٔ «${str(detail.name)}» غیرفعال شد`] };
    case 'partners.activate':
      return { badge: null, text: [`چاپخانهٔ «${str(detail.name)}» دوباره فعال شد`] };
    case 'shipments.upload':
      return { badge: null, text: ['فایل پست ', { ltr: str(detail.filename) }, ' بارگذاری شد'] };
    case 'shipments.commit': {
      const handed = numbersOf(detail.handed);
      return {
        badge: null,
        text: [
          'فایل پست ',
          { ltr: str(detail.filename) },
          ' ثبت شد: ',
          ...commitCounts(detail),
          ...(handed.length > 0 ? ['؛ سفارش ', ...handed, ' تحویل پست شد'] : []),
        ],
      };
    }
    case 'shipments.discard':
      return { badge: null, text: ['فایل پست ', { ltr: str(detail.filename) }, ' دور انداخته شد'] };
    case 'shipments.revert': {
      const reopened = numbersOf(detail.reopened);
      return {
        badge: null,
        text: [
          'ورود ',
          { ltr: str(detail.filename) },
          ' برگشت: ',
          { ltr: String(typeof detail.voided === 'number' ? detail.voided : 0) },
          ' کد رهگیری کنار رفت',
          ...(reopened.length > 0 ? ['؛ سفارش ', ...reopened, ' به «در حال چاپ» برگشت'] : []),
          ...(str(detail.reason) ? [`؛ ${str(detail.reason)}`] : []),
        ],
      };
    }
    case 'shipments.approve':
    case 'shipments.assign': {
      // «همین است» و دادن دستی (۶٫۲): کد کدام سطر کدام فایل به کدام سفارش نشست، و اگر «تحویل پست شد» هم کرد، از کجا.
      const handed = detail.handed === true ? [`؛ ${statusOf(detail.from)} ← تحویل پست شد`] : [];
      return {
        badge: null,
        text: [
          'سطر ',
          ltrOf(detail.rowNo),
          ' فایل پست ',
          { ltr: str(detail.filename) },
          event.action === 'shipments.approve' ? ' با تأیید به سفارش ' : ' دستی به سفارش ',
          ...orderRef(detail),
          ' نشست',
          ...handed,
        ],
      };
    }
    case 'shipments.dismiss':
      return {
        badge: null,
        text: ['سطر ', ltrOf(detail.rowNo), ' فایل پست ', { ltr: str(detail.filename) }, ' کنار گذاشته شد («هیچ‌کدام»)'],
      };
    case 'shipments.void':
      return {
        badge: null,
        text: [
          'کد رهگیری سفارش ',
          ...orderRef(detail),
          ' کنار رفت',
          ...(detail.reopened === true ? ['؛ سفارش به «در حال چاپ» برگشت'] : []),
          ...(str(detail.reason) ? [`؛ ${str(detail.reason)}`] : []),
        ],
      };
    case 'shipments.sms_resend':
      // «دوباره بفرست» (۶٫۳): پیامک رهگیری کدام سفارش دوباره رفت یا باز نرفت.
      return {
        badge: null,
        text: ['پیامک رهگیری سفارش ', ...orderRef(detail), detail.outcome === 'sent' ? ' دوباره فرستاده شد و رفت' : ' دوباره فرستاده شد و باز نرفت'],
      };
    case 'orders.sms_resend':
      // «دوباره بفرست» پیامک پرداخت (۷٫۱؛ طرح: «پیامک پرداخت سفارش 10044 دوباره فرستاده شد»).
      return {
        badge: null,
        text: ['پیامک پرداخت سفارش ', ...orderRef(detail), detail.outcome === 'sent' ? ' دوباره فرستاده شد و رفت' : ' دوباره فرستاده شد و باز نرفت'],
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

/**
 * چیپ‌های صفحه: پیشوند کار. هر قدم پنل چیپ خودش را می‌آورد (سفارش از ۴٫۲، تعرفه ۴٫۵، تنظیمات و کلیدها ۴٫۶، چاپخانه‌ها ۵٫۲،
 * ارسال ۶٫۱)، به ترتیب طرح. جابه‌جایی چاپخانهٔ یک سفارش کار روی همان سفارش است، پس زیر «سفارش»؛ کارهای صف تأیید و کنار گذاشتن یک
 * کد (۶٫۲) زیر «ارسال»، هر چند هدفشان سفارش است (تصمیم ۸۷).
 */
export const EVENT_KINDS = [
  { kind: '', label: 'همه' },
  { kind: 'auth', label: 'ورود' },
  { kind: 'orders', label: 'سفارش' },
  { kind: 'shipments', label: 'ارسال' },
  { kind: 'tariff', label: 'تعرفه' },
  { kind: 'settings', label: 'تنظیمات و کلیدها' },
  { kind: 'partners', label: 'چاپخانه‌ها' },
  { kind: 'admins', label: 'ادمین‌ها' },
] as const;
