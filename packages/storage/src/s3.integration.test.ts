/**
 * تست یکپارچگی روی استوریج S3 واقعی.
 *
 * مثل تست پستگرس: بدون `S3_ENDPOINT` خودش را رد می‌کند و در CI همیشه روی یک
 * Garage واقعی اجرا می‌شود. آنچه اینجا ثابت می‌شود با fetch جعلی ثابت‌شدنی
 * نیست: اینکه سرور واقعی امضای ما را می‌پذیرد، امضای content-length را اجرا
 * می‌کند، و URLی که برای میزبان عمومی امضا شده، پشت Nginx کار می‌کند.
 *
 *   S3_ENDPOINT=http://127.0.0.1:3900 S3_BUCKET=jozveyar \
 *   S3_ACCESS_KEY=GK… S3_SECRET_KEY=… pnpm test
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';

import { beforeAll, describe, expect, it } from 'vitest';

import { MIN_PART_SIZE_BYTES, partRange, planParts } from './multipart.js';
import { S3Driver } from './s3.js';

const env = process.env;
const ENABLED = Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

function driver(publicEndpoint?: string) {
  return new S3Driver({
    endpoint: env.S3_ENDPOINT!,
    publicEndpoint,
    region: env.S3_REGION || 'us-east-1',
    bucket: env.S3_BUCKET || 'jozveyar',
    accessKeyId: env.S3_ACCESS_KEY!,
    secretAccessKey: env.S3_SECRET_KEY!,
  });
}

/** همان کاری که مرورگر می‌کند: PUT بدنه روی URL امضاشده. */
async function put(url: string, body: Buffer): Promise<number> {
  const response = await fetch(url, { method: 'PUT', body: new Blob([Uint8Array.from(body)]) });
  await response.arrayBuffer();
  return response.status;
}

describe.skipIf(!ENABLED)('استوریج واقعی', () => {
  // تنبل: بدنهٔ describe حتی وقتی رد می‌شود اجرا می‌شود، و بدون env نمی‌شود درایور ساخت.
  let s3: S3Driver;
  beforeAll(() => {
    s3 = driver();
  });
  const key = () => `test/${randomUUID()}.bin`;

  it('آپلود چندتکهٔ کامل با URL امضاشده، و دانلود همان بایت‌ها', async () => {
    const k = key();
    const data = randomBytes(MIN_PART_SIZE_BYTES + 12_345);
    const plan = planParts(data.length, MIN_PART_SIZE_BYTES);
    expect(plan.partCount).toBe(2);

    const uploadId = await s3.createMultipartUpload(k, { contentType: 'application/pdf' });
    // عمداً برعکس: ترتیب رسیدن تکه‌ها نباید مهم باشد.
    for (const n of [2, 1]) {
      const { start, end } = partRange(plan, n);
      const url = await s3.presignUploadPart(k, uploadId, n, end - start, 600);
      expect(await put(url, data.subarray(start, end))).toBe(200);
    }

    const parts = await s3.listUploadedParts(k, uploadId);
    expect(parts.map((p) => [p.partNumber, p.sizeBytes])).toEqual([
      [1, MIN_PART_SIZE_BYTES],
      [2, 12_345],
    ]);

    await s3.completeMultipartUpload(k, uploadId, parts);
    expect((await s3.headObject(k))?.sizeBytes).toBe(data.length);

    const downloaded = Buffer.from(
      await (await fetch(await s3.presignGetObject(k, 600, { downloadName: 'جزوه.pdf' }))).arrayBuffer(),
    );
    expect(downloaded.equals(data)).toBe(true);

    await s3.deleteObject(k);
    expect(await s3.headObject(k)).toBeNull();
  });

  it('URL تکه بدنه‌ای با اندازهٔ دیگر را نمی‌پذیرد', async () => {
    const k = key();
    const uploadId = await s3.createMultipartUpload(k, { contentType: 'application/pdf' });
    const url = await s3.presignUploadPart(k, uploadId, 1, 1000, 600);

    expect(await put(url, randomBytes(2000))).toBe(403);
    expect(await put(url, randomBytes(999))).toBe(403);
    expect(await s3.listUploadedParts(k, uploadId)).toEqual([]);

    expect(await put(url, randomBytes(1000))).toBe(200);
    await s3.abortMultipartUpload(k, uploadId);
  });

  it('URL امضاشده برای میزبان عمومی، وقتی با همان Host می‌رسد، پذیرفته می‌شود', async () => {
    // همان کاری که Nginx می‌کند: درخواست `https://jozveyar.com/<bucket>/…` را
    // با `Host: jozveyar.com` به کانتینر استوریج می‌دهد.
    const k = key();
    const uploadId = await s3.createMultipartUpload(k, { contentType: 'application/pdf' });
    const signed = new URL(
      await driver('https://jozveyar.example').presignUploadPart(k, uploadId, 1, 10, 600),
    );
    const internal = new URL(env.S3_ENDPOINT!);

    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: internal.hostname,
          port: internal.port,
          method: 'PUT',
          path: `${signed.pathname}${signed.search}`,
          headers: { host: 'jozveyar.example', 'content-length': 10 },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end(randomBytes(10));
    });
    expect(status).toBe(200);
    expect((await s3.listUploadedParts(k, uploadId)).map((p) => p.partNumber)).toEqual([1]);
    await s3.abortMultipartUpload(k, uploadId);
  });

  it('لغو تکه‌ها را پاک می‌کند و لغو دوباره خطا نیست', async () => {
    const k = key();
    const uploadId = await s3.createMultipartUpload(k, { contentType: 'application/pdf' });
    await put(await s3.presignUploadPart(k, uploadId, 1, 5, 600), randomBytes(5));

    await s3.abortMultipartUpload(k, uploadId);
    await expect(s3.listUploadedParts(k, uploadId)).rejects.toMatchObject({ code: 'no_such_upload' });
    await expect(s3.abortMultipartUpload(k, uploadId)).resolves.toBeUndefined();
  });

  it('قاعدهٔ نگهداری و CORS روی باکت نوشته می‌شوند', async () => {
    await s3.putLifecycleRules([
      { id: 'uploads-expire', prefix: 'uploads/', expireDays: 2, abortIncompleteDays: 1 },
    ]);
    await s3.putUploadCors(['https://jozveyar.com']);
  });
});
