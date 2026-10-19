/**
 * لوگو و بنر صفحهٔ اصلی از پنل (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): فایل‌هایی که کارگر از بارگذاری مالک ساخت و روی سایت رفته‌اند، با نشانی
 * `/media/<sha256>.<پسوند>` (`app/media/[file]/route.ts`)، پس هر فایل نشانی خودش را دارد و کش همیشگی است.
 *
 * layout (لوگوی سربرگ و پاورقی، نشانک، آیکون گوشی و تصویر اشتراک)، manifest و صفحهٔ اصلی (بنر) با ISR ۶۰ ثانیه می‌خوانندشان، مثل نوار اعلان:
 * build و بی پایگاه داده هیچ (لوگوی برند و بی بنر)، و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد. بارگذاری‌ای که فایلی کم دارد هم
 * هیچ، تا سایت هرگز نیمی برند و نیمی لوگوی تازه نباشد.
 */

import { cache } from 'react';

import { barHref, BANNER_ALT_MAX } from '@jozveyar/content';
import type { SiteBanner, SiteLogo } from '@jozveyar/contracts';
import {
  BANNER_SETTING,
  LOGO_SETTING,
  createOrderStore,
  createSiteImageStore,
  getDb,
  readSetting,
  type SiteImageFileMeta,
  type SiteImageKind,
} from '@jozveyar/db';

import { BUILD_PHASE } from './tariff';

/** یک فایل روی سایت: نشانی، ابعاد و نوع. */
export interface MediaFile {
  src: string;
  width: number;
  height: number;
  type: string;
}

/** لوگوی مالک و همهٔ فایل‌هایی که از آن ساخته شد. */
export interface SiteBrand {
  /** PNG با ۱۲۸ پیکسل ارتفاع، برای سربرگ و پاورقی. */
  logo: MediaFile;
  /** ICO با ۱۶، ۳۲ و ۴۸ پیکسل. */
  favicon: MediaFile;
  apple: MediaFile;
  icon192: MediaFile;
  icon512: MediaFile;
  /** تصویر اشتراک ۱۲۰۰×۶۳۰. */
  og: MediaFile;
}

/** بنر روشن صفحهٔ اصلی. */
export interface SiteBannerView {
  alt: string;
  /** صفحه‌ای از همین سایت، یا خالی. */
  href: string;
  desktop: MediaFile;
  mobile: MediaFile | null;
}

const EXTENSIONS: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/x-icon': 'ico' };

/** نشانی یک فایل روی سایت؛ همان شکلی که `/media/[file]` می‌پذیرد. */
export const mediaPath = (file: Pick<SiteImageFileMeta, 'sha256' | 'contentType'>) => `/media/${file.sha256}.${EXTENSIONS[file.contentType] ?? 'bin'}`;

const mediaOf = (file: SiteImageFileMeta): MediaFile => ({ src: mediaPath(file), width: file.width, height: file.height, type: file.contentType });

export interface BrandSource {
  logo: () => Promise<SiteLogo>;
  banner: () => Promise<SiteBanner>;
  /** فایل‌های بارگذاری‌ای از این نوع که روی سایت رفته؛ null یعنی نیست یا هرگز روی سایت نرفت. */
  files: (id: number, kind: SiteImageKind) => Promise<SiteImageFileMeta[] | null>;
}

export async function loadSiteBrand(source: Pick<BrandSource, 'logo' | 'files'>): Promise<SiteBrand | null> {
  const { imageId } = await source.logo();
  if (imageId === null) return null;
  const files = await source.files(imageId, 'logo');
  const by = (name: string) => files?.find((file) => file.name === name);
  const logo = by('logo');
  const favicon = by('favicon');
  const apple = by('apple');
  const icon192 = by('icon192');
  const icon512 = by('icon512');
  const og = by('og');
  if (!logo || !favicon || !apple || !icon192 || !icon512 || !og) return null;
  return {
    logo: mediaOf(logo),
    favicon: mediaOf(favicon),
    apple: mediaOf(apple),
    icon192: mediaOf(icon192),
    icon512: mediaOf(icon512),
    og: mediaOf(og),
  };
}

export async function loadSiteBanner(source: Pick<BrandSource, 'banner' | 'files'>): Promise<SiteBannerView | null> {
  const banner = await source.banner();
  if (banner.mode !== 'on' || banner.imageId === null) return null;
  const files = await source.files(banner.imageId, 'banner');
  const desktop = files?.find((file) => file.name === 'desktop');
  if (!desktop) return null;
  const mobile = files?.find((file) => file.name === 'mobile');
  // پنل پیوند را پیش از ذخیره سنجیده؛ اینجا دوباره، تا مقداری که از راه دیگری در پایگاه داده نشسته پیوندی به سایت دیگر نشود (مثل نوار).
  return {
    alt: [...banner.alt].slice(0, BANNER_ALT_MAX).join(''),
    href: barHref(banner.href) ?? '',
    desktop: mediaOf(desktop),
    mobile: mobile ? mediaOf(mobile) : null,
  };
}

let shared: BrandSource | undefined;

function sourceOf(): BrandSource {
  if (shared) return shared;
  const db = getDb();
  const orders = createOrderStore(db);
  const images = createSiteImageStore(db);
  const setting = (key: string) => orders.setting(key);
  shared = {
    logo: () => readSetting(setting, LOGO_SETTING),
    banner: () => readSetting(setting, BANNER_SETTING),
    files: (id, kind) => images.publishedFiles(id, kind),
  };
  return shared;
}

export async function readSiteBrand(
  env: Readonly<Record<string, string | undefined>> = process.env,
  source: () => BrandSource = sourceOf,
): Promise<SiteBrand | null> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return null;
  try {
    return await loadSiteBrand(source());
  } catch (error) {
    console.error('✗ سایت: لوگو از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

export async function readSiteBanner(
  env: Readonly<Record<string, string | undefined>> = process.env,
  source: () => BrandSource = sourceOf,
): Promise<SiteBannerView | null> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return null;
  try {
    return await loadSiteBanner(source());
  } catch (error) {
    console.error('✗ سایت: بنر صفحهٔ اصلی از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** لوگوی مالک، یک بار در هر رسم صفحه (layout و متادیتا هر دو). */
export const siteBrand = cache(() => readSiteBrand());
/** بنر صفحهٔ اصلی، یک بار در هر رسم. */
export const siteBanner = cache(() => readSiteBanner());
