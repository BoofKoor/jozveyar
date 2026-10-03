/**
 * مسیر خرید روی سایت در پنل (برش ۷٫۵، ADR-052؛ طرح `ad-live`، `st-live-open` و سطر وضعیت `m-dash-alerts`): نام مخاطب‌ها، فهرست آمادگی،
 * یادداشت اولین تکهٔ کم، «از امروز 10:40، سارا»، و سطر پیشخوان. خالص، تا تست بی پایگاه داده و بی ساعت واقعی بسنجدش. پیام‌ها فقط نام
 * تکه را دارند، هرگز مقدار؛ نام‌های لاتین (`.env`، `PAYMENT_PROVIDER`، …) تکهٔ `ltr` جدا، تا جملهٔ راست‌به‌چپ جابه‌جایشان نکند.
 */

import type { CheckoutAudience } from '@jozveyar/contracts';
import {
  CHECKOUT_AUDIENCE_SETTING,
  DEFAULT_SETTINGS,
  LIVE_CALLBACK_URL,
  SERVICE_KEYS,
  type AudienceChange,
  type CheckoutReadiness,
  type ReadinessPart,
  type ReadinessState,
} from '@jozveyar/db';
import { formatTehranTime } from '@jozveyar/text';

import { dayText } from './format';
import type { Seg } from './orders';
import type { CheckoutCardView } from './server/settings';
import { KEY_INFO } from './settings';

export const AUDIENCE_NAMES: Record<CheckoutAudience, string> = { paused: 'متوقف', preview: 'پیش‌نمایش مالک', everyone: 'همه' };

/** نام هر تکهٔ آمادگی در فهرست کارت (طرح `ad-need`). */
export const READINESS_LABELS: Record<ReadinessPart, string> = {
  PAYMENT_PROVIDER: 'درگاه زیبال',
  SMS_PROVIDER: 'پیامک sms.ir',
  PAYMENT_MERCHANT_ID: 'کد پذیرنده',
  SMS_API_KEY: 'کلید API',
  SMS_OTP_TEMPLATE: 'قالب کد تأیید',
  SMS_PAID_TEMPLATE: 'قالب پرداخت',
  SMS_TRACKING_TEMPLATE: 'قالب رهگیری',
  PAYMENT_CALLBACK_URL: 'نشانی برگشت https',
  DATABASE_URL: 'پایگاه داده',
  SESSION_SECRET: 'رمز نشست سایت',
};

/** حال هر تکه برای صفحه‌خوان (طرح: «، آماده»، «، خالی»). */
export const READINESS_STATES: Record<ReadinessState, string> = {
  ok: 'آماده',
  empty: 'خالی',
  other: 'چیز دیگری خواسته شده',
  unreadable: 'خوانده نشد',
  malformed: 'شکل درستی ندارد',
};

/** پایگاه داده و رمز نشست در طرح نیستند: پنلی که بالا آمده هر دو را دارد؛ فقط وقتی کم‌اند دیده می‌شوند. */
const HIDDEN_WHEN_OK: ReadonlySet<ReadinessPart> = new Set(['DATABASE_URL', 'SESSION_SECRET']);

/** فهرست آمادگی کارت: هشت تکهٔ طرح به ترتیب، و پایگاه داده و رمز نشست فقط وقتی درست نیستند. */
export function needList(readiness: CheckoutReadiness) {
  return readiness.parts
    .filter(({ part, state }) => state !== 'ok' || !HIDDEN_WHEN_OK.has(part))
    .map(({ part, state }) => ({ part, label: READINESS_LABELS[part], ok: state === 'ok', state: READINESS_STATES[state] }));
}

/** تکه‌ای که کلید پنل است؛ قالب پیامک چاپخانه (۷٫۶) کلید هست ولی تکهٔ آمادگی نیست. */
const isKey = (part: ReadinessPart): part is (typeof SERVICE_KEYS)[number] & ReadinessPart => (SERVICE_KEYS as readonly string[]).includes(part);

/** اولین تکه‌ای که درست نیست، به ترتیب کارت. */
export function firstGap(readiness: CheckoutReadiness) {
  const gap = readiness.parts.find((part) => part.state !== 'ok');
  return gap ? { part: gap.part, state: gap.state as Exclude<ReadinessState, 'ok'> } : null;
}

/**
 * چه کم است، با نام کلید پنل یا نام `.env`؛ هرگز مقدار: «"شناسهٔ قالب پیامک رهگیری" خالی است»، «PAYMENT_PROVIDER زیبال (zibal) نیست».
 * همان معنی `readinessReason` لاگ، با برچسب پنل برای کلیدها.
 */
export function gapSegs(part: ReadinessPart, state: Exclude<ReadinessState, 'ok'>): Seg[] {
  if (isKey(part)) {
    const label = `«${KEY_INFO[part].label}»`;
    if (state === 'unreadable') return [`${label} پنل با `, { ltr: 'SECRETS_KEY' }, ' امروز خوانده نشد'];
    if (state === 'malformed') return [`${label} شکل درستی ندارد`];
    return [`${label} خالی است`];
  }
  switch (part) {
    case 'PAYMENT_PROVIDER':
      return [{ ltr: 'PAYMENT_PROVIDER' }, ' زیبال (', { ltr: 'zibal' }, ') نیست'];
    case 'SMS_PROVIDER':
      return [{ ltr: 'SMS_PROVIDER' }, ' پیامک sms.ir (', { ltr: 'smsir' }, ') نیست'];
    case 'PAYMENT_CALLBACK_URL':
      return state === 'empty'
        ? [{ ltr: 'PAYMENT_CALLBACK_URL' }, ' خالی است']
        : [{ ltr: 'PAYMENT_CALLBACK_URL' }, ' دقیقاً ', { ltr: LIVE_CALLBACK_URL }, ' نیست'];
    case 'SESSION_SECRET':
      return [{ ltr: 'SESSION_SECRET' }, ' نیست یا کوتاه است'];
    default:
      return ['پایگاه داده نیست'];
  }
}

/**
 * یادداشت کارت «آماده نیست» (طرح): کلید پنل «پایین‌تر واردش کن» و همان لحظه آماده می‌شود؛ بقیه فقط در `.env` سرور. `live` که خواسته
 * نشده، همان را می‌گوید.
 */
export function gapNote(readiness: CheckoutReadiness, audience: CheckoutAudience): Seg[] | null {
  if (!readiness.requested) {
    return ['مسیر خرید واقعی فقط با ', { ltr: 'CHECKOUT_MODE=live' }, ' در ', { ltr: '.env' }, ' سرور روشن می‌شود؛ تا آن موقع مخاطب اثری ندارد.'];
  }
  const gap = firstGap(readiness);
  if (!gap) return null;
  if (!isKey(gap.part)) return [...gapSegs(gap.part, gap.state), '؛ در ', { ltr: '.env' }, ' سرور درستش کن و بعد وب و پنل را دوباره بالا بیاور.'];
  const test = KEY_INFO[gap.part].kind === 'template' ? ' و پیامک آزمایشی بگیر' : ' و بیازما';
  return [...gapSegs(gap.part, gap.state), `. پایین‌تر واردش کن${test}؛ مسیر خرید همان لحظه آماده می‌شود، با مخاطب «${AUDIENCE_NAMES[audience]}».`];
}

const DEFAULT_AUDIENCE = DEFAULT_SETTINGS[CHECKOUT_AUDIENCE_SETTING];

/**
 * «از امروز 10:40، سارا»، و برای پلهٔ بالا «، با کد تازه»، اگر آخرین تغییر همین مخاطب امروز را گذاشت. مخاطب پیش‌فرضی که هرگز عوض نشده
 * «پیش‌فرض پس از استقرار»؛ مخاطبی که بیرون از پنل عوض شد هیچ.
 */
export function sinceSegs(since: AudienceChange | null, audience: CheckoutAudience, now: Date): Seg[] | null {
  if (!since) return audience === DEFAULT_AUDIENCE ? ['پیش‌فرض پس از استقرار'] : null;
  if (since.to !== audience) return null;
  return [`از ${dayText(since.at, now)} `, { num: formatTehranTime(since.at) }, since.by ? `، ${since.by}` : '', since.fresh ? '، با کد تازه' : ''];
}

/** نام هر حالت کارت در `data-state`: آماده، خاموش (live خواسته شد ولی چیزی کم است، یا `off`)، یا درگاه نمونه. */
export function cardState(view: Pick<CheckoutCardView, 'mode' | 'readiness'>): 'ready' | 'off' | 'mock' {
  if (view.readiness.ready) return 'ready';
  return view.mode === 'mock' ? 'mock' : 'off';
}

/** سطر وضعیت پیشخوان (سؤال ۱۴۰، طرح `m-dash-alerts`): یکی از سه، و وقتی برای همه باز است هیچ. */
export interface LiveAlert {
  kind: 'off' | 'paused' | 'preview';
  tone: 'error' | 'warning' | 'info';
  /** متن پررنگ اول. */
  head: string;
  /** بقیهٔ جمله، با نقطهٔ پایانش. */
  text: Seg[];
  /** پیوند به کارت «مسیر خرید روی سایت»، فقط برای مالک. */
  link: string;
}

export function liveAlert(view: CheckoutCardView | null, now: Date): LiveAlert | null {
  if (!view?.readiness.requested) return null;
  const gap = firstGap(view.readiness);
  if (gap) {
    return {
      kind: 'off',
      tone: 'error',
      head: 'مسیر خرید خاموش است:',
      text: [' در ', { ltr: '.env' }, ' «live» خواسته شد، ولی ', ...gapSegs(gap.part, gap.state), '.'],
      link: 'چه کم است',
    };
  }
  if (view.audience === 'everyone') return null;
  if (view.audience === 'preview') {
    return {
      kind: 'preview',
      tone: 'info',
      head: 'مسیر خرید: پیش‌نمایش مالک.',
      text: [' فقط مرورگری که پیوند پیش‌نمایش را باز کرد سفارش می‌دهد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند.'],
      link: 'باز برای همه',
    };
  }
  const since = sinceSegs(view.since, view.audience, now);
  return {
    kind: 'paused',
    tone: 'warning',
    head: 'مسیر خرید متوقف است',
    text: [...(since ? [' ', ...since] : []), ': سفارش تازه نمی‌آید؛ برگشت از درگاه و استعلام کار می‌کنند.'],
    link: 'باز کردن',
  };
}
