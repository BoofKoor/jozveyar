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
