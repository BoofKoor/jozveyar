/**
 * تشخیص رنگ و کیفیت صفحه.
 *
 * مسئله‌ای که این فایل حل می‌کند: بخش بزرگی از جزوه‌های ایرانی اسکن دست‌نویس با
 * ته‌رنگ زرد یا خاکستری است. تشخیص باینری هر صفحه را رنگی اعلام می‌کند و قیمت یک
 * جزوهٔ ۱۴۷ صفحه‌ای را از ۲۳۵,۲۰۰ به ۲۹۴,۰۰۰ تومان می‌برد.
 *
 * همهٔ توابع خالص‌اند و روی بافر پیکسل کار می‌کنند، پس همین کد در مرورگر
 * (روی `OffscreenCanvas`) و در کارگر سرور اجرا می‌شود و هر دو طرف با یک عدد
 * کار می‌کنند. (ADR-009)
 */

import type { DetectionThresholds, PageAnalysis, PageWarning } from '@jozveyar/contracts';

/** آماری که از پیکسل‌های یک صفحه درمی‌آید، قبل از اعمال آستانه. */
export interface PixelStats {
  /** رنگ برآوردی کاغذ — همان ته‌رنگی که باید خنثی شود. */
  paperCast: [number, number, number];
  /** نسبت پیکسل رنگی به کل صفحه. */
  colorRatio: number;
  /** نسبت پیکسل رنگی به پیکسل‌های مرکب. */
  coloredInkRatio: number;
  /** نسبت پیکسل مرکب به کل صفحه. */
  inkRatio: number;
  /** صدک ۹۵ کروما بین پیکسل‌های مرکب. */
  chromaP95: number;
}

/** روشنایی درک‌شده (Rec. 601) — ارزان و برای جدا کردن کاغذ از مرکب کافی است. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * برآورد رنگ کاغذ از روشن‌ترین پیکسل‌های صفحه.
 *
 * میانگین روشن‌ترین دهک گرفته می‌شود، نه سفیدترین پیکسل: یک نقطهٔ سفید تکی
 * (مثلاً حاشیهٔ برش اسکنر) نباید ته‌رنگ کل صفحه را تعیین کند.
 */
export function estimatePaperCast(
  rgba: Uint8ClampedArray | Uint8Array,
  sampleRatio: number,
): [number, number, number] {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) return [255, 255, 255];

  // هیستوگرام روشنایی — از مرتب‌سازی کل تصویر ارزان‌تر است.
  const histogram = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    histogram[Math.round(luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!))]! += 1;
  }

  const wanted = Math.max(1, Math.floor(pixelCount * sampleRatio));
  let cutoff = 255;
  let seen = 0;
  for (let level = 255; level >= 0; level -= 1) {
    seen += histogram[level]!;
    if (seen >= wanted) {
      cutoff = level;
      break;
    }
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (luma(r, g, b) >= cutoff) {
      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;
    }
  }

  if (count === 0) return [255, 255, 255];
  return [sumR / count, sumG / count, sumB / count];
}

/**
 * آمار رنگ یک صفحه.
 *
 * ترتیب کار مهم است: اول ته‌رنگ کاغذ برآورد می‌شود، بعد تعادل سفیدی روی همان
 * اعمال می‌شود، و **بعد** کروما شمرده می‌شود. اگر جای دو مرحلهٔ آخر عوض شود،
 * اسکن زرد همچنان رنگی اعلام می‌شود.
 */
export function analyzePixels(
  rgba: Uint8ClampedArray | Uint8Array,
  thresholds: DetectionThresholds,
): PixelStats {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) {
    return {
      paperCast: [255, 255, 255],
      colorRatio: 0,
      coloredInkRatio: 0,
      inkRatio: 0,
      chromaP95: 0,
    };
  }

  const paperCast = estimatePaperCast(rgba, thresholds.paperSampleRatio);

  // بهرهٔ هر کانال برای تعادل سفیدی. کاغذ زرد یعنی کانال آبی ضعیف است و
  // تقویت می‌شود، پس ته‌رنگ یکدست خنثی می‌شود ولی هایلایت واقعی رنگی می‌ماند.
  const gainR = paperCast[0] > 1 ? 255 / paperCast[0] : 1;
  const gainG = paperCast[1] > 1 ? 255 / paperCast[1] : 1;
  const gainB = paperCast[2] > 1 ? 255 / paperCast[2] : 1;

  const chromaHistogram = new Uint32Array(256);
  let inkCount = 0;
  let coloredCount = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    // پیکسل تماماً شفاف محتوا نیست (مثلاً صفحهٔ بدون پس‌زمینه).
    if (rgba[i + 3]! < 8) continue;

    const r = Math.min(255, rgba[i]! * gainR);
    const g = Math.min(255, rgba[i + 1]! * gainG);
    const b = Math.min(255, rgba[i + 2]! * gainB);

    const l = luma(r, g, b);
    // کاغذ و مرکب سیاه هیچ‌وقت «رنگی» نیستند و فقط نسبت‌ها را رقیق می‌کنند.
    if (l > thresholds.nearWhiteLuma || l < thresholds.nearBlackLuma) continue;

    inkCount += 1;
    const chroma = Math.round(Math.max(r, g, b) - Math.min(r, g, b));
    chromaHistogram[chroma]! += 1;
    if (chroma > thresholds.chromaMin) coloredCount += 1;
  }

  let chromaP95 = 0;
  if (inkCount > 0) {
    const target = Math.ceil(inkCount * 0.95);
    let seen = 0;
    for (let chroma = 0; chroma <= 255; chroma += 1) {
      seen += chromaHistogram[chroma]!;
      if (seen >= target) {
        chromaP95 = chroma;
        break;
      }
    }
  }

  return {
    paperCast,
    colorRatio: coloredCount / pixelCount,
    coloredInkRatio: inkCount > 0 ? coloredCount / inkCount : 0,
    inkRatio: inkCount / pixelCount,
    chromaP95,
  };
}

/**
 * طبقه‌بندی رنگی بودن صفحه از آمار خام.
 *
 * دو شرط، چون یک شرط هر دو حالت را نمی‌گیرد:
 *  - `colorRatio` سطح رنگی بزرگ را می‌گیرد (نمودار، عکس، صفحهٔ تماماً رنگی).
 *  - `coloredInkRatio` صفحهٔ کم‌مرکب ولی قطعاً رنگی را می‌گیرد (یک کلمهٔ هایلایت
 *    روی صفحهٔ سفید، که نسبتش به کل صفحه ناچیز است).
 *
 * هر دو آستانه از پنل ادمین تنظیم می‌شوند، چون عدد درست را فقط دادهٔ واقعی
 * جزوه‌های اسکن‌شده نشان می‌دهد.
 */
export function isColorPage(stats: PixelStats, thresholds: DetectionThresholds): boolean {
  if (stats.inkRatio <= 0) return false;
  return (
    stats.colorRatio >= thresholds.colorPixelRatioMin ||
    stats.coloredInkRatio >= thresholds.coloredInkRatioMin
  );
}

/** صفحه‌ای که تقریباً هیچ مرکبی ندارد. هم هشدار است هم برای آمار لازم. */
export function isBlankPage(stats: PixelStats): boolean {
  return stats.inkRatio < 0.0005;
}

/**
 * اندازهٔ رندر برای تحلیل.
 *
 * مقیاس از بزرگ‌ترین بُعد حساب می‌شود، نه از DPI ثابت: صفحهٔ A5 و A3 هر دو
 * باید به همان تعداد پیکسل برسند، وگرنه هزینه و دقت بین صفحات فرق می‌کند.
 */
export function sampleScaleFor(
  widthPt: number,
  heightPt: number,
  maxDimension: number,
): number {
  const longest = Math.max(widthPt, heightPt);
  if (longest <= 0) return 1;
  return Math.min(1, maxDimension / longest);
}

/** نام اندازهٔ کاغذ از ابعاد پوینت — برای گزارش «۱۴۰ صفحه A4، ۷ صفحه A5». */
export function paperSizeName(widthPt: number, heightPt: number): string {
  const shortSide = Math.min(widthPt, heightPt);
  const longSide = Math.max(widthPt, heightPt);
  const known: [string, number, number][] = [
    ['A3', 842, 1191],
    ['A4', 595, 842],
    ['A5', 420, 595],
    ['Letter', 612, 792],
    ['Legal', 612, 1008],
  ];
  for (const [name, w, h] of known) {
    // ۳٪ رواداری: خروجی اسکنر و ورد دقیقاً سر عدد نمی‌نشیند.
    if (Math.abs(shortSide - w) / w < 0.03 && Math.abs(longSide - h) / h < 0.03) return name;
  }
  return `${Math.round(shortSide)}×${Math.round(longSide)}pt`;
}

/** میلی‌متر از پوینت. */
export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

export interface PageMeasurement {
  n: number;
  widthPt: number;
  heightPt: number;
  rotation: number;
  /** DPI برآوردی بزرگ‌ترین تصویر صفحه؛ برای صفحهٔ متنی null. */
  estimatedDpi: number | null;
  /** کوچک‌ترین حاشیهٔ محتوا به میلی‌متر؛ null یعنی محاسبه نشد. */
  minMarginMm: number | null;
}

/** حداقل حاشیه‌ای که صحافی طلق و سیم می‌خورد؛ کمتر از این، متن بریده می‌شود. */
export const MIN_SAFE_MARGIN_MM = 10;

/** ترکیب اندازه‌گیری و آمار پیکسل در یک `PageAnalysis` کامل. */
export function buildPageAnalysis(
  measurement: PageMeasurement,
  stats: PixelStats,
  thresholds: DetectionThresholds,
): PageAnalysis {
  const blank = isBlankPage(stats);
  const warnings: PageWarning[] = [];

  if (blank) warnings.push('blank_page');
  if (measurement.estimatedDpi !== null && measurement.estimatedDpi < thresholds.lowDpiThreshold) {
    warnings.push('low_dpi');
  }
  if (measurement.minMarginMm !== null && measurement.minMarginMm < MIN_SAFE_MARGIN_MM) {
    warnings.push('tight_margin');
  }

  return {
    n: measurement.n,
    widthPt: measurement.widthPt,
    heightPt: measurement.heightPt,
    rotation: measurement.rotation,
    color: !blank && isColorPage(stats, thresholds),
    colorRatio: stats.colorRatio,
    coloredInkRatio: stats.coloredInkRatio,
    chromaP95: stats.chromaP95,
    paperCast: stats.paperCast,
    inkRatio: stats.inkRatio,
    blank,
    estimatedDpi: measurement.estimatedDpi,
    minMarginMm: measurement.minMarginMm,
    warnings,
  };
}

/**
 * بازطبقه‌بندی با آستانه‌های جدید، بدون داشتن فایل.
 *
 * دلیل وجودش: فایل خام بعد از ۱ تا ۲ روز پاک می‌شود. چون `colorRatio` و
 * `coloredInkRatio` خام ذخیره شده‌اند، وقتی آستانه‌ها را روی دادهٔ واقعی بهتر
 * کردیم می‌توانیم سفارش‌های قبلی را دوباره طبقه‌بندی کنیم و ببینیم چقدر عوض
 * می‌شوند — بدون این، هر تنظیم آستانه یک حدس کور است.
 */
export function reclassify(page: PageAnalysis, thresholds: DetectionThresholds): boolean {
  if (page.blank) return false;
  return (
    page.colorRatio >= thresholds.colorPixelRatioMin ||
    page.coloredInkRatio >= thresholds.coloredInkRatioMin
  );
}

/** گام نمونه‌برداری: بالای سقف، یکی از هر چند صفحه تحلیل شود. */
export function sampleStrideFor(pageCount: number, maxPagesToAnalyze: number): number {
  if (pageCount <= maxPagesToAnalyze) return 1;
  return Math.ceil(pageCount / maxPagesToAnalyze);
}
