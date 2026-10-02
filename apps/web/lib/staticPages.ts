/**
 * صفحه‌های ثابت (برش ۷٫۴، قدم ۵ طراحی؛ طرح `docs/ui/mockups/checkout.html`، سؤال ۱۴۲): نشانی، نام پیوند و توضیح هر صفحه،
 * پیوندهای پاورقی، نقشهٔ سایت و تاریخ «به‌روز شده». یک منبع، تا پاورقی، نقشهٔ سایت و خود صفحه‌ها از هم جدا نشوند؛ «تماس»
 * فقط با اطلاعات تماس واقعی (`lib/contact.ts`). فقط سرور: پاورقی، نقشهٔ سایت و صفحه‌ها کامپوننت سرورند و چیزی از اینجا به
 * باندل مرورگر نمی‌رود.
 */

import type { Metadata, ResolvingMetadata } from 'next';
import { formatJalaliNumeric, parseJalaliNumeric } from '@jozveyar/text';

import { CONTACT, type Contact } from './contact';

export interface StaticPage {
  path: `/${string}`;
  /** نام پیوند پاورقی و عنوان زبانه. */
  label: string;
  description: string;
}

export const STATIC_PAGES = {
  about: {
    path: '/about',
    label: 'دربارهٔ ما',
    description: 'جزوه‌یار سفارش آنلاین چاپ و صحافی جزوه است: فایل را بینداز، قیمت را همان لحظه ببین، و جزوهٔ چاپ‌شده را با پست بگیر.',
  },
  contact: {
    path: '/contact',
    label: 'تماس',
    description: 'راه‌های تماس با پشتیبانی جزوه‌یار.',
  },
  terms: {
    path: '/terms',
    label: 'قوانین و مقررات',
    description: 'قوانین سفارش در جزوه‌یار: قیمت و پرداخت، چاپ و تحویل به پست، فایل و محتوا، و لغو و بازپرداخت.',
  },
  privacy: {
    path: '/privacy',
    label: 'حریم خصوصی',
    description: 'جزوه‌یار چه چیزی از تو می‌گیرد، کجا و تا کی نگه می‌دارد: فایل، موبایل، نشانی، پرداخت و کوکی‌ها.',
  },
} as const satisfies Record<string, StaticPage>;

/** همان openGraph پایهٔ layout؛ صفحه‌ای که openGraph خودش را دارد جای کل آن را می‌گیرد، پس این‌ها را هم باید بدهد. */
export const SITE_OPEN_GRAPH = { type: 'website', locale: 'fa_IR', siteName: 'جزوه‌یار' } as const;

/**
 * `generateMetadata` صفحهٔ ثابت: عنوان، توضیح، canonical خودش (نه canonical صفحهٔ اصلی از layout)، و openGraph با عنوان و نشانی
 * صفحه. openGraph صفحه جای کل openGraph بالادست را می‌گیرد، تصویر اشتراک (`app/opengraph-image.png`) هم، پس تصویر از همان
 * متادیتای بالادست می‌آید (`parent`)، نه نسخهٔ دوم نشانی و اندازه و متن جایگزینش؛ کارت بزرگ توییتر هم از همین.
 */
export function pageMetadata(page: StaticPage) {
  return async (_props: unknown, parent: ResolvingMetadata): Promise<Metadata> => {
    const images = (await parent).openGraph?.images ?? [];
    return {
      title: page.label,
      description: page.description,
      alternates: { canonical: page.path },
      openGraph: { ...SITE_OPEN_GRAPH, title: `${page.label} | جزوه‌یار`, description: page.description, url: page.path, images },
    };
  };
}

/** پیوندهای پاورقی در دو گروه طرح؛ «تماس» فقط با اطلاعات تماس واقعی. */
export function footerGroups(contact: Contact | null = CONTACT): { heading: string; pages: StaticPage[] }[] {
  return [
    { heading: 'جزوه‌یار', pages: [STATIC_PAGES.about, ...(contact ? [STATIC_PAGES.contact] : [])] },
    { heading: 'قوانین', pages: [STATIC_PAGES.terms, STATIC_PAGES.privacy] },
  ];
}

/** صفحه‌های ثابت نقشهٔ سایت، همان‌ها که پاورقی دارد. */
export function sitemapPages(contact: Contact | null = CONTACT): StaticPage[] {
  return footerGroups(contact).flatMap(({ pages }) => pages);
}

/**
 * «به‌روز شده در …» قوانین و حریم خصوصی: دیرترینِ تاریخ خود متن (`revised`، شمسی عددی) و آخرین تغییر تنظیم‌هایی که متن از
 * آن‌هاست (`changedAt`، `lib/server/siteFacts.ts`)؛ اگر مالک روز کاری تحویل یا نگهداری فایل را عوض کند، تاریخ هم جلو می‌رود.
 */
export function pageDate(revised: string, changedAt: Date | null): string {
  const text = parseJalaliNumeric(revised);
  if (!text) throw new Error(`تاریخ متن درست نیست: ${revised}`);
  return formatJalaliNumeric(changedAt && changedAt > text ? changedAt : text);
}
