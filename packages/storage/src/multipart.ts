/**
 * برنامهٔ تکه‌های آپلود — تابع خالص، مشترک بین مرورگر و سرور.
 *
 * مرورگر با همین برنامه فایل را تکه می‌کند و سرور با همین برنامه می‌سنجد که
 * چیزی که رسیده دقیقاً همان است. دو پیاده‌سازی از «تکهٔ n چند بایت است» یعنی
 * روزی که با هم نخوانند، آپلود سالم رد می‌شود.
 *
 * هیچ import از node اینجا نیست؛ این فایل در باندل مرورگر هم می‌رود.
 */

/**
 * ۸ مگابایت. حداقل S3 برای هر تکه جز آخری ۵ مگابایت است.
 *
 * روی لینک موبایل بی‌ثبات، تکهٔ کوچک‌تر یعنی کار کمتری که با هر قطعی دور
 * ریخته می‌شود؛ تکهٔ بزرگ‌تر یعنی درخواست کمتر. فایل ۱٫۵ گیگابایتی با این عدد
 * ۱۹۲ تکه است — خیلی زیر سقف ۱۰,۰۰۰ تکهٔ S3.
 */
export const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;

/** حداقل S3 برای هر تکه جز آخری. */
export const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;

/** سقف S3 برای تعداد تکه‌ها. */
export const MAX_PARTS = 10_000;

export interface PartPlan {
  sizeBytes: number;
  partSizeBytes: number;
  partCount: number;
}

export function planParts(sizeBytes: number, partSizeBytes = DEFAULT_PART_SIZE_BYTES): PartPlan {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new RangeError(`حجم فایل نامعتبر است: ${sizeBytes}`);
  }
  if (partSizeBytes < MIN_PART_SIZE_BYTES) {
    throw new RangeError(`تکه کوچک‌تر از حداقل S3 است: ${partSizeBytes}`);
  }
  const partCount = Math.ceil(sizeBytes / partSizeBytes);
  if (partCount > MAX_PARTS) throw new RangeError(`بیش از ${MAX_PARTS} تکه`);
  return { sizeBytes, partSizeBytes, partCount };
}

/** اندازهٔ دقیق تکهٔ n (۱-مبنا). همه برابرند جز آخری که باقی‌مانده است. */
export function partSize(plan: PartPlan, partNumber: number): number {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > plan.partCount) {
    throw new RangeError(`شمارهٔ تکه خارج از برنامه: ${partNumber}`);
  }
  if (partNumber < plan.partCount) return plan.partSizeBytes;
  return plan.sizeBytes - plan.partSizeBytes * (plan.partCount - 1);
}

/** بازهٔ بایت تکهٔ n برای `Blob.slice(start, end)`. */
export function partRange(plan: PartPlan, partNumber: number): { start: number; end: number } {
  const start = (partNumber - 1) * plan.partSizeBytes;
  return { start, end: start + partSize(plan, partNumber) };
}

export interface PartsVerdict {
  /** همهٔ تکه‌ها با اندازهٔ درست رسیده‌اند. */
  complete: boolean;
  /** تکه‌هایی که با اندازهٔ درست رسیده‌اند. */
  received: number[];
  /** نرسیده یا با اندازهٔ غلط — باید دوباره فرستاده شوند. */
  missing: number[];
}

/**
 * آنچه استوریج می‌گوید رسیده، در برابر برنامه.
 *
 * تکه‌ای با اندازهٔ غلط «نرسیده» شمرده می‌شود، نه «رسیده». تکهٔ بیرون از
 * برنامه نادیده گرفته می‌شود و در تکمیل هم فرستاده نمی‌شود.
 */
export function verifyParts(
  plan: PartPlan,
  listed: { partNumber: number; sizeBytes: number }[],
): PartsVerdict {
  const sizes = new Map(listed.map((p) => [p.partNumber, p.sizeBytes]));
  const received: number[] = [];
  const missing: number[] = [];
  for (let n = 1; n <= plan.partCount; n += 1) {
    if (sizes.get(n) === partSize(plan, n)) received.push(n);
    else missing.push(n);
  }
  return { complete: missing.length === 0, received, missing };
}
