/**
 * لوگو و بنر صفحهٔ اصلی در پنل (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): بارگذاری، پیش‌نمایش فایل‌هایی که کارگر ساخت، و گذاشتن روی سایت.
 *
 * - **مجوز در سرور** (ADR-038): لوگو با `content.edit` (فقط مالک، همان متن‌ها: هویت سایت)، بنر با `content.bar` (مالک و متصدی، همان نوار
 *   اعلان: تبلیغ). حسابدار و چاپخانه هیچ‌کدام.
 * - **کد تازه:** گذاشتن لوگو روی سایت و برگشت به لوگوی جزوه‌یار، و روشن کردن و هر تغییر بنر، پس از هر سنجشی که بی کد جواب دارد؛ بارگذاری و
 *   «خاموش کن» بنر بی کد.
 * - **سرور منبع حقیقت است:** نوع فایل از بایت‌ها و اندازه همین‌جا، و ابعاد و هر چیز دیگر را کارگر با Pillow می‌سنجد؛ پایگاه داده هم سقف‌ها را
 *   دارد (0055). سایت فقط آنچه کارگر از نو ساخت می‌بیند.
 * - **همان که دیده شد:** صفحه لوگو یا بنری را که دید با فرم می‌فرستد (`logoSeen`، `canonicalBanner`)، و ذخیره‌گاه زیر قفل تنظیم‌ها با امروز
 *   می‌سنجدش، همراه ردیف تصویری که قرار است روی سایت برود (ساخته و بی خطا).
 * - **رویداد** هر کار در همان تراکنش خودش است (ذخیره‌گاه، `@jozveyar/db` → `siteImages.ts`).
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل، تراکنش و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash } from 'node:crypto';

import type { SiteBanner, SiteLogo } from '@jozveyar/contracts';
import { checkBanner, tidyBanner } from '@jozveyar/content';
import {
  BANNER_SETTING,
  LOGO_SETTING,
  SITE_IMAGE_FILES,
  SITE_IMAGE_MAX_BYTES,
  type SettingEvent,
  type SettingsStore,
  type SiteImageKind,
  type SiteImageRow,
  type SiteImageStore,
} from '@jozveyar/db';

import {
  IMAGE_FORMATS,
  bannerChange,
  bannerOf,
  canonicalBanner,
  imageFileName,
  imageFormatOf,
  logoOf,
  logoSeen,
  previewFileName,
  type BannerChange,
} from '../images';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** بارگذاری‌های اخیر هر نوع در صفحه‌اش. */
export const RECENT_UPLOADS = 10;

export interface PanelImagesDeps {
  store: SiteImageStore;
  settings: Pick<SettingsStore, 'read'>;
  logoEvent: () => Promise<SettingEvent | null>;
  bannerEvent: () => Promise<SettingEvent | null>;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

export interface LogoView {
  now: Date;
  /** بارگذاری روی سایت؛ null یعنی لوگوی جزوه‌یار. */
  live: SiteImageRow | null;
  seen: string;
  uploads: SiteImageRow[];
  event: SettingEvent | null;
}

export interface BannerView {
  now: Date;
  banner: SiteBanner;
  /** بارگذاری‌ای که بنر به آن اشاره می‌کند (روشن یا خاموش). */
  image: SiteImageRow | null;
  seen: string;
  uploads: SiteImageRow[];
  event: SettingEvent | null;
}

export interface ImageView {
  now: Date;
  image: SiteImageRow;
  /** لوگو: بارگذاری روی سایت؛ بنر: بارگذاری بنر روشن. */
  liveId: number | null;
  seen: string;
  /** بنر امروز، تا فرم «روی سایت بگذار» متن و پیوندش را از پیش داشته باشد. */
  banner: SiteBanner | null;
}

export interface ImageFile {
  body: Uint8Array;
  sizeBytes: number;
  fileName: string;
  contentType: string;
}

export interface UploadInput {
  kind: unknown;
  main: { name: string; bytes: Uint8Array } | null;
  extra: { name: string; bytes: Uint8Array } | null;
}

const PERMISSION = { logo: 'content.edit', banner: 'content.bar' } as const;
const isKind = (value: unknown): value is SiteImageKind => value === 'logo' || value === 'banner';
const ALL_FILES: readonly string[] = [...SITE_IMAGE_FILES.logo, ...SITE_IMAGE_FILES.banner];

/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';
const idOf = (value: unknown) => (typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : null);
const seenOf = (value: unknown) => (typeof value === 'string' ? value : '');
export const bannerSeen = (banner: SiteBanner) => createHash('sha256').update(canonicalBanner(banner)).digest('hex');
/** بارگذاری‌ای که می‌شود روی سایت گذاشت: ساخته و بی خطا. */
const ready = (row: SiteImageRow | null | undefined): row is SiteImageRow => !!row && row.builtAt !== null && row.error === null;
/** بنر در رویداد، بی شمارهٔ ردیف برای متن. */
const bannerDetail = (banner: SiteBanner) => ({ mode: banner.mode, imageId: banner.imageId, alt: banner.alt, href: banner.href });

export function createPanelImages(deps: PanelImagesDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;
  const actor = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });

  async function currentLogo(): Promise<SiteLogo> {
    return logoOf(await deps.settings.read(LOGO_SETTING));
  }

  async function currentBanner(): Promise<SiteBanner> {
    return bannerOf(await deps.settings.read(BANNER_SETTING));
  }

  return {
    async logo(session: AdminSession): Promise<Result<LogoView>> {
      if (!can(session, 'content.edit')) return fail(403, 'forbidden');
      const [logo, uploads, event] = await Promise.all([currentLogo(), store.recent('logo', RECENT_UPLOADS), deps.logoEvent()]);
      const live = logo.imageId === null ? null : await store.get(logo.imageId);
      return ok({ now: now(), live: live && live.kind === 'logo' ? live : null, seen: logoSeen(logo), uploads, event });
    },

    async banner(session: AdminSession): Promise<Result<BannerView>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const [banner, uploads, event] = await Promise.all([currentBanner(), store.recent('banner', RECENT_UPLOADS), deps.bannerEvent()]);
      const image = banner.imageId === null ? null : await store.get(banner.imageId);
      return ok({ now: now(), banner, image: image && image.kind === 'banner' ? image : null, seen: bannerSeen(banner), uploads, event });
    },

    /** صفحهٔ یک بارگذاری، از همان نوع نشانی؛ بارگذاری نوع دیگر همان «پیدا نشد». */
    async image(session: AdminSession, kind: SiteImageKind, param: string): Promise<Result<ImageView>> {
      if (!can(session, PERMISSION[kind])) return fail(403, 'forbidden');
      const id = idOf(param);
      const image = id === null ? null : await store.get(id);
      if (!image || image.kind !== kind) return fail(404, 'image_not_found');
      if (kind === 'logo') {
        const logo = await currentLogo();
        return ok({ now: now(), image, liveId: logo.imageId, seen: logoSeen(logo), banner: null });
      }
      const banner = await currentBanner();
      return ok({ now: now(), image, liveId: banner.mode === 'on' ? banner.imageId : null, seen: bannerSeen(banner), banner });
    },

    /**
     * بارگذاری تازه (بی کد: تا «روی سایت بگذار» چیزی روی سایت عوض نمی‌شود). فایل اصلی لازم و دومی اختیاری (نشان لوگو، یا تصویر گوشی بنر)؛ هر
     * کدام تا ۱ مگابایت و از نوع خودش، از بایت‌ها. ابعاد را کارگر می‌سنجد.
     */
    async upload(session: AdminSession, input: UploadInput, ip: string): Promise<Result<{ id: number; kind: SiteImageKind }>> {
      if (!isKind(input.kind)) return fail(400, 'image_kind');
      const kind = input.kind;
      if (!can(session, PERMISSION[kind])) return fail(403, 'forbidden');
      if (!input.main || input.main.bytes.length === 0) return fail(400, 'image_required', { field: 'main' });
      const files = [
        ['main', input.main],
        ['extra', input.extra],
      ] as const;
      for (const [field, file] of files) {
        if (!file || file.bytes.length === 0) continue;
        if (file.bytes.length > SITE_IMAGE_MAX_BYTES) return fail(413, 'image_too_large', { field });
        const format = imageFormatOf(file.bytes);
        if (format === 'svg') return fail(415, 'image_svg', { field });
        if (format === null || !IMAGE_FORMATS[kind].includes(format)) return fail(415, 'image_format', { field });
      }
      const extra = input.extra && input.extra.bytes.length > 0 ? input.extra : null;
      const fallback = kind === 'logo' ? ['logo', 'mark'] : ['desktop', 'mobile'];
      const row = await store.upload({
        kind,
        main: { name: imageFileName(input.main.name, fallback[0]!), bytes: Buffer.from(input.main.bytes) },
        extra: extra ? { name: imageFileName(extra.name, fallback[1]!), bytes: Buffer.from(extra.bytes) } : null,
        actor: actor(session, ip),
        at: now(),
      });
      return ok({ id: row.id, kind });
    },

    /** یک فایل ساختهٔ کارگر، برای `<img>` پیش‌نمایش پنل؛ مجوز همان نوع بارگذاری. */
    async file(session: AdminSession, param: string, name: string): Promise<Result<ImageFile>> {
      const id = idOf(param);
      if (id === null || !ALL_FILES.includes(name)) return fail(404, 'image_not_found');
      const image = await store.get(id);
      if (!image) return fail(404, 'image_not_found');
      if (!can(session, PERMISSION[image.kind])) return fail(403, 'forbidden');
      const file = await store.file(id, name);
      if (!file) return fail(404, 'image_not_found');
      return ok({
        body: new Uint8Array(file.bytes),
        sizeBytes: file.bytes.length,
        fileName: previewFileName(image.kind, image.version, name, file.contentType),
        contentType: file.contentType,
      });
    },

    /** «روی سایت بگذار» یک لوگو (سؤال ۲۰۶): از همان که دیده شد، فقط بارگذاری ساخته و بی خطا، با کد تازه. */
    async publishLogo(
      session: AdminSession,
      input: { id: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ change: 'publish' | 'same'; version: number }>> {
      if (!can(session, 'content.edit')) return fail(403, 'forbidden');
      const seen = seenOf(input.seen);
      const id = idOf(input.id);
      const image = id === null ? null : await store.get(id);
      if (!image || image.kind !== 'logo') return fail(404, 'image_not_found');
      const current = await currentLogo();
      if (seen !== logoSeen(current)) return fail(409, 'logo_changed');
      if (!ready(image)) return fail(409, 'image_not_ready');
      if (current.imageId === image.id) return ok({ change: 'same', version: image.version });
      if (blank(input.code)) return fail(400, 'logo_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.change({
        key: LOGO_SETTING,
        action: 'content.logo',
        imageId: image.id,
        at: now(),
        actor: actor(session, ip),
        decide: (value, locked) => {
          const logo = logoOf(value);
          if (logoSeen(logo) !== seen) return { kind: 'reject', reason: 'changed' };
          if (!ready(locked) || locked.kind !== 'logo') return { kind: 'reject', reason: 'not_ready' };
          if (logo.imageId === locked.id) return { kind: 'same' };
          return {
            kind: 'write',
            value: { imageId: locked.id },
            detail: { change: 'publish', imageId: locked.id, version: locked.version, before: logo.imageId, fresh: true },
          };
        },
      });
      if (!done.ok) return fail(409, done.reason === 'not_ready' ? 'image_not_ready' : 'logo_changed');
      return ok({ change: done.written ? 'publish' : 'same', version: image.version });
    },

    /** «برگشت به لوگوی جزوه‌یار»: از همان که دیده شد، با کد تازه. */
    async brandLogo(session: AdminSession, input: { seen: unknown; code: unknown }, ip: string): Promise<Result<{ change: 'brand' | 'same' }>> {
      if (!can(session, 'content.edit')) return fail(403, 'forbidden');
      const seen = seenOf(input.seen);
      const current = await currentLogo();
      if (seen !== logoSeen(current)) return fail(409, 'logo_changed');
      if (current.imageId === null) return ok({ change: 'same' });
      if (blank(input.code)) return fail(400, 'logo_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.change({
        key: LOGO_SETTING,
        action: 'content.logo',
        imageId: null,
        at: now(),
        actor: actor(session, ip),
        decide: (value) => {
          const logo = logoOf(value);
          if (logoSeen(logo) !== seen) return { kind: 'reject', reason: 'changed' };
          if (logo.imageId === null) return { kind: 'same' };
          return { kind: 'write', value: { imageId: null }, detail: { change: 'brand', before: logo.imageId, fresh: true } };
        },
      });
      if (!done.ok) return fail(409, 'logo_changed');
      return ok({ change: done.written ? 'brand' : 'same' });
    },

    /**
     * «روی سایت بگذار» بنر، یا ذخیرهٔ متن و پیوند بنر روشن (سؤال ۲۰۶): از همان که دیده شد، بارگذاری ساخته و بی خطا، متن جایگزین لازم و پیوند فقط
     * به همین سایت، و چون بنر روشن روی سایت است، با کد تازه. همان بنر هیچ (بی کد و بی رویداد).
     */
    async saveBanner(
      session: AdminSession,
      input: { id: unknown; alt: unknown; href: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ change: BannerChange | 'same' }>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const seen = seenOf(input.seen);
      const id = idOf(input.id);
      const image = id === null ? null : await store.get(id);
      if (!image || image.kind !== 'banner') return fail(404, 'image_not_found');
      const current = await currentBanner();
      if (seen !== bannerSeen(current)) return fail(409, 'banner_changed');
      if (!ready(image)) return fail(409, 'image_not_ready');
      const fields = tidyBanner(input);
      const issues = checkBanner(fields);
      if (issues.length > 0) return fail(400, 'banner_invalid', { issues });
      const next: SiteBanner = { mode: 'on', imageId: image.id, ...fields };
      if (canonicalBanner(next) === canonicalBanner(current)) return ok({ change: 'same' });
      if (blank(input.code)) return fail(400, 'banner_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const change = bannerChange(current, next);
      const done = await store.change({
        key: BANNER_SETTING,
        action: 'content.banner',
        imageId: image.id,
        at: now(),
        actor: actor(session, ip),
        decide: (value, locked) => {
          const banner = bannerOf(value);
          if (bannerSeen(banner) !== seen) return { kind: 'reject', reason: 'changed' };
          if (!ready(locked) || locked.kind !== 'banner') return { kind: 'reject', reason: 'not_ready' };
          if (canonicalBanner(banner) === canonicalBanner(next)) return { kind: 'same' };
          return {
            kind: 'write',
            value: next,
            detail: { change, version: locked.version, before: bannerDetail(banner), after: bannerDetail(next), fresh: true },
          };
        },
      });
      if (!done.ok) return fail(409, done.reason === 'not_ready' ? 'image_not_ready' : 'banner_changed');
      return ok({ change: done.written ? change : 'same' });
    },

    /** «خاموش کن» بنر: بی کد و همان لحظه؛ تصویر، متن و پیوند می‌مانند، و بنر خاموش همان می‌ماند، بی رویداد. */
    async bannerOff(session: AdminSession, ip: string): Promise<Result<{ change: 'off' | 'same' }>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const done = await store.change({
        key: BANNER_SETTING,
        action: 'content.banner',
        imageId: null,
        at: now(),
        actor: actor(session, ip),
        decide: (value) => {
          const banner = bannerOf(value);
          if (banner.mode === 'off') return { kind: 'same' };
          const next: SiteBanner = { ...banner, mode: 'off' };
          return { kind: 'write', value: next, detail: { change: 'off', before: bannerDetail(banner), after: bannerDetail(next), fresh: false } };
        },
      });
      if (!done.ok) return fail(409, 'banner_changed');
      return ok({ change: done.written ? 'off' : 'same' });
    },
  };
}

export type PanelImages = ReturnType<typeof createPanelImages>;
