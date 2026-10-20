/**
 * صفحه‌های ثابت (برش ۷٫۴، قدم ۵ طراحی؛ طرح `docs/ui/mockups/checkout.html`، سؤال ۱۴۲): نشانی و نام پیوند هر صفحه، پیوندهای پاورقی، نقشهٔ
 * سایت و تاریخ «به‌روز شده». یک منبع، تا پاورقی، نقشهٔ سایت و خود صفحه‌ها از هم جدا نشوند؛ «تماس» فقط وقتی راهی برای تماس هست. متادیتای هر
 * صفحه از ۱۱٫۱ از متن همان صفحه است (`lib/server/pageMetadata.ts`)، جدا از اینجا: تست‌های سرتاسری پاورقی را از همین ماژول می‌خوانند و
 * Playwright ماژول ESM `@jozveyar/db` را بار نمی‌کند. فقط سرور: پاورقی، نقشهٔ سایت و صفحه‌ها کامپوننت سرورند و چیزی از اینجا به باندل مرورگر
 * نمی‌رود.
 */

import { formatJalaliNumeric } from '@jozveyar/text';

export interface StaticPage {
  path: `/${string}`;
  /** نام پیوند پاورقی. */
  label: string;
}

export const STATIC_PAGES = {
  about: { path: '/about', label: 'دربارهٔ ما' },
  contact: { path: '/contact', label: 'تماس' },
  terms: { path: '/terms', label: 'قوانین و مقررات' },
  privacy: { path: '/privacy', label: 'حریم خصوصی' },
} as const satisfies Record<string, StaticPage>;

export type StaticPageKind = keyof typeof STATIC_PAGES;

/**
 * «سفارش‌های من» (برش ۱۲٫۱، سؤال ۳۰۵): اولین پیوند گروه «جزوه‌یار» پاورقی، ولی صفحهٔ ثابت نیست: خصوصی هر مشتری است، پس نه در نقشهٔ سایت
 * و نه در نتیجهٔ جست‌وجو.
 */
export const ACCOUNT_PAGE = { path: '/orders', label: 'سفارش‌های من' } as const satisfies StaticPage;

/** همان openGraph پایهٔ layout؛ صفحه‌ای که openGraph خودش را دارد جای کل آن را می‌گیرد، پس این‌ها را هم باید بدهد. */
export const SITE_OPEN_GRAPH = { type: 'website', locale: 'fa_IR', siteName: 'جزوه‌یار' } as const;

/** پیوندهای پاورقی در دو گروه طرح؛ «تماس» فقط وقتی راهی برای تماس هست (`hasContact`)، و از ۱۲٫۱ «سفارش‌های من» اول «جزوه‌یار». */
export function footerGroups(contact: boolean): { heading: string; pages: StaticPage[] }[] {
  return [
    { heading: 'جزوه‌یار', pages: [ACCOUNT_PAGE, STATIC_PAGES.about, ...(contact ? [STATIC_PAGES.contact] : [])] },
    { heading: 'قوانین', pages: [STATIC_PAGES.terms, STATIC_PAGES.privacy] },
  ];
}

/** صفحه‌های ثابت نقشهٔ سایت، همان‌ها که پاورقی دارد، جز «سفارش‌های من». */
export function sitemapPages(contact: boolean): StaticPage[] {
  return footerGroups(contact)
    .flatMap(({ pages }) => pages)
    .filter((page) => page.path !== ACCOUNT_PAGE.path);
}

/**
 * «به‌روز شده در …» قوانین و حریم خصوصی (سؤال ۲۸۶): روز تغییر خود متن (`changedAt` متن روی سایت: انتشار، یا تاریخ متن پیش‌فرض) و آخرین تغییر
 * تنظیم‌هایی که متن از آن‌هاست (`settingsAt`)؛ اگر مالک روز کاری تحویل یا نگهداری فایل را عوض کند، عدد متن عوض شده و تاریخ هم جلو می‌رود.
 */
export function pageDate(changedAt: Date, settingsAt: Date | null): string {
  return formatJalaliNumeric(settingsAt && settingsAt > changedAt ? settingsAt : changedAt);
}
