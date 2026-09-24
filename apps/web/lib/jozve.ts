/**
 * جزوهٔ چندفایلی — مدل خالص (ADR-030).
 *
 * جزوه فهرستی مرتب از فایل‌هاست که پشت‌سرهم، بی صفحهٔ سفید بینشان، یک‌جا صحافی
 * می‌شوند. هر فایل یک سند جدا روی سرور است. اینجا بی React و بی مرورگر حساب می‌شود:
 *  - هر فایل الان چه وضعی دارد و در قیمت چه سهمی (`sectionView`)؛
 *  - جمع جزوه، و اینکه قیمت قطعی است یا نه (`jozveView`)؛
 *  - نوبت کارگر تحلیل و نوبت آپلود (`nextAnalysisJob`، `nextUpload`)؛
 *  - ترتیب اولیهٔ فایل‌هایی که با هم انداخته شده‌اند (`orderBatch`).
 *
 * اجرای صف با کارگر و آپلودگر واقعی در `jozveController.ts` است و همین تصمیم‌ها را
 * می‌گیرد.
 */

import type { OrderSpec } from '@jozveyar/contracts';
import { itemPageCount, wholeDocumentRule } from '@jozveyar/pricing';
import { normalizeFa } from '@jozveyar/text';
import { serverFailureMessage, uploadRefusal, type FileKind } from './analysis-protocol';
import {
  browserPriceReady,
  isFileError,
  isServerPath,
  summarize,
  type AnalysisState,
  type AnalysisSummaryView,
} from './fileAnalysis';
import type { OrderConfig } from '../components/ConfigPanel';
import type { ServerAnalysisView } from './server/uploads';
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

/* ─────────────────────────── یک فایل ─────────────────────────── */

export interface SectionView {
  key: string;
  name: string;
  size: number;
  kind: FileKind | null;
  /** وضعیت مرورگر؛ وقتی عدد سرور رسیده، با همان عدد (برای کارت). */
  state: AnalysisState;
  upload: UploadSnapshot | null;
  documentId: string | null;
  serverPath: boolean;
  /** مسیر سرور با پیش‌فاکتور: عددی که خود Word نوشته، یا «یک عکس یک صفحه». */
  estimate: boolean;
  serverReady: boolean;
  serverFailed: boolean;
  /** سرور آپلود را نپذیرفت یا آپلود نرسید. */
  uploadRefused: boolean;
  /** سهم این فایل در قیمت؛ عدد سرور وقتی رسیده. صفر یعنی هنوز معلوم نیست. */
  pageCount: number;
  /** عددی که مرورگر یا خود Word گفته بود و سرور چیز دیگری دید. */
  correctedFrom: number | null;
  /** فایلی که در قیمت نمی‌آید، با پیام و راه جلو — نه بن‌بست. */
  blocked: { title: string; hint: string } | null;
  /** هنوز شمرده نشده: در صف کارگر، یا مسیر سروری که پیش‌فاکتور ندارد. */
  pending: boolean;
  /** عدد این فایل قطعی است: بررسی کامل مرورگر، یا عدد سرور. */
  settled: boolean;
  summary: AnalysisSummaryView;
}

/** تحلیل سرور به همان شکلی که کارت تحلیل نشان می‌دهد. */
function serverSummary(server: ServerAnalysisView): AnalysisSummaryView {
  return {
    pageCount: server.pageCount ?? 0,
    colorPageCount: server.colorPageCount ?? 0,
    blankPageCount: server.blankPageCount ?? 0,
    lowDpiPageCount: server.lowDpiPageCount ?? 0,
    tightMarginPageCount: server.tightMarginPageCount ?? 0,
    pageSizes: server.pageSizes ?? [],
    colorPages: server.colorPages ?? [],
    blankPages: server.blankPages ?? [],
    lowDpiPages: server.lowDpiPages ?? [],
    tightMarginPages: server.tightMarginPages ?? [],
    mismatchedFonts: server.mismatchedFonts ?? [],
    estimated: false,
  };
}

/**
 * وضع یک فایل — همان قاعده‌های فلوی تک‌فایلی، برای هر فایل جدا.
 *
 * سرور منبع حقیقت است: وقتی همهٔ صفحه‌ها را دید، عدد او جای عدد مرورگر یا پیش‌فاکتور
 * می‌نشیند. تا آن موقع عدد مرورگر پیش‌فاکتور است.
 */
export function sectionView(section: Section): SectionView {
  const { analysis, upload } = section;
  const server = upload?.analysis;
  const serverPath = isServerPath(analysis);
  const serverReady = server?.state === 'ready' && (server.pageCount ?? 0) > 0;
  const serverFailed = server?.state === 'failed';
  const uploadRefused = upload?.phase === 'unavailable' || upload?.phase === 'failed';
  const estimate = serverPath && analysis.estimatedFrom !== null && analysis.pageCount > 0;
  const pageCount = serverReady ? server!.pageCount! : analysis.pageCount;

  let blocked: SectionView['blocked'] = null;
  if (!serverReady) {
    if (isFileError(analysis) && analysis.error) {
      blocked = { title: analysis.error.title, hint: analysis.error.hint };
    } else if (serverPath && serverFailed) {
      // پیش‌فاکتوری که سرور نتوانست تأییدش کند دیگر معنا ندارد.
      blocked = serverFailureMessage(server?.failureReason, section.kind);
    } else if (serverPath && !estimate && uploadRefused) {
      blocked = uploadRefusal(upload?.reason);
    }
  }

  return {
    key: section.key,
    name: section.file.name,
    size: section.file.size,
    kind: section.kind,
    state: serverReady
      ? {
          ...analysis,
          phase: 'ready',
          pageCount,
          analyzedCount: pageCount,
          sampleStride: 1,
          estimatedFrom: null,
        }
      : analysis,
    upload,
    documentId: upload?.documentId ?? null,
    serverPath,
    estimate,
    serverReady,
    serverFailed,
    uploadRefused,
    pageCount,
    correctedFrom:
      serverReady && analysis.pageCount > 0 && server!.pageCount !== analysis.pageCount
        ? analysis.pageCount
        : null,
    blocked,
    pending: blocked === null && pageCount === 0,
    settled: serverReady || (!serverPath && analysis.phase === 'ready'),
    summary: serverReady ? serverSummary(server!) : summarize(analysis),
  };
}

/* ─────────────────────────── کل جزوه ─────────────────────────── */

export interface JozveView {
  sections: SectionView[];
  /** فایل‌هایی که در قیمت‌اند: شمرده شده و بی خطا. */
  included: SectionView[];
  /** تعداد صفحهٔ جزوه — همان جمعی که `quote()` می‌کند. */
  pageCount: number;
  /** فایل‌هایی که هنوز شمرده نشده‌اند؛ قیمتشان بعداً اضافه می‌شود. */
  pending: SectionView[];
  /** فایل‌هایی که خوانده نشدند؛ قیمت بی آنهاست و «ادامه» تا روشن شدن تکلیفشان بسته. */
  blocked: SectionView[];
  /** قیمت هنوز ممکن است عوض شود. */
  provisional: boolean;
  summary: AnalysisSummaryView & {
    /** رنگ هیچ فایلی هنوز معلوم نیست (مثلاً فقط Word و عکس، پیش از سرور). */
    colorUnknown: boolean;
  };
}

export function jozveView(sections: readonly Section[]): JozveView {
  const views = sections.map(sectionView);
  const included = views.filter((v) => v.blocked === null && v.pageCount > 0);
  const sizes = new Map<string, number>();
  for (const v of included) {
    for (const size of v.summary.pageSizes) sizes.set(size.name, (sizes.get(size.name) ?? 0) + size.count);
  }
  const sum = (pick: (s: AnalysisSummaryView) => number) =>
    included.reduce((total, v) => total + pick(v.summary), 0);
  const pending = views.filter((v) => v.pending);

  return {
    sections: views,
    included,
    pageCount: itemPageCount(included),
    pending,
    blocked: views.filter((v) => v.blocked !== null),
    provisional: pending.length > 0 || included.some((v) => !v.settled),
    summary: {
      pageCount: itemPageCount(included),
      colorPageCount: sum((s) => s.colorPageCount),
      blankPageCount: sum((s) => s.blankPageCount),
      lowDpiPageCount: sum((s) => s.lowDpiPageCount),
      tightMarginPageCount: sum((s) => s.tightMarginPageCount),
      pageSizes: [...sizes.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      // شمارهٔ صفحه‌ها مال هر فایل است و زیر همان فایل نشان داده می‌شود، نه سراسری.
      colorPages: [],
      blankPages: [],
      lowDpiPages: [],
      tightMarginPages: [],
      mismatchedFonts: [],
      estimated: included.some((v) => v.summary.estimated),
      colorUnknown: included.length > 0 && included.every((v) => v.state.estimatedFrom !== null),
    },
  };
}

/**
 * مشخصات سفارش جزوه برای `quote()`: یک قلم، بخش‌ها به همین ترتیب. فایل آپلودنشده
 * شناسهٔ موقت می‌گیرد؛ قیمت به شناسه بند نیست. null یعنی هنوز صفحه‌ای شمرده نشده.
 */
export function jozveSpec(view: JozveView, config: OrderConfig): OrderSpec | null {
  if (view.pageCount === 0) return null;
  return {
    items: [
      {
        sections: view.included.map((v) => ({
          documentId: v.documentId ?? `draft-${v.key}`,
          pageCount: v.pageCount,
        })),
        rules: wholeDocumentRule(view.pageCount, config.colorMode, config.paperTypeId),
        copies: config.copies,
        sidesMode: config.sidesMode,
        bindingTypeId: config.bindingTypeId,
      },
    ],
    // شهر در مرحلهٔ آدرس گرفته می‌شود؛ تا آن موقع «ارسال از X تومان».
    shipping: null,
  };
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
