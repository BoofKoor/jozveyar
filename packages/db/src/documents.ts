/**
 * سند و آپلودش در پایگاه داده.
 *
 * فقط کوئری است، بدون منطق. تصمیم‌ها («این تکه‌ها کافی‌اند؟»، «بودجه پر است؟»)
 * در سرویس آپلود گرفته می‌شوند و این لایه فقط ذخیره و خواندن می‌کند — تا
 * سرویس با یک پیاده‌سازی حافظه‌ای هم تست‌پذیر باشد.
 */

import { and, desc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { DocumentAnalysis } from '@jozveyar/contracts';

import type { Database } from './index.js';
import { documentAnalyses, documentPages, documents, jobs, orderItemSections, settings } from './schema.js';

export type DocumentRow = typeof documents.$inferSelect;

/** نوع کاری که کارگر اسناد برای تحلیل برمی‌دارد. همین رشته در services/docworker است. */
export const ANALYZE_DOCUMENT_JOB = 'analyze_document';
/**
 * تبدیل Word، پاورپوینت یا عکس به PDF (ADR-028). کارگر بعد از تبدیل، کار
 * تحلیل همان سند را خودش در صف می‌گذارد — در همان تراکنشی که PDF را ثبت می‌کند.
 */
export const CONVERT_DOCUMENT_JOB = 'convert_document';
export type DocumentJob = typeof ANALYZE_DOCUMENT_JOB | typeof CONVERT_DOCUMENT_JOB;

/** یک صفحه از تحلیل ذخیره‌شده — فقط آنچه برای نمایش و قیمت لازم است. */
export interface StoredPage {
  widthPt: number;
  heightPt: number;
  color: boolean;
  blank: boolean;
  warnings: string[];
}

export interface StoredAnalysis {
  engine: string;
  pageCount: number;
  elapsedMs: number;
  pages: StoredPage[];
}

export interface NewUploadDocument {
  id: string;
  sessionHash: string;
  originalName: string;
  sourceKind: DocumentRow['sourceKind'];
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadId: string;
  partSizeBytes: number;
}

/** درگاه سرویس آپلود به پایگاه داده. */
export interface DocumentStore {
  insertUpload(doc: NewUploadDocument): Promise<void>;
  find(id: string): Promise<DocumentRow | null>;
  /**
   * آپلود تمام شد. کار بعدی (`job`: تحلیل برای PDF، تبدیل برای بقیه) **در همان
   * تراکنش** در صف می‌رود: یا هر دو ثبت می‌شوند یا هیچ‌کدام — سندی نمی‌ماند که
   * رسیده ولی هیچ‌وقت بررسی نشود.
   */
  markUploaded(id: string, at: Date, fileExpiresAt: Date, job: DocumentJob | null): Promise<void>;
  markFailed(id: string, reason: string, fileDeletedAt?: Date): Promise<void>;
  /** آپلودهای باز این نشست که از `since` جوان‌ترند. */
  countOpenUploads(sessionHash: string, since: Date): Promise<number>;
  /**
   * حجمی که الان روی دیسک است یا در راه است: آپلودهای باز جوان‌تر از
   * `openSince` + فایل‌های رسیده‌ای که هنوز منقضی یا پاک نشده‌اند — با PDF
   * تبدیل‌شده‌شان، که گاهی از خود Word بزرگ‌تر است.
   */
  committedBytes(now: Date, openSince: Date): Promise<number>;
  /** مقدار یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
  /**
   * تحلیل مرورگر را کنار تحلیل سرور ذخیره می‌کند — فقط بار اول. سرور منبع
   * حقیقت است؛ این ردیف برای سنجیدن اختلاف دو طرف است (ADR-002).
   */
  saveBrowserAnalysis(documentId: string, analysis: DocumentAnalysis): Promise<boolean>;
  /** آخرین تحلیل سرور، یا null اگر هنوز نیست. */
  serverAnalysis(documentId: string): Promise<StoredAnalysis | null>;
  /**
   * سند در سفارشی هست (برش ۳ب)؟ فایلش را «انصراف» پاک نمی‌کند: کار `prepare_order` بعد از پرداخت از
   * همین فایل PDF جزوه را می‌سازد.
   */
  inOrder(documentId: string): Promise<boolean>;
}

export function createDocumentStore({ db }: Database): DocumentStore {
  return {
    async insertUpload(doc) {
      await db.insert(documents).values({ ...doc, status: 'uploading' });
    },

    async find(id) {
      const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      return row ?? null;
    },

    async markUploaded(id, at, fileExpiresAt, job) {
      await db.transaction(async (tx) => {
        await tx
          .update(documents)
          .set({ status: 'uploaded', uploadedAt: at, fileExpiresAt })
          .where(eq(documents.id, id));
        if (job) {
          await tx.insert(jobs).values({ kind: job, documentId: id }).onConflictDoNothing();
        }
      });
    },

    async markFailed(id, reason, fileDeletedAt) {
      await db
        .update(documents)
        .set({ status: 'failed', failureReason: reason, ...(fileDeletedAt ? { fileDeletedAt } : {}) })
        .where(eq(documents.id, id));
    },

    async countOpenUploads(sessionHash, since) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            eq(documents.sessionHash, sessionHash),
            eq(documents.status, 'uploading'),
            gt(documents.createdAt, since),
          ),
        );
      return row?.n ?? 0;
    },

    async committedBytes(now, openSince) {
      const open: SQL = and(eq(documents.status, 'uploading'), gt(documents.createdAt, openSince))!;
      const stored: SQL = and(
        inArray(documents.status, ['uploaded', 'converting', 'analyzing', 'ready']),
        isNull(documents.fileDeletedAt),
        or(isNull(documents.fileExpiresAt), gt(documents.fileExpiresAt, now)),
      )!;
      const [row] = await db
        .select({
          total: sql<string>`coalesce(sum(${documents.sizeBytes} + coalesce(${documents.pdfSizeBytes}, 0)), 0)`,
        })
        .from(documents)
        .where(or(open, stored));
      // sum روی bigint در پستگرس numeric برمی‌گرداند و درایور رشته می‌دهد.
      return Number(row?.total ?? 0);
    },

    async setting(key) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },

    async saveBrowserAnalysis(documentId, analysis) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: documentAnalyses.id })
          .from(documentAnalyses)
          .where(and(eq(documentAnalyses.documentId, documentId), eq(documentAnalyses.source, 'browser')))
          .limit(1);
        if (existing) return false;

        const [row] = await tx
          .insert(documentAnalyses)
          .values({
            documentId,
            source: 'browser',
            engine: analysis.engine,
            thresholds: analysis.thresholds,
            pageCount: analysis.pageCount,
            sampled: analysis.sampled,
            sampleStride: analysis.sampleStride,
            elapsedMs: Math.round(analysis.elapsedMs),
          })
          .returning({ id: documentAnalyses.id });

        if (analysis.pages.length > 0) {
          await tx.insert(documentPages).values(
            analysis.pages.map((p) => ({
              analysisId: row!.id,
              n: p.n,
              widthPt: p.widthPt,
              heightPt: p.heightPt,
              rotation: p.rotation,
              color: p.color,
              blank: p.blank,
              colorRatio: p.colorRatio,
              coloredInkRatio: p.coloredInkRatio,
              chromaP95: p.chromaP95,
              inkRatio: p.inkRatio,
              paperCast: p.paperCast,
              estimatedDpi: p.estimatedDpi,
              minMarginMm: p.minMarginMm,
              warnings: p.warnings,
            })),
          );
        }
        return true;
      });
    },

    async serverAnalysis(documentId) {
      const [head] = await db
        .select()
        .from(documentAnalyses)
        .where(and(eq(documentAnalyses.documentId, documentId), eq(documentAnalyses.source, 'server')))
        .orderBy(desc(documentAnalyses.createdAt))
        .limit(1);
      if (!head) return null;
      const pages = await db
        .select({
          widthPt: documentPages.widthPt,
          heightPt: documentPages.heightPt,
          color: documentPages.color,
          blank: documentPages.blank,
          warnings: documentPages.warnings,
        })
        .from(documentPages)
        .where(eq(documentPages.analysisId, head.id))
        .orderBy(documentPages.n);
      return { engine: head.engine, pageCount: head.pageCount, elapsedMs: head.elapsedMs, pages };
    },

    async inOrder(documentId) {
      const [row] = await db
        .select({ one: sql<number>`1` })
        .from(orderItemSections)
        .where(eq(orderItemSections.documentId, documentId))
        .limit(1);
      return row !== undefined;
    },
  };
}
