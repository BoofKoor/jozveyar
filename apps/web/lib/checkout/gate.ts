/**
 * جزوه آمادهٔ سفارش است؟ (۳ج) — خالص، بی React.
 *
 * قیمت مرورگر پیش‌فاکتور است؛ سفارش فقط با سندهایی ساخته می‌شود که روی سرور رسیده‌اند و سرور خودش
 * شمرده (قاعدهٔ ۲، ADR-034). پس «ادامه — آدرس و تحویل» تا رسیدن همهٔ فایل‌ها و پایان بررسی سرور صبر
 * می‌کند؛ کارت «جزوهٔ تو» همان‌جا «در حال ارسال فایل · 42%» را نشان می‌دهد. فایلی که به سرور نرسید بن‌بست
 * نیست: پیامش و راه جلو («دوباره بفرست»).
 */

import type { CheckoutItem } from '@jozveyar/contracts/checkout';

import type { JozveView, SectionView } from '../jozveView';
import type { OrderConfig } from '../orderConfig';

export type OrderGate =
  /** همه روی سرور و شمرده؛ همین قلم به مسیر خرید می‌رود. */
  | { kind: 'ready'; items: CheckoutItem[] }
  /** فایلی هنوز در راه سرور است، یا سرور هنوز بررسی‌اش می‌کند. */
  | { kind: 'sending' }
  /** فایلی به سرور نرسید یا سرور نتوانست بخواندش. */
  | { kind: 'stuck'; sections: SectionView[] };

export function orderGate(view: JozveView, config: OrderConfig): OrderGate {
  const stuck = view.included.filter((s) => !s.serverReady && (s.uploadRefused || s.serverFailed));
  if (stuck.length > 0) return { kind: 'stuck', sections: stuck };
  if (view.included.length === 0 || view.included.some((s) => !s.serverReady || !s.documentId)) return { kind: 'sending' };
  return {
    kind: 'ready',
    items: [
      {
        documentIds: view.included.map((s) => s.documentId!),
        colorMode: config.colorMode,
        paperTypeId: config.paperTypeId,
        sidesMode: config.sidesMode,
        bindingTypeId: config.bindingTypeId,
        copies: config.copies,
      },
    ],
  };
}

/** رد آپلودی که تلاش دوباره عوضش نمی‌کند: فایل خودش مشکل دارد (حجم، نوع). */
export function retryable(section: SectionView): boolean {
  const reason = section.upload?.reason;
  return !(section.uploadRefused && (reason === 'too_large' || reason === 'unsupported_type'));
}
