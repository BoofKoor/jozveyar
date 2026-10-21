/**
 * نقشهٔ سایت (برش ۱۵٫۱، سؤال ۴۲۸): «آخرین تغییر» دیرترین زمان معلوم است و زمان نامعلوم نوشته نمی‌شود؛ صفحهٔ اصلی همان مبدأ سایت است، مثل
 * canonicalش. خواندن‌ها (`app/sitemap.ts`) و ترتیب صفحه‌ها در `tests/site.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import { latest, sitemapEntries } from './sitemap';

const A = new Date('2026-10-10T08:00:00Z');
const B = new Date('2026-10-18T06:30:00Z');

describe('نقشهٔ سایت', () => {
  it('دیرترین زمان معلوم؛ هیچ معلومی یعنی null، نه «همین حالا»', () => {
    expect(latest(A, null, B, undefined)).toEqual(B);
    expect(latest(B, A)).toEqual(B);
    expect(latest(null, undefined)).toBeNull();
    expect(latest()).toBeNull();
    expect(latest(new Date('نامعتبر'), A)).toEqual(A);
    // نسخهٔ تازه، نه همان شیء: کسی که نتیجه را عوض کند ورودی را عوض نمی‌کند.
    expect(latest(A)).not.toBe(A);
  });

  it('صفحهٔ اصلی همان مبدأ، بقیه با مسیرشان، به همان ترتیب؛ زمان نامعلوم بی lastModified', () => {
    expect(
      sitemapEntries('https://jozveyar.com', [
        { path: '/', lastModified: B, changeFrequency: 'weekly', priority: 1 },
        { path: '/about', lastModified: null, changeFrequency: 'yearly', priority: 0.3 },
        { path: '/terms', lastModified: A, changeFrequency: 'yearly', priority: 0.3 },
      ]),
    ).toStrictEqual([
      { url: 'https://jozveyar.com', lastModified: B, changeFrequency: 'weekly', priority: 1 },
      { url: 'https://jozveyar.com/about', changeFrequency: 'yearly', priority: 0.3 },
      { url: 'https://jozveyar.com/terms', lastModified: A, changeFrequency: 'yearly', priority: 0.3 },
    ]);
  });
});
