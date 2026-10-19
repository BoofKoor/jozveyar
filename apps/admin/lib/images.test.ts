import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SITE_IMAGE_MAX_BYTES, type SettingEvent } from '@jozveyar/db';

import {
  bannerChange,
  bannerEventText,
  bannerOf,
  canonicalBanner,
  IMAGE_MAX_BYTES,
  imageBadge,
  imageError,
  imageFileName,
  imageFormatOf,
  imageState,
  logoEventText,
  logoOf,
  logoSeen,
  previewFileName,
  UPLOAD_FIELDS,
} from './images';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('نوع فایل از خود بایت‌ها (همان قاعدهٔ کارگر)', () => {
  it('PNG، WebP، JPEG و SVG، و نام هیچ اثری ندارد', () => {
    expect(imageFormatOf(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    expect(imageFormatOf(new Uint8Array([...text('RIFF'), 1, 2, 3, 4, ...text('WEBP')]))).toBe('webp');
    expect(imageFormatOf(new Uint8Array([...text('RIFF'), 1, 2, 3, 4, ...text('WAVE')]))).toBeNull();
    expect(imageFormatOf(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe('jpeg');
    expect(imageFormatOf(text('\ufeff\n <?xml version="1.0"?>'))).toBe('svg');
    expect(imageFormatOf(text('<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(imageFormatOf(text('GIF89a'))).toBeNull();
    expect(imageFormatOf(new Uint8Array())).toBeNull();
    expect(imageFormatOf(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });
});

describe('فرم بارگذاری همان قاعده‌های کارگر و پایگاه داده', () => {
  it('سقف هر فایل، و عددهای راهنمای هر فیلد از `site_images.py`', () => {
    expect(IMAGE_MAX_BYTES).toBe(SITE_IMAGE_MAX_BYTES);
    const py = readFileSync(new URL('../../../services/docworker/docworker/site_images.py', import.meta.url), 'utf-8');
    expect(py).toMatch(/^MAX_UPLOAD_BYTES = 1024 \* 1024$/m);
    const constant = (name: string) => Number(new RegExp(`^${name} = (\\d+)$`, 'm').exec(py)?.[1]);
    expect(UPLOAD_FIELDS.logo.main.hint).toContain(`ارتفاع دست‌کم ${constant('LOGO_HEIGHT')} پیکسل`);
    expect(UPLOAD_FIELDS.logo.extra.hint).toContain(`هر ضلع دست‌کم ${constant('MARK_MIN_SIDE')} پیکسل`);
    const rule = (name: string) => {
      const match = new RegExp(`^${name} = BannerRule\\("[^"]+", (\\d+), \\([\\d.]+, [\\d.]+\\), (\\d+)\\)$`, 'm').exec(py);
      return { min: Number(match?.[1]), max: Number(match?.[2]) };
    };
    expect(UPLOAD_FIELDS.banner.main.hint).toContain(`پهنا دست‌کم ${rule('DESKTOP').min} پیکسل`);
    expect(UPLOAD_FIELDS.banner.main.hint).toContain(`پهن‌تر از ${rule('DESKTOP').max} پیکسل`);
    expect(UPLOAD_FIELDS.banner.extra.hint).toContain(`پهنا دست‌کم ${rule('MOBILE').min} پیکسل`);
  });
});

describe('نام فایل نمایشی', () => {
  it('بی مسیر، نویسهٔ کنترلی و جهت‌دهنده، تا ۲۰۰ نویسه؛ خالی یعنی نام پیش‌فرض', () => {
    expect(imageFileName('C:\\fakepath\\لوگو.png', 'logo')).toBe('لوگو.png');
    expect(imageFileName('../../etc/passwd', 'logo')).toBe('passwd');
    expect(imageFileName('a\u0000b\u202ec\u2066.png', 'logo')).toBe('abc.png');
    expect(imageFileName('   ', 'mark')).toBe('mark');
    expect([...imageFileName('ا'.repeat(300), 'x')].length).toBe(200);
  });
});

describe('حال هر بارگذاری و پیام کارگر', () => {
  const at = new Date('2026-10-19T08:00:00Z');
  it('در حال آماده شدن، ساخته نشد، آماده، روی سایت', () => {
    expect(imageState({ id: 1, builtAt: null, error: null }, 1)).toBe('building');
    expect(imageState({ id: 1, builtAt: at, error: 'too_small: x' }, 1)).toBe('failed');
    expect(imageState({ id: 1, builtAt: at, error: null }, 2)).toBe('ready');
    expect(imageState({ id: 1, builtAt: at, error: null }, 1)).toBe('live');
    expect(imageState({ id: 1, builtAt: at, error: null }, null)).toBe('ready');
    expect(['building', 'failed', 'ready', 'live'].map((s) => imageBadge(s as never))).toEqual([
      { tone: 'neutral', text: 'در حال آماده شدن' },
      { tone: 'error', text: 'ساخته نشد' },
      { tone: 'info', text: 'آماده' },
      { tone: 'success', text: 'روی سایت' },
    ]);
  });

  it('پیام آماده پس از کد؛ خطای گذرا پیام خودش', () => {
    expect(imageError(null)).toBeNull();
    expect(imageError('too_small: لوگو: ارتفاع 90 پیکسل است؛ دست‌کم 128 لازم است.')).toEqual({
      code: 'too_small',
      message: 'لوگو: ارتفاع 90 پیکسل است؛ دست‌کم 128 لازم است.',
      server: false,
    });
    expect(imageError('build_failed: OSError')).toMatchObject({ code: 'build_failed', server: true });
    expect(imageError('build_failed: OSError')!.message).toContain('خطای سرور، نه فایل تو');
    expect(imageError('weird')).toMatchObject({ code: 'weird', server: true });
  });
});

describe('لوگو و بنر در تنظیم', () => {
  it('مقدار خراب پیش‌فرض است؛ «همان که دیده شد» لوگو و JSON یکتای بنر', () => {
    expect(logoOf({ imageId: 3 })).toEqual({ imageId: 3 });
    expect(logoOf({ imageId: 'x' })).toEqual({ imageId: null });
    expect(logoOf(undefined)).toEqual({ imageId: null });
    expect([logoSeen({ imageId: null }), logoSeen({ imageId: 4 })]).toEqual(['brand', '4']);
    expect(bannerOf({ mode: 'on', imageId: null, alt: '', href: '' })).toEqual({ mode: 'off', imageId: null, alt: '', href: '' });
    expect(bannerOf({ mode: 'on', imageId: 2, alt: 'a', href: '/x' })).toEqual({ mode: 'on', imageId: 2, alt: 'a', href: '/x' });
    expect(canonicalBanner({ mode: 'on', imageId: 2, alt: 'a', href: '' })).not.toBe(canonicalBanner({ mode: 'on', imageId: 2, alt: 'a', href: '/' }));
  });

  it('کار هر تغییر بنر', () => {
    const off = { mode: 'off' as const, imageId: 1, alt: 'a', href: '' };
    const on = { ...off, mode: 'on' as const };
    expect([bannerChange(off, on), bannerChange(on, { ...on, alt: 'b' }), bannerChange(on, off)]).toEqual(['on', 'change', 'off']);
  });

  it('خط آخرین تغییر کارت‌ها', () => {
    const now = new Date('2026-10-19T08:00:00Z');
    const event = (detail: Record<string, unknown>, by: string | null = 'بهار'): SettingEvent => ({
      at: new Date('2026-10-19T06:35:00Z'),
      by,
      action: 'content.banner',
      detail,
    });
    expect(logoEventText(null, now)).toBeNull();
    expect(logoEventText(event({ change: 'publish', fresh: true }), now)).toBe('از امروز 10:05، بهار، با کد تازه.');
    expect(bannerEventText(event({ change: 'on', fresh: true }), now)).toBe('روشن از امروز 10:05، بهار، با کد تازه.');
    expect(bannerEventText(event({ change: 'off', fresh: false }, null), now)).toBe('خاموش از امروز 10:05.');
    expect(bannerEventText(event({ change: 'change', fresh: true }), now)).toBe('آخرین تغییر امروز 10:05، بهار، با کد تازه.');
  });

  it('نام فایل دانلود پیش‌نمایش', () => {
    expect(previewFileName('logo', 3, 'favicon', 'image/x-icon')).toBe('logo-3-favicon.ico');
    expect(previewFileName('banner', 2, 'desktop', 'image/jpeg')).toBe('banner-2-desktop.jpg');
    expect(previewFileName('logo', 3, 'og', 'image/png')).toBe('logo-3-og.png');
  });
});
