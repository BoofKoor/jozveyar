/**
 * نمای جزوهٔ چندفایلی — خالص (ADR-030).
 *
 * هر فایل الان چه وضعی دارد و در قیمت چه سهمی (`sectionView`)، جمع جزوه و اینکه قیمت قطعی
 * است یا نه (`jozveView`)، و مشخصات سفارش برای `quote()` (`jozveSpec`). نوبت‌ها و ترتیب صف در
 * `jozve.ts` است.
 *
 * جدا از صف است چون فقط رابط پس از فایل آن را می‌خواهد، که با اولین فایل بار می‌شود
 * (docs/UI.md، ۴ب)؛ `pricing` هم فقط از همین‌جا به صفحه می‌رسد، نه از باندل اولیه.
 */

import type { OrderSpec } from '@jozveyar/contracts';
import { itemPageCount, wholeDocumentRule } from '@jozveyar/pricing';
import type { FileKind } from './analysis-protocol';
import { isFileError, isServerPath, type AnalysisState } from './fileAnalysis';
import { summarize, type AnalysisSummaryView } from './fileSummary';
import type { RestoredFile, Section } from './jozve';
import type { OrderConfig } from './orderConfig';
import type { ServerAnalysisView } from './server/uploads';
import { serverFailureMessage, uploadRefusal } from './serverMessages';
import type { UploadSnapshot } from './upload/client';

/* ─────────────────────────── یک فایل ─────────────────────────── */

/**
 * بخش جزوهٔ برگشته بعد از رفرش (۳د) که فایلش روی سرور نرسیده بود: تا همان فایل دوباره انتخاب نشود، در قیمت و
 * سفارش نیست. اینجاست نه در صف (`jozve.ts`)، چون فقط رابط پس از فایل لازمش دارد و صف در باندل اولیه است.
 */
export function awaitsFile(section: Section): boolean {
  return !(section.file instanceof File) && section.upload === null;
}

/** همان فایل: نام، حجم و تاریخ تغییر — اثر انگشت ادامهٔ آپلود (ADR-024). */
export function sameFile(a: RestoredFile | File, b: RestoredFile | File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * فایل‌های تازه در جزوه‌ای که بعد از رفرش برگشت: هر فایلی که بخشی منتظرش است، به همان بخش (`resumed`؛ سند
 * نیمه‌کاره‌اش روی سرور می‌ماند تا آپلود از همان تکه ادامه دهد)، و بقیه فایل تازه (`rest`). پس همهٔ فایل‌ها را
 * یک‌جا هم می‌شود داد و هر کدام سر جای خودش می‌نشیند.
 */
export function matchAwaited(sections: readonly Section[], files: readonly File[]) {
  const resumed: { key: string; file: File }[] = [];
  const rest: File[] = [];
  for (const file of files) {
    const section = sections.find((s) => awaitsFile(s) && sameFile(s.file, file) && !resumed.some((r) => r.key === s.key));
    if (section) resumed.push({ key: section.key, file });
    else rest.push(file);
  }
  return { resumed, rest };
}

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
  /**
   * جزوه بعد از رفرش برگشت و این فایل روی سرور نرسیده بود (۳د): تا همان فایل دوباره انتخاب نشود، در قیمت و
   * سفارش نیست.
   */
  waiting: boolean;
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
  const waiting = awaitsFile(section);
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
    waiting,
    pending: blocked === null && !waiting && pageCount === 0,
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
  /** فایل‌های جزوهٔ برگشته که منتظر همان فایل‌اند (۳د)؛ قیمت بی آنهاست و «ادامه» تا رسیدنشان بسته. */
  waiting: SectionView[];
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
  const waiting = views.filter((v) => v.waiting);

  return {
    sections: views,
    included,
    pageCount: itemPageCount(included),
    pending,
    blocked: views.filter((v) => v.blocked !== null),
    waiting,
    provisional: pending.length > 0 || waiting.length > 0 || included.some((v) => !v.settled),
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
