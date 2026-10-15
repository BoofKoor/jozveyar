/**
 * مقدارهای قرارداد که مرورگر لازم دارد — بی zod.
 *
 * اگر مرورگر این‌ها را از `index.ts` بگیرد، همهٔ اسکیماها و خود zod (حدود ۲۵ کیلوبایت
 * فشرده، ۱۸٪ باندل اولیه) پشتشان به صفحهٔ اصلی می‌آیند، در حالی که مرورگر هیچ اسکیمایی
 * parse نمی‌کند. پس مرورگر از `@jozveyar/contracts/constants` می‌گیرد و `index.ts` همین‌ها
 * را دوباره صادر می‌کند. تست باندل اولیه نبودن zod را قفل کرده. (ADR-018، افزودهٔ برش ۲ب)
 */

import type { DetectionThresholds } from './index.js';

/**
 * سقف فایل‌های یک جزوه. جزوهٔ یک ترم، جلسه‌به‌جلسه یا فصل‌به‌فصل، زیر این است؛ بیشترش
 * فهرست را روی گوشی بی‌معنا می‌کند. (ADR-030)
 */
export const MAX_SECTIONS_PER_ITEM = 30;

/**
 * خانواده‌های فایلی که مالک از «تنظیمات» روشن و خاموش می‌کند (برش ۸٫۴، سؤال ۱۹۰): Word (doc و docx)، پاورپوینت (ppt و pptx) و
 * عکس (jpg، png، webp و heic). PDF همیشه پذیرفته است و کلید ندارد. نام‌ها همان `FileKind` مرورگرند.
 */
export const FILE_FAMILIES = ['word', 'slides', 'image'] as const;
export type FileFamily = (typeof FILE_FAMILIES)[number];

/** بزرگ‌ترین سقف حجم هر فایل که مالک می‌گذارد، مگابایت (هر مگابایت ۱٬۰۴۸٬۵۷۶ بایت)؛ همان سقف پیش از ۸٫۴. */
export const FILE_MAX_MB_LIMIT = 1536;
/** بزرگ‌ترین سقف صفحهٔ هر فایل که مالک می‌گذارد. */
export const FILE_MAX_PAGES_LIMIT = 1500;

/**
 * قاعده‌های فایل (برش ۸٫۴): مرورگر همان لحظهٔ انداختن می‌سنجد و سرور دوباره (قاعدهٔ ۲). از `settings` می‌آیند
 * (`file.formats`، `file.max_mb`، `file.max_pages`) و صفحهٔ اصلی با ISR به پوسته می‌دهدشان.
 */
export interface FileRules {
  formats: Record<FileFamily, boolean>;
  maxMb: number;
  maxPages: number;
}

/** پیش‌فرض: همهٔ خانواده‌ها روشن، و بزرگ‌ترین سقف‌ها. build و سرور بی پایگاه داده همین را دارند. */
export const DEFAULT_FILE_RULES: FileRules = {
  formats: { word: true, slides: true, image: true },
  maxMb: FILE_MAX_MB_LIMIT,
  maxPages: FILE_MAX_PAGES_LIMIT,
};

/**
 * آستانه‌های پیش‌فرض تشخیص رنگ.
 *
 * این اعداد نقطهٔ شروع‌اند، نه حقیقت. روی جزوه‌های اسکن‌شدهٔ واقعی باید کالیبره
 * شوند — به همین دلیل `colorRatio` و `chromaP95` خام ذخیره می‌شوند تا بازطبقه‌بندی
 * بدون داشتن فایل ممکن باشد (فایل خام بعد از ۱ تا ۲ روز پاک می‌شود).
 */
export const DEFAULT_THRESHOLDS: DetectionThresholds = {
  chromaMin: 36,
  colorPixelRatioMin: 0.004,
  coloredInkRatioMin: 0.12,
  sampleMaxDimension: 400,
  nearWhiteLuma: 244,
  nearBlackLuma: 26,
  paperSampleRatio: 0.1,
  lowDpiThreshold: 150,
};
