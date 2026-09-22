/**
 * رفتار درایور S3 با fetch جعلی — چیزهایی که بدون سرور واقعی سنجیدنی‌اند:
 * چه درخواستی ساخته می‌شود و پاسخ‌های عجیب S3 چطور خوانده می‌شوند.
 * رفت‌وبرگشت واقعی در `s3.integration.test.ts` است.
 */

import { describe, expect, it } from 'vitest';

import { StorageError } from './driver.js';
import { S3Driver } from './s3.js';
import { decodeXml } from './xml.js';

type Call = { url: URL; init: RequestInit };

function driverWith(responses: { status?: number; body?: string; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL | string, init: RequestInit = {}) => {
    calls.push({ url: new URL(String(input)), init });
    const next = responses.shift() ?? {};
    return new Response(next.body ?? '', { status: next.status ?? 200, headers: next.headers });
  }) as typeof fetch;
  const driver = new S3Driver({
    endpoint: 'http://garage:3900',
    publicEndpoint: 'https://jozveyar.com',
    region: 'us-east-1',
    bucket: 'jozveyar',
    accessKeyId: 'GK0123',
    secretAccessKey: 'secret',
    fetch: fetchImpl,
  });
  return { driver, calls };
}

describe('درایور S3', () => {
  it('URL تکه برای میزبان عمومی امضا می‌شود، نه آدرس داخلی', async () => {
    const { driver } = driverWith([]);
    const url = new URL(await driver.presignUploadPart('uploads/a.pdf', 'u1', 3, 1234, 3600));
    expect(url.origin).toBe('https://jozveyar.com');
    expect(url.pathname).toBe('/jozveyar/uploads/a.pdf');
    expect(url.searchParams.get('partNumber')).toBe('3');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
  });

  it('درخواست‌های سرور به آدرس داخلی می‌روند', async () => {
    const { driver, calls } = driverWith([
      { body: '<InitiateMultipartUploadResult><UploadId>abc~1</UploadId></InitiateMultipartUploadResult>' },
    ]);
    expect(await driver.createMultipartUpload('uploads/a.pdf', { contentType: 'application/pdf' })).toBe('abc~1');
    expect(calls[0]!.url.origin).toBe('http://garage:3900');
    expect(calls[0]!.url.search).toBe('?uploads=');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it('فهرست تکه‌ها صفحه‌به‌صفحه خوانده می‌شود و ETag با entity درست می‌آید', async () => {
    const page = (parts: number[], truncated: boolean, next?: number) =>
      `<ListPartsResult><IsTruncated>${truncated}</IsTruncated>` +
      (next ? `<NextPartNumberMarker>${next}</NextPartNumberMarker>` : '') +
      parts
        .map((n) => `<Part><PartNumber>${n}</PartNumber><ETag>&quot;e${n}&quot;</ETag><Size>10</Size></Part>`)
        .join('') +
      '</ListPartsResult>';
    const { driver, calls } = driverWith([{ body: page([1, 2], true, 2) }, { body: page([3], false) }]);

    const parts = await driver.listUploadedParts('k', 'u');
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(parts[0]!.etag).toBe('"e1"');
    expect(calls[1]!.url.searchParams.get('part-number-marker')).toBe('2');
  });

  it('تکمیلی که ۲۰۰ برمی‌گرداند ولی خطا در بدنه دارد، شکست است', async () => {
    const { driver } = driverWith([
      { status: 200, body: '<Error><Code>InternalError</Code><Message>try again</Message></Error>' },
    ]);
    await expect(
      driver.completeMultipartUpload('k', 'u', [{ partNumber: 1, etag: '"e"', sizeBytes: 1 }]),
    ).rejects.toThrow(StorageError);
  });

  it('آپلود ناموجود کد مشخص دارد و لغوش خطا نیست', async () => {
    const noSuch = { status: 404, body: '<Error><Code>NoSuchUpload</Code><Message>x</Message></Error>' };
    const { driver } = driverWith([noSuch, noSuch]);
    await expect(driver.listUploadedParts('k', 'u')).rejects.toMatchObject({ code: 'no_such_upload' });
    await expect(driver.abortMultipartUpload('k', 'u')).resolves.toBeUndefined();
  });

  it('فایل ناموجود در head برابر null است', async () => {
    const { driver } = driverWith([{ status: 404 }, { status: 200, headers: { 'content-length': '42', etag: '"x"' } }]);
    expect(await driver.headObject('k')).toBeNull();
    expect(await driver.headObject('k')).toEqual({ sizeBytes: 42, etag: '"x"' });
  });

  it('قطع شبکه یعنی «در دسترس نیست»، نه خطای مبهم', async () => {
    const driver = new S3Driver({
      endpoint: 'http://garage:3900',
      region: 'us-east-1',
      bucket: 'b',
      accessKeyId: 'a',
      secretAccessKey: 's',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(driver.headObject('k')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('پیکربندی باکت به خود باکت می‌رود و Content-MD5 دارد', async () => {
    const { driver, calls } = driverWith([{}]);
    await driver.putLifecycleRules([{ id: 'uploads', prefix: 'uploads/', expireDays: 2, abortIncompleteDays: 1 }]);
    expect(calls[0]!.url.pathname).toBe('/jozveyar');
    expect(calls[0]!.url.search).toBe('?lifecycle=');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['content-md5']).toMatch(/==$/);
    expect(String(calls[0]!.init.body)).toContain('<Days>2</Days>');
  });
});

describe('XML', () => {
  it('entityها باز می‌شوند', () => {
    expect(decodeXml('&quot;a&amp;b&quot; &#1576; &#x67E;')).toBe('"a&b" ب پ');
  });
});
