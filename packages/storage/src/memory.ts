/**
 * `StorageDriver` در حافظه — برای تست منطق آپلود بدون استوریج واقعی.
 *
 * رفتارهایی که منطق دامنه رویشان تکیه دارد عیناً شبیه S3 است: آپلود ناموجود
 * `no_such_upload` می‌دهد، تکمیل فقط تکه‌های رسیده را می‌پذیرد، و لغو تکرارپذیر
 * است. «PUT مرورگر» با `receivePart` شبیه‌سازی می‌شود.
 */

import { randomUUID } from 'node:crypto';

import {
  StorageError,
  type LifecycleRule,
  type ObjectInfo,
  type StorageDriver,
  type UploadedPart,
} from './driver.js';

interface Upload {
  key: string;
  contentType: string;
  parts: Map<number, number>;
}

export class MemoryDriver implements StorageDriver {
  readonly uploads = new Map<string, Upload>();
  readonly objects = new Map<string, ObjectInfo & { contentType: string }>();
  lifecycle: LifecycleRule[] = [];
  corsOrigins: string[] = [];

  async createMultipartUpload(key: string, { contentType }: { contentType: string }) {
    const id = randomUUID();
    this.uploads.set(id, { key, contentType, parts: new Map() });
    return id;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    sizeBytes: number,
    expiresInSeconds: number,
  ) {
    return `memory://${key}?uploadId=${uploadId}&partNumber=${partNumber}&size=${sizeBytes}&expires=${expiresInSeconds}`;
  }

  /** همان کاری که PUT مرورگر روی URL امضاشده می‌کند. */
  receivePart(uploadId: string, partNumber: number, sizeBytes: number) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new StorageError('no_such_upload', 'آپلود نیست', 'NoSuchUpload', 404);
    upload.parts.set(partNumber, sizeBytes);
  }

  private upload(key: string, uploadId: string): Upload {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) {
      throw new StorageError('no_such_upload', 'آپلود نیست', 'NoSuchUpload', 404);
    }
    return upload;
  }

  async listUploadedParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    return [...this.upload(key, uploadId).parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, sizeBytes]) => ({ partNumber, sizeBytes, etag: `"etag-${partNumber}"` }));
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]) {
    const upload = this.upload(key, uploadId);
    let total = 0;
    for (const part of parts) {
      const size = upload.parts.get(part.partNumber);
      if (size === undefined) throw new StorageError('invalid_part', 'تکه نرسیده', 'InvalidPart', 400);
      total += size;
    }
    this.uploads.delete(uploadId);
    this.objects.set(key, { sizeBytes: total, etag: `"${uploadId}"`, contentType: upload.contentType });
  }

  async abortMultipartUpload(_key: string, uploadId: string) {
    this.uploads.delete(uploadId);
  }

  async headObject(key: string) {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.sizeBytes, etag: object.etag } : null;
  }

  async deleteObject(key: string) {
    this.objects.delete(key);
  }

  async presignGetObject(key: string, expiresInSeconds: number) {
    return `memory://${key}?expires=${expiresInSeconds}`;
  }

  async putLifecycleRules(rules: LifecycleRule[]) {
    this.lifecycle = rules;
  }

  async putUploadCors(origins: string[]) {
    this.corsOrigins = origins;
  }
}
