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
  unknown: {
    title: 'مشکلی در خواندن فایل پیش آمد',
    hint: 'دوباره تلاش کنید. اگر تکرار شد، فایل را آپلود کنید تا سمت سرور بررسی شود.',
  },
};

/**
 * پیام شکست تحلیل **سرور**. سه کد اول همان خطاهای فایل‌اند و همان پیام را
 * می‌گیرند؛ بقیه یعنی سرور هم نتوانست — و «آپلود کنید» دیگر راه جلو نیست.
 */
export function serverFailureMessage(code: string | undefined): { title: string; hint: string } {
  if (code === 'password_protected' || code === 'corrupt_file' || code === 'no_pages') {
    return ERROR_MESSAGES[code];
  }
  return {
    title: 'این فایل خوانده نشد',
    hint: 'از برنامه‌ای که جزوه را با آن ساختی یک بار دیگر خروجی PDF بگیر و همان را بینداز. اگر فایل اسکن است، با کیفیت کمتری اسکن کن.',
  };
}
