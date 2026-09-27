/**
 * تعرفهٔ صفحه، در HTML و در مرورگر (برش ۴٫۴، ADR-040).
 *
 * صفحهٔ اصلی تعرفهٔ فعال پایگاه داده و روز کاری تحویل به پست را به JSON درون HTML می‌گذارد (`<script
 * type="application/json">`، که اجرا نمی‌شود)، و رابط پس از فایل همان را برای `quote()` می‌خواند: پیش‌فاکتور مرورگر همان
 * عددی است که سرور حساب می‌کند، حتی پس از ویرایش تعرفه در پنل (قاعدهٔ ۱ و ۲). نه fetch پس از بار صفحه: درخواستی در راه
 * اولین قیمت می‌گذاشت.
 *
 * پوسته (باندل اولیه) این را نمی‌خواند؛ فقط رابط پس از فایل و تکه‌های بعدش (مسیر خرید، برگرداندن بعد از رفرش).
 */

import type { PriceList } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

export interface SiteTariff {
  priceList: PriceList;
  /** روز کاری تا تحویل به پست (`order.sla_days`، ADR-013). */
  slaDays: number;
}

/**
 * تعرفهٔ پایه: build، بی پایگاه داده، و صفحه‌ای که JSONش نبود یا خراب بود. روز کاری همان پیش‌فرض `order.sla_days` است
 * (`DEFAULT_SETTINGS` در `@jozveyar/db`، ADR-013) و تست برابری‌شان را قفل کرده. اینجا نوشته شده، نه در
 * `@jozveyar/contracts/constants`: آن ماژول در باندل اولیه است و هر خروجی به‌کاررفته‌اش همان‌جا می‌ماند (۱۴ بایت، سنجیده).
 */
export const SEED_TARIFF: SiteTariff = { priceList: SEED_PRICE_LIST, slaDays: 2 };

/** شناسهٔ `<script type="application/json">` تعرفه در HTML صفحهٔ اصلی. */
export const TARIFF_ELEMENT_ID = 'jy-tariff';

/**
 * JSON درون `<script>`. هر `<` به `<`، که JSON.parse همان را برمی‌گرداند: نام‌های تعرفه از ۴٫۵ دست ادمین است و
 * `</script>` یا `<!--` درونشان نباید HTML را ببندد.
 */
export function tariffJson(tariff: SiteTariff): string {
  return JSON.stringify(tariff).replace(/</g, '\\u003c');
}

/**
 * JSON صفحه به تعرفه؛ نبود یا خراب، تعرفهٔ پایه، تا صفحه قیمت بدهد (بی بن‌بست). اگر آن عدد با سرور نخواند، مسیر خرید
 * عدد سرور را نشان می‌دهد (قاعدهٔ ۲).
 */
export function parseTariff(text: string | null | undefined): SiteTariff {
  if (!text) return SEED_TARIFF;
  try {
    const value = JSON.parse(text) as Partial<SiteTariff> | null;
    if (value && typeof value.slaDays === 'number' && typeof value.priceList?.version === 'number') return value as SiteTariff;
  } catch {
    // پایین
  }
  return SEED_TARIFF;
}

/** تعرفهٔ همین صفحه، از HTML خودش. */
export function pageTariff(): SiteTariff {
  return parseTariff(typeof document === 'undefined' ? null : document.getElementById(TARIFF_ELEMENT_ID)?.textContent);
}
