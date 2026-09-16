'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_THRESHOLDS, type DocumentAnalysis, type PageAnalysis } from '@jozveyar/contracts';
import { paperSizeName } from '@jozveyar/analysis';
import {
  ERROR_MESSAGES,
  MAX_BROWSER_ANALYSIS_BYTES,
  MAX_PAGES_TO_ANALYZE,
  type AnalysisErrorCode,
  type AnalyzeRequest,
  type WorkerResponse,
} from './analysis-protocol';

export type AnalysisPhase =
  | 'idle'
  | 'reading'
  | 'analyzing'
  | 'ready'
  /** فایل برای مرورگر بزرگ است — مسیر سرور. بن‌بست نیست، فقط کندتر. */
  | 'needs_server'
  | 'error';

export interface AnalysisState {
  phase: AnalysisPhase;
  fileName: string | null;
  fileSize: number;
  /** به محض باز شدن سند معلوم می‌شود، قبل از تحلیل صفحات. */
  pageCount: number;
  pages: PageAnalysis[];
  analyzedCount: number;
  sampleStride: number;
  /** null تا وقتی تحلیل تمام شود. */
  analysis: DocumentAnalysis | null;
  error: { code: AnalysisErrorCode; title: string; hint: string } | null;
  elapsedMs: number;
}

const INITIAL: AnalysisState = {
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
};

/** پسوندهایی که مسیر مرورگر می‌روند. بقیه از روز اول مسیر سرور دارند. */
const BROWSER_PATH = /\.pdf$/i;

export interface AnalysisSummaryView {
  pageCount: number;
  colorPageCount: number;
  blankPageCount: number;
  lowDpiPageCount: number;
  tightMarginPageCount: number;
  pageSizes: { name: string; count: number }[];
  /** صفحاتی که رنگی تشخیص داده شده‌اند — ورودی حالت ترکیبی در آینده. */
  colorPages: number[];
  /** true یعنی عددها از نمونه برآورد شده‌اند، نه شمارش کامل. */
  estimated: boolean;
}

/**
 * تجمیع تحلیل برای نمایش و قیمت.
 *
 * وقتی نمونه‌برداری شده، شمارش‌ها به نسبت گام نمونه بزرگ می‌شوند تا عدد نمایشی
 * با تعداد واقعی صفحات جور باشد. برآورد صریحاً علامت می‌خورد، چون قیمت قطعی
 * را سرور می‌دهد نه این عدد.
 */
export function summarize(state: AnalysisState): AnalysisSummaryView {
  const { pages, pageCount, sampleStride } = state;
  const sizes = new Map<string, number>();
  const colorPages: number[] = [];
  let color = 0;
  let blank = 0;
  let lowDpi = 0;
  let tightMargin = 0;

  for (const page of pages) {
    const name = paperSizeName(page.widthPt, page.heightPt);
    sizes.set(name, (sizes.get(name) ?? 0) + 1);
    if (page.color) {
      color += 1;
      colorPages.push(page.n);
    }
    if (page.blank) blank += 1;
    if (page.warnings.includes('low_dpi')) lowDpi += 1;
    if (page.warnings.includes('tight_margin')) tightMargin += 1;
  }

  const scale = (value: number) =>
    sampleStride > 1 ? Math.min(pageCount, Math.round(value * sampleStride)) : value;

  return {
    pageCount,
    colorPageCount: scale(color),
    blankPageCount: scale(blank),
    lowDpiPageCount: scale(lowDpi),
    tightMarginPageCount: scale(tightMargin),
    pageSizes: [...sizes.entries()]
      .map(([name, count]) => ({ name, count: scale(count) }))
      .sort((a, b) => b.count - a.count),
    colorPages,
    estimated: sampleStride > 1,
  };
}

export function useDocumentAnalysis() {
  const [state, setState] = useState<AnalysisState>(INITIAL);
  const workerRef = useRef<Worker | null>(null);
  const startedAtRef = useRef(0);

  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => disposeWorker, [disposeWorker]);

  const reset = useCallback(() => {
    disposeWorker();
    setState(INITIAL);
  }, [disposeWorker]);

  const analyzeFile = useCallback(
    async (file: File) => {
      // فایل جدید، تحلیل قبلی را لغو می‌کند — وگرنه نتیجهٔ کهنه قیمت را خراب می‌کند.
      disposeWorker();
      startedAtRef.current = Date.now();

      const base = {
        ...INITIAL,
        fileName: file.name,
        fileSize: file.size,
      };

      if (!BROWSER_PATH.test(file.name)) {
        // Word، پاورپوینت و عکس در مرورگر قابل تجزیه نیستند. مسیر سرور
        // از روز اول در طرح هست؛ تا ساخته شود، کاربر پیام روشن می‌بیند.
        setState({ ...base, phase: 'needs_server' });
        return;
      }

      if (file.size > MAX_BROWSER_ANALYSIS_BYTES) {
        setState({ ...base, phase: 'needs_server' });
        return;
      }

      setState({ ...base, phase: 'reading' });

      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        setState({ ...base, phase: 'needs_server' });
        return;
      }

      let worker: Worker;
      try {
        worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        // کارگر ساخته نشد (مرورگر قدیمی یا سیاست امنیتی). بن‌بست نداریم.
        setState({ ...base, phase: 'needs_server' });
        return;
      }
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        setState((current) => {
          switch (message.kind) {
            case 'meta':
              return {
                ...current,
                phase: 'analyzing',
                pageCount: message.pageCount,
                sampleStride: message.sampleStride,
              };
            case 'page':
              return {
                ...current,
                phase: 'analyzing',
                pages: [...current.pages, message.page],
                analyzedCount: message.analyzedCount,
                elapsedMs: Date.now() - startedAtRef.current,
              };
            case 'done':
              return {
                ...current,
                phase: 'ready',
                analysis: message.analysis,
                pages: message.analysis.pages,
                pageCount: message.analysis.pageCount,
                analyzedCount: message.analysis.pages.length,
                elapsedMs: message.analysis.elapsedMs,
              };
            case 'error':
              return {
                ...current,
                phase: 'error',
                error: { code: message.code, ...ERROR_MESSAGES[message.code] },
              };
            default:
              return current;
          }
        });
      };

      worker.onerror = () => {
        setState((current) => ({
          ...current,
          phase: 'error',
          error: { code: 'unknown', ...ERROR_MESSAGES.unknown },
        }));
      };

      const request: AnalyzeRequest = {
        kind: 'analyze',
        buffer,
        thresholds: DEFAULT_THRESHOLDS,
        maxPagesToAnalyze: MAX_PAGES_TO_ANALYZE,
      };
      // بافر منتقل می‌شود نه کپی — برای فایل ۱۰۰ مگابایتی روی گوشی مهم است.
      worker.postMessage(request, [buffer]);
    },
    [disposeWorker],
  );

  return { state, analyzeFile, reset, summary: summarize(state) };
}
