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

import type { CatalogPaused, PriceList } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

export interface SiteTariff {
  priceList: PriceList;
  /** روز کاری تا تحویل به پست (`order.sla_days`، ADR-013). */
  slaDays: number;
  /**
   * گزینه‌های همین تعرفه که موقتاً در دسترس نیستند (برش ۸٫۴، سؤال ۱۸۸): `catalog.paused` پس از `pausedOf` سرور، پس فقط آنچه این
   * تعرفه ارائه می‌کند و هرگز پیش‌فرض‌ها. صفحه هر ۶۰ ثانیه با ISR تازه می‌شود؛ سرور مسیر خرید همین لحظه را می‌سنجد.
   */
  paused: CatalogPaused;
}

/** هیچ گزینه‌ای خاموش نیست. */
export const NONE_PAUSED: CatalogPaused = { sizes: [], papers: [], bindings: [] };

/**
 * تعرفهٔ پایه: build، بی پایگاه داده، و صفحه‌ای که JSONش نبود یا خراب بود. روز کاری همان پیش‌فرض `order.sla_days` است
 * (`DEFAULT_SETTINGS` در `@jozveyar/db`، ADR-013) و تست برابری‌شان را قفل کرده. اینجا نوشته شده، نه در
 * `@jozveyar/contracts/constants`: آن ماژول در باندل اولیه است و هر خروجی به‌کاررفته‌اش همان‌جا می‌ماند (۱۴ بایت، سنجیده).
 */
export const SEED_TARIFF: SiteTariff = { priceList: SEED_PRICE_LIST, slaDays: 2, paused: NONE_PAUSED };

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
    // شکل پیش از ۸٫۳ (`clickRates`، بی `printRates`) هم تعرفهٔ پایه است: صفحه‌ای که هنوز HTML قدیم دارد قیمت می‌دهد.
    if (
      value &&
      typeof value.slaDays === 'number' &&
      typeof value.priceList?.version === 'number' &&
      typeof value.priceList.printRates?.a4 === 'object'
    ) {
      // HTML پیش از ۸٫۴ `paused` ندارد، و شکل خراب هم یعنی هیچ: سرور مسیر خرید گزینهٔ خاموش را خودش رد می‌کند.
      return { priceList: value.priceList, slaDays: value.slaDays, paused: pausedLists(value.paused) };
    }
  } catch {
    // پایین
  }
  return SEED_TARIFF;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** `paused` JSON صفحه؛ هر چه آرایهٔ نام نیست، هیچ. */
export function pausedLists(value: unknown): CatalogPaused {
  if (!value || typeof value !== 'object') return NONE_PAUSED;
  const lists = value as Record<string, unknown>;
  return {
    sizes: strings(lists.sizes).filter((size): size is 'a5' | 'a3' => size === 'a5' || size === 'a3'),
    papers: strings(lists.papers),
    bindings: strings(lists.bindings),
  };
}

/** تعرفهٔ همین صفحه، از HTML خودش. */
export function pageTariff(): SiteTariff {
  return parseTariff(typeof document === 'undefined' ? null : document.getElementById(TARIFF_ELEMENT_ID)?.textContent);
}
