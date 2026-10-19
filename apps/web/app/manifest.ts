import type { MetadataRoute } from 'next';
import { BAND_COLOR } from '@jozveyar/ui/tokens';

import { manifestIcons } from '../lib/brand';
import { siteBrand } from '../lib/server/brand';

/** آیکون‌ها از لوگوی مالک اگر روی سایت است (۱۱٫۲)، با همان ISR ۶۰ ثانیهٔ صفحه‌ها. */
export const revalidate = 60;

/**
 * manifest سایت (`/manifest.webmanifest`)، برای «افزودن به صفحهٔ اصلی» گوشی: نام، جهت و آیکون.
 *
 * `display: 'browser'`: سایت در مرورگر باز می‌شود، نه مثل برنامهٔ جدا. آیکون‌ها از
 * `scripts/make-icons.mjs` می‌آیند: نشان کامل روی مربع سفید مات. همان ۵۱۲ «maskable» هم هست، چون کل
 * نشان در دایرهٔ امن می‌ماند (`lib/site-icons.test.ts` این را می‌سنجد). رنگ‌ها green-50‌اند، همان
 * `BAND_COLOR` نوار بالای صفحه. از ۱۱٫۲ اگر مالک لوگوی خودش را روی سایت گذاشته، آیکون‌هایی که کارگر از آن ساخت (`manifestIcons`)، که آنها
 * هم در دایرهٔ امن‌اند.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await siteBrand();
  return {
    name: 'جزوه‌یار',
    short_name: 'جزوه‌یار',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/',
    display: 'browser',
    theme_color: BAND_COLOR,
    background_color: BAND_COLOR,
    icons: manifestIcons(brand),
  };
}
