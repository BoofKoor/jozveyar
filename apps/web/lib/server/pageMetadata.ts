/**
 * متادیتای صفحه‌های ثابت (برش ۷٫۴؛ از ۱۱٫۱ از متن همان صفحه که مالک از پنل منتشر می‌کند، `lib/server/content.ts`). جدا از `lib/staticPages.ts`،
 * چون این به پایگاه داده می‌رسد و آن را تست‌های سرتاسری هم می‌خوانند.
 */

import type { Metadata, ResolvingMetadata } from 'next';

import { SITE_OPEN_GRAPH, STATIC_PAGES, type StaticPageKind } from '../staticPages';
import { liveText, sitePublished, type SitePublished } from './content';

/**
 * `generateMetadata` صفحهٔ ثابت: عنوان و توضیح گوگل از متن همان صفحه (سؤال ۲۸۳)، canonical خودش (نه canonical صفحهٔ اصلی از layout)، و
 * openGraph با عنوان و نشانی صفحه. openGraph صفحه جای کل openGraph بالادست را می‌گیرد، تصویر اشتراک (`app/opengraph-image.png`) هم، پس
 * تصویر از همان متادیتای بالادست می‌آید (`parent`)، نه نسخهٔ دوم نشانی و اندازه و متن جایگزینش؛ کارت بزرگ توییتر هم از همین.
 */
export function pageMetadata(kind: StaticPageKind, published: () => Promise<SitePublished> = sitePublished) {
  const { path } = STATIC_PAGES[kind];
  return async (_props: unknown, parent: ResolvingMetadata): Promise<Metadata> => {
    const [images, { seo }] = await Promise.all([parent.then((meta) => meta.openGraph?.images ?? []), published().then((all) => liveText(kind, all).content)]);
    return {
      title: seo.title,
      description: seo.description,
      alternates: { canonical: path },
      openGraph: { ...SITE_OPEN_GRAPH, title: `${seo.title} | جزوه‌یار`, description: seo.description, url: path, images },
    };
  };
}
