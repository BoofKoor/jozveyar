/**
 * وضعیت بررسی مرورگر برای یک فایل — خالص، بی React.
 *
 * هر فایل جزوه یکی از این دارد (`lib/jozve.ts`). اینجا فقط «فایل چه هست» حساب می‌شود:
 * حالت اولیه از نوع فایل و اعمال پیام‌های کارگر تحلیل. اینکه کدام فایل کِی به کارگر برود کار
 * صف است، نه این ماژول؛ تجمیع برای کارت و قیمت در `fileSummary.ts` است، که فقط رابط پس از فایل
 * آن را می‌خواهد (docs/UI.md، ۴ب).
 */

import type { DocumentAnalysis, PageAnalysis } from '@jozveyar/contracts';
import {
  ERROR_MESSAGES,
  FIRST_PRICE_AFTER_PAGES,
  MAX_BROWSER_ANALYSIS_BYTES,
  fileKind,
  type AnalysisErrorCode,
  type WorkerResponse,
} from './analysis-protocol';

export type AnalysisPhase =
  | 'idle'
  /** PDF در صف کارگر: هنوز نوبتش نشده، یا فقط شمرده شده و بررسی رنگ و کیفیتش مانده. */
  | 'queued'
  | 'reading'
  | 'analyzing'
  | 'ready'
  /**
   * مسیر سرور: Word، پاورپوینت و عکس (تبدیل، ADR-028)، یا PDF‌ای که برای مرورگر
   * بزرگ است. بن‌بست نیست، فقط چند ثانیه کندتر.
   */
  | 'needs_server'
  | 'error';

export interface AnalysisState {
  phase: AnalysisPhase;
  fileName: string | null;
  fileSize: number;
  /** به محض باز شدن سند معلوم می‌شود، قبل از تحلیل صفحات؛ در صف جزوه، با شمارش. */
  pageCount: number;
  pages: PageAnalysis[];
  analyzedCount: number;
  sampleStride: number;
  /** null تا وقتی تحلیل تمام شود. */
  analysis: DocumentAnalysis | null;
  error: { code: AnalysisErrorCode; title: string; hint: string } | null;
  elapsedMs: number;
  /**
   * `pageCount` در مسیر سرور، پیش از رسیدن عدد سرور: `office` یعنی عددی که خود
   * Word یا پاورپوینت در فایل نوشته، `image` یعنی «هر عکس یک صفحه». پیش‌فاکتور
   * فوری است؛ قیمت قطعی از شمارش PDF تبدیل‌شده می‌آید.
   */
  estimatedFrom: 'office' | 'image' | null;
}

export const INITIAL: AnalysisState = {
  phase: 'idle',
  fileName: null,
  fileSize: 0,
  pageCount: 0,
  pages: [],
  analyzedCount: 0,
  sampleStride: 1,
  analysis: null,
  error: null,
  elapsedMs: 0,
  estimatedFrom: null,
};

/** خطاهای مرورگر که یعنی «مرورگر کم آورد»، نه «فایل خراب است». */
export const BROWSER_GAVE_UP: readonly AnalysisErrorCode[] = ['render_failed', 'unknown'];

/**
 * حالت اولیهٔ یک فایل تازه، فقط از نام و حجمش — هنوز چیزی از آن خوانده نشده.
 *
 * - نوع ناشناس: خطا با راه جلو.
 * - عکس: یک صفحهٔ A4؛ رنگ و کیفیتش را سرور بعد از تبدیل می‌گوید.
 * - Word و پاورپوینت: مسیر سرور؛ پیش‌فاکتورشان را خواندن فهرست zip جدا می‌دهد.
 * - PDF بزرگ‌تر از توان مرورگر: مسیر سرور.
 * - بقیهٔ PDFها: صف کارگر.
 */
export function initialAnalysis(file: { name: string; size: number }): AnalysisState {
  const base: AnalysisState = { ...INITIAL, fileName: file.name, fileSize: file.size };
  const kind = fileKind(file.name);
  if (kind === null) {
    return {
      ...base,
      phase: 'error',
      error: { code: 'unsupported_type', ...ERROR_MESSAGES.unsupported_type },
    };
  }
  if (kind === 'image') return { ...base, phase: 'needs_server', pageCount: 1, estimatedFrom: 'image' };
  if (kind !== 'pdf') return { ...base, phase: 'needs_server' };
  if (file.size > MAX_BROWSER_ANALYSIS_BYTES) return { ...base, phase: 'needs_server' };
  return { ...base, phase: 'queued' };
}

/**
 * یک پیام کارگر روی وضعیت فایل. `elapsedMs` از شروع همین کار است.
 *
 * `counted` (شمارش بدون بررسی) فقط تعداد صفحه را می‌گذارد و فایل را در صف نگه می‌دارد تا
 * نوبت بررسی کاملش برسد.
 */
export function applyWorkerMessage(
  state: AnalysisState,
  message: WorkerResponse,
  elapsedMs: number,
): AnalysisState {
  switch (message.kind) {
    case 'counted':
      return { ...state, phase: 'queued', pageCount: message.pageCount };
    case 'meta':
      return {
        ...state,
        phase: 'analyzing',
        pageCount: message.pageCount,
        sampleStride: message.sampleStride,
      };
    case 'page':
      return {
        ...state,
        phase: 'analyzing',
        pages: [...state.pages, message.page],
        analyzedCount: message.analyzedCount,
        elapsedMs,
      };
    case 'done':
      return {
        ...state,
        phase: 'ready',
        analysis: message.analysis,
        pages: message.analysis.pages,
        pageCount: message.analysis.pageCount,
        analyzedCount: message.analysis.pages.length,
        elapsedMs: message.analysis.elapsedMs,
      };
    case 'error':
      return { ...state, phase: 'error', error: { code: message.code, ...ERROR_MESSAGES[message.code] } };
    default:
      return state;
  }
}

/** کارگر ساخته نشد، فایل خوانده نشد یا کارگر وسط کار افتاد: بی‌صدا مسیر سرور. */
export function toServerPath(state: AnalysisState): AnalysisState {
  return { ...state, phase: 'needs_server' };
}

/**
 * مسیر سرور: Word، پاورپوینت و عکس همیشه (تبدیل، ADR-028)؛ PDF وقتی برای مرورگر
 * بزرگ بود یا مرورگر وسط راه کم آورد. قاعدهٔ محصول: «مرورگر کم آورد ← بی‌صدا
 * مسیر سرور».
 */
export function isServerPath(state: AnalysisState): boolean {
  return (
    state.phase === 'needs_server' ||
    (state.phase === 'error' && state.error !== null && BROWSER_GAVE_UP.includes(state.error.code))
  );
}

/** خطای خود فایل (رمز، خراب، بی‌صفحه، نوع ناشناس) — سرور هم نمی‌تواند؛ آپلود نمی‌شود. */
export function isFileError(state: AnalysisState): boolean {
  return state.phase === 'error' && !isServerPath(state);
}

/** اولین قیمت مسیر مرورگر: سند باز شد و چند صفحهٔ اول بررسی شد (یا همه). */
export function browserPriceReady(state: AnalysisState): boolean {
  return (
    state.pageCount > 0 && (state.phase === 'ready' || state.analyzedCount >= FIRST_PRICE_AFTER_PAGES)
  );
}
