/**
 * سند و آپلودش در پایگاه داده.
 *
 * فقط کوئری است، بدون منطق. تصمیم‌ها («این تکه‌ها کافی‌اند؟»، «بودجه پر است؟»)
 * در سرویس آپلود گرفته می‌شوند و این لایه فقط ذخیره و خواندن می‌کند — تا
 * سرویس با یک پیاده‌سازی حافظه‌ای هم تست‌پذیر باشد.
 */

import { and, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from './index.js';
import { documents, settings } from './schema.js';

export type DocumentRow = typeof documents.$inferSelect;

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
  markUploaded(id: string, at: Date, fileExpiresAt: Date): Promise<void>;
  markFailed(id: string, reason: string, fileDeletedAt?: Date): Promise<void>;
  /** آپلودهای باز این نشست که از `since` جوان‌ترند. */
  countOpenUploads(sessionHash: string, since: Date): Promise<number>;
  /**
   * حجمی که الان روی دیسک است یا در راه است: آپلودهای باز جوان‌تر از
   * `openSince` + فایل‌های رسیده‌ای که هنوز منقضی یا پاک نشده‌اند.
   */
  committedBytes(now: Date, openSince: Date): Promise<number>;
  /** مقدار یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
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

    async markUploaded(id, at, fileExpiresAt) {
      await db
        .update(documents)
        .set({ status: 'uploaded', uploadedAt: at, fileExpiresAt })
        .where(eq(documents.id, id));
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
        inArray(documents.status, ['uploaded', 'analyzing', 'ready']),
        isNull(documents.fileDeletedAt),
        or(isNull(documents.fileExpiresAt), gt(documents.fileExpiresAt, now)),
      )!;
      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${documents.sizeBytes}), 0)` })
        .from(documents)
        .where(or(open, stored));
      // sum روی bigint در پستگرس numeric برمی‌گرداند و درایور رشته می‌دهد.
      return Number(row?.total ?? 0);
    },

    async setting(key) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },
  };
}
