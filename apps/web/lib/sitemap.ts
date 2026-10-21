/**
 * نقشهٔ سایت (برش ۱۵٫۱، سؤال ۴۲۸؛ ADR-071): «آخرین تغییر» هر صفحه از خود داده، نه زمان ساختن نقشه. گوگل `lastmod`ی را که همیشه «همین
 * حالا» است دروغ می‌شمارد و کنارش می‌گذارد؛ زمانی که معلوم نیست هم نوشته نمی‌شود، نه حدسی. خالص، تا تست بی سرور بسنجدش؛ خواندن‌ها در
 * `app/sitemap.ts`.
 */

import type { MetadataRoute } from 'next';

type Entry = MetadataRoute.Sitemap[number];

export interface SitemapPage {
  /** نشانی صفحه؛ صفحهٔ اصلی `/`، که در نقشه همان مبدأ سایت است، مثل canonicalش. */
  path: '/' | `/${string}`;
  /** آخرین تغییر معلوم؛ null یعنی نامعلوم، و `lastmod` نوشته نمی‌شود. */
  lastModified: Date | null;
  changeFrequency: NonNullable<Entry['changeFrequency']>;
  priority: number;
}

/** دیرترین زمان معلوم؛ null وقتی هیچ کدام معلوم نیست. */
export function latest(...dates: readonly (Date | null | undefined)[]): Date | null {
  const known = dates.filter((at): at is Date => at instanceof Date && !Number.isNaN(at.getTime()));
  return known.length > 0 ? new Date(Math.max(...known.map((at) => at.getTime()))) : null;
}

/** ردیف‌های نقشه به همان ترتیب صفحه‌ها، با نشانی مطلق؛ `siteUrl` بی `/` ته. */
export function sitemapEntries(siteUrl: string, pages: readonly SitemapPage[]): MetadataRoute.Sitemap {
  return pages.map(({ path, lastModified, changeFrequency, priority }) => ({
    url: path === '/' ? siteUrl : `${siteUrl}${path}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
  }));
}
