/**
 * نشانک، آیکون گوشی و تصویر اشتراک سایت، از یک جا (برش ۱۱٫۲، ADR-067): لوگوی مالک اگر روی سایت است (`lib/server/brand.ts`)، وگرنه فایل‌های برند
 * در `public/` که `scripts/make-icons.mjs` از `docs/brand` می‌سازد. پیش از ۱۱٫۲ فایل‌های برند متادیتای فایلی نکست بودند (`app/icon.svg` و …)؛
 * ولی نکست `app/favicon.ico` را همیشه اول فهرست می‌گذارد، حتی کنار آیکون‌های پیکربندی، پس با لوگوی مالک نشانک برند هم می‌ماند. حالا همه پیکربندی
 * layout و manifest است، با همان نشانی‌های پیشین.
 */

import type { Metadata, MetadataRoute } from 'next';

import type { SiteBrand } from './server/brand';

/** متن جایگزین تصویر اشتراک برند (`public/opengraph-image.png`): لوگو، تیتر صفحهٔ اصلی و خط معرفی که درون خود تصویرند. */
export const BRAND_SHARE_ALT =
  'لوگوی جزوه‌یار و تیتر «جزوه‌ات را بینداز، قیمت را همین حالا ببین»؛ چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران';

/** نشانک و آیکون گوشی: ICO و SVG برند، یا ICO و PNG ۱۹۲ مالک؛ و آیکون آیفون ۱۸۰. */
export function siteIcons(brand: SiteBrand | null): NonNullable<Metadata['icons']> {
  if (!brand) {
    return {
      icon: [
        { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
        { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      ],
      apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
    };
  }
  return {
    icon: [
      { url: brand.favicon.src, type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: brand.icon192.src, type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: brand.apple.src, type: 'image/png', sizes: '180x180' }],
  };
}

/** تصویر اشتراک: برند با تیتر و معرفی، یا لوگوی مالک روی green-50 (بی متن، پس متن جایگزینش فقط نام است). */
export function siteShareImage(brand: SiteBrand | null) {
  if (!brand) return { url: '/opengraph-image.png', width: 1200, height: 630, type: 'image/png', alt: BRAND_SHARE_ALT };
  return { url: brand.og.src, width: brand.og.width, height: brand.og.height, type: brand.og.type, alt: 'لوگوی جزوه‌یار' };
}

/** لوگوی سازمان در دادهٔ ساختاریافته (۱۵٫۱): همان آیکون مربع ۵۱۲ manifest، برند یا مالک؛ گوگل لوگوی مربع دست‌کم ۱۱۲ پیکسلی می‌خواهد. */
export function organizationLogo(brand: SiteBrand | null): { url: string; width: number; height: number } {
  if (!brand) return { url: '/icons/icon-512.png', width: 512, height: 512 };
  return { url: brand.icon512.src, width: brand.icon512.width, height: brand.icon512.height };
}

/** آیکون‌های manifest: ۱۹۲ و ۵۱۲، و همان ۵۱۲ «maskable»، چون تصویر هر دو در دایرهٔ امن است. */
export function manifestIcons(brand: SiteBrand | null): NonNullable<MetadataRoute.Manifest['icons']> {
  const [small, large] = brand ? [brand.icon192.src, brand.icon512.src] : ['/icons/icon-192.png', '/icons/icon-512.png'];
  return [
    { src: small, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: large, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: large, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}
