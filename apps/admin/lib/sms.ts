/**
 * پیامک رهگیری در پنل (برش ۶٫۳، ADR-047؛ طرح `m-order-shipped` و `m-ship-done`): ردیف «پیامک» کارت «بستهٔ پستی» و سطر صفحهٔ ورود،
 * شمار پیامک‌های یک ورود، و فهرست پیامک‌گرفته‌ها در صفحهٔ برگرداندن. خالص؛ حال هر پیامک همان `smsState` از `@jozveyar/sms`، که
 * «دوباره بفرست» سرور هم با آن می‌سنجد.
 */

import type { ShipmentSms } from '@jozveyar/db';
import { parseSmsErrorTag, resendable, smsState, type SmsErrorCode, type SmsState } from '@jozveyar/sms';

import { whenText } from './format';
import { phoneText, type Seg } from './orders';

/** علت «نرفت» به زبان ادمین؛ کد ناشناس همان «جواب نداد». از ۷٫۱ با عدد پاسخ sms.ir (`rejected:401`) و «کلید خالی». */
const SMS_ERRORS: Record<SmsErrorCode, string> = {
  unavailable: 'پنل پیامک جواب نداد',
  rejected: 'پنل پیامک نپذیرفت',
  interrupted: 'فرستادنش نیمه‌کاره ماند',
  unconfigured: 'کلید API یا شناسهٔ قالب sms.ir خالی است یا خوانده نشد',
};

/** علت «نرفت» یک ردیف: «پنل پیامک نپذیرفت (کد 401).»؛ منتظرِ مانده «نیمه‌کاره ماند». */
function whyNot(sms: ShipmentSms): string {
  if (sms.status === 'pending') return `${SMS_ERRORS.interrupted}.`;
  const { code, number } = parseSmsErrorTag(sms.error);
  return number === null ? `${SMS_ERRORS[code]}.` : `${SMS_ERRORS[code]} (کد ${number}).`;
}

export interface SmsView {
  /** `none`: مرسولهٔ پیش از ۶٫۳، بی پیامک. */
  state: SmsState | 'none';
  text: Seg[];
  /** «دوباره بفرست» (مالک و متصدی). */
  resendable: boolean;
  /** همین کد پیش‌تر برای همین سفارش پیامک شد (سؤال ۶۷): ردیف پیامک پیش از خود مرسوله ساخته شده. */
  earlier: boolean;
}

export function smsView(sms: ShipmentSms | null, shipmentCreatedAt: Date, now: Date): SmsView {
  if (!sms) return { state: 'none', text: ['پیش از پیامک رهگیری ثبت شد؛ پیامکی نرفت.'], resendable: false, earlier: false };
  const state = smsState(sms, now);
  const to: Seg = { num: phoneText(sms.toMobile) };
  const earlier = sms.createdAt.getTime() < shipmentCreatedAt.getTime();
  const text: Seg[] =
    state === 'sent'
      ? ['به ', to, ` رفت، ${whenText(sms.sentAt ?? sms.createdAt, now)}`, ...(earlier ? [' (همین کد، پیش‌تر)'] : [])]
      : state === 'sending'
        ? ['در حال فرستادن به ', to, '…']
        : state === 'unknown'
          ? ['معلوم نیست به ', to, ' رفت یا نه: فرستادنش نیمه‌کاره ماند. شاید رفته باشد.']
          : ['به ', to, ` نرفت: ${whyNot(sms)}`];
  return { state, text, resendable: resendable(state), earlier };
}

/** شمار پیامک کدهای زندهٔ یک ورود: «پیامک: 8 رفت، 1 نرفت.» (طرح)؛ در راه جدا. */
export function smsCounts(items: readonly { sms: ShipmentSms | null; createdAt: Date; voidedAt: Date | null }[], now: Date) {
  const live = items.filter((item) => item.voidedAt === null && item.sms);
  const states = live.map((item) => smsState(item.sms!, now));
  return {
    sent: states.filter((s) => s === 'sent').length,
    failed: states.filter((s) => s === 'failed' || s === 'unknown').length,
    sending: states.filter((s) => s === 'sending').length,
  };
}

export function smsCountsText(counts: { sent: number; failed: number; sending: number }): Seg[] {
  const parts: Seg[][] = [];
  if (counts.sent > 0) parts.push([{ num: String(counts.sent) }, ' رفت']);
  if (counts.failed > 0) parts.push([{ num: String(counts.failed) }, ' نرفت']);
  if (counts.sending > 0) parts.push([{ num: String(counts.sending) }, ' در راه']);
  if (parts.length === 0) return [];
  return ['پیامک: ', ...parts.flatMap((part, i) => (i === 0 ? part : ['، ', ...part])), '.'];
}

/** سفارش‌هایی که پیامک کد زنده‌شان رفت (صفحهٔ برگرداندن: «پیامکی که رفت برنمی‌گردد»)، کوچک‌ترین اول. */
export function smsReached(items: readonly { orderNumber: number; sms: ShipmentSms | null; voidedAt: Date | null }[], now: Date): number[] {
  return [...new Set(items.filter((item) => item.voidedAt === null && item.sms && smsState(item.sms, now) === 'sent').map((item) => item.orderNumber))].sort(
    (a, b) => a - b,
  );
}

/**
 * یادداشت پیامک زیر سطر قطعی صفحهٔ ورود (طرح `m-ship-done`: «پیامک نرفت: پنل پیامک جواب نداد.» با «دوباره بفرست»)؛ پیامکی که رفت
 * یادداشت ندارد (شمارش بالای گروه هست)، و کد پیامک‌شدهٔ ۶۷ می‌گوید چرا پیامک تازه نرفت.
 */
export function smsRowNote(sms: ShipmentSms | null, shipmentCreatedAt: Date, now: Date): { text: string; failed: boolean; resendable: boolean } | null {
  if (!sms) return null;
  const view = smsView(sms, shipmentCreatedAt, now);
  if (view.state === 'sent') return view.earlier ? { text: 'پیامک همین کد پیش‌تر برای همین سفارش رفته بود؛ دوباره نرفت.', failed: false, resendable: false } : null;
  if (view.state === 'sending') return { text: 'پیامک در راه است…', failed: false, resendable: false };
  if (view.state === 'unknown') return { text: 'معلوم نیست پیامک رفت یا نه: فرستادنش نیمه‌کاره ماند.', failed: true, resendable: true };
  return { text: `پیامک نرفت: ${whyNot(sms)}`, failed: true, resendable: true };
}

/**
 * ردیف «پیامک پرداخت» کارت «پرداخت‌ها» (برش ۷٫۱، طرح `ad-paysms`): «به 0915 234 5678 رفت، شنبه 14:05»، یا «نرفت: …» با «دوباره بفرست»
 * (مالک و متصدی) وقتی سفارش هنوز در صف چاپ یا در حال چاپ است. پرداخت پیش از ۷٫۱ پیامکش را بی ردیف منتظر فرستاده بود: هیچ.
 */
export function paymentSmsView(sms: ShipmentSms | null, orderOpen: boolean, now: Date): { state: SmsState; text: Seg[]; resendable: boolean } | null {
  if (!sms) return null;
  const state = smsState(sms, now);
  const to: Seg = { num: phoneText(sms.toMobile) };
  const at = whenText(sms.attemptedAt ?? sms.createdAt, now);
  const text: Seg[] =
    state === 'sent'
      ? ['به ', to, ` رفت، ${whenText(sms.sentAt ?? sms.createdAt, now)}`]
      : state === 'sending'
        ? ['در حال فرستادن به ', to, '…']
        : state === 'unknown'
          ? ['معلوم نیست به ', to, ` رفت یا نه: فرستادنش نیمه‌کاره ماند، ${at}.`]
          : [`نرفت: ${whyNot(sms).replace(/\.$/, '')}، ${at}`];
  return { state, text, resendable: orderOpen && resendable(state) };
}
