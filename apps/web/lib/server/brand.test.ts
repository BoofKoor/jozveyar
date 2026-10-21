/**
 * لوگو و بنر از پنل (برش ۱۱٫۲): فایل‌های روی سایت با نشانی `/media/<sha256>.<پسوند>`؛ بارگذاری‌ای که فایلی کم دارد یا روی سایت نرفته هیچ (لوگوی
 * برند و بی بنر)؛ بنر خاموش هیچ؛ پیوندی که به سایت دیگر می‌رود بی پیوند؛ build و بی پایگاه داده هیچ، و خطای پایگاه داده بالا می‌رود تا ISR
 * صفحهٔ قبلی را نگه دارد. نشانک، تصویر اشتراک و manifest از همین (`lib/brand.ts`).
 */

import { describe, expect, it, vi } from 'vitest';

import type { SiteBanner, SiteLogo } from '@jozveyar/contracts';
import type { SiteImageFileMeta } from '@jozveyar/db';

import { BRAND_SHARE_ALT, manifestIcons, organizationLogo, siteIcons, siteShareImage } from '../brand';
import { BUILD_PHASE } from './tariff';
import { loadSiteBanner, loadSiteBrand, mediaPath, readSiteBanner, readSiteBrand, type BrandSource } from './brand';

const sha = (c: string) => c.repeat(64);

const file = (name: SiteImageFileMeta['name'], contentType: string, width: number, height: number, hash: string): SiteImageFileMeta => ({
  name,
  contentType,
  width,
  height,
  sha256: sha(hash),
  hasAlpha: false,
  sizeBytes: 1000,
});

const LOGO_FILES: SiteImageFileMeta[] = [
  file('apple', 'image/png', 180, 180, 'a'),
  file('favicon', 'image/x-icon', 48, 48, 'b'),
  file('icon192', 'image/png', 192, 192, 'c'),
  file('icon512', 'image/png', 512, 512, 'd'),
  file('logo', 'image/png', 384, 128, 'e'),
  file('og', 'image/png', 1200, 630, 'f'),
];

const source = (over: Partial<BrandSource> & { logoValue?: SiteLogo; bannerValue?: SiteBanner; published?: Record<number, SiteImageFileMeta[]> }) => {
  const files = vi.fn(async (id: number, _kind: string) => over.published?.[id] ?? null);
  return {
    files,
    logo: async () => over.logoValue ?? { imageId: null },
    banner: async () => over.bannerValue ?? { mode: 'off' as const, imageId: null, alt: '', href: '' },
  };
};

describe('نشانی فایل روی سایت', () => {
  it('هش و پسوند نوع: png، jpg و ico', () => {
    expect(mediaPath({ sha256: sha('a'), contentType: 'image/png' })).toBe(`/media/${sha('a')}.png`);
    expect(mediaPath({ sha256: sha('b'), contentType: 'image/jpeg' })).toBe(`/media/${sha('b')}.jpg`);
    expect(mediaPath({ sha256: sha('c'), contentType: 'image/x-icon' })).toBe(`/media/${sha('c')}.ico`);
  });
});

describe('لوگوی مالک', () => {
  it('لوگوی برند: نه فایلی خوانده می‌شود، نه چیزی برمی‌گردد', async () => {
    const s = source({});
    expect(await loadSiteBrand(s)).toBeNull();
    expect(s.files).not.toHaveBeenCalled();
  });

  it('بارگذاری روی سایت با هر شش فایل، با نشانی و ابعاد هر کدام', async () => {
    const s = source({ logoValue: { imageId: 7 }, published: { 7: LOGO_FILES } });
    const brand = await loadSiteBrand(s);
    expect(s.files).toHaveBeenCalledWith(7, 'logo');
    expect(brand).toEqual({
      logo: { src: `/media/${sha('e')}.png`, width: 384, height: 128, type: 'image/png' },
      favicon: { src: `/media/${sha('b')}.ico`, width: 48, height: 48, type: 'image/x-icon' },
      apple: { src: `/media/${sha('a')}.png`, width: 180, height: 180, type: 'image/png' },
      icon192: { src: `/media/${sha('c')}.png`, width: 192, height: 192, type: 'image/png' },
      icon512: { src: `/media/${sha('d')}.png`, width: 512, height: 512, type: 'image/png' },
      og: { src: `/media/${sha('f')}.png`, width: 1200, height: 630, type: 'image/png' },
    });
  });

  it('روی سایت نرفته یا فایلی کم: لوگوی برند، نه نیمی برند و نیمی تازه', async () => {
    expect(await loadSiteBrand(source({ logoValue: { imageId: 7 } }))).toBeNull();
    for (const name of ['logo', 'favicon', 'apple', 'icon192', 'icon512', 'og']) {
      const partial = LOGO_FILES.filter((f) => f.name !== name);
      expect(await loadSiteBrand(source({ logoValue: { imageId: 7 }, published: { 7: partial } })), name).toBeNull();
    }
  });
});

describe('بنر صفحهٔ اصلی', () => {
  const desktop = file('desktop', 'image/jpeg', 2160, 540, '1');
  const mobile = file('mobile', 'image/png', 1280, 640, '2');
  const on = (patch: Partial<SiteBanner> = {}): SiteBanner => ({ mode: 'on', imageId: 3, alt: 'تخفیف دانشجویی', href: '/#tariff', ...patch });

  it('خاموش یا بی تصویر: هیچ، بی خواندن فایل', async () => {
    const off = source({ bannerValue: { ...on(), mode: 'off' } });
    expect(await loadSiteBanner(off)).toBeNull();
    expect(off.files).not.toHaveBeenCalled();
  });

  it('روشن: دسکتاپ، و گوشی اگر هست، با متن جایگزین و پیوند', async () => {
    const s = source({ bannerValue: on(), published: { 3: [desktop, mobile] } });
    expect(await loadSiteBanner(s)).toEqual({
      alt: 'تخفیف دانشجویی',
      href: '/#tariff',
      desktop: { src: `/media/${sha('1')}.jpg`, width: 2160, height: 540, type: 'image/jpeg' },
      mobile: { src: `/media/${sha('2')}.png`, width: 1280, height: 640, type: 'image/png' },
    });
    expect(s.files).toHaveBeenCalledWith(3, 'banner');
    expect(await loadSiteBanner(source({ bannerValue: on(), published: { 3: [desktop] } }))).toMatchObject({ mobile: null });
  });

  it('روی سایت نرفته یا بی دسکتاپ: هیچ؛ پیوند بیرونی بی پیوند؛ متن جایگزین تا ۱۲۰ نویسه', async () => {
    expect(await loadSiteBanner(source({ bannerValue: on() }))).toBeNull();
    expect(await loadSiteBanner(source({ bannerValue: on(), published: { 3: [mobile] } }))).toBeNull();
    for (const href of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(await loadSiteBanner(source({ bannerValue: on({ href }), published: { 3: [desktop] } })), href).toMatchObject({ href: '' });
    }
    expect(await loadSiteBanner(source({ bannerValue: on({ href: 'https://jozveyar.com/contact' }), published: { 3: [desktop] } }))).toMatchObject({
      href: '/contact',
    });
    const long = await loadSiteBanner(source({ bannerValue: on({ alt: 'ب'.repeat(300) }), published: { 3: [desktop] } }));
    expect([...long!.alt].length).toBe(120);
  });
});

describe('build، بی پایگاه داده، و خطا', () => {
  const env = { DATABASE_URL: 'postgresql://x' };
  it('build و بی DATABASE_URL هیچ، بی دست زدن به منبع', async () => {
    const make = vi.fn(() => source({ logoValue: { imageId: 7 }, published: { 7: LOGO_FILES } }) as BrandSource);
    expect(await readSiteBrand({ ...env, NEXT_PHASE: BUILD_PHASE }, make)).toBeNull();
    expect(await readSiteBanner({}, make)).toBeNull();
    expect(make).not.toHaveBeenCalled();
    expect(await readSiteBrand(env, make)).not.toBeNull();
  });

  it('خطای پایگاه داده بالا می‌رود، با یک خط لاگ بی جزئیات راز', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = () => ({ ...source({}), logo: async () => Promise.reject(new Error('db down')), banner: async () => Promise.reject(new Error('db down')) }) as BrandSource;
    await expect(readSiteBrand(env, broken)).rejects.toThrow('db down');
    await expect(readSiteBanner(env, broken)).rejects.toThrow('db down');
    expect(error.mock.calls.map(([line]) => String(line))).toEqual([
      '✗ سایت: لوگو از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.',
      '✗ سایت: بنر صفحهٔ اصلی از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.',
    ]);
    error.mockRestore();
  });
});

describe('نشانک، تصویر اشتراک و manifest', () => {
  it('لوگوی برند: همان نشانی‌های پیشین فایل‌های `public/`', () => {
    expect(siteIcons(null)).toEqual({
      icon: [
        { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
        { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      ],
      apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
    });
    expect(siteShareImage(null)).toEqual({ url: '/opengraph-image.png', width: 1200, height: 630, type: 'image/png', alt: BRAND_SHARE_ALT });
    expect(manifestIcons(null).map(({ src, purpose }) => `${src} ${purpose}`)).toEqual([
      '/icons/icon-192.png any',
      '/icons/icon-512.png any',
      '/icons/icon-512.png maskable',
    ]);
    // لوگوی سازمان در دادهٔ ساختاریافته (۱۵٫۱): همان آیکون مربع ۵۱۲.
    expect(organizationLogo(null)).toEqual({ url: '/icons/icon-512.png', width: 512, height: 512 });
  });

  it('لوگوی مالک: فقط فایل‌های خودش، هیچ فایل برند کنارش', async () => {
    const brand = (await loadSiteBrand(source({ logoValue: { imageId: 7 }, published: { 7: LOGO_FILES } })))!;
    const all = JSON.stringify([siteIcons(brand), siteShareImage(brand), manifestIcons(brand), organizationLogo(brand)]);
    for (const url of ['/favicon.ico', '/icon.svg', '/apple-icon.png', '/opengraph-image.png', '/icons/']) expect(all).not.toContain(`"${url}`);
    expect(siteIcons(brand)).toEqual({
      icon: [
        { url: `/media/${sha('b')}.ico`, type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
        { url: `/media/${sha('c')}.png`, type: 'image/png', sizes: '192x192' },
      ],
      apple: [{ url: `/media/${sha('a')}.png`, type: 'image/png', sizes: '180x180' }],
    });
    expect(siteShareImage(brand)).toEqual({ url: `/media/${sha('f')}.png`, width: 1200, height: 630, type: 'image/png', alt: 'لوگوی جزوه‌یار' });
    expect(manifestIcons(brand).map(({ src, sizes, purpose }) => `${src} ${sizes} ${purpose}`)).toEqual([
      `/media/${sha('c')}.png 192x192 any`,
      `/media/${sha('d')}.png 512x512 any`,
      `/media/${sha('d')}.png 512x512 maskable`,
    ]);
    expect(organizationLogo(brand)).toEqual({ url: `/media/${sha('d')}.png`, width: 512, height: 512 });
  });
});
