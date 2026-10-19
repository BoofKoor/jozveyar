/**
 * تصویرهای سایت (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): بارگذاری لوگو و بنر، نتیجهٔ کار کارگر (`build_site_image`)، و گذاشتن روی سایت.
 *
 * مثل `templates.ts` فقط خواندن و نوشتن است؛ قالب و اندازهٔ فایل، مجوز، کد تازه و متن‌ها در سرویس پنل (`apps/admin/lib/server/images.ts`).
 * آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک تراکنش برای بارگذاری:** ردیف، کار کارگر و رویداد `content.upload` با هم؛ شمارهٔ هر نوع زیر قفل خودش.
 *  - **روی سایت زیر قفل تنظیم‌ها:** لوگو و بنر دو تنظیم‌اند (`content.logo` و `content.banner`)، پس همان قفل مشورتی ذخیره‌گاه تنظیم‌ها؛ ردیف
 *    تصویری که مقدار تازه به آن اشاره می‌کند هم قفل می‌شود و `decide` سرویس هر دو را می‌بیند. نوشتن، `published_at` همان ردیف و رویداد در
 *    همان تراکنش.
 *  - **سایت فقط آنچه روی سایت رفته:** فایل با sha256 فقط از بارگذاری‌ای داده می‌شود که `published_at` دارد؛ پیش‌نمایش پنل از راه خودش.
 *  - تغییرناپذیری، نتیجهٔ یک‌بارهٔ کارگر، فایل‌های کامل و پاک نشدن آنچه روی سایت رفته را خود پایگاه داده هم می‌سنجد (0056).
 */

import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { adminEvents, adminUsers, jobs, settings, siteImageFiles, siteImageKind, siteImages, type SiteImageFileName } from './schema.js';
import { SETTINGS_LOCK, SETTING_TARGET, type SettingChangeResult, type SettingDecision, type SettingsActor } from './settings.js';

/** کار کارگر برای هر بارگذاری (`services/docworker/docworker/site_images.py`). */
export const BUILD_SITE_IMAGE_JOB = 'build_site_image';
/** هدف رویداد بارگذاری در `admin_events`؛ شناسهٔ هدف شمارهٔ ردیف. */
export const SITE_IMAGE_TARGET = 'site_image';
/** بارگذاری‌ای که هرگز روی سایت نرفت این‌قدر روز می‌ماند؛ بعد کارگر پاکش می‌کند (`retention.py`). */
export const SITE_IMAGE_UNPUBLISHED_DAYS = 30;

/** کلید قفل مشورتی شمارهٔ بارگذاری‌ها: «simg» به عدد. */
const SITE_IMAGES_LOCK = 0x73696d67;

export type SiteImageKind = (typeof siteImageKind.enumValues)[number];
export type SiteImageSetting = 'content.logo' | 'content.banner';

/** یک فایل ساختهٔ کارگر، بی بایت. */
export interface SiteImageFileMeta {
  name: SiteImageFileName;
  contentType: string;
  width: number;
  height: number;
  sha256: string;
  hasAlpha: boolean;
  sizeBytes: number;
}

export interface SiteImageRow {
  id: number;
  kind: SiteImageKind;
  version: number;
  mainName: string;
  mainBytes: number;
  extraName: string | null;
  extraBytes: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  builtAt: Date | null;
  error: string | null;
  publishedAt: Date | null;
  files: SiteImageFileMeta[];
}

/** بایت یک فایل، برای پیش‌نمایش پنل یا `/media/…` سایت. */
export interface SiteImageFile {
  contentType: string;
  bytes: Buffer;
  sha256: string;
}

export interface SiteImageStore {
  /** بارگذاری تازه با کار کارگر و رویداد، در یک تراکنش. */
  upload(input: {
    kind: SiteImageKind;
    main: { name: string; bytes: Buffer };
    extra: { name: string; bytes: Buffer } | null;
    actor: SettingsActor;
    at: Date;
  }): Promise<SiteImageRow>;
  get(id: number): Promise<SiteImageRow | null>;
  /** تازه‌ترین بارگذاری‌های یک نوع، با فایل‌هایشان (بی بایت). */
  recent(kind: SiteImageKind, limit: number): Promise<SiteImageRow[]>;
  /** بایت یک فایل هر بارگذاری، برای پیش‌نمایش پنل. */
  file(id: number, name: string): Promise<SiteImageFile | null>;
  /** بایت فایلی با این sha256 از بارگذاری‌ای که روی سایت رفته (`/media/…` سایت)؛ null یعنی نیست یا هرگز روی سایت نرفت. */
  publishedFile(sha256: string): Promise<SiteImageFile | null>;
  /** فایل‌های بارگذاری‌ای از این نوع که روی سایت رفته، بی بایت؛ null یعنی نیست، نوعش دیگر است، یا هرگز روی سایت نرفت. */
  publishedFiles(id: number, kind: SiteImageKind): Promise<SiteImageFileMeta[] | null>;
  /**
   * تغییر لوگو یا بنر زیر قفل تنظیم‌ها: مقدار خام امروز و ردیف تصویری که مقدار تازه به آن اشاره می‌کند (`imageId`، قفل‌شده؛ null اگر نیست یا
   * مقدار تازه تصویر ندارد) به `decide` می‌روند. نوشتن مقدار، `published_at` همان ردیف (اگر خالی است) و رویداد `action` را با هم می‌نشاند.
   */
  change(input: {
    key: SiteImageSetting;
    action: string;
    imageId: number | null;
    decide: (current: unknown, image: SiteImageRow | null) => SettingDecision;
    at: Date;
    actor: SettingsActor;
  }): Promise<SettingChangeResult>;
}

export function createSiteImageStore({ db }: Database): SiteImageStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Reader = Tx | typeof db;

  const columns = {
    id: siteImages.id,
    kind: siteImages.kind,
    version: siteImages.version,
    mainName: siteImages.mainName,
    mainBytes: sql<number>`octet_length(${siteImages.main})`.mapWith(Number),
    extraName: siteImages.extraName,
    extraBytes: sql<number | null>`octet_length(${siteImages.extra})`.mapWith((value) => (value === null ? null : Number(value))),
    createdBy: siteImages.createdBy,
    createdByName: adminUsers.displayName,
    createdAt: siteImages.createdAt,
    builtAt: siteImages.builtAt,
    error: siteImages.error,
    publishedAt: siteImages.publishedAt,
  };

  const fileColumns = {
    imageId: siteImageFiles.imageId,
    name: siteImageFiles.name,
    contentType: siteImageFiles.contentType,
    width: siteImageFiles.width,
    height: siteImageFiles.height,
    sha256: siteImageFiles.sha256,
    hasAlpha: siteImageFiles.hasAlpha,
    sizeBytes: sql<number>`octet_length(${siteImageFiles.bytes})`.mapWith(Number),
  };

  const metaOf = ({ imageId: _imageId, ...file }: { imageId: number } & Omit<SiteImageFileMeta, 'name'> & { name: string }): SiteImageFileMeta => ({
    ...file,
    name: file.name as SiteImageFileName,
  });

  /** ردیف‌ها با فایل‌هایشان، به ترتیب پرسش. */
  async function rowsOf(reader: Reader, where: ReturnType<typeof eq> | undefined, options: { limit?: number; lock?: boolean } = {}) {
    let query = reader
      .select(columns)
      .from(siteImages)
      .innerJoin(adminUsers, eq(adminUsers.id, siteImages.createdBy))
      .where(where)
      .orderBy(desc(siteImages.createdAt), desc(siteImages.id))
      .$dynamic();
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.lock) query = query.for('update', { of: siteImages });
    const rows = await query;
    if (rows.length === 0) return [];
    const files = await reader
      .select(fileColumns)
      .from(siteImageFiles)
      .where(
        inArray(
          siteImageFiles.imageId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(siteImageFiles.name);
    return rows.map(
      (row): SiteImageRow => ({
        ...row,
        files: files.filter((file) => file.imageId === row.id).map(metaOf),
      }),
    );
  }

  const event = (actor: SettingsActor, action: string, targetType: string, targetId: string, at: Date, detail: Record<string, unknown>) =>
    adminEventRow({ adminUserId: actor.adminUserId, action, targetType, targetId, ipHash: actor.ipHash, detail, at });

  return {
    async upload(input) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${SITE_IMAGES_LOCK})`);
        const [last] = await tx
          .select({ version: sql<number>`coalesce(max(${siteImages.version}), 0)`.mapWith(Number) })
          .from(siteImages)
          .where(eq(siteImages.kind, input.kind));
        const [row] = await tx
          .insert(siteImages)
          .values({
            kind: input.kind,
            version: (last?.version ?? 0) + 1,
            main: input.main.bytes,
            mainName: input.main.name,
            extra: input.extra?.bytes ?? null,
            extraName: input.extra?.name ?? null,
            createdBy: input.actor.adminUserId,
            createdAt: input.at,
          })
          .returning({ id: siteImages.id, version: siteImages.version });
        await tx.insert(jobs).values({ kind: BUILD_SITE_IMAGE_JOB, siteImageId: row!.id, payload: {} });
        await tx.insert(adminEvents).values(
          event(input.actor, 'content.upload', SITE_IMAGE_TARGET, String(row!.id), input.at, {
            kind: input.kind,
            version: row!.version,
            files: input.extra ? 2 : 1,
            bytes: input.main.bytes.length + (input.extra?.bytes.length ?? 0),
          }),
        );
        const [created] = await rowsOf(tx, eq(siteImages.id, row!.id));
        return created!;
      });
    },

    async get(id) {
      const [row] = await rowsOf(db, eq(siteImages.id, id));
      return row ?? null;
    },

    async recent(kind, limit) {
      return rowsOf(db, eq(siteImages.kind, kind), { limit });
    },

    async file(id, name) {
      const [row] = await db
        .select({ contentType: siteImageFiles.contentType, bytes: siteImageFiles.bytes, sha256: siteImageFiles.sha256 })
        .from(siteImageFiles)
        .where(and(eq(siteImageFiles.imageId, id), eq(siteImageFiles.name, name)));
      return row ?? null;
    },

    async publishedFile(sha256) {
      const [row] = await db
        .select({ contentType: siteImageFiles.contentType, bytes: siteImageFiles.bytes, sha256: siteImageFiles.sha256 })
        .from(siteImageFiles)
        .innerJoin(siteImages, eq(siteImages.id, siteImageFiles.imageId))
        .where(and(eq(siteImageFiles.sha256, sha256), isNotNull(siteImages.publishedAt)))
        .limit(1);
      return row ?? null;
    },

    async publishedFiles(id, kind) {
      const [image] = await db
        .select({ id: siteImages.id })
        .from(siteImages)
        .where(and(eq(siteImages.id, id), eq(siteImages.kind, kind), isNotNull(siteImages.publishedAt)));
      if (!image) return null;
      const files = await db.select(fileColumns).from(siteImageFiles).where(eq(siteImageFiles.imageId, id)).orderBy(siteImageFiles.name);
      return files.map(metaOf);
    },

    async change(input) {
      return db.transaction(async (tx) => {
        // همان قفل ذخیره‌گاه تنظیم‌ها (`settings.ts`)، چون لوگو و بنر تنظیم‌اند؛ و قفل ردیف، برای هر نوشتنی بیرون از پنل.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK})`);
        const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, input.key)).for('update');
        const [image] = input.imageId === null ? [] : await rowsOf(tx, eq(siteImages.id, input.imageId), { lock: true });
        const decision = input.decide(row?.value, image ?? null);
        if (decision.kind === 'reject') {
          return { ok: false, reason: decision.reason, ...(decision.detail ? { detail: decision.detail } : {}) } as const;
        }
        if (decision.kind === 'same') return { ok: true, written: false } as const;
        await tx
          .insert(settings)
          .values({ key: input.key, value: decision.value, updatedAt: input.at })
          .onConflictDoUpdate({ target: settings.key, set: { value: decision.value, updatedAt: input.at } });
        if (image && image.publishedAt === null) {
          await tx.update(siteImages).set({ publishedAt: input.at }).where(eq(siteImages.id, image.id));
        }
        await tx.insert(adminEvents).values(event(input.actor, input.action, SETTING_TARGET, input.key, input.at, decision.detail));
        return { ok: true, written: true } as const;
      });
    },
  };
}
