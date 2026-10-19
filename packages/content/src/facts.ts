/**
 * مقدار امروز هر جای‌نگهدار (برش ۱۱٫۱، سؤال ۲۸۵)، از همان تعرفهٔ فعال و `settings`ی که سایت با آن قیمت می‌دهد و کار می‌کند. سایت (صفحه‌ها با
 * ISR) و پنل (پیش‌نمایش و «چه عوض می‌شود») هر دو از اینجا می‌سازندش، پس پیش‌نمایش همان است که سایت نشان می‌دهد.
 */

import type { FileRules, PriceList } from '@jozveyar/contracts';
import { DEFAULT_PAPER_SIZE } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { formatTomans } from '@jozveyar/text';

import type { PlaceholderValues } from './placeholders.js';

export interface ContentFacts {
  /** روز کاری تحویل به پست (`order.sla_days`). */
  slaDays: number;
  /** روزهای ماندن فایل آپلود، گرد به بالا (`file.retention_days`). */
  uploadDays: number;
  /** روزهای ماندن فایل‌های سفارش پس از پست یا لغو (`order.files_retention_days`). */
  orderFilesDays: number;
  formats: FileRules['formats'];
  /** نرخ هر روی A4 به ریال؛ دورو و یکرو. */
  rates: { bw: number; color: number; bwSingle: number; colorSingle: number };
  /** کمترین قیمت صحافی پیش‌فرض (طلق و سیم) در A4، ریال. */
  bindingFromRials: number;
  /** کمترین کرایهٔ روش پیش‌فرض (پست پیشتاز)، ریال. */
  shippingFromRials: number;
}

/** واقعیت‌ها از تعرفهٔ فعال و تنظیم‌ها؛ A4 و صحافی پیش‌فرض همیشه در تعرفه هستند (۸٫۳) و هرگز خاموش نمی‌شوند (۸٫۴). */
export function factsOf(input: {
  priceList: PriceList;
  slaDays: number;
  uploadDays: number;
  orderFilesDays: number;
  formats: FileRules['formats'];
}): ContentFacts {
  const { priceList } = input;
  const a4 = priceList.printRates[DEFAULT_PAPER_SIZE]!;
  const bands = priceList.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.bands[DEFAULT_PAPER_SIZE] ?? [];
  const shipping = priceList.shippingRates.filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID).map((rate) => rate.priceRials);
  return {
    slaDays: input.slaDays,
    uploadDays: input.uploadDays,
    orderFilesDays: input.orderFilesDays,
    formats: { ...input.formats },
    rates: { bw: a4.double.bw, color: a4.double.color, bwSingle: a4.single.bw, colorSingle: a4.single.color },
    bindingFromRials: bands.length > 0 ? Math.min(...bands.map((band) => band.priceRials)) : 0,
    shippingFromRials: shipping.length > 0 ? Math.min(...shipping) : 0,
  };
}

/** «PDF، Word، پاورپوینت یا عکس»؛ فقط PDF یعنی «فقط PDF». */
export function formatsText(formats: FileRules['formats']): string {
  const names = ['PDF', ...(formats.word ? ['Word'] : []), ...(formats.slides ? ['پاورپوینت'] : []), ...(formats.image ? ['عکس'] : [])];
  return names.length === 1 ? 'فقط PDF' : `${names.slice(0, -1).join('، ')} یا ${names.at(-1)}`;
}

export function placeholderValues(facts: ContentFacts): PlaceholderValues {
  const tomans = (rials: number) => formatTomans(rials, false);
  return {
    روز_کاری: String(facts.slaDays),
    روزهای_فایل: String(facts.uploadDays),
    روزهای_فایل_سفارش: String(facts.orderFilesDays),
    'فرمت‌ها': formatsText(facts.formats),
    نرخ_سیاه_سفید: tomans(facts.rates.bw),
    نرخ_سیاه_سفید_یکرو: tomans(facts.rates.bwSingle),
    نرخ_رنگی: tomans(facts.rates.color),
    نرخ_رنگی_یکرو: tomans(facts.rates.colorSingle),
    صحافی_از: tomans(facts.bindingFromRials),
    کرایه_از: tomans(facts.shippingFromRials),
  };
}
