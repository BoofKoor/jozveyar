/**
 * اتصال به پایگاه داده.
 *
 * دو چیز عمداً اینجا **نیست**: هیچ کوئری دامنه‌ای، و هیچ اتصالی در زمان import.
 * اتصال وقتی ساخته می‌شود که کسی `getDb()` را صدا بزند، تا import کردن این
 * پکیج در تست یا در بیلد، سراغ پستگرس نرود.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export * from './schema.js';
export * from './price-list.js';
export * from './seed.js';
export * from './documents.js';
export * from './holidays.js';
export * from './reference.js';
export { runMigrations } from './migrate.js';

export type Database = ReturnType<typeof createDb>;

export interface DbOptions {
  /** حداکثر اتصال همزمان. روی سرور کوچک کم نگه دارید. */
  max?: number;
  /** ثانیه — اتصال بی‌کار بعد از این بسته می‌شود. */
  idleTimeout?: number;
}

export function createDb(connectionString: string, options: DbOptions = {}) {
  const client = postgres(connectionString, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeout ?? 30,
    // نام‌های فارسی و نیم‌فاصله باید بدون تغییر رفت‌وبرگشت کنند.
    // پستگرس پیش‌فرض UTF-8 است؛ این فقط صریح کردن همان است.
    connection: { client_encoding: 'UTF8' },
    onnotice: () => {},
  });

  return { db: drizzle(client, { schema }), client };
}

let cached: Database | undefined;

/**
 * نمونهٔ مشترک، از `DATABASE_URL`.
 *
 * در نکست هر درخواست ماژول را دوباره اجرا نمی‌کند ولی هات‌رلود می‌تواند؛ بدون
 * این کش، هر بار یک استخر اتصال تازه ساخته می‌شود و پستگرس با
 * «too many connections» می‌افتد — که خطایی است که علتش اصلاً پیدا نیست.
 */
export function getDb(): Database {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL تنظیم نشده است.');

  cached = createDb(url);
  return cached;
}
