/**
 * صفحه‌های ثابت (برش ۷٫۴؛ از ۱۱٫۱ متن از پنل): پیوندهای پاورقی و نقشهٔ سایت یک منبع‌اند و «تماس» فقط وقتی راهی برای تماس هست؛ هر صفحه
 * canonical خودش را دارد و عنوان و توضیح گوگل از متن همان صفحه؛ و «به‌روز شده» دیرترینِ تغییر متن و آخرین تغییر تنظیم‌هاست. خود صفحه‌ها در
 * `tests/site.spec.ts`.
 */

import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@jozveyar/content';
import { formatJalaliNumeric } from '@jozveyar/text';

import type { SitePublished } from './server/content';
import { pageMetadata } from './server/pageMetadata';
import { ACCOUNT_PAGE, STATIC_PAGES, footerGroups, pageDate, sitemapPages } from './staticPages';

const paths = (pages: readonly { path: string }[]) => pages.map(({ path }) => path);
const KINDS = Object.keys(STATIC_PAGES) as (keyof typeof STATIC_PAGES)[];

describe('صفحه‌های ثابت', () => {
  it('پاورقی: دو گروه طرح؛ «سفارش‌های من» اول «جزوه‌یار» (۱۲٫۱)، و «تماس» فقط وقتی راهی برای تماس هست', () => {
    expect(footerGroups(false).map(({ heading, pages }) => [heading, paths(pages)])).toEqual([
      ['جزوه‌یار', ['/orders', '/about']],
      ['قوانین', ['/terms', '/privacy']],
    ]);
    expect(footerGroups(true).map(({ heading, pages }) => [heading, paths(pages)])).toEqual([
      ['جزوه‌یار', ['/orders', '/about', '/contact']],
      ['قوانین', ['/terms', '/privacy']],
    ]);
    expect(footerGroups(true).flatMap(({ pages }) => pages).map(({ label }) => label)).toEqual([
      'سفارش‌های من',
      'دربارهٔ ما',
      'تماس',
      'قوانین و مقررات',
      'حریم خصوصی',
    ]);
  });

  it('نقشهٔ سایت همان صفحه‌های پاورقی است، جز «سفارش‌های من» که خصوصی هر مشتری است', () => {
    expect(paths(sitemapPages(false))).toEqual(['/about', '/terms', '/privacy']);
    expect(paths(sitemapPages(true))).toEqual(['/about', '/contact', '/terms', '/privacy']);
    expect(sitemapPages(true)).toEqual(footerGroups(true).flatMap(({ pages }) => pages).filter(({ path }) => path !== ACCOUNT_PAGE.path));
  });

  it('متادیتا: عنوان و توضیح گوگل از متن صفحه، canonical خود صفحه، و openGraph پایهٔ سایت با تصویر بالادست', async () => {
    const image = { url: new URL('https://jozveyar.com/opengraph-image.png?abc'), width: 1200, height: 630, alt: 'جزوه‌یار' };
    const parent = Promise.resolve({ openGraph: { images: [image] } }) as unknown as ResolvingMetadata;
    for (const kind of KINDS) {
      const { seo } = defaultContent(kind);
      // متن پیش‌فرض: همان عنوان و توضیح پیش از ۱۱٫۱، که عنوانش نام پیوند پاورقی است.
      expect(seo.title).toBe(STATIC_PAGES[kind].label);
      const metadata = await pageMetadata(kind, async () => ({}))({}, parent);
      expect(metadata.title).toBe(seo.title);
      expect(metadata.description).toBe(seo.description);
      expect(metadata.alternates).toEqual({ canonical: STATIC_PAGES[kind].path });
      expect(metadata.openGraph).toEqual({
        type: 'website',
        locale: 'fa_IR',
        siteName: 'جزوه‌یار',
        title: `${seo.title} | جزوه‌یار`,
        description: seo.description,
        url: STATIC_PAGES[kind].path,
        images: [image],
      });
    }
    // متنی که مالک منتشر کرد، و برگشت به پیش‌فرض.
    const published: SitePublished = {
      terms: { content: { ...defaultContent('terms'), seo: { title: 'قوانین سفارش', description: 'تازه' } }, version: 2, at: new Date() },
      privacy: { content: null, version: 3, at: new Date() },
    };
    expect(await pageMetadata('terms', async () => published)({}, parent)).toMatchObject({ title: 'قوانین سفارش', description: 'تازه' });
    expect(await pageMetadata('privacy', async () => published)({}, parent)).toMatchObject({ title: 'حریم خصوصی' });
    const bare = await pageMetadata('terms', async () => ({}))({}, Promise.resolve({ openGraph: null }) as unknown as ResolvingMetadata);
    expect(bare.openGraph).toMatchObject({ images: [] });
  });

  it('«به‌روز شده»: روز تغییر متن، مگر تنظیمی دیرتر عوض شده باشد', () => {
    const text = new Date('2026-10-01T20:30:00Z'); // ۱۴۰۵/۰۷/۱۰ به وقت تهران
    expect(pageDate(text, null)).toBe('1405/07/10');
    // تغییر پیش از متن (دادهٔ پایه، یا ویرایش پیشین): همان تاریخ متن.
    expect(pageDate(text, new Date('2026-09-26T08:00:00Z'))).toBe('1405/07/10');
    // تغییر پس از متن: روز همان تغییر، به وقت تهران.
    expect(pageDate(text, new Date('2026-10-20T09:30:00Z'))).toBe(formatJalaliNumeric(new Date('2026-10-20T09:30:00Z')));
    expect(pageDate(text, new Date('2026-10-20T09:30:00Z'))).toBe('1405/07/28');
    // ۲۲:۰۰ UTC روز دهم مهر یعنی ۰۱:۳۰ روز یازدهم در تهران.
    expect(pageDate(text, new Date('2026-10-02T22:00:00Z'))).toBe('1405/07/11');
  });
});
