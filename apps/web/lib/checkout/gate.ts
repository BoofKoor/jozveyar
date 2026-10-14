/**
 * جزوه آمادهٔ سفارش است؟ (۳ج) — خالص، بی React.
 *
 * قیمت مرورگر پیش‌فاکتور است؛ سفارش فقط با سندهایی ساخته می‌شود که روی سرور رسیده‌اند و سرور خودش
 * شمرده (قاعدهٔ ۲، ADR-034). پس «ادامه — آدرس و تحویل» تا رسیدن همهٔ فایل‌ها و پایان بررسی سرور صبر
 * می‌کند؛ کارت «جزوهٔ تو» همان‌جا «در حال ارسال فایل · 42%» را نشان می‌دهد. فایلی که به سرور نرسید بن‌بست
 * نیست: پیامش و راه جلو («دوباره بفرست»).
 */

import type { CheckoutItem } from '@jozveyar/contracts/checkout';

import type { JozvePart, SectionView } from '../jozveView';

export type OrderGate =
  /** همه روی سرور و شمرده؛ همین قلم‌ها، یکی برای هر جزوه، به مسیر خرید می‌روند. */
  | { kind: 'ready'; items: CheckoutItem[] }
  /** فایلی هنوز در راه سرور است، یا سرور هنوز بررسی‌اش می‌کند. */
  | { kind: 'sending' }
  /** فایلی به سرور نرسید یا سرور نتوانست بخواندش. */
  | { kind: 'stuck'; sections: SectionView[] }
  /** جزوه بعد از رفرش برگشت و فایلی منتظر انتخاب دوباره است (۳د)؛ سفارش بی آن فصل ساخته نمی‌شود. */
  | { kind: 'waiting' }
  /** فایلی خوانده نشد (ADR-030)؛ پیام و راه جلویش در کارت همان فایل است. */
  | { kind: 'blocked' };

/**
 * «همه روی سرور و شمرده» یعنی **همهٔ** فایل‌های **همهٔ** جزوه‌ها، نه فقط آنها که در قیمت‌اند: فایلی که منتظر انتخاب دوباره
 * است، خوانده نشد یا هنوز شمرده نشده، در `included` نیست، ولی سفارش بی آن فصل ساخته نمی‌شود. رابط «ادامه» را برای همین‌ها
 * جدا می‌بندد؛ برگشت بعد از رفرش (۳د) فقط به همین دروازه تکیه دارد. یک قلم برای هر جزوه، به ترتیب جزوه‌ها (برش ۸٫۲).
 */
export function orderGate(parts: readonly JozvePart[]): OrderGate {
  const views = parts.map((part) => part.view);
  if (views.some((view) => view.waiting.length > 0)) return { kind: 'waiting' };
  if (views.some((view) => view.blocked.length > 0)) return { kind: 'blocked' };
  const stuck = views.flatMap((view) => view.included.filter((s) => !s.serverReady && (s.uploadRefused || s.serverFailed)));
  if (stuck.length > 0) return { kind: 'stuck', sections: stuck };
  const sending = (view: JozvePart['view']) =>
    view.pending.length > 0 || view.included.length === 0 || view.included.some((s) => !s.serverReady || !s.documentId);
  if (views.length === 0 || views.some(sending)) return { kind: 'sending' };
  return {
    kind: 'ready',
    items: parts.map(({ view, config }) => ({
      documentIds: view.included.map((s) => s.documentId!),
      colorMode: config.colorMode,
      paperTypeId: config.paperTypeId,
      sidesMode: config.sidesMode,
      bindingTypeId: config.bindingTypeId,
      copies: config.copies,
    })),
  };
}

/** رد آپلودی که تلاش دوباره عوضش نمی‌کند: فایل خودش مشکل دارد (حجم، نوع). */
export function retryable(section: SectionView): boolean {
  const reason = section.upload?.reason;
  return !(section.uploadRefused && (reason === 'too_large' || reason === 'unsupported_type'));
}
