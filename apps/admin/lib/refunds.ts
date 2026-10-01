/**
 * بازپرداخت سفارش لغوشده به زبان پنل (برش ۷٫۳، ADR-051؛ طرح پنل `m-refund`، `m-refund-manual`، `m-refunding`، `m-refunded` و
 * `m-refund-failed`): حالت کارت «بازپرداخت»، کارمزد، روز و کد پیگیری دستی، و متن هر رد درگاه. خالص و بی JSX، مثل `orders.ts`.
 */

import { isLiveRefund, refundInquirable, refundUnknown, type PanelOrderDetails, type PanelPayment, type PanelRefund } from '@jozveyar/db';
import { gatewayName, type RefundRejection } from '@jozveyar/payments';
import { parseJalaliNumeric, tehranDayStart, toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

/** حالت کارت: پول برنگشته، در حال برگشت، معلوم نیست (درخواست بی جواب روشن)، برگشت داده شد، یا برنگشت (رد درگاه). */
export type RefundState = 'none' | 'refunding' | 'unknown' | 'refunded' | 'failed';

export interface RefundCard {
  state: RefundState;
  /** پرداخت موفق سفارش، که کل مبلغش برمی‌گردد (نسخهٔ اول، ADR-051). */
  payment: PanelPayment;
  /** آخرین بازپرداخت همین پرداخت؛ null یعنی هنوز هیچ. */
  latest: PanelRefund | null;
  /** آنچه فرم با خود می‌برد («همان که دیده شد»): شناسهٔ آخرین بازپرداخت، یا خالی. */
  seen: string;
}

/** کارت «بازپرداخت»: فقط سفارش «لغو شد» با پرداخت موفق؛ بقیه هیچ. */
export function refundCard(details: PanelOrderDetails): RefundCard | null {
  if (details.order.status !== 'cancelled') return null;
  const payment = details.payments.find((row) => row.status === 'succeeded');
  if (!payment) return null;
  const latest = details.refunds.find((refund) => refund.paymentId === payment.id) ?? null;
  const state: RefundState = !latest
    ? 'none'
    : latest.status === 'succeeded'
      ? 'refunded'
      : latest.status === 'failed'
        ? 'failed'
        : refundUnknown(latest)
          ? 'unknown'
          : 'refunding';
  return { state, payment, latest, seen: latest?.id ?? '' };
}

/** بازپرداخت زنده (در جریان یا برگشت‌داده‌شده): سفارش از «لغو شد» برنمی‌گردد. */
export const hasLiveRefund = (details: PanelOrderDetails) => details.refunds.some(isLiveRefund);

/** «استعلام از درگاه» این بازپرداخت معنا دارد: در جریان و درخواستش دیگر در راه نیست. */
export const refundAskable = (refund: PanelRefund | null, at: Date) => refund !== null && refundInquirable(refund, at);

/** علت رد درگاه، به زمان حال برای کارت («موجودی کیف پول کافی نیست»). */
export function rejectionNow(reason: string | null, provider: string, result: number | null): string {
  const name = gatewayName(provider);
  switch (reason as RefundRejection | null) {
    case 'balance':
      return 'موجودی کیف پول کافی نیست';
    case 'ip':
      return `IP این سرور در پنل ${name} ثبت نیست`;
    case 'token':
      return 'توکن API درست نیست یا دسترسی بازپرداخت ندارد';
    case 'unconfigured':
      return 'توکن API در «تنظیمات» نیست یا خوانده نشد، پس درخواست نرفت';
    case 'not_found':
      return `${name} چنین درخواستی نگرفته بود؛ پاسخ درخواست گم شده بود`;
    default:
      return result !== null ? `کد ${result}` : 'علتی نگفت';
  }
}

/** همان علت، به زمان گذشته برای رویدادهای سفارش («موجودی کیف پول زیبال کافی نبود»). */
export function rejectionPast(reason: string | null, provider: string, result: number | null): string {
  const name = gatewayName(provider);
  switch (reason as RefundRejection | null) {
    case 'balance':
      return `موجودی کیف پول ${name} کافی نبود`;
    case 'ip':
      return `IP سرور در پنل ${name} ثبت نبود`;
    case 'token':
      return `توکن API ${name} پذیرفته نشد`;
    case 'unconfigured':
      return 'توکن API نبود و درخواست نرفت';
    case 'not_found':
      return `درخواست به ${name} نرسیده بود`;
    default:
      return result !== null ? `کد ${result}` : 'بی علت روشن';
  }
}

/** عدد `rejected:<عدد>` برچسب خطای ردیف، برای ردِ `other`. */
export function rejectionResult(tag: string | null): number | null {
  const match = /^rejected:(-?\d{1,9})$/.exec(tag ?? '');
  return match ? Number(match[1]) : null;
}

/** چه چیزی راه درگاه را بست، برای رویدادهای سفارش. */
export const REFUND_VIA: Record<string, string> = { auto: 'درگاه، استعلام خودکار', panel: 'درگاه، استعلام از پنل' };

/** «چطور برگشت» دستی: حداکثر این‌قدر. */
export const REFUND_NOTE_MAX = 200;

export type ManualRefundField = 'day' | 'reference' | 'note';

/**
 * فرم «ثبت بازپرداخت دستی»: روز برگشت (شمسی، رقم فارسی هم)، از روز پرداخت تا امروز؛ کد پیگیری بانک، بی فاصله و خط تیره‌ای که رقم‌ها را
 * جدا کرده باشد؛ و «چطور برگشت» اختیاری. هر خطا با فیلدش.
 */
export function readManualRefund(
  input: { day: unknown; reference: unknown; note: unknown },
  bounds: { paidAt: Date; at: Date },
):
  | { ok: true; value: { refundedOn: Date; reference: string; note: string | null } }
  | { ok: false; field: ManualRefundField; error: 'refund_day_invalid' | 'refund_day_future' | 'refund_day_early' | 'refund_reference_invalid' | 'refund_note_too_long' } {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const day = parseJalaliNumeric(toLatinDigits(text(input.day)).replace(/[-.]/g, '/').trim());
  if (!day) return { ok: false, field: 'day', error: 'refund_day_invalid' };
  if (day.getTime() > tehranDayStart(bounds.at).getTime()) return { ok: false, field: 'day', error: 'refund_day_future' };
  if (day.getTime() < tehranDayStart(bounds.paidAt).getTime()) return { ok: false, field: 'day', error: 'refund_day_early' };
  const reference = toLatinDigits(text(input.reference)).replace(/\s+/g, '');
  if (!/^[0-9A-Za-z-]{3,40}$/.test(reference)) return { ok: false, field: 'reference', error: 'refund_reference_invalid' };
  const note = tidyInputFa(text(input.note));
  if (note.length > REFUND_NOTE_MAX) return { ok: false, field: 'note', error: 'refund_note_too_long' };
  return { ok: true, value: { refundedOn: day, reference, note: note || null } };
}
