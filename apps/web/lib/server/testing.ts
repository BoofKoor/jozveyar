/**
 * پیاده‌سازی حافظه‌ای `DocumentStore` — فقط برای تست.
 *
 * همان قراردادی که `createDocumentStore` روی پستگرس دارد؛ درستی آن یکی در
 * تست یکپارچگی `packages/db` سنجیده می‌شود.
 */

import type { DocumentRow, DocumentStore, NewUploadDocument, StoredAnalysis } from '@jozveyar/db';
import type { DocumentAnalysis } from '@jozveyar/contracts';

export function memoryStore(): DocumentStore & {
  rows: Map<string, DocumentRow>;
  settings: Map<string, unknown>;
  queued: Set<string>;
  browserAnalyses: Map<string, DocumentAnalysis>;
  serverAnalyses: Map<string, StoredAnalysis>;
} {
  const rows = new Map<string, DocumentRow>();
  const settings = new Map<string, unknown>();
  /** کار تحلیلی که در صف رفته — شبیه جدول `jobs`. */
  const queued = new Set<string>();
  const browserAnalyses = new Map<string, DocumentAnalysis>();
  /** تحلیل‌هایی که «کارگر» نوشته — تست مستقیم پرش می‌کند. */
  const serverAnalyses = new Map<string, StoredAnalysis>();
  return {
    rows,
    settings,
    queued,
    browserAnalyses,
    serverAnalyses,
    async insertUpload(doc: NewUploadDocument) {
      rows.set(doc.id, {
        ...doc,
        createdAt: new Date(),
        fileExpiresAt: null,
        fileDeletedAt: null,
        status: 'uploading',
        pageCount: null,
        failureReason: null,
        uploadedAt: null,
      });
    },
    async find(id) {
      return rows.get(id) ?? null;
    },
    async markUploaded(id, at, fileExpiresAt, queueAnalysis) {
      Object.assign(rows.get(id)!, { status: 'uploaded', uploadedAt: at, fileExpiresAt });
      if (queueAnalysis) queued.add(id);
    },
    async markFailed(id, reason, fileDeletedAt) {
      Object.assign(rows.get(id)!, { status: 'failed', failureReason: reason, fileDeletedAt: fileDeletedAt ?? null });
    },
    async countOpenUploads(session) {
      return [...rows.values()].filter((r) => r.sessionHash === session && r.status === 'uploading').length;
    },
    async committedBytes() {
      return [...rows.values()]
        .filter((r) => r.status === 'uploading' || r.status === 'uploaded')
        .reduce((sum, r) => sum + r.sizeBytes, 0);
    },
    async setting(key) {
      return settings.get(key);
    },
    async saveBrowserAnalysis(documentId, analysis) {
      if (browserAnalyses.has(documentId)) return false;
      browserAnalyses.set(documentId, analysis);
      return true;
    },
    async serverAnalysis(documentId) {
      return serverAnalyses.get(documentId) ?? null;
    },
  };
}
