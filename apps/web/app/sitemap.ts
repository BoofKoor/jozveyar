import type { MetadataRoute } from 'next';

import { sitemapPages } from '../lib/staticPages';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/**
 * نقشهٔ سایت: صفحهٔ اصلی و صفحه‌های ثابت (برش ۷٫۴؛ همان‌ها که پاورقی دارد، «تماس» فقط با اطلاعات تماس واقعی).
 *
 * صفحه‌های ثابت `lastModified` ندارند: روز build روز تغییر متن نیست، و «به‌روز شده»شان با تنظیم‌ها هم جلو می‌رود. از برش سئو
 * به بعد از جدول `landing_pages` هم خوانده می‌شود تا صفحات استانی بدون دیپلوی اضافه شوند.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...sitemapPages().map(({ path }) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
