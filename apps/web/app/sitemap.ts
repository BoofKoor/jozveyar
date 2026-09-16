import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/**
 * نقشهٔ سایت.
 *
 * فعلاً فقط صفحهٔ اصلی. از برش سئو به بعد از جدول `landing_pages` خوانده
 * می‌شود تا صفحات استانی بدون دیپلوی اضافه شوند.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
