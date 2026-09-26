/**
 * کد برنامهٔ تأیید گوشی (TOTP، RFC 6238) و پایه‌اش HOTP (RFC 4226)، دست‌نویس با `node:crypto` به جای یک
 * وابستگی (ADR-037). بردارهای خود دو RFC در `totp.test.ts` قفلش کرده‌اند.
 *
 * - **شکل کد:** ۶ رقم، گام ۳۰ ثانیه، SHA-1؛ همان پیش‌فرض قالب `otpauth://` که همهٔ برنامه‌های تأیید
 *   می‌فهمند.
 * - **پذیرش:** گام جاری و یک گام پیش و پس (±۳۰ ثانیه برای ساعت گوشی). بزرگ‌ترین گامی که جور شد برمی‌گردد،
 *   تا سرویس ورود فقط گامی بزرگ‌تر از آخرین گام پذیرفته را قبول کند: هر کد یک بار، حتی اگر اتفاقاً در دو
 *   گام یکی باشد.
 * - **رمز:** ۲۰ بایت تصادفی (۱۶۰ بیت، اندازهٔ پیشنهادی RFC 4226)، base32 بی `=`، یعنی ۳۲ نویسه.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** چند گام پیش و پس از گام جاری هم پذیرفته می‌شود. */
export const TOTP_SKEW_STEPS = 1;
const SECRET_BYTES = 20;
/** نامی که برنامهٔ تأیید کنار حساب نشان می‌دهد؛ لاتین، تا هر برنامه‌ای درست نشانش دهد. */
export const TOTP_ISSUER = 'Jozveyar';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** base32 (RFC 4648) بی `=`؛ شکلی که `otpauth://` می‌خواهد. */
export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32 به بایت. فاصله، خط تیره و `=` دور ریخته می‌شوند و حروف کوچک هم پذیرفته‌اند؛ نویسهٔ دیگر پرتاب. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('base32 نامعتبر است.');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226): کد شمارندهٔ `counter`. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** گام ۳۰ ثانیه‌ای این لحظه. */
export const totpStep = (at: Date) => Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);

/** کد TOTP این لحظه. */
export const totpAt = (secret: Uint8Array, at: Date, digits = TOTP_DIGITS) => hotp(secret, totpStep(at), digits);

/**
 * گامی که این کد در آن درست است (جاری، یا `TOTP_SKEW_STEPS` پیش و پس)، یا null. همهٔ گام‌ها با مقایسهٔ
 * زمان‌ثابت سنجیده می‌شوند و بزرگ‌ترینِ جورشده برمی‌گردد.
 */
export function matchTotp(secret: Uint8Array, code: string, at: Date): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const given = Buffer.from(code);
  const now = totpStep(at);
  let matched: number | null = null;
  for (let step = now + TOTP_SKEW_STEPS; step >= now - TOTP_SKEW_STEPS; step -= 1) {
    const same = timingSafeEqual(Buffer.from(hotp(secret, step)), given);
    if (same && matched === null) matched = step;
  }
  return matched;
}

/** رمز تازهٔ برنامهٔ تأیید، base32. */
export const newTotpSecret = () => base32Encode(randomBytes(SECRET_BYTES));

/** رمز در گروه‌های ۴ نویسه‌ای، برای وارد کردن دستی: `JBSW Y3DP …`. */
export const groupedSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? '';

/**
 * نشانی `otpauth://` که QR پیوند ثبت نشانش می‌دهد (قالب Key Uri برنامه‌های تأیید). SHA-1، ۶ رقم و ۳۰ ثانیه
 * پیش‌فرض همین قالب‌اند و نوشته نمی‌شوند: نشانی کوتاه‌تر QR کم‌تراکم‌تری می‌دهد که از صفحه آسان‌تر اسکن
 * می‌شود.
 */
export function otpauthUri(secret: string, account: string, issuer = TOTP_ISSUER): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?${new URLSearchParams({ secret, issuer }).toString()}`;
}
