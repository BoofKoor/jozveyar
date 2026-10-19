import type { MetadataRoute } from 'next';

import { hasContact } from '@jozveyar/content';

import { liveText, sitePublished } from '../lib/server/content';
import { sitemapPages } from '../lib/staticPages';

/** «تماس» فقط وقتی راهی برای تماس هست، که مالک از پنل عوض می‌کند (۱۱٫۱)؛ پس مثل صفحه‌ها هر ۶۰ ثانیه. */
export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/**
 * نقشهٔ سایت: صفحهٔ اصلی و صفحه‌های ثابت (برش ۷٫۴؛ همان‌ها که پاورقی دارد، «تماس» فقط وقتی راهی برای تماس هست).
 *
 * صفحه‌های ثابت `lastModified` ندارند: «به‌روز شده»شان با انتشار متن و با تنظیم‌ها جلو می‌رود. از برش سئو
 * به بعد از جدول `landing_pages` هم خوانده می‌شود تا صفحات استانی بدون دیپلوی اضافه شوند.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const contact = hasContact(liveText('contact', await sitePublished()).content);
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...sitemapPages(contact).map(({ path }) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
