/**
 * سرویس آپلود — مستقیم از مرورگر به استوریج (ADR-024).
 *
 * بایت‌های فایل هیچ‌وقت از اینجا رد نمی‌شوند. این سرویس فقط سه کار دارد:
 * اجازه می‌دهد (URL امضاشده)، می‌سنجد (تکه‌ها واقعاً رسیده‌اند؟ اندازه‌شان
 * درست است؟) و ثبت می‌کند. سرور منبع حقیقت است: موقع تکمیل خودش از استوریج
 * می‌پرسد چه رسیده و به هیچ عددی از کلاینت اعتماد نمی‌کند.
 *
 * هر وابستگی بیرونی از درگاه می‌آید (`DocumentStore`، `StorageDriver`)، پس کل
 * منطق با پیاده‌سازی حافظه‌ای تست می‌شود.
 */

import { randomUUID } from 'node:crypto';

import { ANALYZE_DOCUMENT_JOB, CONVERT_DOCUMENT_JOB, type DocumentRow, type DocumentStore } from '@jozveyar/db';
import {
  DEFAULT_PART_SIZE_BYTES,
  partSize,
  planParts,
  StorageError,
  verifyParts,
  type PartPlan,
  type StorageDriver,
} from '@jozveyar/storage';
import { tidyFa } from '@jozveyar/text';
import { isSlidePage, paperSizeName } from '@jozveyar/analysis';
import { documentAnalysisSchema } from '@jozveyar/contracts';

/** پیشوندی که قاعدهٔ نگهداری باکت رویش است. سفارش پرداخت‌شده باید از اینجا بیرون برود (برش ۳). */
export const UPLOAD_PREFIX = 'uploads/';

/** هر URL تکه یک ساعت اعتبار دارد؛ آپلود کند، URL تازه را دسته‌ای می‌گیرد. */
export const PART_URL_TTL_SECONDS = 3600;
export const MAX_PARTS_PER_REQUEST = 50;
/** آپلود نیمه‌کاره بعد از یک روز در استوریج لغو می‌شود؛ شمارش‌ها هم همین پنجره را دارند. */
export const OPEN_UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_OPEN_UPLOADS_PER_SESSION = 5;
/** سقف صفحات تحلیل مرورگر که پذیرفته می‌شود — همان سقف صفحهٔ فایل. */
export const MAX_BROWSER_ANALYSIS_PAGES = 1500;

/** پیش‌فرض‌های `settings` — همان اعدادی که ARCHITECTURE فهرست کرده. */
export const DEFAULT_MAX_BYTES = 1_610_612_736;
export const DEFAULT_RETENTION_DAYS = 2;

type SourceKind = DocumentRow['sourceKind'];

const KINDS: Record<string, { kind: SourceKind; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  docx: {
    kind: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  doc: { kind: 'doc', mime: 'application/msword' },
  pptx: {
    kind: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  ppt: { kind: 'ppt', mime: 'application/vnd.ms-powerpoint' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  webp: { kind: 'image', mime: 'image/webp' },
  heic: { kind: 'image', mime: 'image/heic' },
};

export type UploadErrorCode =
  | 'invalid_request'
  | 'unsupported_type'
  | 'too_large'
  | 'too_many_uploads'
  | 'storage_full'
  | 'storage_unavailable'
  | 'not_found'
  | 'not_uploading'
  | 'incomplete'
  | 'size_mismatch';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: UploadErrorCode; missing?: number[] };

const fail = (status: number, error: UploadErrorCode, missing?: number[]): Result<never> => ({
  ok: false,
  status,
  error,
  ...(missing ? { missing } : {}),
});
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * تحلیل سمت سرور، به شکلی که مرورگر برای هم‌تراز کردن قیمت لازم دارد.
 *
 * سرور منبع حقیقت است: وقتی `state` برابر `ready` شد، مرورگر تعداد صفحه و
 * صفحات رنگی را از اینجا می‌گیرد و قیمت را با همان `quote()` دوباره حساب می‌کند.
 */
export interface ServerAnalysisView {
  /** `converting`: Word، پاورپوینت یا عکس در حال تبدیل به PDF (ADR-028). */
  state: 'pending' | 'converting' | 'running' | 'ready' | 'failed';
  /** کد شکست؛ همان کدهایی که مرورگر برایشان پیام فارسی دارد. */
  failureReason?: string;
  pageCount?: number;
  colorPageCount?: number;
  blankPageCount?: number;
  lowDpiPageCount?: number;
  tightMarginPageCount?: number;
  pageSizes?: { name: string; count: number }[];
  colorPages?: number[];
  /** شمارهٔ صفحه‌های هر هشدار، از ۱ — هشدار جای مشکل را نشان می‌دهد (ADR-029). */
  blankPages?: number[];
  lowDpiPages?: number[];
  /** برای اسلاید خالی: اسلاید تقریباً همیشه تا لبه طرح دارد (ADR-029). */
  tightMarginPages?: number[];
  /**
   * فونت‌هایی که روی سرور نبودند و جایگزینشان اندازهٔ دیگری دارد: ظاهر و تعداد صفحه
   * ممکن است با فایل خود کاربر فرق کند (ADR-029).
   */
  mismatchedFonts?: string[];
}

/** شکل ستون `documents.conversion` که این لایه لازم دارد (کارگر می‌نویسدش، ADR-028). */
interface ConversionRecord {
  format?: string;
  fonts?: { mismatched?: unknown };
}

/** اسلاید: فایلی که کارگر پاورپوینت (یا ارائهٔ ODF) تشخیص داد، یا پسوندش این را گفت. */
const PRESENTATION_FORMATS = new Set(['pptx', 'ppt', 'odp']);

/** همان سقف کارگر برای فونت‌های خواسته‌شده (`formats.requested_fonts`). */
const MAX_FONTS = 50;

/** نام فونت از داخل فایل کاربر می‌آید: فقط رشته، کوتاه، و نه بی‌شمار. */
function mismatchedFontsOf(conversion: ConversionRecord | null): string[] {
  const names = conversion?.fonts?.mismatched;
  if (!Array.isArray(names)) return [];
  return names
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    .slice(0, MAX_FONTS)
    .map((name) => name.trim().slice(0, 60));
}

export interface UploadStatus {
  documentId: string;
  status: 'uploading' | 'uploaded' | 'failed';
  partSizeBytes: number;
  partCount: number;
  /** تکه‌هایی که با اندازهٔ درست رسیده‌اند؛ بقیه باید فرستاده شوند. */
  receivedParts: number[];
  /** فقط بعد از رسیدن فایل. Word و پاورپوینت و عکس اول تبدیل می‌شوند (`converting`). */
  analysis?: ServerAnalysisView;
}

export interface UploadServiceDeps {
  store: DocumentStore;
  storage: StorageDriver;
  /** سقف کل حجم روی دیسک (`STORAGE_BUDGET_BYTES`). */
  budgetBytes: number;
  /** مبدأ سایت برای CORS — لازم فقط وقتی استوریج روی دامنهٔ دیگری است. */
  siteOrigin?: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

export function createUploadService(deps: UploadServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));

  async function numberSetting(key: string, fallback: number): Promise<number> {
    const value = await deps.store.setting(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  /**
   * قاعدهٔ نگهداری و CORS روی باکت — یک بار در هر فرایند.
   *
   * این لایهٔ دوم محافظ دیسک است: حتی اگر هیچ کد پاک‌سازی از ما اجرا نشود،
   * استوریج خودش فایل منقضی و آپلود نیمه‌کاره را پاک می‌کند. شکستش جلوی
   * آپلود را نمی‌گیرد (بودجه هنوز محافظ است)، ولی بلند لاگ می‌شود و ده دقیقه
   * بعد دوباره امتحان می‌شود.
   */
  let bucketReady: Promise<void> | null = null;
  let bucketFailedAt = 0;
  function ensureBucketPolicy(): Promise<void> {
    if (bucketReady && !(bucketFailedAt && now().getTime() - bucketFailedAt > 600_000)) {
      return bucketReady;
    }
    bucketFailedAt = 0;
    bucketReady = (async () => {
      try {
        const retentionDays = await numberSetting('file.retention_days', DEFAULT_RETENTION_DAYS);
        await deps.storage.putLifecycleRules([
          {
            id: 'uploads-retention',
            prefix: UPLOAD_PREFIX,
            expireDays: Math.ceil(retentionDays),
            abortIncompleteDays: 1,
          },
        ]);
        if (deps.siteOrigin) await deps.storage.putUploadCors([deps.siteOrigin]);
      } catch (error) {
        bucketFailedAt = now().getTime();
        log('✗ قاعدهٔ نگهداری باکت ثبت نشد — فایل‌ها خودکار پاک نمی‌شوند:', error);
      }
    })();
    return bucketReady;
  }

  async function analysisView(doc: DocumentRow): Promise<ServerAnalysisView> {
    if (doc.status === 'uploaded') return { state: 'pending' };
    if (doc.status === 'converting') return { state: 'converting' };
    if (doc.status === 'analyzing') return { state: 'running' };
    if (doc.status === 'failed') return { state: 'failed', failureReason: doc.failureReason ?? 'unknown' };

    const stored = await deps.store.serverAnalysis(doc.id);
    if (!stored) return { state: 'running' };
    const conversion = (doc.conversion ?? null) as ConversionRecord | null;
    // حاشیهٔ اسلاید حساب و ذخیره می‌شود، ولی هشدار نمی‌شود: چه فایل پاورپوینت بوده
    // باشد، چه PDF‌ای که صفحه‌هایش شکل اسلاید دارند (ADR-029).
    const deck = PRESENTATION_FORMATS.has(conversion?.format ?? doc.sourceKind);
    const sizes = new Map<string, number>();
    const colorPages: number[] = [];
    const blankPages: number[] = [];
    const lowDpiPages: number[] = [];
    const tightMarginPages: number[] = [];
    stored.pages.forEach((page, i) => {
      const name = paperSizeName(page.widthPt, page.heightPt);
      sizes.set(name, (sizes.get(name) ?? 0) + 1);
      if (page.color) colorPages.push(i + 1);
      if (page.blank) blankPages.push(i + 1);
      if (page.warnings.includes('low_dpi')) lowDpiPages.push(i + 1);
      if (
        page.warnings.includes('tight_margin') &&
        !deck &&
        !isSlidePage(page.widthPt, page.heightPt)
      ) {
        tightMarginPages.push(i + 1);
      }
    });
    return {
      state: 'ready',
      pageCount: stored.pageCount,
      colorPageCount: colorPages.length,
      blankPageCount: blankPages.length,
      lowDpiPageCount: lowDpiPages.length,
      tightMarginPageCount: tightMarginPages.length,
      pageSizes: [...sizes.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      colorPages,
      blankPages,
      lowDpiPages,
      tightMarginPages,
      mismatchedFonts: mismatchedFontsOf(conversion),
    };
  }

  function planOf(doc: DocumentRow): PartPlan {
    return planParts(doc.sizeBytes, doc.partSizeBytes ?? DEFAULT_PART_SIZE_BYTES);
  }

  /** سند متعلق به همین نشست؛ سند دیگران «نیست»، نه «ممنوع» — وجودش لو نمی‌رود. */
  async function owned(sessionHash: string, id: string): Promise<DocumentRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const doc = await deps.store.find(id);
    return doc && doc.sessionHash === sessionHash ? doc : null;
  }

  /** خطای استوریج به پاسخ؛ «در دسترس نیست» یعنی مرورگر بی‌صدا ادامه می‌دهد. */
  function storageFailure(error: unknown): Result<never> {
    log('✗ خطای استوریج:', error);
    return fail(503, 'storage_unavailable');
  }

  return {
    async create(
      sessionHash: string,
      input: { name: string; sizeBytes: number; mimeType?: string },
    ): Promise<Result<UploadStatus>> {
      const name = tidyFa(String(input.name ?? '')).slice(0, 200);
      const size = input.sizeBytes;
      if (!name || !Number.isSafeInteger(size) || size <= 0) return fail(400, 'invalid_request');

      const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
      const type = KINDS[ext];
      if (!type) return fail(415, 'unsupported_type');

      const maxBytes = await numberSetting('file.max_bytes', DEFAULT_MAX_BYTES);
      if (size > maxBytes) return fail(413, 'too_large');

      const at = now();
      const openSince = new Date(at.getTime() - OPEN_UPLOAD_WINDOW_MS);
      if ((await deps.store.countOpenUploads(sessionHash, openSince)) >= MAX_OPEN_UPLOADS_PER_SESSION) {
        return fail(429, 'too_many_uploads');
      }
      // لایهٔ اول محافظ دیسک: استوریج روی همان دیسک پستگرس است و دیسک پر یعنی
      // کل سایت پایین. بهتر است آپلود تازه رد شود — مرورگر قیمت را از تحلیل
      // خودش نشان می‌دهد — تا اینکه پایگاه داده بیفتد.
      if ((await deps.store.committedBytes(at, openSince)) + size > deps.budgetBytes) {
        log(`✗ بودجهٔ دیسک استوریج پر است (${deps.budgetBytes} بایت) — آپلود تازه رد شد.`);
        return fail(503, 'storage_full');
      }

      await ensureBucketPolicy();

      const id = randomUUID();
      const storageKey = `${UPLOAD_PREFIX}${id}.${ext}`;
      const plan = planParts(size);
      const mimeType =
        input.mimeType && /^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType) ? input.mimeType : type.mime;

      let uploadId: string;
      try {
        uploadId = await deps.storage.createMultipartUpload(storageKey, { contentType: mimeType });
      } catch (error) {
        return storageFailure(error);
      }

      try {
        await deps.store.insertUpload({
          id,
          sessionHash,
          originalName: name,
          sourceKind: type.kind,
          mimeType,
          sizeBytes: size,
          storageKey,
          uploadId,
          partSizeBytes: plan.partSizeBytes,
        });
      } catch (error) {
        // آپلودی که سندی ندارد، یتیم است؛ همین حالا آزادش کن.
        await deps.storage.abortMultipartUpload(storageKey, uploadId).catch(() => undefined);
        throw error;
      }

      return ok({
        documentId: id,
        status: 'uploading',
        partSizeBytes: plan.partSizeBytes,
        partCount: plan.partCount,
        receivedParts: [],
      });
    },

    async presignParts(
      sessionHash: string,
      id: string,
      partNumbers: unknown,
    ): Promise<Result<{ urls: { partNumber: number; url: string }[]; expiresInSeconds: number }>> {
      const doc = await owned(sessionHash, id);
      if (!doc) return fail(404, 'not_found');
      if (doc.status !== 'uploading' || !doc.uploadId || !doc.storageKey) {
        return fail(409, 'not_uploading');
      }

      const plan = planOf(doc);
      if (
        !Array.isArray(partNumbers) ||
        partNumbers.length === 0 ||
        partNumbers.length > MAX_PARTS_PER_REQUEST ||
        !partNumbers.every((n) => Number.isInteger(n) && n >= 1 && n <= plan.partCount)
      ) {
        return fail(400, 'invalid_request');
      }

      const urls = await Promise.all(
        [...new Set(partNumbers as number[])].map(async (n) => ({
          partNumber: n,
          url: await deps.storage.presignUploadPart(
            doc.storageKey!,
            doc.uploadId!,
            n,
            partSize(plan, n),
            PART_URL_TTL_SECONDS,
          ),
        })),
      );
      return ok({ urls, expiresInSeconds: PART_URL_TTL_SECONDS });
    },

    async status(sessionHash: string, id: string): Promise<Result<UploadStatus>> {
      const doc = await owned(sessionHash, id);
      if (!doc) return fail(404, 'not_found');
      const plan = planOf(doc);
      const base = { documentId: doc.id, partSizeBytes: plan.partSizeBytes, partCount: plan.partCount };

      if (doc.status !== 'uploading') {
        // فایلی که رسیده و بعد تحلیلش شکست خورده، هنوز «رسیده» است؛ شکست مال تحلیل است.
        const arrived = doc.uploadedAt !== null && doc.fileDeletedAt === null;
        return ok({
          ...base,
          status: arrived ? 'uploaded' : 'failed',
          receivedParts: arrived ? Array.from({ length: plan.partCount }, (_, i) => i + 1) : [],
          ...(arrived ? { analysis: await analysisView(doc) } : {}),
        });
      }

      try {
        const listed = await deps.storage.listUploadedParts(doc.storageKey!, doc.uploadId!);
        return ok({ ...base, status: 'uploading', receivedParts: verifyParts(plan, listed).received });
      } catch (error) {
        if (error instanceof StorageError && error.code === 'no_such_upload') {
          // استوریج آپلود کهنه را لغو کرده؛ کلاینت از نو شروع می‌کند.
          await deps.store.markFailed(doc.id, 'upload_expired');
          return ok({ ...base, status: 'failed', receivedParts: [] });
        }
        return storageFailure(error);
      }
    },

    async complete(sessionHash: string, id: string): Promise<Result<UploadStatus>> {
      const doc = await owned(sessionHash, id);
      if (!doc) return fail(404, 'not_found');
      const plan = planOf(doc);
      const done = (): Result<UploadStatus> =>
        ok({
          documentId: doc.id,
          status: 'uploaded',
          partSizeBytes: plan.partSizeBytes,
          partCount: plan.partCount,
          receivedParts: Array.from({ length: plan.partCount }, (_, i) => i + 1),
        });

      // تکرارپذیر: کلاینتی که جواب اول را گم کرده، دوباره می‌پرسد.
      if (doc.status === 'uploaded' || doc.status === 'analyzing' || doc.status === 'ready') {
        return done();
      }
      if (doc.status !== 'uploading') return fail(409, 'not_uploading');

      const key = doc.storageKey!;
      const at = now();
      const retentionDays = await numberSetting('file.retention_days', DEFAULT_RETENTION_DAYS);
      // همان لحظه در صف کارگر، در همان تراکنش: PDF مستقیم تحلیل (ADR-025)، بقیه
      // اول تبدیل و بعد همان تحلیل (ADR-028). نوع از پسوند است؛ کارگر محتوا را
      // می‌سنجد و اگر مثلاً «docx» در واقع PDF باشد، همان را تحلیل می‌کند.
      const markUploaded = () =>
        deps.store.markUploaded(
          doc.id,
          at,
          new Date(at.getTime() + retentionDays * 86_400_000),
          doc.sourceKind === 'pdf' ? ANALYZE_DOCUMENT_JOB : CONVERT_DOCUMENT_JOB,
        );

      try {
        // منبع حقیقت: آنچه استوریج می‌گوید رسیده، نه آنچه کلاینت می‌گوید فرستاده.
        const listed = await deps.storage.listUploadedParts(key, doc.uploadId!);
        const verdict = verifyParts(plan, listed);
        if (!verdict.complete) return fail(409, 'incomplete', verdict.missing);

        const wanted = new Set(verdict.received);
        await deps.storage.completeMultipartUpload(
          key,
          doc.uploadId!,
          listed.filter((p) => wanted.has(p.partNumber)),
        );
      } catch (error) {
        if (error instanceof StorageError && error.code === 'no_such_upload') {
          // یا درخواست موازی همین الان بستش، یا کهنه شده بود. فایل خودش جواب است.
          const object = await deps.storage.headObject(key).catch(() => null);
          if (object?.sizeBytes === doc.sizeBytes) {
            await markUploaded();
            return done();
          }
          await deps.store.markFailed(doc.id, 'upload_expired');
          return fail(409, 'not_uploading');
        }
        return storageFailure(error);
      }

      // بعد از بستن، حجم کل یک بار دیگر: اگر نخواند، فایل را نگه نمی‌داریم.
      const object = await deps.storage.headObject(key).catch(() => null);
      if (object?.sizeBytes !== doc.sizeBytes) {
        log(`✗ حجم فایل نمی‌خواند: سند ${doc.id}، انتظار ${doc.sizeBytes}، استوریج ${object?.sizeBytes}`);
        await deps.storage.deleteObject(key).catch(() => undefined);
        await deps.store.markFailed(doc.id, 'size_mismatch', at);
        return fail(409, 'size_mismatch');
      }

      await markUploaded();
      return done();
    },

    /**
     * تحلیل مرورگر، برای سنجیدن اختلاف با سرور (ADR-002). بار اول ذخیره می‌شود؛
     * قیمت هیچ‌وقت از آن نمی‌آید.
     */
    async saveBrowserAnalysis(
      sessionHash: string,
      id: string,
      body: unknown,
    ): Promise<Result<{ saved: boolean }>> {
      const doc = await owned(sessionHash, id);
      if (!doc) return fail(404, 'not_found');
      const parsed = documentAnalysisSchema.safeParse(body);
      if (!parsed.success || parsed.data.pages.length > MAX_BROWSER_ANALYSIS_PAGES) {
        return fail(400, 'invalid_request');
      }
      return ok({ saved: await deps.store.saveBrowserAnalysis(doc.id, parsed.data) });
    },

    /** کاربر فایل دیگری انداخت: دیسک همین حالا آزاد می‌شود، نه دو روز بعد. */
    async abort(sessionHash: string, id: string): Promise<Result<{ aborted: true }>> {
      const doc = await owned(sessionHash, id);
      if (!doc) return fail(404, 'not_found');
      if (doc.status === 'failed') return ok({ aborted: true });
      try {
        if (doc.status === 'uploading') {
          await deps.storage.abortMultipartUpload(doc.storageKey!, doc.uploadId!);
          await deps.store.markFailed(doc.id, 'aborted');
        } else {
          await deps.storage.deleteObject(doc.storageKey!);
          // PDF تبدیل‌شدهٔ Word و عکس هم؛ وگرنه تا روزهای نگهداری دیسک را نگه می‌دارد.
          if (doc.pdfStorageKey && doc.pdfStorageKey !== doc.storageKey) {
            await deps.storage.deleteObject(doc.pdfStorageKey);
          }
          await deps.store.markFailed(doc.id, 'discarded', now());
        }
      } catch (error) {
        return storageFailure(error);
      }
      return ok({ aborted: true });
    },
  };
}

export type UploadService = ReturnType<typeof createUploadService>;
