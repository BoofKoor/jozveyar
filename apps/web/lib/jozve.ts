/**
 * جزوهٔ چندفایلی — صف، خالص (ADR-030).
 *
 * جزوه فهرستی مرتب از فایل‌هاست که پشت‌سرهم، بی صفحهٔ سفید بینشان، یک‌جا صحافی
 * می‌شوند. هر فایل یک سند جدا روی سرور است. اینجا بی React و بی مرورگر حساب می‌شود:
 *  - نوبت کارگر تحلیل و نوبت آپلود (`nextAnalysisJob`، `nextUpload`)؛
 *  - ترتیب اولیهٔ فایل‌هایی که با هم انداخته شده‌اند (`orderBatch`).
 *
 * اجرای صف با کارگر و آپلودگر واقعی در `jozveController.ts` است و همین تصمیم‌ها را
 * می‌گیرد. وضع هر فایل و جمع جزوه برای رابط و قیمت در `jozveView.ts` است: صف از لحظهٔ
 * انداختن فایل کار می‌کند و در باندل اولیه است، ولی نما فقط با رابط پس از فایل بار می‌شود.
 */

import { normalizeFa } from '@jozveyar/text';
import type { FileKind } from './analysis-protocol';
import { browserPriceReady, isFileError, isServerPath, type AnalysisState } from './fileAnalysis';
import type { UploadPhase, UploadSnapshot } from './upload/client';

/** یک فایل جزوه، با هر چه مرورگر و سرور تا این لحظه درباره‌اش می‌دانند. */
export interface Section {
  /** کلید محلی و پایدار در جابه‌جایی؛ شناسهٔ سند سرور نیست. */
  key: string;
  file: File;
  kind: FileKind | null;
  analysis: AnalysisState;
  /** null تا وقتی نوبت آپلودش نرسیده. */
  upload: UploadSnapshot | null;
}

/** آپلودی که هنوز جریان دارد؛ فقط یکی در هر لحظه (سقف آپلود باز هر نشست، ADR-024). */
const ACTIVE_UPLOAD: ReadonlySet<UploadPhase> = new Set(['starting', 'uploading', 'offline']);

export function uploadActive(upload: UploadSnapshot | null): boolean {
  return upload !== null && ACTIVE_UPLOAD.has(upload.phase);
}

/* ─────────────────────────── نوبت‌ها ─────────────────────────── */

/**
 * کار بعدی کارگر تحلیل — یکی در هر لحظه، پس هر لحظه یک pdf.js و یک فایل در حافظه.
 *
 * اول **شمارش** همهٔ PDFها: قیمت کل جزوه فقط تعداد صفحه را لازم دارد و آن همان لحظهٔ باز
 * شدن معلوم است. بعد بررسی کامل رنگ و کیفیت، به ترتیب فهرست. فایلی که تنها
 * شمرده‌نشده است و نوبت بررسی‌اش هم رسیده، مستقیم بررسی می‌شود — بررسی کامل هم اول
 * می‌شمارد، و خواندن دوبارهٔ فایل هدر است. جزوهٔ تک‌فایلی عیناً همان رفتار قبل را دارد.
 */
export function nextAnalysisJob(sections: readonly Section[]): { key: string; countOnly: boolean } | null {
  const waiting = sections.filter((s) => s.analysis.phase === 'queued');
  const first = waiting[0];
  if (!first) return null;
  const uncounted = waiting.filter((s) => s.analysis.pageCount === 0);
  if (uncounted.length === 0 || (uncounted.length === 1 && uncounted[0] === first)) {
    return { key: first.key, countOnly: false };
  }
  return { key: uncounted[0]!.key, countOnly: true };
}

/** همهٔ PDFهای مسیر مرورگر شمرده شده‌اند: اولین قیمت کل جزوه روی صفحه است. */
export function jozveCounted(sections: readonly Section[]): boolean {
  return !sections.some(
    (s) => (s.analysis.phase === 'queued' || s.analysis.phase === 'reading') && s.analysis.pageCount === 0,
  );
}

/**
 * آپلود بعدی — یکی در هر لحظه: هم رم گوشی، هم سقف آپلود باز هر نشست (ADR-024).
 *
 * شرط شروع هر فایل همان فلوی تک‌فایلی است: PDF مسیر مرورگر بعد از اولین قیمت خودش، تا
 * با لحظهٔ جادو سر پردازنده و شبکه رقابت نکند؛ مسیر سرور بعد از شمارش همهٔ PDFها. مسیر
 * سرور جلوتر می‌رود، چون قیمت قطعی‌اش به سرور بند است و تبدیلش وقت می‌برد — Word پشت یک
 * PDF صدمگابایتی نمی‌ماند. فایلی که خطای خودش را دارد (رمز، خراب) آپلود نمی‌شود.
 */
export function nextUpload(sections: readonly Section[]): string | null {
  if (sections.some((s) => uploadActive(s.upload))) return null;
  const waiting = sections.filter((s) => s.upload === null && !isFileError(s.analysis));
  if (jozveCounted(sections)) {
    const server = waiting.find((s) => isServerPath(s.analysis));
    if (server) return server.key;
  }
  return waiting.find((s) => !isServerPath(s.analysis) && browserPriceReady(s.analysis))?.key ?? null;
}

/* ─────────────────────────── ترتیب ─────────────────────────── */

const byName = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });

/**
 * ترتیب فایل‌هایی که با هم انداخته شده‌اند: نام، با فهم عدد — «جلسه 2» پیش از «جلسه 10»،
 * و ارقام فارسی مثل لاتین. ترتیبی که مرورگر می‌دهد به سیستم‌عامل بسته است، و نام فایل
 * جزوه تقریباً همیشه شمارهٔ جلسه یا فصل دارد. پسوند در ترتیب نیست («جلسه 1.pdf» پیش از
 * «جلسه 1-ب.docx»)، و هم‌نام‌ها ترتیب خودشان را نگه می‌دارند.
 */
export function orderBatch<T extends { name: string }>(files: readonly T[]): T[] {
  const keyed = files.map((file) => ({ file, sortKey: normalizeFa(file.name.replace(/\.[^.]*$/, '')) }));
  return keyed.sort((a, b) => byName.compare(a.sortKey, b.sortKey)).map((entry) => entry.file);
}

/** جابه‌جایی یک فایل با همسایه‌اش؛ لبهٔ فهرست بی‌اثر است. */
export function moveSection<T extends { key: string }>(list: readonly T[], key: string, delta: -1 | 1): T[] {
  const from = list.findIndex((s) => s.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
