/**
 * اجرای خروجی standalone نکست.
 *
 * `next start` با `output: standalone` کار نمی‌کند و خودِ standalone هم
 * `.next/static` و `public/` را کنار خودش لازم دارد. همین مراحل در ایمیج داکر
 * هم تکرار می‌شود، پس یک جا نوشته شده تا لوکال و تولید از هم واگرا نشوند.
 */

import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = new URL('../', import.meta.url).pathname;
const STANDALONE = `${ROOT}.next/standalone/apps/web`;

if (!existsSync(`${STANDALONE}/server.js`)) {
  console.error('خروجی standalone پیدا نشد. اول `next build` را اجرا کنید.');
  process.exit(1);
}

cpSync(`${ROOT}.next/static`, `${STANDALONE}/.next/static`, { recursive: true });
if (existsSync(`${ROOT}public`)) {
  cpSync(`${ROOT}public`, `${STANDALONE}/public`, { recursive: true });
}
// فایل‌های SQL مهاجرت: سرور موقع بالا آمدن اجرایشان می‌کند (instrumentation.ts)
// و از ../../packages/db/migrations نسبت به apps/web می‌خواند.
cpSync(`${ROOT}../../packages/db/migrations`, `${STANDALONE}/../../packages/db/migrations`, {
  recursive: true,
});

const port = process.argv[2] ?? process.env.PORT ?? '3000';
spawn(process.execPath, [`${STANDALONE}/server.js`], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOSTNAME: '0.0.0.0' },
}).on('exit', (code) => process.exit(code ?? 0));
