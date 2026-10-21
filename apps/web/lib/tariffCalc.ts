/**
 * ماشین‌حساب «تعرفه» (برش ۱۵٫۲، سؤال ۴۵۸): خواندن «چند صفحه؟» و جزوهٔ `quote()`، خالص، تا تست بی مرورگر بسنجدشان؛ رسم در
 * `components/TariffCalc.tsx`.
 */

import type { OrderSpec } from '@jozveyar/contracts';
import { wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { toLatinDigits } from '@jozveyar/text';

import type { OrderConfig } from './orderConfig';

/** «چند صفحه؟» به عدد: ارقام فارسی و جداکنندهٔ هزارگان و فاصله پذیرفته؛ بیرون از ۱ تا سقف، یا هر چیز دیگر، null. */
export function readPages(text: string, maxPages: number): number | null {
  const digits = toLatinDigits(text).replace(/[\s,،٬]/g, '');
  if (!/^\d{1,6}$/.test(digits)) return null;
  const pages = Number(digits);
  return pages >= 1 && pages <= maxPages ? pages : null;
}

/**
 * جزوهٔ ماشین‌حساب برای `quote()`: یک جزوه با یک قاعدهٔ رنگ برای همه (رنگ هر صفحه خاموش است، قاعدهٔ ۵)، مثل میز سفارش؛ با منطقه، با کرایهٔ
 * پست پیشتاز همان منطقه.
 */
export function calcSpec(config: OrderConfig, pages: number, zoneId: string | null): OrderSpec {
  return {
    items: [
      {
        sections: [{ documentId: 'calc', pageCount: pages }],
        rules: wholeDocumentRule(pages, config.colorMode, config.paperTypeId),
        copies: config.copies,
        sidesMode: config.sidesMode,
        paperSize: config.paperSize,
        bindingTypeId: config.bindingTypeId,
      },
    ],
    shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
  };
}
