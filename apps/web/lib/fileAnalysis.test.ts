/**
 * وضعیت بررسی یک فایل: حالت اولیه، پیام‌های کارگر، و تجمیع برای کارت هشدار — شمارهٔ
 * صفحه‌ها و قاعدهٔ اسلاید (ADR-029).
 */

import { describe, expect, it } from 'vitest';
import type { PageAnalysis, PageWarning } from '@jozveyar/contracts';

import {
  applyWorkerMessage,
  browserPriceReady,
  initialAnalysis,
  isFileError,
  isServerPath,
  summarize,
  toServerPath,
  type AnalysisState,
} from './fileAnalysis';

function page(n: number, warnings: PageWarning[] = [], size: [number, number] = [595, 842]): PageAnalysis {
  return {
    n,
    widthPt: size[0],
    heightPt: size[1],
    rotation: 0,
    color: false,
    colorRatio: 0,
    coloredInkRatio: 0,
    chromaP95: 0,
    paperCast: [255, 255, 255],
    inkRatio: warnings.includes('blank_page') ? 0 : 0.05,
    blank: warnings.includes('blank_page'),
    estimatedDpi: warnings.includes('low_dpi') ? 96 : null,
    minMarginMm: warnings.includes('tight_margin') ? 3 : 20,
    warnings,
  };
}

function state(pages: PageAnalysis[], pageCount = pages.length, sampleStride = 1): AnalysisState {
  return {
    phase: 'ready',
    fileName: 'جزوه.pdf',
    fileSize: 1000,
    pageCount,
    pages,
    analyzedCount: pages.length,
    sampleStride,
    analysis: null,
    error: null,
    elapsedMs: 10,
    estimatedFrom: null,
  };
}

describe('summarize', () => {
  it('هر هشدار شمارهٔ صفحه‌هایش را دارد، نه فقط تعداد', () => {
    const summary = summarize(
      state([
        page(1, ['low_dpi']),
        page(2),
        page(3, ['blank_page', 'tight_margin']),
        page(4, ['low_dpi', 'tight_margin']),
      ]),
    );
    expect(summary).toMatchObject({
      lowDpiPages: [1, 4],
      lowDpiPageCount: 2,
      blankPages: [3],
      blankPageCount: 1,
      tightMarginPages: [3, 4],
      tightMarginPageCount: 2,
      mismatchedFonts: [],
      estimated: false,
    });
  });

  it('حاشیهٔ صفحهٔ اسلاید هشدار نمی‌شود؛ صفحهٔ A4 کنارش می‌شود', () => {
    const summary = summarize(
      state([
        page(1, ['tight_margin'], [960, 540]),
        page(2, ['tight_margin'], [720, 540]),
        page(3, ['tight_margin']),
        page(4, ['tight_margin'], [842, 595]),
      ]),
    );
    expect(summary.tightMarginPages).toEqual([3, 4]);
    expect(summary.tightMarginPageCount).toBe(2);
  });

  it('سند نمونه‌برداری‌شده: شمارش برآوردی، فهرست فقط صفحه‌های بررسی‌شده', () => {
    // ۳۰ صفحه، یکی از هر ۳ بررسی شد: ۱، ۴، ۷، …
    const pages = Array.from({ length: 10 }, (_, i) => page(1 + i * 3, i < 4 ? ['low_dpi'] : []));
    const summary = summarize(state(pages, 30, 3));
    expect(summary).toMatchObject({
      estimated: true,
      lowDpiPages: [1, 4, 7, 10],
      lowDpiPageCount: 12,
    });
  });
});

describe('حالت اولیه از نوع و حجم فایل', () => {
  it('PDF در صف کارگر؛ PDF بزرگ‌تر از توان مرورگر مسیر سرور', () => {
    expect(initialAnalysis({ name: 'a.pdf', size: 1000 }).phase).toBe('queued');
    expect(initialAnalysis({ name: 'a.pdf', size: 151 * 1024 * 1024 }).phase).toBe('needs_server');
  });

  it('عکس یک صفحه است، Word و پاورپوینت مسیر سرور، نوع ناشناس خطا با راه جلو', () => {
    expect(initialAnalysis({ name: 'scan.JPG', size: 10 })).toMatchObject({ phase: 'needs_server', pageCount: 1, estimatedFrom: 'image' });
    expect(initialAnalysis({ name: 'j.docx', size: 10 })).toMatchObject({ phase: 'needs_server', pageCount: 0 });
    const xlsx = initialAnalysis({ name: 'j.xlsx', size: 10 });
    expect(xlsx.phase).toBe('error');
    expect(xlsx.error?.code).toBe('unsupported_type');
    expect(isFileError(xlsx)).toBe(true);
  });
});

describe('پیام‌های کارگر', () => {
  const queued = initialAnalysis({ name: 'a.pdf', size: 1000 });

  it('شمارش فقط تعداد صفحه را می‌گذارد و فایل در صف بررسی می‌ماند', () => {
    const counted = applyWorkerMessage(queued, { kind: 'counted', job: 1, pageCount: 40 }, 5);
    expect(counted).toMatchObject({ phase: 'queued', pageCount: 40, analyzedCount: 0 });
    expect(browserPriceReady(counted)).toBe(false);
  });

  it('بررسی کامل: meta، صفحه‌ها، done — اولین قیمت از صفحهٔ هشتم', () => {
    let state = applyWorkerMessage(queued, { kind: 'meta', job: 1, pageCount: 40, sampleStride: 1 }, 1);
    for (let n = 1; n <= 8; n += 1) {
      expect(browserPriceReady(state)).toBe(false);
      state = applyWorkerMessage(state, { kind: 'page', job: 1, page: page(n), analyzedCount: n }, n * 10);
    }
    expect(state).toMatchObject({ phase: 'analyzing', analyzedCount: 8, elapsedMs: 80 });
    expect(browserPriceReady(state)).toBe(true);
  });

  it('مرورگر کم آورد: مسیر سرور؛ فایل خراب: خطای خود فایل', () => {
    const gaveUp = applyWorkerMessage(queued, { kind: 'error', job: 1, code: 'render_failed', message: '' }, 1);
    expect([isServerPath(gaveUp), isFileError(gaveUp)]).toEqual([true, false]);
    const broken = applyWorkerMessage(queued, { kind: 'error', job: 1, code: 'corrupt_file', message: '' }, 1);
    expect([isServerPath(broken), isFileError(broken)]).toEqual([false, true]);
    expect(isServerPath(toServerPath(queued))).toBe(true);
  });
});
