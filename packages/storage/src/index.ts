/**
 * استوریج جزوه‌یار.
 *
 * کد دامنه فقط `StorageDriver` را می‌شناسد. اینکه پشتش Garage است یا آروان،
 * تنها در `.env` معلوم می‌شود (ADR-008، ADR-023).
 */

import { S3Driver } from './s3.js';

export * from './driver.js';
export * from './multipart.js';
export { S3Driver, type S3Config } from './s3.js';
export { MemoryDriver } from './memory.js';

export interface StorageEnv {
  driver: S3Driver;
  bucket: string;
}

/**
 * درایور از متغیرهای محیطی، یا null وقتی استوریج پیکربندی نشده.
 *
 * null خطا نیست: یعنی سایت بدون آپلود کار می‌کند، دقیقاً مثل قبل از این برش.
 * مرورگر جواب ۵۰۳ می‌گیرد و بی‌صدا با تحلیل خودش ادامه می‌دهد.
 */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageEnv | null {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    driver: new S3Driver({
      endpoint,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT || endpoint,
      region: env.S3_REGION || 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
    }),
  };
}
