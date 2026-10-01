/**
 * سنجش یک تلاش پرداخت با درگاه خودش، زیر قفل `settle` (برش ۷٫۲، ADR-050): برگشت از درگاه و استعلام خودکار در وب، و «استعلام از درگاه» پنل،
 * همه همین. حکم مال `@jozveyar/payments` است (`judge`: استعلام پیش از `verify`، سؤال‌های ۱۴۴ تا ۱۴۷)؛ اینجا فقط درگاه همان پرداخت
 * (`payments.provider`، نه `.env` امروز)، مهلت تحویل به پست با تعطیلی‌ها، و نوشتن در همان تراکنش.
 *
 * استعلام خودکار تلاش‌های بسته‌ای را هم که پولشان شاید هنوز نزد درگاه است می‌پاید (`watchHeld`)، فقط برای «پول مشتری برمی‌گردد»؛ وضعیت
 * تلاش عوض نمی‌شود.
 */

import { judge, paymentErrorTag, type PaymentGateway } from '@jozveyar/payments';
import { postHandoffDue } from '@jozveyar/text';

import {
  PAYMENT_ATTEMPT_TTL_MS,
  type OrderStore,
  type PaymentLookup,
  type SettledPayment,
  type SettledVia,
  type Settlement,
} from './orders.js';
import { readSetting } from './reference.js';
import type { PaymentRow } from './orders.js';

export interface SettleWithInput {
  store: OrderStore;
  lookup: PaymentLookup;
  /** درگاه‌هایی که همین حالا در کارند، با نامشان (`payments.provider`). */
  gateways: Readonly<Record<string, PaymentGateway>>;
  via: SettledVia;
  now: () => Date;
  /** برگشت مرورگر مشتری (`returned_at`). */
  returned?: boolean;
  skipLocked?: boolean;
  log?: (message: string, error?: unknown) => void;
}

/**
 * «در حال بررسی» (برش ۷٫۲، سؤال ۱۳۰): تلاشی که پولش شاید گرفته شده و هنوز نهایی نیست: درگاه گفته «پرداخت‌شده» (یا `verify` در راه است)،
 * یا مشتری برگشت و درگاه جواب روشن نداد. تا نتیجه، نه «دوباره پرداخت کن» و نه تلاش تازه: پرداخت دوم پول دوم است. سایت و پنل هر دو همین.
 */
export function isChecking(payment: Pick<PaymentRow, 'status' | 'gatewayStatus' | 'gatewayError' | 'returnedAt'>): boolean {
  if (payment.status !== 'pending') return false;
  if (payment.gatewayStatus === 1 || payment.gatewayStatus === 2) return true;
  return payment.returnedAt !== null && payment.gatewayError !== null;
}

/** درگاه‌های در کار، برای `PaymentLookup`. */
export const providersOf = (gateways: Readonly<Record<string, PaymentGateway>>) => Object.keys(gateways);

export async function settleWith(input: SettleWithInput): Promise<SettledPayment | 'busy' | null> {
  const { store, gateways, now } = input;
  const holidays = new Set((await readSetting((key) => store.setting(key), 'calendar.holidays', input.log)).map((day) => day.date));
  return store.settle(
    input.lookup,
    async ({ payment, order }): Promise<Settlement> => {
      const gateway = gateways[payment.provider];
      if (!gateway) return { kind: 'pending', check: { status: payment.gatewayStatus, error: 'unconfigured', at: now() } };
      const verdict = await judge({
        gateway,
        attempt: {
          authority: payment.authority,
          amountRials: payment.amountRials,
          orderId: payment.gatewayOrderId,
          raw: payment.raw,
          createdAt: payment.createdAt,
          gatewayStatus: payment.gatewayStatus,
        },
        payable: order.status === 'awaiting_payment',
        ttlMs: PAYMENT_ATTEMPT_TTL_MS,
        now,
      });
      if (verdict.kind !== 'succeeded') return verdict;
      const paidAt = now();
      return { ...verdict, paidAt, postHandoffDueAt: postHandoffDue(paidAt, order.slaDays, holidays) };
    },
    { via: input.via, ...(input.returned ? { returned: now() } : {}), ...(input.skipLocked ? { skipLocked: true } : {}) },
  );
}

/** پاییدن پول یک تلاش بسته (پرداخت دوم، مهلت گذشته): فقط استعلام، و آنچه دانستیم؛ هرگز `verify`. */
export async function watchHeld(input: { store: OrderStore; payment: PaymentRow; gateway: PaymentGateway; now: () => Date }): Promise<number | null> {
  const { store, payment, gateway, now } = input;
  try {
    const seen = await gateway.inquire({
      authority: payment.authority,
      amountRials: payment.amountRials,
      orderId: payment.gatewayOrderId,
      raw: payment.raw,
    });
    await store.recordGatewayCheck(payment.id, { status: seen.status, error: null, at: now() });
    return seen.status;
  } catch (error) {
    await store.recordGatewayCheck(payment.id, { status: payment.gatewayStatus, error: paymentErrorTag(error), at: now() });
    return null;
  }
}
