/**
 * تجمیع تحلیل مرورگر برای کارت هشدار: شمارهٔ صفحه‌ها، و قاعدهٔ اسلاید (ADR-029).
 */

import { describe, expect, it } from 'vitest';
import type { PageAnalysis, PageWarning } from '@jozveyar/contracts';

import { summarize, type AnalysisState } from './useDocumentAnalysis';

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
