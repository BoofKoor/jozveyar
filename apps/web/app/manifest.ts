import type { MetadataRoute } from 'next';
import { PAGE_COLOR } from '@jozveyar/ui/tokens';

/**
 * manifest سایت (`/manifest.webmanifest`)، برای «افزودن به صفحهٔ اصلی» گوشی: نام، جهت و آیکون.
 *
 * `display: 'browser'`: سایت در مرورگر باز می‌شود، نه مثل برنامهٔ جدا. آیکون‌ها از
 * `scripts/make-icons.mjs` می‌آیند: نشان کامل روی مربع سفید مات. همان ۵۱۲ «maskable» هم هست، چون کل
 * نشان در دایرهٔ امن می‌ماند (`lib/site-icons.test.ts` این را می‌سنجد). رنگ‌ها green-50‌اند؛ امروز
 * `PAGE_COLOR` همان است.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'جزوه‌یار',
    short_name: 'جزوه‌یار',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/',
    display: 'browser',
    theme_color: PAGE_COLOR,
    background_color: PAGE_COLOR,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
