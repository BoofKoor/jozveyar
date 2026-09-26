/**
 * مرز استوریج (ADR-008).
 *
 * این اینترفیس به شکل **نیاز ما** است، نه کل API استوریج. هر چه اینجا نیست،
 * کد دامنه لازمش ندارد — و هر پیاده‌سازی تازه (Garage امروز، آروان یا پارس‌پک
 * فردا) فقط همین را باید برآورده کند.
 *
 * نکتهٔ اصلی طراحی: بایت‌های فایل کاربر هیچ‌وقت از سرور وب رد نمی‌شوند.
 * مرورگر با URL امضاشده مستقیم به استوریج می‌فرستد و سرور فقط فرمان می‌دهد و
 * می‌سنجد. به همین دلیل «دیسک محلی» پیاده‌سازی ممکنی نیست و عمداً رد شد. تنها
 * خواندن بایت‌ها `getObject` است، برای دانلود PDF جزوه در پنل ادمین (ADR-037).
 */

export interface UploadedPart {
  /** ۱-مبنا، همان شمارهٔ تکه در آپلود چندتکه. */
  partNumber: number;
  etag: string;
  sizeBytes: number;
}

export interface ObjectInfo {
  sizeBytes: number;
  etag: string;
}

/** بدنهٔ یک فایل، جریانی: تا گیرنده می‌خواند می‌آید، نه یک‌جا در حافظه. */
export interface ObjectStream extends ObjectInfo {
  body: ReadableStream<Uint8Array>;
}

export interface LifecycleRule {
  id: string;
  prefix: string;
  /** فایل کامل‌شده بعد از این تعداد روز پاک می‌شود. */
  expireDays?: number;
  /** آپلود نیمه‌کاره بعد از این تعداد روز لغو و تکه‌هایش پاک می‌شوند. */
  abortIncompleteDays?: number;
}

export interface StorageDriver {
  /** شروع آپلود چندتکه؛ شناسهٔ آپلود را برمی‌گرداند. */
  createMultipartUpload(key: string, options: { contentType: string }): Promise<string>;

  /**
   * URL امضاشده برای یک تکه. `sizeBytes` در امضا می‌رود، پس URL فقط تکه‌ای
   * دقیقاً به همین اندازه را می‌پذیرد.
   */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<string>;

  /** تکه‌هایی که واقعاً رسیده‌اند — منبع حقیقت برای ادامه و تکمیل. */
  listUploadedParts(key: string, uploadId: string): Promise<UploadedPart[]>;

  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;

  /** لغو و پاک کردن تکه‌ها. آپلودی که دیگر نیست خطا نیست. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /** null یعنی فایل نیست. */
  headObject(key: string): Promise<ObjectInfo | null>;

  /**
   * بایت‌های یک فایل از آدرس داخلی، جریانی؛ null یعنی فایل نیست. فقط برای پنل ادمین، که PDF جزوه را از
   * راه خودش می‌دهد تا مسیر `/jozveyar/` Nginx همان «فقط PUT» بماند (ADR-037). سقف زمان فقط تا رسیدن
   * سرآیندهاست: جزوه تا گیگابایت است و بدنه تا هر وقت که گیرنده بخواند جریان دارد.
   */
  getObject(key: string): Promise<ObjectStream | null>;

  /** فایلی که نیست خطا نیست. */
  deleteObject(key: string): Promise<void>;

  /**
   * URL دانلود امضاشده برای میزبان عمومی. امروز کسی به کارش نمی‌برد: مسیر `/jozveyar/` Nginx فقط PUT است و
   * پنل جزوه را با `getObject` از راه خودش می‌دهد (ADR-037).
   */
  presignGetObject(
    key: string,
    expiresInSeconds: number,
    options?: { downloadName?: string },
  ): Promise<string>;

  /** قاعده‌های نگهداری باکت را جایگزین می‌کند. idempotent. */
  putLifecycleRules(rules: LifecycleRule[]): Promise<void>;

  /** اجازهٔ PUT مستقیم از این مبدأها. idempotent. */
  putUploadCors(origins: string[]): Promise<void>;
}

/** کدهای خطایی که کد دامنه رویشان تصمیم می‌گیرد. بقیه `unknown`. */
export type StorageErrorCode = 'no_such_upload' | 'invalid_part' | 'unavailable' | 'unknown';

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    /** کد خام خطای S3، برای لاگ. */
    readonly s3Code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
