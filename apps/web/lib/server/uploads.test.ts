/**
 * منطق آپلود با استوریج و پایگاه دادهٔ حافظه‌ای.
 *
 * هر تصمیمی که سرویس می‌گیرد اینجا سنجیده می‌شود: مالکیت، سقف‌ها، و مهم‌تر
 * از همه اینکه تکمیل فقط وقتی قبول می‌شود که **استوریج** بگوید همهٔ تکه‌ها با
 * اندازهٔ درست رسیده‌اند.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryDriver, partSize, planParts } from '@jozveyar/storage';

import { memoryStore } from './testing';
import { createUploadService, MAX_OPEN_UPLOADS_PER_SESSION } from './uploads';

const MiB = 1024 * 1024;
const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('سرویس آپلود', () => {
  let storage: MemoryDriver;
  let store: ReturnType<typeof memoryStore>;
  let service: ReturnType<typeof createUploadService>;
  const logs: string[] = [];

  beforeEach(() => {
    storage = new MemoryDriver();
    store = memoryStore();
    logs.length = 0;
    service = createUploadService({
      store,
      storage,
      budgetBytes: 100 * MiB,
      siteOrigin: 'https://jozveyar.com',
      log: (m) => logs.push(m),
    });
  });

  /** همهٔ تکه‌ها را مثل مرورگر «می‌فرستد». */
  function sendParts(id: string, only?: number[], sizeOverride?: (n: number) => number) {
    const doc = store.rows.get(id)!;
    const plan = planParts(doc.sizeBytes, doc.partSizeBytes!);
    for (let n = 1; n <= plan.partCount; n += 1) {
      if (only && !only.includes(n)) continue;
      storage.receivePart(doc.uploadId!, n, sizeOverride?.(n) ?? partSize(plan, n));
    }
  }

  async function created(size = 20 * MiB, name = 'جزوه.pdf') {
    const result = await service.create(ME, { name, sizeBytes: size, mimeType: 'application/pdf' });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  it('ساخت آپلود: سند، برنامهٔ تکه‌ها، و قاعدهٔ نگهداری باکت', async () => {
    const upload = await created();
    expect(upload).toMatchObject({ status: 'uploading', partSizeBytes: 8 * MiB, partCount: 3 });
    const row = store.rows.get(upload.documentId)!;
    expect(row.storageKey).toBe(`uploads/${upload.documentId}.pdf`);
    expect(row.sessionHash).toBe(ME);
    expect(storage.lifecycle).toEqual([
      { id: 'uploads-retention', prefix: 'uploads/', expireDays: 2, abortIncompleteDays: 1 },
    ]);
    expect(storage.corsOrigins).toEqual(['https://jozveyar.com']);
  });

  it('نام فارسی یکدست می‌شود (ي → ی)', async () => {
    const upload = await created(MiB, 'جزوه‌ي فيزيك.pdf');
    expect(store.rows.get(upload.documentId)!.originalName).toBe('جزوه‌ی فیزیک.pdf');
  });

  it('ورودی نامعتبر، نوع ناشناخته و فایل بزرگ رد می‌شوند', async () => {
    expect(await service.create(ME, { name: 'a.pdf', sizeBytes: 0 })).toMatchObject({ status: 400 });
    expect(await service.create(ME, { name: 'a.exe', sizeBytes: 10 })).toMatchObject({
      status: 415,
      error: 'unsupported_type',
    });
    expect(await service.create(ME, { name: 'a.pdf', sizeBytes: 1_610_612_737 })).toMatchObject({
      status: 413,
      error: 'too_large',
    });
  });

  it('سقف حجم از جدول settings خوانده می‌شود', async () => {
    store.settings.set('file.max_bytes', 5 * MiB);
    expect(await service.create(ME, { name: 'a.pdf', sizeBytes: 6 * MiB })).toMatchObject({
      error: 'too_large',
    });
  });

  it('بودجهٔ دیسک پر: آپلود تازه رد و لاگ می‌شود', async () => {
    await created(60 * MiB);
    expect(await service.create(ME, { name: 'b.pdf', sizeBytes: 50 * MiB })).toMatchObject({
      status: 503,
      error: 'storage_full',
    });
    expect(logs.some((m) => m.includes('بودجه'))).toBe(true);
  });

  it('سقف آپلود باز برای هر نشست', async () => {
    for (let i = 0; i < MAX_OPEN_UPLOADS_PER_SESSION; i += 1) await created(MiB);
    expect(await service.create(ME, { name: 'x.pdf', sizeBytes: MiB })).toMatchObject({
      status: 429,
    });
    // نشست دیگر گیر نمی‌افتد.
    expect((await service.create(OTHER, { name: 'x.pdf', sizeBytes: MiB })).ok).toBe(true);
  });

  it('URL تکه‌ها فقط برای تکه‌های داخل برنامه، با اندازهٔ دقیق', async () => {
    const upload = await created(20 * MiB);
    const result = await service.presignParts(ME, upload.documentId, [3, 1]);
    expect(result.ok && result.value.urls.map((u) => u.url)).toEqual([
      expect.stringContaining(`partNumber=3&size=${4 * MiB}`),
      expect.stringContaining(`partNumber=1&size=${8 * MiB}`),
    ]);
    expect(await service.presignParts(ME, upload.documentId, [4])).toMatchObject({ status: 400 });
    expect(await service.presignParts(ME, upload.documentId, [])).toMatchObject({ status: 400 });
    expect(await service.presignParts(ME, upload.documentId, 'all')).toMatchObject({ status: 400 });
  });

  it('سند نشست دیگر «نیست» — نه URL، نه وضعیت، نه تکمیل، نه لغو', async () => {
    const upload = await created();
    for (const call of [
      service.presignParts(OTHER, upload.documentId, [1]),
      service.status(OTHER, upload.documentId),
      service.complete(OTHER, upload.documentId),
      service.abort(OTHER, upload.documentId),
    ]) {
      expect(await call).toMatchObject({ status: 404, error: 'not_found' });
    }
    expect(await service.status(ME, 'not-a-uuid')).toMatchObject({ status: 404 });
  });

  it('وضعیت برای ادامه: فقط تکه‌های با اندازهٔ درست «رسیده»‌اند', async () => {
    const upload = await created(20 * MiB);
    sendParts(upload.documentId, [1, 3], (n) => (n === 3 ? 123 : 8 * MiB));
    const status = await service.status(ME, upload.documentId);
    expect(status.ok && status.value.receivedParts).toEqual([1]);
  });

  it('تکمیل ناقص رد می‌شود و تکه‌های لازم را می‌گوید', async () => {
    const upload = await created(20 * MiB);
    sendParts(upload.documentId, [1, 3]);
    expect(await service.complete(ME, upload.documentId)).toMatchObject({
      status: 409,
      error: 'incomplete',
      missing: [2],
    });
    expect(store.rows.get(upload.documentId)!.status).toBe('uploading');
  });

  it('تکمیل کامل: فایل بسته، سند uploaded، و انقضا بر اساس روزهای نگهداری', async () => {
    const upload = await created(20 * MiB);
    sendParts(upload.documentId);
    const result = await service.complete(ME, upload.documentId);
    expect(result).toMatchObject({ ok: true, value: { status: 'uploaded' } });

    const row = store.rows.get(upload.documentId)!;
    expect(row.status).toBe('uploaded');
    expect(storage.objects.get(row.storageKey!)?.sizeBytes).toBe(20 * MiB);
    const days = (row.fileExpiresAt!.getTime() - row.uploadedAt!.getTime()) / 86_400_000;
    expect(days).toBe(2);

    // تکرارپذیر: کلاینتی که جواب را گم کرده دوباره می‌پرسد.
    expect(await service.complete(ME, upload.documentId)).toMatchObject({ ok: true });
  });

  it('تکمیل هم‌زمان: درخواست دومی که آپلود را بسته‌شده می‌بیند، موفق است', async () => {
    const upload = await created(20 * MiB);
    sendParts(upload.documentId);
    const row = store.rows.get(upload.documentId)!;
    // درخواست موازی آپلود را بسته، ولی سند هنوز به‌روز نشده.
    await storage.completeMultipartUpload(
      row.storageKey!,
      row.uploadId!,
      await storage.listUploadedParts(row.storageKey!, row.uploadId!),
    );
    expect(await service.complete(ME, upload.documentId)).toMatchObject({ ok: true });
    expect(row.status).toBe('uploaded');
  });

  it('آپلود منقضی‌شده در استوریج: وضعیت failed تا کلاینت از نو شروع کند', async () => {
    const upload = await created(MiB);
    await storage.abortMultipartUpload('', store.rows.get(upload.documentId)!.uploadId!);
    const status = await service.status(ME, upload.documentId);
    expect(status.ok && status.value.status).toBe('failed');
  });

  it('لغو: تکه‌ها آزاد می‌شوند؛ فایل کامل‌شده هم پاک می‌شود', async () => {
    const a = await created(MiB);
    expect((await service.abort(ME, a.documentId)).ok).toBe(true);
    expect(storage.uploads.size).toBe(0);
    expect(store.rows.get(a.documentId)!.failureReason).toBe('aborted');

    const b = await created(MiB);
    sendParts(b.documentId);
    await service.complete(ME, b.documentId);
    await service.abort(ME, b.documentId);
    const row = store.rows.get(b.documentId)!;
    expect(storage.objects.has(row.storageKey!)).toBe(false);
    expect(row.fileDeletedAt).not.toBeNull();
  });

  it('استوریج از دسترس خارج: ۵۰۳، تا مرورگر بی‌صدا ادامه دهد', async () => {
    storage.createMultipartUpload = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await service.create(ME, { name: 'a.pdf', sizeBytes: MiB })).toMatchObject({
      status: 503,
      error: 'storage_unavailable',
    });
    expect(store.rows.size).toBe(0);
  });

  it('شکست ثبت قاعدهٔ نگهداری جلوی آپلود را نمی‌گیرد ولی بلند لاگ می‌شود', async () => {
    storage.putLifecycleRules = async () => {
      throw new Error('AccessDenied');
    };
    expect((await service.create(ME, { name: 'a.pdf', sizeBytes: MiB })).ok).toBe(true);
    expect(logs.some((m) => m.includes('نگهداری'))).toBe(true);
  });
});
