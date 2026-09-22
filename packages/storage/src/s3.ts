/**
 * `StorageDriver` روی پروتکل S3 — یک پیاده‌سازی برای Garage، آروان و پارس‌پک.
 *
 * دو آدرس جدا دارد و این عمدی است:
 *
 * - `endpoint` — آدرسی که **سرور** با آن حرف می‌زند (داخل شبکهٔ داکر،
 *   `http://garage:3900`).
 * - `publicEndpoint` — آدرسی که **مرورگر** URL امضاشده را رویش صدا می‌زند
 *   (`https://jozveyar.com`، که Nginx به همان کانتینر می‌دهد).
 *
 * امضای S3 میزبان را امضا می‌کند، پس URL باید برای همان میزبانی امضا شود که
 * مرورگر به آن وصل می‌شود. امضا کاملاً محلی است و تماس شبکه‌ای ندارد، پس ساختن
 * URL برای آدرس عمومی هزینه‌ای ندارد. روز انتقال به آروان، هر دو یکی می‌شوند.
 *
 * همهٔ آدرس‌ها path-style‌اند (`/<bucket>/<key>`): تنها شکلی که هم Garage،
 * هم آروان و هم پراکسی هم‌مبدأ Nginx بدون DNS اضافه پشتیبانی می‌کنند.
 */

import { createHash } from 'node:crypto';

import {
  StorageError,
  type LifecycleRule,
  type ObjectInfo,
  type StorageDriver,
  type StorageErrorCode,
  type UploadedPart,
} from './driver.js';
import {
  canonicalPath,
  canonicalQuery,
  presignUrl,
  sha256Hex,
  signRequest,
  type SigningCredentials,
} from './sigv4.js';
import { allTags, escapeXml, firstTag, parseS3Error } from './xml.js';

export interface S3Config {
  endpoint: string;
  /** پیش‌فرض: همان `endpoint`. */
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** سقف هر درخواست سرور به استوریج. پیش‌فرض ۳۰ ثانیه. */
  timeoutMs?: number;
  /** برای تست. */
  fetch?: typeof fetch;
}

type Query = [string, string][];

const S3_NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

/** کد خطای S3 به تصمیمی که کد دامنه می‌گیرد. */
function classify(s3Code: string | undefined, status: number): StorageErrorCode {
  if (s3Code === 'NoSuchUpload') return 'no_such_upload';
  if (s3Code === 'InvalidPart' || s3Code === 'InvalidPartOrder' || s3Code === 'EntityTooSmall') {
    return 'invalid_part';
  }
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

export class S3Driver implements StorageDriver {
  private readonly credentials: SigningCredentials;
  private readonly endpoint: string;
  private readonly publicEndpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: S3Config) {
    this.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
    };
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.publicEndpoint = (config.publicEndpoint || config.endpoint).replace(/\/+$/, '');
    this.fetchImpl = config.fetch ?? fetch;
  }

  /**
   * آدرس یک کلید یا خود باکت (`key` خالی).
   *
   * مسیر و پرس‌وجو همین‌جا به شکل کانونی کد می‌شوند، تا چیزی که روی سیم می‌رود
   * بایت‌به‌بایت همان باشد که امضا شد.
   */
  private url(base: string, key: string, query: Query = []): URL {
    // کلید خالی = خود باکت. بدون اسلش پایانی، وگرنه بعضی سرورها «کلید خالی» می‌فهمند.
    const path = key ? `/${this.config.bucket}/${key}` : `/${this.config.bucket}`;
    const qs = query.length > 0 ? `?${canonicalQuery(query)}` : '';
    return new URL(`${base}${canonicalPath(path)}${qs}`);
  }

  private async send(
    method: string,
    key: string,
    query: Query,
    options: { body?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; text: string; headers: Headers }> {
    const url = this.url(this.endpoint, key, query);
    const body = options.body ?? '';
    const headers = signRequest({
      method,
      url,
      headers: options.headers,
      payloadHash: sha256Hex(body),
      credentials: this.credentials,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });
    } catch (error) {
      throw new StorageError(
        'unavailable',
        `استوریج در دسترس نیست (${method} ${url.pathname}): ${(error as Error).message}`,
      );
    }

    const text = method === 'HEAD' ? '' : await response.text();
    if (!response.ok) {
      const parsed = parseS3Error(text);
      throw new StorageError(
        classify(parsed?.code, response.status),
        `${method} ${url.pathname} → ${response.status} ${parsed?.code ?? ''} ${parsed?.message ?? ''}`.trim(),
        parsed?.code,
        response.status,
      );
    }
    return { status: response.status, text, headers: response.headers };
  }

  async createMultipartUpload(key: string, { contentType }: { contentType: string }) {
    const { text } = await this.send('POST', key, [['uploads', '']], {
      headers: { 'content-type': contentType },
    });
    const uploadId = firstTag(text, 'UploadId');
    if (!uploadId) throw new StorageError('unknown', `پاسخ بدون UploadId: ${text.slice(0, 200)}`);
    return uploadId;
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    sizeBytes: number,
    expiresInSeconds: number,
  ) {
    return presignUrl({
      method: 'PUT',
      url: this.url(this.publicEndpoint, key, [
        ['partNumber', String(partNumber)],
        ['uploadId', uploadId],
      ]),
      expiresInSeconds,
      credentials: this.credentials,
      // بدنه‌ای با اندازهٔ دیگر امضا را می‌شکند؛ یک URL نمی‌تواند دیسک را پر کند.
      signedHeaders: { 'content-length': String(sizeBytes) },
    });
  }

  async listUploadedParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker = '';
    // صفحه‌بندی: S3 حداکثر ۱۰۰۰ تکه در هر پاسخ می‌دهد.
    for (;;) {
      const query: Query = [['uploadId', uploadId]];
      if (marker) query.push(['part-number-marker', marker]);
      const { text } = await this.send('GET', key, query);
      for (const block of allTags(text, 'Part')) {
        parts.push({
          partNumber: Number(firstTag(block, 'PartNumber')),
          etag: firstTag(block, 'ETag') ?? '',
          sizeBytes: Number(firstTag(block, 'Size')),
        });
      }
      const truncated = firstTag(text, 'IsTruncated') === 'true';
      const next = firstTag(text, 'NextPartNumberMarker');
      if (!truncated || !next || next === marker) break;
      marker = next;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]) {
    const body =
      `<CompleteMultipartUpload xmlns="${S3_NS}">` +
      parts
        .map(
          (p) =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`,
        )
        .join('') +
      '</CompleteMultipartUpload>';
    const { text } = await this.send('POST', key, [['uploadId', uploadId]], {
      body,
      headers: { 'content-type': 'application/xml' },
    });
    // تلهٔ معروف: S3 ممکن است ۲۰۰ برگرداند و خطا را در بدنه بگذارد، چون پاسخ را
    // قبل از تمام شدن کار شروع کرده. کد وضعیت به‌تنهایی کافی نیست.
    const error = parseS3Error(text);
    if (error) {
      throw new StorageError(classify(error.code, 200), `تکمیل شکست خورد: ${error.code} ${error.message}`, error.code, 200);
    }
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    try {
      await this.send('DELETE', key, [['uploadId', uploadId]]);
    } catch (error) {
      if (error instanceof StorageError && error.code === 'no_such_upload') return;
      throw error;
    }
  }

  async headObject(key: string): Promise<ObjectInfo | null> {
    try {
      const { headers } = await this.send('HEAD', key, []);
      return {
        sizeBytes: Number(headers.get('content-length') ?? 0),
        etag: headers.get('etag') ?? '',
      };
    } catch (error) {
      if (error instanceof StorageError && error.status === 404) return null;
      throw error;
    }
  }

  async deleteObject(key: string) {
    try {
      await this.send('DELETE', key, []);
    } catch (error) {
      if (error instanceof StorageError && error.status === 404) return;
      throw error;
    }
  }

  async presignGetObject(
    key: string,
    expiresInSeconds: number,
    options: { downloadName?: string } = {},
  ) {
    const query: Query = [];
    if (options.downloadName) {
      // نام فارسی: شکل RFC 5987 تا مرورگر درست نشانش دهد.
      query.push([
        'response-content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`,
      ]);
    }
    return presignUrl({
      method: 'GET',
      url: this.url(this.publicEndpoint, key, query),
      expiresInSeconds,
      credentials: this.credentials,
    });
  }

  async putLifecycleRules(rules: LifecycleRule[]) {
    const body =
      `<LifecycleConfiguration xmlns="${S3_NS}">` +
      rules
        .map(
          (rule) =>
            `<Rule><ID>${escapeXml(rule.id)}</ID>` +
            `<Filter><Prefix>${escapeXml(rule.prefix)}</Prefix></Filter>` +
            '<Status>Enabled</Status>' +
            (rule.expireDays ? `<Expiration><Days>${rule.expireDays}</Days></Expiration>` : '') +
            (rule.abortIncompleteDays
              ? `<AbortIncompleteMultipartUpload><DaysAfterInitiation>${rule.abortIncompleteDays}</DaysAfterInitiation></AbortIncompleteMultipartUpload>`
              : '') +
            '</Rule>',
        )
        .join('') +
      '</LifecycleConfiguration>';
    await this.sendConfig('lifecycle', body);
  }

  async putUploadCors(origins: string[]) {
    const body =
      `<CORSConfiguration xmlns="${S3_NS}"><CORSRule>` +
      origins.map((o) => `<AllowedOrigin>${escapeXml(o)}</AllowedOrigin>`).join('') +
      '<AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader>' +
      '<MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>';
    await this.sendConfig('cors', body);
  }

  /** پیکربندی باکت؛ S3 برای اینها Content-MD5 می‌خواهد. */
  private async sendConfig(subresource: string, body: string) {
    await this.send('PUT', '', [[subresource, '']], {
      body,
      headers: {
        'content-type': 'application/xml',
        'content-md5': createHash('md5').update(body).digest('base64'),
      },
    });
  }
}
