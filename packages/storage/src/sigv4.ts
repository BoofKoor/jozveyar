/**
 * امضای AWS Signature V4 برای S3 — دست‌نویس، با `node:crypto`.
 *
 * چرا SDK نه: `@aws-sdk/client-s3` ده‌ها بسته به باندل standalone می‌آورد، و از
 * اوایل ۲۰۲۵ به‌طور پیش‌فرض checksum به درخواست‌ها و URLهای امضاشده اضافه می‌کند
 * که روی بعضی سرویس‌های S3-سازگار آپلود را می‌شکند. سطحی که ما لازم داریم کوچک
 * است؛ کدی که فقط همان را امضا کند، دقیقاً همان چیزی را می‌فرستد که امضا کرده.
 *
 * درستی این فایل با امضاهای مرجعی سنجیده می‌شود که AWS در مستنداتش منتشر کرده
 * (`sigv4.test.ts`). یک بایت خطا در کانونی‌سازی، امضا را کاملاً عوض می‌کند —
 * پس تست یا دقیقاً سبز است یا قرمز، چیزی بینابین ندارد.
 */

import { createHash, createHmac } from 'node:crypto';

export interface SigningCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

/** SHA-256 بدنهٔ خالی — پرتکرارترین مقدار `x-amz-content-sha256`. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * کدگذاری RFC 3986، همان‌طور که SigV4 می‌خواهد.
 *
 * `encodeURIComponent` پنج نویسه را کد نمی‌کند که S3 کدشده‌شان را امضا می‌کند.
 */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** مسیر کانونی: هر بخش جدا کد می‌شود و `/` می‌ماند. S3 مسیر را نرمال نمی‌کند. */
export function canonicalPath(path: string): string {
  return path.split('/').map(uriEncode).join('/');
}

/** رشتهٔ پرس‌وجوی کانونی: کلید و مقدار کد می‌شوند و بر اساس کلید مرتب. */
export function canonicalQuery(params: Iterable<[string, string]>): string {
  return [...params]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/** `20130524T000000Z` */
export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

interface CanonicalInput {
  method: string;
  /** مسیر خام، کدنشده. */
  path: string;
  query: [string, string][];
  /** نام هدرها باید حروف کوچک باشند. همهٔ اینها امضا می‌شوند. */
  headers: Record<string, string>;
  payloadHash: string;
}

function canonicalRequest({ method, path, query, headers, payloadHash }: CanonicalInput) {
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${headers[name]!.trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const request = [
    method,
    canonicalPath(path),
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  return { request, signedHeaders };
}

function signature(
  creds: SigningCredentials,
  date: Date,
  canonical: string,
): { signature: string; scope: string } {
  const stamp = amzDate(date);
  const dateStamp = stamp.slice(0, 8);
  const scope = `${dateStamp}/${creds.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonical)].join('\n');
  const sig = createHmac('sha256', signingKey(creds.secretAccessKey, dateStamp, creds.region))
    .update(stringToSign, 'utf8')
    .digest('hex');
  return { signature: sig, scope };
}

export interface SignRequestInput {
  method: string;
  url: URL;
  /** هدرهای اضافه برای امضا (حروف کوچک). `host` و `x-amz-*` خودکار اضافه می‌شوند. */
  headers?: Record<string, string>;
  /** SHA-256 بدنه به hex. */
  payloadHash: string;
  credentials: SigningCredentials;
  date?: Date;
}

/**
 * امضا در هدر `Authorization`. هدرهایی را برمی‌گرداند که باید **عیناً** با
 * درخواست فرستاده شوند (به‌جز `host` که fetch خودش از URL می‌سازد).
 */
export function signRequest(input: SignRequestInput): Record<string, string> {
  const date = input.date ?? new Date();
  const headers: Record<string, string> = {
    ...input.headers,
    host: input.url.host,
    'x-amz-date': amzDate(date),
    'x-amz-content-sha256': input.payloadHash,
  };
  const { request, signedHeaders } = canonicalRequest({
    method: input.method,
    path: decodeURIComponent(input.url.pathname),
    query: [...input.url.searchParams],
    headers,
    payloadHash: input.payloadHash,
  });
  const { signature: sig, scope } = signature(input.credentials, date, request);
  const { host: _host, ...toSend } = headers;
  return {
    ...toSend,
    authorization: `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

export interface PresignInput {
  method: string;
  url: URL;
  expiresInSeconds: number;
  credentials: SigningCredentials;
  /**
   * هدرهایی که درخواست واقعی باید دقیقاً با همین مقدار داشته باشد، مثل
   * `content-length`. `host` خودکار اضافه می‌شود.
   */
  signedHeaders?: Record<string, string>;
  date?: Date;
}

/** URL امضاشده (امضا در پرس‌وجو). بدنه امضا نمی‌شود: `UNSIGNED-PAYLOAD`. */
export function presignUrl(input: PresignInput): string {
  const date = input.date ?? new Date();
  const headers: Record<string, string> = { ...input.signedHeaders, host: input.url.host };
  const stamp = amzDate(date);
  const scope = `${stamp.slice(0, 8)}/${input.credentials.region}/${SERVICE}/aws4_request`;

  const url = new URL(input.url.toString());
  url.searchParams.set('X-Amz-Algorithm', ALGORITHM);
  url.searchParams.set('X-Amz-Credential', `${input.credentials.accessKeyId}/${scope}`);
  url.searchParams.set('X-Amz-Date', stamp);
  url.searchParams.set('X-Amz-Expires', String(input.expiresInSeconds));
  url.searchParams.set('X-Amz-SignedHeaders', Object.keys(headers).sort().join(';'));

  const { request } = canonicalRequest({
    method: input.method,
    path: decodeURIComponent(url.pathname),
    query: [...url.searchParams],
    headers,
    payloadHash: 'UNSIGNED-PAYLOAD',
  });
  const { signature: sig } = signature(input.credentials, date, request);

  // URLSearchParams فاصله را `+` می‌نویسد و `/` را کد نمی‌کند؛ رشتهٔ نهایی
  // را از همان کانونی‌سازی می‌سازیم تا چیزی که فرستاده می‌شود همان باشد که امضا شد.
  const query = canonicalQuery([...url.searchParams, ['X-Amz-Signature', sig]]);
  return `${url.origin}${canonicalPath(decodeURIComponent(url.pathname))}?${query}`;
}
