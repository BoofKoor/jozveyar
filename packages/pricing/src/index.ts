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
  Breakdown,
  ColorMode,
  ItemBreakdown,
  ItemSpec,
  OrderSpec,
  PageRange,
  PriceList,
  QuoteWarning,
} from '@jozveyar/contracts';

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
  const { copies, sidesMode } = item;
  // یک جزوه، یک صحافی: برگ‌ها از جمع صفحه‌های همهٔ بخش‌ها می‌آیند، نه جدا از هر فایل.
  const pageCount = itemPageCount(item.sections);

  // برگ به حالت رنگ بستگی ندارد — همهٔ صفحات چاپ می‌شوند.
  const printedSides = pageCount;
  const sheets = sidesMode === 'double' ? Math.ceil(printedSides / 2) : printedSides;

  // روهای هر حالت رنگ، از قاعده‌ها.
  const sidesByMode: Record<ColorMode, number> = { color: 0, bw: 0 };
  let paperRialsPerCopy = 0;
  let coveredSides = 0;

  for (const rule of item.rules) {
    const sides = countPages(rule.pageRanges, pageCount);
    sidesByMode[rule.colorMode] += sides;
    coveredSides += sides;

    const paper = list.paperTypes[rule.paperTypeId];
    if (!paper) {
      warnings.add('paper_type_unavailable');
      continue;
    }
    if (!paper.enabled) warnings.add('paper_type_unavailable');
    // نرخ کاغذ به برگ است، ولی قاعده بر حسب صفحه. سهم این قاعده از برگ‌ها:
    const ruleSheets = sidesMode === 'double' ? sides / 2 : sides;
    paperRialsPerCopy += ruleSheets * paper.ratePerSheetRials;
  }

  // قاعده‌ها باید کل سند را بپوشانند. اگر نپوشاندند، قیمت ناقص است.
  if (coveredSides !== pageCount) warnings.add('rules_do_not_cover_all_pages');

  const printRialsPerCopy =
    sidesByMode.color * (list.clickRates.color ?? 0) +
    sidesByMode.bw * (list.clickRates.bw ?? 0);

  // صحافی
  const binding = list.bindingTypes[item.bindingTypeId];
  let sheetsPerVolume: number[] = [sheets];
  let bindingRialsPerCopy = 0;

  if (!binding) {
    warnings.add('binding_type_unavailable');
  } else {
    if (!binding.enabled) warnings.add('binding_type_unavailable');
    sheetsPerVolume = splitSheets(sheets, binding.maxSheetsPerVolume);
    for (const volumeSheets of sheetsPerVolume) {
      const price = bandPriceRials(volumeSheets, binding.bands);
      if (price === null) {
        warnings.add('binding_band_missing');
      } else {
        bindingRialsPerCopy += price;
      }
    }
  }

  const paperWeightPerCopy = sheets * (firstPaperGsm(item, list) ?? 80) * list.settings.sheetAreaM2;
  const bindingWeightPerCopy = (binding?.weightPerVolumeGrams ?? 0) * sheetsPerVolume.length;

  return {
    sections: item.sections.map(({ documentId, pageCount: sectionPages }) => ({
      documentId,
      pageCount: sectionPages,
    })),
    pageCount,
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
