/**
 * موتور قیمت جزوه‌یار.
 *
 * تابع خالص: بدون I/O، بدون تاریخ، بدون تصادف. **همین فایل** هم در مرورگر
 * (برای قیمت پیش‌نمایش) و هم روی سرور (برای قیمت قطعی) اجرا می‌شود.
 *
 * این تنها دلیلی است که اختلاف «۲۴۵,۰۰۰ دیدم، ۲۶۸,۰۰۰ شد» ممکن نیست: نسخهٔ
 * دومی وجود ندارد که واگرا شود. هر منطق قیمت جای دیگر، باگ است. (ADR-001)
 */

import type {
  BindingType,
  Breakdown,
  CatalogPaused,
  ColorMode,
  ItemBreakdown,
  ItemSpec,
  OrderSpec,
  PageRange,
  PaperSize,
  PriceList,
  QuoteWarning,
  SidesMode,
} from '@jozveyar/contracts';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from './seed.js';

/* ──────────────────────────── اندازهٔ کاغذ ──────────────────────────── */

/**
 * اندازه‌های کاغذ، به ترتیب نمایش (برش ۸٫۳): ابعاد به میلی‌متر. فایل چاپ هر صفحه را روی همین «Fit» می‌کند
 * (`docworker/printfile.py`)، و وزن از مساحت همین است. اینکه کدام ارائه می‌شود با تعرفه است (`offeredSizes`).
 */
export const PAPER_SIZES: Readonly<Record<PaperSize, { label: string; widthMm: number; heightMm: number }>> = {
  a4: { label: 'A4', widthMm: 210, heightMm: 297 },
  a5: { label: 'A5', widthMm: 148, heightMm: 210 },
  a3: { label: 'A3', widthMm: 297, heightMm: 420 },
};

export const PAPER_SIZE_ORDER: readonly PaperSize[] = ['a4', 'a5', 'a3'];

/** اندازهٔ پیش‌فرض: جزوه‌ای که اندازه‌اش گفته نشده، و هر نسخهٔ تعرفه دارد. */
export const DEFAULT_PAPER_SIZE: PaperSize = 'a4';

/** مساحت یک برگ به متر مربع، مبنای وزن: A4 همان 0.06237 پیش از ۸٫۳. */
export function sheetAreaM2(size: PaperSize): number {
  const { widthMm, heightMm } = PAPER_SIZES[size];
  return (widthMm * heightMm) / 1_000_000;
}

/** اندازه‌هایی که این تعرفه ارائه می‌کند، به ترتیب نمایش: آنها که نرخ چاپ دارند. */
export function offeredSizes(list: PriceList): PaperSize[] {
  return PAPER_SIZE_ORDER.filter((size) => list.printRates[size] !== undefined);
}

/* ──────────────────────────── در دسترس بودن زنده ──────────────────────────── */

/** گزینه‌های تعرفهٔ فعال که همین حالا موقتاً در دسترس نیستند (`pausedOf`). */
export interface PausedOptions {
  sizes: ReadonlySet<PaperSize>;
  papers: ReadonlySet<string>;
  bindings: ReadonlySet<string>;
}

export const NONE_PAUSED: PausedOptions = { sizes: new Set(), papers: new Set(), bindings: new Set() };

/**
 * گزینه‌های این تعرفه که موقتاً در دسترس نیستند (برش ۸٫۴، سؤال ۱۸۸)، از تنظیم `catalog.paused`: فقط آنچه همین تعرفه ارائه
 * می‌کند و روشن است، و هرگز A4، کاغذ پیش‌فرض یا صحافی پیش‌فرض، تا هر جزوه همیشه اندازه، کاغذ و صحافی‌ای داشته باشد (همان
 * پیش‌فرض‌هایی که جای انتخابِ دیگر نمی‌خورد می‌نشینند). قیمت را دست نمی‌زند. یک جا برای میز، صفحهٔ اصلی، سرور مسیر خرید و پنل.
 */
export function pausedOf(list: PriceList, paused: CatalogPaused | null | undefined): PausedOptions {
  if (!paused) return NONE_PAUSED;
  return {
    sizes: new Set(paused.sizes.filter((size) => list.printRates[size] !== undefined)),
    papers: new Set(paused.papers.filter((id) => id !== DEFAULT_PAPER_TYPE_ID && list.paperTypes[id]?.enabled === true)),
    bindings: new Set(paused.bindings.filter((id) => id !== DEFAULT_BINDING_TYPE_ID && list.bindingTypes[id]?.enabled === true)),
  };
}

/* ──────────────────────────── کمکی‌ها ──────────────────────────── */

/**
 * تعداد صفحهٔ جزوه: جمع بخش‌ها، پشت‌سرهم و بی صفحهٔ سفید بینشان (ADR-030).
 *
 * هم `quote()` این را صدا می‌زند و هم مرورگر برای ساختن قاعده، تا «صفحهٔ جزوه» یک
 * تعریف داشته باشد.
 */
export function itemPageCount(sections: readonly { pageCount: number }[]): number {
  return sections.reduce((sum, section) => sum + section.pageCount, 0);
}

/** تعداد صفحهٔ یکتا در مجموعه‌ای از بازه‌ها. بازهٔ همپوشان دوباره شمرده نمی‌شود. */
export function countPages(ranges: readonly PageRange[], pageCount: number): number {
  if (ranges.length === 0) return 0;
  const clamped = ranges
    .map(([from, to]): PageRange => [Math.max(1, from), Math.min(pageCount, to)])
    .filter(([from, to]) => from <= to)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let total = 0;
  let cursor = 0; // آخرین صفحهٔ شمرده‌شده
  for (const [from, to] of clamped) {
    const start = Math.max(from, cursor + 1);
    if (to >= start) {
      total += to - start + 1;
      cursor = to;
    }
  }
  return total;
}

/**
 * توزیع برگ بین جلدها، عمداً یکنواخت.
 *
 * ۱۰۰۰ برگ با سقف ۸۰۰ → دو جلد ۵۰۰ برگی، نه ۸۰۰ + ۲۰۰.
 * یکنواخت هم ارزان‌تر است (۶۲,۰۰۰×۲ در برابر ۷۸,۰۰۰+۵۰,۰۰۰) هم فیزیکی متعادل‌تر.
 */
export function splitSheets(totalSheets: number, maxPerVolume: number): number[] {
  if (totalSheets <= 0) return [];
  const volumes = Math.max(1, Math.ceil(totalSheets / maxPerVolume));
  const base = Math.floor(totalSheets / volumes);
  const remainder = totalSheets % volumes;
  return Array.from({ length: volumes }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** برگ یک نسخهٔ جزوه: دورو یعنی هر دو صفحه یک برگ. */
export function sheetsOf(pageCount: number, sidesMode: SidesMode): number {
  return sidesMode === 'double' ? Math.ceil(pageCount / 2) : pageCount;
}

/**
 * جلدهای یک نسخه با این صحافی: صحافی‌ای که چند جلد می‌شود، بالای سقف یکنواخت می‌شکند؛ بقیه همیشه یک جلد (و اگر از سقف
 * بیشتر است، `bindingMisfit` می‌گوید نمی‌خورد).
 */
export function volumesOf(binding: Pick<BindingType, 'splitsVolumes' | 'maxSheetsPerVolume'>, sheets: number): number[] {
  return binding.splitsVolumes ? splitSheets(sheets, binding.maxSheetsPerVolume) : [sheets];
}

/** چرا صحافی‌ای به این جزوه نمی‌خورد (برش ۸٫۳): این اندازه را ندارد، جلدش از کمینه نازک‌تر است، یا از سقف بیشتر. */
export type BindingMisfit =
  | { reason: 'size' }
  | { reason: 'min'; minSheets: number }
  | { reason: 'max'; maxSheets: number };

/**
 * صحافی به این اندازه و این شمار برگ می‌خورد یا نه؛ null یعنی می‌خورد. همان که `quote()` با `binding_does_not_fit` رد
 * می‌کند و کاشی صحافی با دلیلش خاموش نشان می‌دهد («تا 50 برگ؛ این جزوه 57 برگ است»)، یک تعریف (قاعدهٔ ۱). کمینه روی
 * نازک‌ترین جلد است: جزوهٔ بلندی که دو جلد می‌شود، هر جلدش باید به کمینه برسد.
 */
export function bindingMisfit(binding: BindingType, size: PaperSize, sheets: number): BindingMisfit | null {
  if (!binding.bands[size]?.length) return { reason: 'size' };
  if (!binding.splitsVolumes && sheets > binding.maxSheetsPerVolume) {
    return { reason: 'max', maxSheets: binding.maxSheetsPerVolume };
  }
  if (Math.min(...volumesOf(binding, sheets)) < binding.minSheets) return { reason: 'min', minSheets: binding.minSheets };
  return null;
}

/** قیمت صحافی یک جلد. null یعنی هیچ بازه‌ای این تعداد برگ را نمی‌پوشاند. */
export function bandPriceRials(
  sheets: number,
  bands: readonly { minSheets: number; maxSheets: number; priceRials: number }[],
): number | null {
  for (const band of bands) {
    if (sheets >= band.minSheets && sheets <= band.maxSheets) return band.priceRials;
  }
  return null;
}

function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/* ─────────────────────────── محاسبهٔ قلم ─────────────────────────── */

function quoteItem(
  item: ItemSpec,
  list: PriceList,
  warnings: Set<QuoteWarning>,
): ItemBreakdown {
  const { copies, sidesMode, paperSize } = item;
  // یک جزوه، یک صحافی: برگ‌ها از جمع صفحه‌های همهٔ بخش‌ها می‌آیند، نه جدا از هر فایل.
  const pageCount = itemPageCount(item.sections);

  // برگ به حالت رنگ بستگی ندارد — همهٔ صفحات چاپ می‌شوند.
  const printedSides = pageCount;
  const sheets = sheetsOf(printedSides, sidesMode);

  // نرخ هر رو با اندازه و یکرو یا دورو (۸٫۳)؛ اندازه‌ای که نرخ ندارد ارائه نمی‌شود.
  const rates = list.printRates[paperSize];
  if (!rates) warnings.add('paper_size_unavailable');

  // روهای هر حالت رنگ، از قاعده‌ها.
  const sidesByMode: Record<ColorMode, number> = { color: 0, bw: 0 };
  let paperRialsPerCopy = 0;
  let coveredSides = 0;

  for (const rule of item.rules) {
    const sides = countPages(rule.pageRanges, pageCount);
    sidesByMode[rule.colorMode] += sides;
    coveredSides += sides;

    const paper = list.paperTypes[rule.paperTypeId];
    // کاغذی که نیست، خاموش است، یا این اندازه را ندارد.
    const sheetRate = paper?.sheetRates[paperSize];
    if (!paper?.enabled || sheetRate === undefined) warnings.add('paper_type_unavailable');
    if (sheetRate === undefined) continue;
    // نرخ کاغذ به برگ است، ولی قاعده بر حسب صفحه. سهم این قاعده از برگ‌ها:
    const ruleSheets = sidesMode === 'double' ? sides / 2 : sides;
    paperRialsPerCopy += ruleSheets * sheetRate;
  }

  // قاعده‌ها باید کل سند را بپوشانند. اگر نپوشاندند، قیمت ناقص است.
  if (coveredSides !== pageCount) warnings.add('rules_do_not_cover_all_pages');

  const sideRates = rates?.[sidesMode];
  const printRialsPerCopy = sideRates ? sidesByMode.color * sideRates.color + sidesByMode.bw * sideRates.bw : 0;

  // صحافی
  const binding = list.bindingTypes[item.bindingTypeId];
  let sheetsPerVolume: number[] = [sheets];
  let bindingRialsPerCopy = 0;

  if (!binding) {
    warnings.add('binding_type_unavailable');
  } else {
    if (!binding.enabled) warnings.add('binding_type_unavailable');
    if (bindingMisfit(binding, paperSize, sheets)) warnings.add('binding_does_not_fit');
    sheetsPerVolume = volumesOf(binding, sheets);
    const bands = binding.bands[paperSize] ?? [];
    for (const volumeSheets of sheetsPerVolume) {
      const price = bandPriceRials(volumeSheets, bands);
      if (price === null) {
        warnings.add('binding_band_missing');
      } else {
        bindingRialsPerCopy += price;
      }
    }
  }

  const paperWeightPerCopy = sheets * (firstPaperGsm(item, list) ?? 80) * sheetAreaM2(paperSize);
  const bindingWeightPerCopy = (binding?.weightPerVolumeGrams ?? 0) * sheetsPerVolume.length;

  return {
    sections: item.sections.map(({ documentId, pageCount: sectionPages }) => ({
      documentId,
      pageCount: sectionPages,
    })),
    pageCount,
    paperSize,
    printedSides,
    sheets,
    colorSides: sidesByMode.color,
    bwSides: sidesByMode.bw,
    volumes: sheetsPerVolume.length,
    sheetsPerVolume,
    copies,
    printRials: Math.round(printRialsPerCopy * copies),
    paperRials: Math.round(paperRialsPerCopy * copies),
    bindingRials: Math.round(bindingRialsPerCopy * copies),
    weightGrams: Math.round((paperWeightPerCopy + bindingWeightPerCopy) * copies),
    totalRials: Math.round((printRialsPerCopy + paperRialsPerCopy + bindingRialsPerCopy) * copies),
  };
}

/** گرماژ کاغذ قاعدهٔ اول — امروز همهٔ قاعده‌ها یک نوع کاغذ دارند. */
function firstPaperGsm(item: ItemSpec, list: PriceList): number | null {
  for (const rule of item.rules) {
    const paper = list.paperTypes[rule.paperTypeId];
    if (paper) return paper.gsm;
  }
  return null;
}

/* ──────────────────────────── ارسال ──────────────────────────── */

/**
 * سقف بازهٔ وزن، شامل نمی‌شود. `null` یعنی بدون سقف.
 *
 * یک تابع کوچک برای یک مقایسه زیاده‌روی به نظر می‌رسد، ولی این مقایسه در دو
 * جا تکرار می‌شود و اگر یکی‌شان `null` را فراموش کند، اثرش این است که
 * سنگین‌ترین سفارش‌ها — یعنی گران‌ترین‌ها — بی‌صدا بدون کرایه قیمت می‌خورند.
 */
function belowCeiling(weightGrams: number, maxWeightGrams: number | null): boolean {
  return maxWeightGrams === null || weightGrams < maxWeightGrams;
}

function shippingRialsFor(
  list: PriceList,
  methodId: string,
  zoneId: string,
  weightGrams: number,
): number | null {
  for (const rate of list.shippingRates) {
    if (rate.methodId !== methodId) continue;
    if (rate.zoneId !== zoneId) continue;
    if (weightGrams >= rate.minWeightGrams && belowCeiling(weightGrams, rate.maxWeightGrams)) {
      return rate.priceRials;
    }
  }
  return null;
}

/**
 * ارزان‌ترین کرایهٔ ممکن برای این وزن، روی همهٔ مناطق و روش‌های فعال.
 *
 * پشت جملهٔ «+ ارسال از X تومان» می‌نشیند. چون کرایهٔ پست تقریباً ثابت است
 * (کف حدود ۱۳۵,۰۰۰ تومان و وزن ۲۰ برابر فقط ~۲۶,۰۰۰ اضافه می‌کند)، این عدد
 * تخمین مبهم نیست — تقریباً همان چیزی است که کاربر آخر پرداخت می‌کند. (ADR-011)
 */
export function shippingFloorRials(list: PriceList, weightGrams: number): number | null {
  let floor: number | null = null;
  for (const rate of list.shippingRates) {
    const method = list.shippingMethods[rate.methodId];
    if (!method?.enabled) continue;
    if (weightGrams < rate.minWeightGrams) continue;
    if (!belowCeiling(weightGrams, rate.maxWeightGrams)) continue;
    if (floor === null || rate.priceRials < floor) floor = rate.priceRials;
  }
  return floor;
}

/**
 * چقدر تا حداقل سفارش مانده (برش ۸٫۴، سؤال ۱۹۰)، ریال: همان قاعدهٔ `below_min_order` `quote()`، روی جمع چاپ، کاغذ و صحافی، پیش از
 * کرایه، تخفیف، مالیات و گرد کردن. صفر یعنی رسیده، یا تعرفه حداقلی ندارد، یا هنوز چیزی قیمت نخورده.
 */
export function minOrderGapRials(breakdown: Pick<Breakdown, 'subtotalRials'>, list: PriceList): number {
  const min = list.settings.minOrderRials;
  return breakdown.subtotalRials > 0 && breakdown.subtotalRials < min ? min - breakdown.subtotalRials : 0;
}

/* ───────────────────────────── ورودی اصلی ───────────────────────────── */

export function quote(spec: OrderSpec, list: PriceList): Breakdown {
  const warnings = new Set<QuoteWarning>();
  const items = spec.items.map((item) => quoteItem(item, list, warnings));

  const subtotalRials = items.reduce((sum, i) => sum + i.totalRials, 0);
  const discountRials = 0; // تخفیف پلکانی فعلاً غیرفعال — زیرساخت در جدول discount_tiers

  const estWeightGrams =
    items.reduce((sum, i) => sum + i.weightGrams, 0) +
    Math.round(list.settings.packagingWeightGrams);

  const shippingFromRials = shippingFloorRials(list, estWeightGrams);

  let shippingRials: number | null = null;
  if (spec.shipping) {
    shippingRials = shippingRialsFor(
      list,
      spec.shipping.methodId,
      spec.shipping.zoneId,
      estWeightGrams,
    );
    if (shippingRials === null) warnings.add('shipping_rate_missing');
  }

  if (subtotalRials > 0 && subtotalRials < list.settings.minOrderRials) {
    warnings.add('below_min_order');
  }

  const taxable = subtotalRials - discountRials + (shippingRials ?? 0);
  const vatRials = Math.round((taxable * list.settings.vatPercent) / 100);

  const exactWithoutShipping = subtotalRials - discountRials;
  const exactTotal = taxable + vatRials;

  const roundedTotal = roundToStep(exactTotal, list.settings.roundingStepRials);
  const roundingRials = roundedTotal - exactTotal;

  return {
    priceListVersion: list.version,
    items,
    subtotalRials,
    discountRials,
    shippingRials,
    shippingFromRials,
    estWeightGrams,
    vatRials,
    roundingRials,
    totalWithoutShippingRials: roundToStep(
      exactWithoutShipping,
      list.settings.roundingStepRials,
    ),
    totalRials: shippingRials === null
      ? roundToStep(exactWithoutShipping, list.settings.roundingStepRials)
      : roundedTotal,
    warnings: [...warnings],
  };
}

/* ───────────────────────── ساخت قاعده‌ها ───────────────────────── */

/**
 * قاعده‌های چاپ برای حالت فعلی محصول: یک انتخاب رنگ برای کل سند.
 *
 * حالت ترکیبی (`features.perPageColor`) از همین امضا چند قاعده برمی‌گرداند —
 * موتور قیمت و schema تغییری نمی‌کنند. (ADR-002)
 */
export function wholeDocumentRule(
  pageCount: number,
  colorMode: ColorMode,
  paperTypeId: string,
) {
  return [{ pageRanges: [[1, pageCount]] as PageRange[], colorMode, paperTypeId }];
}

/**
 * قاعده‌های حالت ترکیبی: صفحات رنگیِ تشخیص‌داده‌شده رنگی، بقیه سیاه‌سفید.
 *
 * امروز در UI فراخوانی نمی‌شود، ولی تست‌شده است تا روزی که فلگ روشن شود
 * فقط یک تغییر UI باشد، نه یک پروژه.
 */
export function perPageColorRules(
  pageCount: number,
  colorPages: readonly number[],
  paperTypeId: string,
) {
  const colorSet = new Set(colorPages.filter((p) => p >= 1 && p <= pageCount));
  const colorRanges = toRanges([...colorSet].sort((a, b) => a - b));
  const bwPages: number[] = [];
  for (let p = 1; p <= pageCount; p += 1) if (!colorSet.has(p)) bwPages.push(p);
  const bwRanges = toRanges(bwPages);

  const rules = [];
  if (colorRanges.length > 0) {
    rules.push({ pageRanges: colorRanges, colorMode: 'color' as ColorMode, paperTypeId });
  }
  if (bwRanges.length > 0) {
    rules.push({ pageRanges: bwRanges, colorMode: 'bw' as ColorMode, paperTypeId });
  }
  return rules;
}

/** فهرست صفحهٔ مرتب را به کوچک‌ترین مجموعهٔ بازه‌ها فشرده می‌کند. */
export function toRanges(sortedPages: readonly number[]): PageRange[] {
  const ranges: PageRange[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  for (const page of sortedPages) {
    if (start === null || previous === null) {
      start = page;
      previous = page;
    } else if (page === previous + 1) {
      previous = page;
    } else {
      ranges.push([start, previous]);
      start = page;
      previous = page;
    }
  }
  if (start !== null && previous !== null) ranges.push([start, previous]);
  return ranges;
}
