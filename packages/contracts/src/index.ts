/**
 * قراردادهای مشترک جزوه‌یار.
 *
 * این پکیج تنها جایی است که شکل داده تعریف می‌شود. مرورگر، سرور و کارگر اسناد
 * همه از همین تایپ‌ها استفاده می‌کنند، پس هر تغییر شکل داده در یک جا اتفاق می‌افتد.
 *
 * واحد پول: همه‌جا **ریال** و عدد صحیح. نام هر مقدار پول به `Rials` ختم می‌شود.
 * بزرگ‌ترین مبلغ ممکن (چند میلیارد ریال) خیلی زیر `Number.MAX_SAFE_INTEGER` است،
 * پس در TypeScript `number` امن است؛ ستون پایگاه داده `bigint` می‌ماند.
 */

import { z } from 'zod';

import { MAX_SECTIONS_PER_ITEM } from './constants.js';

/* ────────────────────────────── پایه ────────────────────────────── */

export const colorModeSchema = z.enum(['color', 'bw']);
export type ColorMode = z.infer<typeof colorModeSchema>;

export const sidesModeSchema = z.enum(['single', 'double']);
export type SidesMode = z.infer<typeof sidesModeSchema>;

export const sourceKindSchema = z.enum(['pdf', 'docx', 'doc', 'pptx', 'ppt', 'image']);
export type SourceKind = z.infer<typeof sourceKindSchema>;

/** بازهٔ صفحات، هر دو سر شامل، ۱-مبنا. */
export const pageRangeSchema = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([from, to]) => from <= to, { message: 'بازهٔ صفحات نامعتبر است' });
export type PageRange = z.infer<typeof pageRangeSchema>;

/* ──────────────────────── تحلیل صفحه ──────────────────────── */

/**
 * آستانه‌های تشخیص رنگ.
 *
 * هر کدام از پنل ادمین قابل تنظیم است و کنار نتیجهٔ تحلیل ذخیره می‌شود، تا بدانیم
 * کدام عدد این نتیجه را ساخته. جزئیات الگوریتم در `@jozveyar/analysis`.
 */
export const detectionThresholdsSchema = z.object({
  /** حداقل کروما (۰ تا ۲۵۵) تا یک پیکسل «رنگی» شمرده شود. */
  chromaMin: z.number().min(0).max(255),
  /** حداقل نسبت پیکسل رنگی به کل صفحه. */
  colorPixelRatioMin: z.number().min(0).max(1),
  /** حداقل نسبت پیکسل رنگی به پیکسل‌های مرکب — صفحهٔ کم‌مرکب ولی قطعاً رنگی را می‌گیرد. */
  coloredInkRatioMin: z.number().min(0).max(1),
  /** بزرگ‌ترین بُعد تصویر نمونه، به پیکسل. کوچک‌تر = سریع‌تر. */
  sampleMaxDimension: z.number().int().positive(),
  /** روشنایی بالاتر از این «کاغذ» است و شمرده نمی‌شود. */
  nearWhiteLuma: z.number().min(0).max(255),
  /** روشنایی پایین‌تر از این «مرکب سیاه» است و شمرده نمی‌شود. */
  nearBlackLuma: z.number().min(0).max(255),
  /** چند درصد روشن‌ترین پیکسل‌ها برای برآورد رنگ کاغذ استفاده شود. */
  paperSampleRatio: z.number().min(0.01).max(0.5),
  /** DPI کمتر از این، هشدار کیفیت می‌دهد. */
  lowDpiThreshold: z.number().positive(),
});
export type DetectionThresholds = z.infer<typeof detectionThresholdsSchema>;

/**
 * آستانه‌های پیش‌فرض — در `constants.ts`، بی zod، تا مرورگر بتواند فقط همین را بگیرد
 * (`@jozveyar/contracts/constants`) و اسکیماها به باندل اولیه نیایند.
 */
export { DEFAULT_THRESHOLDS } from './constants.js';

export const pageWarningSchema = z.enum([
  'low_dpi',
  'tight_margin',
  'blank_page',
  'odd_page_size',
]);
export type PageWarning = z.infer<typeof pageWarningSchema>;

export const pageAnalysisSchema = z.object({
  /** شمارهٔ صفحه، ۱-مبنا. */
  n: z.number().int().positive(),
  /** عرض و ارتفاع به پوینت (۱/۷۲ اینچ) — واحد بومی PDF. */
  widthPt: z.number().positive(),
  heightPt: z.number().positive(),
  rotation: z.number().int(),
  /** نتیجهٔ طبقه‌بندی با آستانه‌های ذخیره‌شده. */
  color: z.boolean(),
  /** نسبت پیکسل رنگی به کل صفحه. خام ذخیره می‌شود برای کالیبراسیون بعدی. */
  colorRatio: z.number().min(0).max(1),
  /** نسبت پیکسل رنگی به پیکسل‌های مرکب. */
  coloredInkRatio: z.number().min(0).max(1),
  /** صدک ۹۵ کروما بین پیکسل‌های مرکب (۰ تا ۲۵۵). */
  chromaP95: z.number().min(0).max(255),
  /** رنگ برآوردی کاغذ — همان ته‌رنگ زرد یا خاکستری اسکن. */
  paperCast: z.tuple([z.number(), z.number(), z.number()]),
  /** نسبت پیکسل مرکب به کل صفحه. صفر یعنی صفحهٔ خالی. */
  inkRatio: z.number().min(0).max(1),
  blank: z.boolean(),
  /**
   * DPI مؤثر تصویری که بیشترین سطح صفحه را پوشانده، از جای واقعی‌اش روی صفحه
   * (`pageDpi` در packages/analysis)؛ صفحهٔ بی‌تصویر بزرگ null.
   */
  estimatedDpi: z.number().positive().nullable(),
  /** کوچک‌ترین حاشیهٔ محتوا به میلی‌متر؛ null یعنی محاسبه نشد. */
  minMarginMm: z.number().min(0).nullable(),
  warnings: z.array(pageWarningSchema),
});
export type PageAnalysis = z.infer<typeof pageAnalysisSchema>;

export const documentAnalysisSchema = z.object({
  /** شناسهٔ پیاده‌سازی، مثلاً `browser-pdfjs-4.10` یا `server-pymupdf-1.24`. */
  engine: z.string(),
  thresholds: detectionThresholdsSchema,
  pageCount: z.number().int().nonnegative(),
  pages: z.array(pageAnalysisSchema),
  /** true یعنی همهٔ صفحات تحلیل نشده‌اند و نتیجه برآوردی است. */
  sampled: z.boolean(),
  /** هر چند صفحه یکی نمونه گرفته شده. ۱ یعنی همه. */
  sampleStride: z.number().int().positive(),
  /** میلی‌ثانیه — برای سنجش کارایی روی موبایل ضعیف. */
  elapsedMs: z.number().nonnegative(),
});
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

/* ──────────────── تجمیع تحلیل (برای قیمت و آمار) ──────────────── */

export interface AnalysisSummary {
  pageCount: number;
  colorPageCount: number;
  bwPageCount: number;
  blankPageCount: number;
  lowDpiPageCount: number;
  /** شمارش هر اندازهٔ صفحه، مثلاً `{ A4: 140, A5: 7 }`. */
  pageSizes: Record<string, number>;
  sampled: boolean;
}

/* ──────────────────────── مشخصات سفارش ──────────────────────── */

/**
 * یک قاعدهٔ چاپ: «این بازه‌های صفحه، با این حالت رنگ، روی این کاغذ».
 *
 * حالت فعلی محصول (`features.perPageColor = false`) یعنی هر سند دقیقاً یک قاعده
 * دارد که همهٔ صفحات را می‌پوشاند. حالت ترکیبی چند قاعده می‌سازد — همین schema،
 * بدون migration. دلیل کامل در docs/DECISIONS.md، ADR-002.
 */
export const printRuleSchema = z.object({
  pageRanges: z.array(pageRangeSchema).min(1),
  colorMode: colorModeSchema,
  paperTypeId: z.string().min(1),
});
export type PrintRule = z.infer<typeof printRuleSchema>;

/** سقف فایل‌های یک جزوه — در `constants.ts`، چون مرورگر هم لازمش دارد. (ADR-030) */
export { MAX_SECTIONS_PER_ITEM };

/**
 * یک بخش جزوه: یک فایل آپلودشده (یک سند) و تعداد صفحه‌اش.
 *
 * در مرورگر `pageCount` پیش‌فاکتور است (شمارش مرورگر، یا عددی که خود Word نوشته)؛ سرور
 * موقع ثبت سفارش آن را از تحلیل خودش می‌گذارد و عدد کلاینت را دور می‌ریزد.
 */
export const itemSectionSchema = z.object({
  documentId: z.string().min(1),
  pageCount: z.number().int().positive(),
});
export type ItemSection = z.infer<typeof itemSectionSchema>;

/**
 * یک قلم سفارش = یک جزوهٔ صحافی‌شده، از یک یا چند فایل.
 *
 * بخش‌ها به ترتیب صحافی پشت‌سرهم می‌آیند و بینشان صفحهٔ سفیدی اضافه نمی‌شود. تعداد
 * صفحهٔ جزوه جمع بخش‌هاست و فقط `quote()` حسابش می‌کند (`itemPageCount`)، پس عددی که با
 * بخش‌ها نخواند اصلاً وجود ندارد. شمارهٔ صفحهٔ قاعده‌ها سراسری است: صفحهٔ ۱ بخش دوم یعنی
 * صفحه‌های بخش اول به‌علاوهٔ یک. (ADR-030)
 */
export const itemSpecSchema = z.object({
  sections: z.array(itemSectionSchema).min(1).max(MAX_SECTIONS_PER_ITEM),
  rules: z.array(printRuleSchema).min(1),
  copies: z.number().int().positive().max(1000),
  sidesMode: sidesModeSchema,
  bindingTypeId: z.string().min(1),
});
export type ItemSpec = z.infer<typeof itemSpecSchema>;

export const orderSpecSchema = z.object({
  items: z.array(itemSpecSchema).min(1),
  /** تا وقتی کاربر شهر را انتخاب نکرده null است — قیمت بدون ارسال نشان داده می‌شود. */
  shipping: z
    .object({ methodId: z.string().min(1), zoneId: z.string().min(1) })
    .nullable()
    .default(null),
});
export type OrderSpec = z.infer<typeof orderSpecSchema>;

/* ──────────────────────────── تعرفه ──────────────────────────── */

export const bindingBandSchema = z.object({
  /** بازه بر حسب **برگ** است، نه صفحه. ضخامت صحافی به برگ بستگی دارد. */
  minSheets: z.number().int().positive(),
  maxSheets: z.number().int().positive(),
  priceRials: z.number().int().nonnegative(),
});
export type BindingBand = z.infer<typeof bindingBandSchema>;

export const paperTypeSchema = z.object({
  nameFa: z.string(),
  gsm: z.number().positive(),
  enabled: z.boolean(),
  /** امروز صفر است؛ کل نرخ در `clickRates` نشسته. اهرم تفکیک یکرو/دورو در آینده. */
  ratePerSheetRials: z.number().int().nonnegative(),
});

export const bindingTypeSchema = z.object({
  nameFa: z.string(),
  enabled: z.boolean(),
  /** بالای این تعداد برگ، سند خودکار به چند جلد می‌شکند. */
  maxSheetsPerVolume: z.number().int().positive(),
  weightPerVolumeGrams: z.number().nonnegative(),
  bands: z.array(bindingBandSchema).min(1),
});

export const shippingRateSchema = z.object({
  methodId: z.string(),
  zoneId: z.string(),
  minWeightGrams: z.number().int().nonnegative(),
  /**
   * بالای بازه، شامل نمی‌شود. **`null` یعنی بدون سقف** — برای آخرین بازه.
   *
   * قبلاً اینجا نوشته بود «`Infinity` بگذارید» و همین غلط بود، از دو جهت:
   * zod نسخهٔ ۴ اصلاً `Infinity` را رد می‌کند، و مهم‌تر اینکه
   * `JSON.stringify(Infinity)` برابر `null` است. یعنی لحظه‌ای که تعرفه از
   * سرور به مرورگر می‌رفت، آن مقدار بی‌صدا به `null` تبدیل می‌شد و بازهٔ
   * آخر دیگر به هیچ وزنی نمی‌خورد — کرایه `null` برمی‌گشت برای دقیقاً
   * سنگین‌ترین سفارش‌ها.
   *
   * پس `null` فقط سازگارتر نیست؛ تنها مقداری است که از سیم رد می‌شود.
   */
  maxWeightGrams: z.number().int().positive().nullable(),
  priceRials: z.number().int().nonnegative(),
});
export type ShippingRate = z.infer<typeof shippingRateSchema>;

export const pricingSettingsSchema = z.object({
  minOrderRials: z.number().int().nonnegative(),
  /** ۰ یعنی رُند نکن. مثلاً ۱۰۰۰۰ ریال = رُند به نزدیک‌ترین ۱۰۰۰ تومان. */
  roundingStepRials: z.number().int().nonnegative(),
  vatPercent: z.number().min(0).max(100),
  packagingWeightGrams: z.number().nonnegative(),
  /** مساحت یک برگ به متر مربع. A4 = 0.06237 */
  sheetAreaM2: z.number().positive(),
});
export type PricingSettings = z.infer<typeof pricingSettingsSchema>;

export const priceListSchema = z.object({
  version: z.number().int().positive(),
  label: z.string(),
  /** ریال به‌ازای هر **رو** چاپ‌شده. */
  clickRates: z.record(colorModeSchema, z.number().int().nonnegative()),
  paperTypes: z.record(z.string(), paperTypeSchema),
  bindingTypes: z.record(z.string(), bindingTypeSchema),
  shippingMethods: z.record(z.string(), z.object({ nameFa: z.string(), enabled: z.boolean() })),
  shippingRates: z.array(shippingRateSchema),
  settings: pricingSettingsSchema,
});
export type PriceList = z.infer<typeof priceListSchema>;

/* ────────────────────────── ریز قیمت ────────────────────────── */

export const quoteWarningSchema = z.enum([
  'below_min_order',
  'binding_band_missing',
  'binding_type_unavailable',
  'paper_type_unavailable',
  'shipping_rate_missing',
  'rules_do_not_cover_all_pages',
  'estimated_from_sample',
]);
export type QuoteWarning = z.infer<typeof quoteWarningSchema>;

export interface ItemBreakdown {
  /** بخش‌های جزوه به ترتیب صحافی — در ریز قیمت منجمد سفارش می‌ماند: کدام فایل‌ها، چند صفحه. */
  sections: ItemSection[];
  /** جمع صفحه‌های بخش‌ها. */
  pageCount: number;
  /** روهای چاپی برای یک نسخه. */
  printedSides: number;
  /** برگ لازم برای یک نسخه — مبنای صحافی و وزن. */
  sheets: number;
  colorSides: number;
  bwSides: number;
  volumes: number;
  /** توزیع برگ بین جلدها؛ عمداً یکنواخت، چون هم ارزان‌تر است هم فیزیکی بهتر. */
  sheetsPerVolume: number[];
  copies: number;
  printRials: number;
  paperRials: number;
  bindingRials: number;
  /** وزن کاغذ و صحافی برای همهٔ نسخه‌ها، بدون بسته‌بندی. */
  weightGrams: number;
  totalRials: number;
}

export interface Breakdown {
  priceListVersion: number;
  items: ItemBreakdown[];
  subtotalRials: number;
  discountRials: number;
  /** null تا وقتی شهر انتخاب نشده. */
  shippingRials: number | null;
  /**
   * کف واقعی کرایه برای این وزن، روی همهٔ مناطق.
   * چون کرایهٔ پست تقریباً ثابت است، «+ ارسال از X تومان» صادق و دقیق است
   * و پرش قیمت در مرحلهٔ آدرس را حذف می‌کند. (ADR-011)
   */
  shippingFromRials: number | null;
  estWeightGrams: number;
  vatRials: number;
  roundingRials: number;
  /** جمع بدون ارسال — عددی که تا قبل از مرحلهٔ آدرس نشان داده می‌شود. */
  totalWithoutShippingRials: number;
  /** جمع کل. تا وقتی ارسال نامعلوم است، برابر جمع بدون ارسال. */
  totalRials: number;
  warnings: QuoteWarning[];
}
