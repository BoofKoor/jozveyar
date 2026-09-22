/**
 * پیاده‌سازی حافظه‌ای `DocumentStore` — فقط برای تست.
 *
 * همان قراردادی که `createDocumentStore` روی پستگرس دارد؛ درستی آن یکی در
 * تست یکپارچگی `packages/db` سنجیده می‌شود.
 */

import type { DocumentRow, DocumentStore, NewUploadDocument } from '@jozveyar/db';

export function memoryStore(): DocumentStore & { rows: Map<string, DocumentRow>; settings: Map<string, unknown> } {
  const rows = new Map<string, DocumentRow>();
  const settings = new Map<string, unknown>();
  return {
    rows,
    settings,
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
    async markUploaded(id, at, fileExpiresAt) {
      Object.assign(rows.get(id)!, { status: 'uploaded', uploadedAt: at, fileExpiresAt });
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
  };
}
