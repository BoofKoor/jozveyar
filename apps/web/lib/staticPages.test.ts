/**
 * صفحه‌های ثابت (برش ۷٫۴): پیوندهای پاورقی و نقشهٔ سایت یک منبع‌اند و «تماس» فقط با اطلاعات تماس واقعی؛ هر صفحه canonical
 * خودش را دارد؛ و «به‌روز شده» دیرترینِ تاریخ متن و آخرین تغییر تنظیم‌هاست. خود صفحه‌ها در `tests/site.spec.ts`.
 */

import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';
import { formatJalaliNumeric } from '@jozveyar/text';

import { CONTACT } from './contact';
import { STATIC_PAGES, footerGroups, pageDate, pageMetadata, sitemapPages } from './staticPages';

const paths = (pages: readonly { path: string }[]) => pages.map(({ path }) => path);

describe('صفحه‌های ثابت', () => {
  it('پاورقی: دو گروه طرح؛ «تماس» فقط با اطلاعات تماس', () => {
    expect(footerGroups(null).map(({ heading, pages }) => [heading, paths(pages)])).toEqual([
      ['جزوه‌یار', ['/about']],
      ['قوانین', ['/terms', '/privacy']],
    ]);
    expect(footerGroups({ mobile: '09120000000' }).map(({ heading, pages }) => [heading, paths(pages)])).toEqual([
      ['جزوه‌یار', ['/about', '/contact']],
      ['قوانین', ['/terms', '/privacy']],
    ]);
    expect(footerGroups().flatMap(({ pages }) => pages).map(({ label }) => label)).toEqual(
      CONTACT ? ['دربارهٔ ما', 'تماس', 'قوانین و مقررات', 'حریم خصوصی'] : ['دربارهٔ ما', 'قوانین و مقررات', 'حریم خصوصی'],
    );
  });

  it('نقشهٔ سایت همان صفحه‌های پاورقی است', () => {
    expect(paths(sitemapPages(null))).toEqual(['/about', '/terms', '/privacy']);
    expect(paths(sitemapPages({ email: 'a@b.ir' }))).toEqual(['/about', '/contact', '/terms', '/privacy']);
    expect(sitemapPages()).toEqual(footerGroups().flatMap(({ pages }) => pages));
  });

  it('متادیتا: عنوان با الگوی layout، canonical خود صفحه، و openGraph پایهٔ سایت با عنوان و نشانی صفحه و تصویر بالادست', async () => {
    const image = { url: new URL('https://jozveyar.com/opengraph-image.png?abc'), width: 1200, height: 630, alt: 'جزوه‌یار' };
    const parent = Promise.resolve({ openGraph: { images: [image] } }) as unknown as ResolvingMetadata;
    for (const page of Object.values(STATIC_PAGES)) {
      const metadata = await pageMetadata(page)({}, parent);
      expect(metadata.title).toBe(page.label);
      expect(metadata.description).toBe(page.description);
      expect(metadata.alternates).toEqual({ canonical: page.path });
      expect(metadata.openGraph).toEqual({
        type: 'website',
        locale: 'fa_IR',
        siteName: 'جزوه‌یار',
        title: `${page.label} | جزوه‌یار`,
        description: page.description,
        url: page.path,
        images: [image],
      });
    }
    const bare = await pageMetadata(STATIC_PAGES.terms)({}, Promise.resolve({ openGraph: null }) as unknown as ResolvingMetadata);
    expect(bare.openGraph).toMatchObject({ images: [] });
  });

  it('«به‌روز شده»: تاریخ متن، مگر تنظیمی دیرتر عوض شده باشد', () => {
    expect(pageDate('1405/07/10', null)).toBe('1405/07/10');
    // تغییر پیش از متن (دادهٔ پایه، یا ویرایش پیشین): همان تاریخ متن.
    expect(pageDate('1405/07/10', new Date('2026-09-26T08:00:00Z'))).toBe('1405/07/10');
    // تغییر پس از متن: روز همان تغییر، به وقت تهران.
    expect(pageDate('1405/07/10', new Date('2026-10-20T09:30:00Z'))).toBe(formatJalaliNumeric(new Date('2026-10-20T09:30:00Z')));
    expect(pageDate('1405/07/10', new Date('2026-10-20T09:30:00Z'))).toBe('1405/07/28');
    // ۲۲:۰۰ UTC روز دهم مهر یعنی ۰۱:۳۰ روز یازدهم در تهران.
    expect(pageDate('1405/07/10', new Date('2026-10-02T22:00:00Z'))).toBe('1405/07/11');
    expect(() => pageDate('1405/13/10', null)).toThrow('تاریخ متن');
  });
});
