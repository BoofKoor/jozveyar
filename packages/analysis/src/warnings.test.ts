import { describe, expect, it } from 'vitest';

import { isDeck, mismatchedFonts, pageWarnings, type WarningPage } from './warnings';

/** صفحه‌های پشت‌سرهم با یک هشدار، هر کدام با اندازهٔ خودش. پیش‌فرض: دو صفحهٔ A4. */
const pages = (
  warnings: string[],
  sizes: [number, number][] = [
    [595, 842],
    [595, 842],
  ],
): WarningPage[] =>
  sizes.map(([widthPt, heightPt], i) => ({ n: i + 1, widthPt, heightPt, blank: false, warnings }));

describe('هشدارهای سند برای پنل (ADR-029، ۸٫۱)', () => {
  it('هر هشدار با شمارهٔ صفحه‌هایش، از ۱ و به ترتیب؛ صفحهٔ خالی از خود صفحه', () => {
    expect(
      pageWarnings(
        [
          { n: 1, widthPt: 595, heightPt: 842, blank: false, warnings: ['low_dpi'] },
          { n: 2, widthPt: 595, heightPt: 842, blank: false, warnings: [] },
          { n: 3, widthPt: 420, heightPt: 595, blank: true, warnings: ['blank_page', 'tight_margin'] },
          { n: 4, widthPt: 595, heightPt: 842, blank: false, warnings: ['low_dpi', 'tight_margin'] },
        ],
        false,
      ),
    ).toEqual({ blank: [3], lowDpi: [1, 4], tightMargin: [3, 4] });
  });

  it('پاورپوینت هشدار حاشیه نمی‌گیرد — چه کارگر تشخیص داده باشد، چه نوع سند', () => {
    expect(isDeck({ format: 'pptx', fonts: { mismatched: [] } }, 'pptx')).toBe(true);
    // «docx» که در واقع ارائهٔ ODF بود: محتوا تصمیم می‌گیرد، نه پسوند.
    expect(isDeck({ format: 'odp' }, 'docx')).toBe(true);
    // هنوز تبدیل ثبت نشده (یا ستون خراب است): نوع سند.
    expect(isDeck(null, 'pptx')).toBe(true);
    expect(isDeck('pptx', 'docx')).toBe(false);
    // Word همان هشدار را می‌گیرد، با شمارهٔ صفحه‌ها.
    expect(isDeck({ format: 'docx' }, 'docx')).toBe(false);
    expect(isDeck(null, 'pdf')).toBe(false);
    expect(pageWarnings(pages(['tight_margin']), true).tightMargin).toEqual([]);
    expect(pageWarnings(pages(['tight_margin']), false).tightMargin).toEqual([1, 2]);
  });

  it('PDF اسلاید: فقط صفحه‌هایی که شکل کاغذ دارند هشدار حاشیه می‌گیرند', () => {
    const view = pageWarnings(
      pages(
        ['tight_margin', 'low_dpi'],
        [
          [960, 540], // ۱۶:۹
          [595, 842], // جزوهٔ A4 وسط اسلایدها
          [720, 540], // ۴:۳
          [842, 595], // A4 افقی: سند است
        ],
      ),
      false,
    );
    expect(view.tightMargin).toEqual([2, 4]);
    // کیفیت اسکن اسلاید هم کیفیت چاپ است.
    expect(view.lowDpi).toEqual([1, 2, 3, 4]);
  });

  it('فونت جایگزین با نام کوتاه‌شده؛ ستون خراب یا تبدیل‌نشده هیچ', () => {
    expect(
      mismatchedFonts({
        format: 'docx',
        fonts: { requested: ['B Nazanin', 'Times New Roman'], mismatched: ['B Nazanin', ' ', 42, 'X'.repeat(500)] },
      }),
    ).toEqual(['B Nazanin', 'X'.repeat(60)]);
    expect(mismatchedFonts({ fonts: { mismatched: Array.from({ length: 80 }, (_, i) => `F${i}`) } })).toHaveLength(50);
    expect(mismatchedFonts(null)).toEqual([]);
    expect(mismatchedFonts({ format: 'docx', fonts: { mismatched: 'B Nazanin' } })).toEqual([]);
    expect(mismatchedFonts('B Nazanin')).toEqual([]);
  });
});
