/**
 * تجمیع بررسی مرورگر یک فایل برای کارت «جزوهٔ تو» و قیمت — خالص، بی React.
 *
 * جدا از `fileAnalysis.ts` است چون فقط رابط پس از فایل آن را می‌خواهد، که با اولین فایل بار می‌شود؛
 * صف جزوه (در باندل اولیه) فقط حالت فایل را لازم دارد (docs/UI.md، ۴ب).
 */

import { isSlidePage, paperSizeName } from '@jozveyar/analysis';
import type { AnalysisState } from './fileAnalysis';

export interface AnalysisSummaryView {
  pageCount: number;
  colorPageCount: number;
  blankPageCount: number;
  lowDpiPageCount: number;
  tightMarginPageCount: number;
  pageSizes: { name: string; count: number }[];
  /** صفحاتی که رنگی تشخیص داده شده‌اند — ورودی حالت ترکیبی در آینده. */
  colorPages: number[];
  /**
   * شمارهٔ صفحه‌های هر هشدار، از ۱ (ADR-029). در سند نمونه‌برداری‌شده فقط صفحه‌های
   * بررسی‌شده‌اند، پس نمونه‌اند نه فهرست کامل؛ شمارش بالا برآورد است.
   */
  blankPages: number[];
  lowDpiPages: number[];
  /** بدون صفحه‌های اسلاید: اسلاید برای چاپ کوچک می‌شود و لبه‌اش لبهٔ کاغذ نیست. */
  tightMarginPages: number[];
  /** فونت‌هایی که روی سرور نبودند و جایگزینشان اندازهٔ دیگری دارد — فقط از سرور. */
  mismatchedFonts: string[];
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
  const blankPages: number[] = [];
  const lowDpiPages: number[] = [];
  const tightMarginPages: number[] = [];

  for (const page of pages) {
    const name = paperSizeName(page.widthPt, page.heightPt);
    sizes.set(name, (sizes.get(name) ?? 0) + 1);
    if (page.color) colorPages.push(page.n);
    if (page.blank) blankPages.push(page.n);
    if (page.warnings.includes('low_dpi')) lowDpiPages.push(page.n);
    // همان قاعدهٔ سرور (`analysisView`): حاشیهٔ اسلاید حساب می‌شود ولی هشدار نمی‌شود.
    if (page.warnings.includes('tight_margin') && !isSlidePage(page.widthPt, page.heightPt)) {
      tightMarginPages.push(page.n);
    }
  }

  const scale = (value: number) =>
    sampleStride > 1 ? Math.min(pageCount, Math.round(value * sampleStride)) : value;

  return {
    pageCount,
    colorPageCount: scale(colorPages.length),
    blankPageCount: scale(blankPages.length),
    lowDpiPageCount: scale(lowDpiPages.length),
    tightMarginPageCount: scale(tightMarginPages.length),
    pageSizes: [...sizes.entries()]
      .map(([name, count]) => ({ name, count: scale(count) }))
      .sort((a, b) => b.count - a.count),
    colorPages,
    blankPages,
    lowDpiPages,
    tightMarginPages,
    mismatchedFonts: [],
    estimated: sampleStride > 1,
  };
}
