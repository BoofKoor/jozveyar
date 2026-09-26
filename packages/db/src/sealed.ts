/**
 * مقدار مهروموم‌شده در پایگاه داده: رمزی که سرور باید بخواند ولی نشت پایگاه داده نباید لو بدهد.
 *
 * امروز رمز برنامهٔ تأیید ادمین (TOTP، ADR-037)؛ از ۴٫۶ کلیدهای سرویس‌های بیرونی (ADR-041). هر دو را
 * سرور خام لازم دارد (کد را می‌سنجد، به پنل پیامک وصل می‌شود)، پس هش بس نیست.
 *
 * - **AES-256-GCM** با `SECRETS_KEY` (۶۴ رقم hex در `.env`، که `deploy-bundle.sh` اگر نباشد می‌سازد).
 *   کلید هیچ‌وقت در پایگاه داده نیست.
 * - **داده‌ٔ همراه (AAD):** هر مقدار به جای خودش بسته است (مثلاً `admin_users.totp:<شناسه>`)؛ جابه‌جا
 *   کردن مقدار مهروموم‌شدهٔ یک ردیف به ردیف دیگر باز نمی‌شود.
 * - **شکل:** `v1.<iv>.<رمزشده و برچسب>`، هر دو base64url. `v1` جای کلید تازه را باز می‌گذارد.
 *
 * شکست باز کردن (کلید دیگر، دستکاری، جای دیگر) پرتاب می‌شود؛ تصمیم با صدازننده است.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** کلید ۳۲ بایتی از `SECRETS_KEY` (۶۴ رقم hex)، یا null اگر نیست یا شکلش درست نیست. */
export function secretsKeyOf(value: string | undefined): Buffer | null {
  const hex = value?.trim() ?? '';
  return /^[0-9a-fA-F]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null;
}

export function seal(key: Buffer, plaintext: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString('base64url')}.${body.toString('base64url')}`;
}

export function unseal(key: Buffer, sealed: string, context: string): string {
  const [version, ivPart, bodyPart, ...rest] = sealed.split('.');
  if (version !== VERSION || !ivPart || !bodyPart || rest.length > 0) throw new Error('مقدار مهروموم‌شده شکل درستی ندارد.');
  const iv = Buffer.from(ivPart, 'base64url');
  const body = Buffer.from(bodyPart, 'base64url');
  if (iv.length !== IV_BYTES || body.length < TAG_BYTES) throw new Error('مقدار مهروموم‌شده شکل درستی ندارد.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString('utf8');
}
