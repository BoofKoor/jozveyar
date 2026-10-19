/**
 * لوگو و بنر در پنل (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): نوع فایل از خود بایت‌ها، نام فایل نمایشی، حال هر بارگذاری در یک نشان، پیام «ساخته نشد»
 * کارگر، کار هر تغییر بنر، و خط آخرین تغییر کارت‌ها. خالص و بی JSX، مثل `bar.ts`: تست بی مرورگر می‌سنجدش.
 */

import type { SiteBanner, SiteLogo } from '@jozveyar/contracts';
import { SETTING_SCHEMAS } from '@jozveyar/contracts';
import type { SettingEvent, SiteImageFileName, SiteImageKind, SiteImageRow } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { whenText } from './format';

export type ImageFormat = 'png' | 'webp' | 'jpeg' | 'svg';

/** فرمت‌های هر نوع (سؤال ۲۰۶): لوگو و نشان PNG یا WebP، چون شفافیت دارند و SVG اسکریپت می‌پذیرد؛ بنر JPEG هم، چون معمولاً عکس است. */
export const IMAGE_FORMATS: Readonly<Record<SiteImageKind, readonly ImageFormat[]>> = {
  logo: ['png', 'webp'],
  banner: ['jpeg', 'png', 'webp'],
};

/** سقف هر فایل بارگذاری (`SITE_IMAGE_MAX_BYTES`)؛ فرم بارگذاری مرورگری است و پکیج پایگاه داده را با خودش نمی‌آورد (تست برابری). */
export const IMAGE_MAX_BYTES = 1024 * 1024;

/** دو فایل فرم بارگذاری هر نوع: اصلی لازم، دومی اختیاری؛ متن‌ها همان قاعده‌های کارگر (`site_images.py`). */
export const UPLOAD_FIELDS: Readonly<Record<SiteImageKind, Record<'main' | 'extra', { label: string; hint: string }>>> = {
  logo: {
    main: {
      label: 'لوگو',
      hint: 'PNG یا WebP با زمینهٔ شفاف؛ ارتفاع دست‌کم 128 پیکسل، و پهنا نیم تا چهار برابر ارتفاع. حاشیهٔ شفاف دورش خودکار بریده می‌شود.',
    },
    extra: {
      label: 'نشان',
      hint: 'برای نشانک مرورگر و آیکون گوشی: تصویر نزدیک به مربع، هر ضلع دست‌کم 192 پیکسل. بی آن همین دو از خود لوگو ساخته می‌شوند.',
    },
  },
  banner: {
    main: {
      label: 'تصویر دسکتاپ',
      hint: 'JPEG، PNG یا WebP؛ پهنا دست‌کم 1080 پیکسل، و دو تا شش برابر ارتفاع. پهن‌تر از 2160 پیکسل کوچک می‌شود.',
    },
    extra: {
      label: 'تصویر گوشی',
      hint: 'پهنا دست‌کم 640 پیکسل، و یک تا سه برابر ارتفاع. بی آن گوشی هم تصویر دسکتاپ را می‌بیند.',
    },
  },
};

/** نام هر فایل ساختهٔ کارگر در پیش‌نمایش پنل. */
export const FILE_LABELS: Readonly<Record<SiteImageFileName, string>> = {
  logo: 'سربرگ و پاورقی',
  favicon: 'نشانک مرورگر',
  apple: 'آیکون آیفون',
  icon192: 'آیکون اندروید',
  icon512: 'آیکون اندروید، بزرگ',
  og: 'تصویر اشتراک',
  desktop: 'دسکتاپ',
  mobile: 'گوشی',
};

/** `accept` ورودی فایل هر نوع؛ فقط راهنمای مرورگر است، سرور خودش از بایت‌ها می‌سنجد. */
export const IMAGE_ACCEPT: Readonly<Record<SiteImageKind, string>> = {
  logo: 'image/png,image/webp',
  banner: 'image/jpeg,image/png,image/webp',
};

/** نوع از خود بایت‌ها، همان قاعدهٔ کارگر (`kind_of` در `site_images.py`): PNG، WebP، JPEG، SVG، یا null. */
export function imageFormatOf(bytes: Uint8Array): ImageFormat | null {
  const at = (i: number) => bytes[i] ?? -1;
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => at(i) === value)) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^[﻿\s]+/, '')
    .toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) return 'svg';
  return null;
}

/** نام فایلی که بارگذاری شد، فقط برای نمایش: بی مسیر و نویسهٔ کنترلی، تا ۲۰۰ نویسه؛ خالی یعنی نام پیش‌فرض. */
export function imageFileName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').trim();
  return [...(clean || fallback)].slice(0, 200).join('');
}

export const logoOf = (raw: unknown): SiteLogo => {
  const parsed = SETTING_SCHEMAS['content.logo'].safeParse(raw);
  return parsed.success ? parsed.data : { imageId: null };
};

export const BANNER_OFF: SiteBanner = { mode: 'off', imageId: null, alt: '', href: '' };

export const bannerOf = (raw: unknown): SiteBanner => {
  const parsed = SETTING_SCHEMAS['content.banner'].safeParse(raw);
  return parsed.success ? parsed.data : BANNER_OFF;
};

/** «همان که دیده شد» لوگو: شمارهٔ بارگذاری روی سایت، یا `brand`. */
export const logoSeen = (logo: SiteLogo) => (logo.imageId === null ? 'brand' : String(logo.imageId));

/** JSON یکتای بنر، برای «همان که دیده شد» و «چیزی عوض نشد». */
export const canonicalBanner = (banner: SiteBanner) => JSON.stringify([banner.mode, banner.imageId, banner.alt, banner.href]);

export type ImageState = 'building' | 'failed' | 'ready' | 'live';

/** حال یک بارگذاری: در حال آماده شدن، ساخته نشد، آماده، یا همین حالا روی سایت. */
export function imageState(row: Pick<SiteImageRow, 'id' | 'builtAt' | 'error'>, liveId: number | null): ImageState {
  if (row.builtAt === null) return 'building';
  if (row.error !== null) return 'failed';
  return row.id === liveId ? 'live' : 'ready';
}

export function imageBadge(state: ImageState): { tone: 'success' | 'info' | 'neutral' | 'error'; text: string } {
  switch (state) {
    case 'building':
      return { tone: 'neutral', text: 'در حال آماده شدن' };
    case 'failed':
      return { tone: 'error', text: 'ساخته نشد' };
    case 'ready':
      return { tone: 'info', text: 'آماده' };
    case 'live':
      return { tone: 'success', text: 'روی سایت' };
  }
}

/**
 * خطای کارگر (`too_small: لوگو: ارتفاع …`): کد، و پیام آماده؛ خطای گذرا (`build_failed: OSError`) پیام خودش را دارد و `server`، چون فایل درست
 * است و همان را دوباره می‌شود بارگذاری کرد.
 */
export function imageError(error: string | null): { code: string; message: string; server: boolean } | null {
  if (error === null) return null;
  const at = error.indexOf(': ');
  const code = at > 0 ? error.slice(0, at) : error;
  const rest = at > 0 ? error.slice(at + 2) : '';
  if (code === 'build_failed' || !rest) {
    return { code, message: 'کارگر فایل‌ها را نساخت (خطای سرور، نه فایل تو). همان تصویر را دوباره بارگذاری کن؛ اگر باز نشد، خبر بده.', server: true };
  }
  return { code, message: rest, server: false };
}

/** کار هر تغییر بنر: روشن شد، عوض شد، یا خاموش شد. */
export type BannerChange = 'on' | 'change' | 'off';

export function bannerChange(before: SiteBanner, after: SiteBanner): BannerChange {
  if (after.mode === 'off') return 'off';
  return before.mode === 'on' ? 'change' : 'on';
}

/** خط آخرین تغییر کارت لوگو: «از امروز 10:05، بهار، با کد تازه.»؛ بی رویداد هیچ. */
export function logoEventText(event: SettingEvent | null, now: Date): string | null {
  if (!event) return null;
  const who = event.by ? `، ${event.by}` : '';
  const fresh = event.detail.fresh === true ? '، با کد تازه' : '';
  return `از ${whenText(event.at, now)}${who}${fresh}.`;
}

/** خط آخرین تغییر کارت بنر: «روشن از امروز 10:05، علی، با کد تازه.»، «خاموش از …»، «آخرین تغییر …». */
export function bannerEventText(event: SettingEvent | null, now: Date): string | null {
  if (!event) return null;
  const who = event.by ? `، ${event.by}` : '';
  const fresh = event.detail.fresh === true ? '، با کد تازه' : '';
  const when = whenText(event.at, now);
  if (event.detail.change === 'on') return `روشن از ${when}${who}${fresh}.`;
  if (event.detail.change === 'off') return `خاموش از ${when}${who}.`;
  return `آخرین تغییر ${when}${who}${fresh}.`;
}

/** اندازهٔ فایل به کیلوبایت، دست‌کم 1: «34». */
export const kbText = (bytes: number) => formatNumber(Math.max(1, Math.round(bytes / 1024)));

/** نام فایل دانلود پیش‌نمایش: `logo-3-favicon.ico`. */
export function previewFileName(kind: SiteImageKind, version: number, name: string, contentType: string): string {
  const ext = contentType === 'image/x-icon' ? 'ico' : contentType === 'image/jpeg' ? 'jpg' : 'png';
  return `${kind}-${version}-${name}.${ext}`;
}
