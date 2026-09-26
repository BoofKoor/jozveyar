/**
 * رمز ادمین (ADR-037): argon2id با پارامترهای پیشنهادی OWASP، m=19456 (۱۹ مگابایت)، t=2، p=1.
 *
 * هش در پایگاه داده به قالب PHC است (`$argon2id$v=19$m=19456,t=2,p=1$…`)، پس پارامترهای هر هش همراه
 * خودش است: اگر روزی بالا بروند، هش‌های قدیم باز هم سنجیده می‌شوند.
 *
 * - **پیش از هش** رمز یکدست می‌شود (`normalizePassword`): NFKC، ي و ك عربی فارسی، ارقام لاتین. همان
 *   رمز از صفحه‌کلید دیگری (ویندوز با «ي» عربی، گوشی با ارقام فارسی) همان هش را می‌دهد. فاصله و
 *   نیم‌فاصله دست نمی‌خورند؛ بخشی از رمزند.
 * - **ادمینی که نیست** هم یک سنجش کامل می‌خورد (`dummyVerify`)، تا زمان پاسخ نگوید کدام نام هست.
 *
 * `@node-rs/argon2` بومی است و در استخر رشتهٔ libuv اجرا می‌شود، نه رشتهٔ اصلی.
 */

import { hash, verify, type Options } from '@node-rs/argon2';

import { normalizePassword } from './passwordText';

export { normalizePassword };

/** `Algorithm.Argon2id`؛ خود enum در تایپ‌ها `const enum` است و با `isolatedModules` خوانده نمی‌شود. */
const ARGON2ID = 2 as NonNullable<Options['algorithm']>;

export const ARGON2_OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } satisfies Options;

export interface Passwords {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  /** همان کار `verify` روی هشی ساختگی؛ همیشه false. */
  dummyVerify(password: string): Promise<false>;
}

export function argon2Passwords(): Passwords {
  let dummy: Promise<string> | null = null;
  const check = async (passwordHash: string, password: string) => {
    try {
      return await verify(passwordHash, normalizePassword(password));
    } catch {
      return false;
    }
  };
  return {
    hash: (password) => hash(normalizePassword(password), ARGON2_OPTIONS),
    verify: check,
    async dummyVerify(password) {
      dummy ??= hash('jozveyar-dummy-password', ARGON2_OPTIONS);
      await check(await dummy, password);
      return false;
    },
  };
}
