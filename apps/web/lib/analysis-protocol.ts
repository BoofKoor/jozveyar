/**
 * قرارداد پیام‌های بین صفحه و کارگر تحلیل.
 *
 * جدا نگه داشته می‌شود چون هم صفحه و هم کارگر به آن نیاز دارند و نباید هیچ‌کدام
 * کد دیگری را import کند.
 */

import type { DetectionThresholds, DocumentAnalysis, PageAnalysis } from '@jozveyar/contracts';

/**
 * سقف حجم فایل برای تحلیل در مرورگر.
 *
 * فایل باید کامل در حافظه بیاید تا pdf.js بتواند بخواندش. روی گوشی ۳ گیگ رم،
 * فایل بزرگ‌تر از این یا تب را می‌کشد یا سوآپ می‌کند. بالای این حجم مستقیم به
 * مسیر سرور می‌رود — که کندتر است، ولی بن‌بست نیست.
 */
export const MAX_BROWSER_ANALYSIS_BYTES = 150 * 1024 * 1024;

/** تا این تعداد صفحه کامل تحلیل می‌شود؛ بالاتر نمونه‌برداری می‌شود. */
export const MAX_PAGES_TO_ANALYZE = 200;

/** بعد از این تعداد صفحه، اولین قیمت نشان داده می‌شود و بقیه در پس‌زمینه ادامه می‌یابد. */
export const FIRST_PRICE_AFTER_PAGES = 8;

/**
 * پسوندهایی که می‌پذیریم — همان فهرست سرور (`KINDS` در `lib/server/uploads.ts`)،
 * که تصمیم آخر با اوست. PDF در مرورگر خوانده می‌شود؛ بقیه روی سرور به PDF تبدیل
 * می‌شوند (ADR-028).
 */
export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'jpg', 'jpeg', 'png', 'webp', 'heic'];

export function extensionOf(name: string): string {
  return /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** نوع فایل از پسوند — برای مسیر و متن پیام‌ها؛ کارگر خودش محتوا را می‌سنجد. */
export type FileKind = 'pdf' | 'word' | 'slides' | 'image';

export function fileKind(name: string): FileKind | null {
  switch (extensionOf(name)) {
    case 'pdf':
      return 'pdf';
    case 'docx':
    case 'doc':
      return 'word';
    case 'pptx':
    case 'ppt':
      return 'slides';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'heic':
      return 'image';
    default:
      return null;
  }
}

export interface AnalyzeRequest {
  kind: 'analyze';
  /** بافر فایل. با transfer فرستاده می‌شود تا کپی نشود. */
  buffer: ArrayBuffer;
  thresholds: DetectionThresholds;
  maxPagesToAnalyze: number;
}

export type WorkerResponse =
  | { kind: 'meta'; pageCount: number; sampleStride: number }
  | { kind: 'page'; page: PageAnalysis; analyzedCount: number }
  | { kind: 'done'; analysis: DocumentAnalysis }
  | { kind: 'error'; code: AnalysisErrorCode; message: string };

export type AnalysisErrorCode =
  | 'password_protected'
  | 'corrupt_file'
  | 'no_pages'
  | 'render_failed'
  | 'unsupported_type'
  | 'unknown';

/**
 * پیام فارسی هر خطا، به‌علاوهٔ راه جلو.
 *
 * قاعدهٔ محصول: هیچ بن‌بستی نداریم. هر خطا باید بگوید کاربر بعد چه کند —
 * «به تلگرام پیام بدهید» جواب نیست.
 */
export const ERROR_MESSAGES: Record<AnalysisErrorCode, { title: string; hint: string }> = {
  password_protected: {
    title: 'این فایل رمز دارد',
    hint: 'رمز را از فایل بردارید و دوباره بیندازید. اگر رمز را ندارید، فایل بدون رمز را از منبع اصلی بگیرید.',
  },
  corrupt_file: {
    title: 'این فایل خوانده نشد',
    hint: 'فایل ممکن است نیمه‌کاره دانلود شده باشد. دوباره دانلود کنید و بیندازید.',
  },
  no_pages: {
    title: 'این فایل صفحه‌ای ندارد',
    hint: 'فایل درست را انتخاب کنید — چیزی برای چاپ پیدا نشد.',
  },
  render_failed: {
    title: 'تحلیل در مرورگر کامل نشد',
    hint: 'فایل را آپلود کنید تا سمت سرور بررسی شود. قیمت بعد از بررسی نشان داده می‌شود.',
  },
  unsupported_type: {
    title: 'این نوع فایل را نمی‌گیریم',
    hint: 'PDF، Word، پاورپوینت یا عکس (JPG، PNG، WebP، HEIC) بینداز. اگر جزوه با برنامهٔ دیگری ساخته شده، از همان برنامه خروجی PDF بگیر.',
  },
  unknown: {
    title: 'مشکلی در خواندن فایل پیش آمد',
    hint: 'دوباره تلاش کنید. اگر تکرار شد، فایل را آپلود کنید تا سمت سرور بررسی شود.',
  },
};

/**
 * پیام شکست تحلیل یا تبدیل **سرور** (کدهای کارگر، ADR-028). سه کد اول همان
 * خطاهای فایل‌اند و همان پیام را می‌گیرند؛ بقیه یعنی سرور هم نتوانست — و
 * «آپلود کنید» دیگر راه جلو نیست. راه جلو تقریباً همیشه PDF است، که در مرورگر
 * خوانده می‌شود و به تبدیل سرور نیاز ندارد.
 */
export function serverFailureMessage(
  code: string | undefined,
  kind: FileKind | null = 'pdf',
): { title: string; hint: string } {
  if (code === 'password_protected' || code === 'corrupt_file' || code === 'no_pages') {
    return ERROR_MESSAGES[code];
  }
  const program = kind === 'slides' ? 'پاورپوینت' : 'Word';
  switch (code) {
    case 'convert_failed':
      return {
        title: `این فایل ${program} باز نشد`,
        hint: `فایل را یک بار در ${program} باز کن، با «Save As» خروجی PDF بگیر و همان PDF را بینداز.`,
      };
    case 'convert_timeout':
    case 'too_heavy':
      return {
        title: 'این فایل برای تبدیل روی سرور خیلی سنگین است',
        hint: `از خود ${program} خروجی PDF بگیر و همان را بینداز؛ PDF همین‌جا در مرورگر فوری خوانده می‌شود.`,
      };
    case 'unsupported_format':
      return {
        title: 'محتوای این فایل با پسوندش جور نیست',
        hint: 'فایل اصلی را بینداز، نه نسخه‌ای که پسوندش دستی عوض شده؛ یا از برنامه‌اش خروجی PDF بگیر.',
      };
    case 'image_unreadable':
      return {
        title: 'این عکس باز نشد',
        hint: 'عکس ممکن است ناقص رسیده باشد. یک بار دیگر از گالری انتخابش کن و بینداز.',
      };
    case 'image_too_large':
      return {
        title: 'این عکس خیلی بزرگ است',
        hint: 'عکس را با وضوح کمتر (مثلاً 12 مگاپیکسل) ذخیره کن و دوباره بینداز.',
      };
    default:
      return {
        title: 'این فایل خوانده نشد',
        hint: 'از برنامه‌ای که جزوه را با آن ساختی یک بار دیگر خروجی PDF بگیر و همان را بینداز. اگر فایل اسکن است، با کیفیت کمتری اسکن کن.',
      };
  }
}

/**
 * سرور آپلود را نپذیرفت (`reason` همان کد خطای API است). فقط دو دلیل به فایل
 * برمی‌گردد؛ بقیه (استوریج نیست، دیسک پر، شبکه) گذرا است.
 */
export function uploadRefusalMessage(reason: string | undefined): string {
  if (reason === 'unsupported_type') return ERROR_MESSAGES.unsupported_type.hint;
  if (reason === 'too_large') {
    return 'این فایل از سقف حجمی که می‌گیریم بزرگ‌تر است. از برنامه‌اش خروجی PDF با کیفیت کمتر بگیر و همان را بینداز.';
  }
  return 'الان نمی‌توانیم این فایل را بگیریم. چند دقیقهٔ دیگر دوباره بینداز؛ یا اگر فایل کوچک‌تری از همین جزوه داری، همان را امتحان کن.';
}
