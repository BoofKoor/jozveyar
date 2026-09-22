/**
 * اجرای مهاجرت‌ها.
 *
 * درایور جدا از `getDb()` ساخته می‌شود و با یک اتصال کار می‌کند: مهاجرت یک بار
 * اجرا می‌شود و استخر اتصال برایش هم بی‌فایده است هم خطرناک (چند اتصال یعنی
 * احتمال اجرای موازی دو مهاجرت).
 *
 *   pnpm --filter @jozveyar/db migrate
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/**
 * `migrationsFolder` برای اجرای داخل بستهٔ تولیدی لازم است: آنجا این فایل در
 * باندل نکست حل شده و `import.meta.url` دیگر به پوشهٔ پکیج اشاره نمی‌کند.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const client = postgres(connectionString, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

// اجرای مستقیم از خط فرمان. `import` شدن این ماژول نباید چیزی را اجرا کند.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ DATABASE_URL تنظیم نشده است.');
    process.exit(1);
  }

  runMigrations(url).then(
    () => {
      console.log('✓ مهاجرت‌ها اعمال شدند.');
      process.exit(0);
    },
    (error: unknown) => {
      console.error('✗ مهاجرت شکست خورد:', error);
      process.exit(1);
    },
  );
}
