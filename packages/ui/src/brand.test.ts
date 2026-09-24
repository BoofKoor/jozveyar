/**
 * لوگو و نشان: `<img>` با متن جایگزین، نسبت خود فایل، و نه کوچک‌تر از کمینهٔ راهنما.
 *
 * فایل وارد‌شده در Next شیء تصویر ایستاست (`{ src }`) و در vitest نشانی یا data URI. اینجا هر
 * دو شکل ساختگی داده می‌شود تا خود کامپوننت سنجیده شود؛ رفتار واقعی Next در build سنجیده شد.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it, vi } from 'vitest';

import { Logo, Mark } from './brand.js';
import { LOGO_MIN_HEIGHT, MARK_MIN_HEIGHT } from './tokens.js';

vi.mock('../assets/jozveyar-logo-no-tagline.svg', () => ({
  default: { src: '/_next/static/media/jozveyar-logo-no-tagline.0a1b2c3d.svg' },
}));
vi.mock('../assets/jozveyar-mark.svg', () => ({ default: '/assets/jozveyar-mark.svg' }));

const attrs = (html: string) => Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));

describe('لوگو و نشان', () => {
  it('لوگو: فایل بی‌شعار، متن جایگزین، و پهنا از نسبت خود فایل', () => {
    const img = attrs(renderToStaticMarkup(createElement(Logo, { height: 64 })));
    expect(img.src).toBe('/_next/static/media/jozveyar-logo-no-tagline.0a1b2c3d.svg');
    expect(img.alt).toBe('جزوه‌یار');
    expect(img.height).toBe('64');
    expect(img.width).toBe('58'); // 395 × 64 / 435
  });

  it('لوگو زیر کمینه نمی‌رود', () => {
    const img = attrs(renderToStaticMarkup(createElement(Logo, { height: 32 })));
    expect(Number(img.height)).toBe(LOGO_MIN_HEIGHT);
  });

  it('نشان: پیش‌فرض تزئینی، و نه کوچک‌تر از ۳۲ پیکسل', () => {
    const img = attrs(renderToStaticMarkup(createElement(Mark, { height: 24 })));
    expect(img.src).toBe('/assets/jozveyar-mark.svg');
    expect(img.alt).toBe('');
    expect(Number(img.height)).toBe(MARK_MIN_HEIGHT);
    expect(attrs(renderToStaticMarkup(createElement(Mark, { height: 40, alt: 'جزوه‌یار' }))).alt).toBe('جزوه‌یار');
  });
});
