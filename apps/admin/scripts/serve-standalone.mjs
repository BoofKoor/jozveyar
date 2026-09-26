/**
 * اجرای خروجی standalone پنل، مثل `apps/web/scripts/serve-standalone.mjs`: standalone خودش `.next/static` و
 * `public/` را کنار خودش لازم دارد؛ همین مراحل در مونتاژ بستهٔ CI هم هست.
 *
 * پنل مهاجرت اجرا نمی‌کند (آن با وب است)؛ پایگاه داده باید پیش‌تر با وب بالا آمده باشد.
 */

import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = new URL('../', import.meta.url).pathname;
const STANDALONE = `${ROOT}.next/standalone/apps/admin`;

if (!existsSync(`${STANDALONE}/server.js`)) {
  console.error('خروجی standalone پنل پیدا نشد. اول `pnpm --filter @jozveyar/admin build` را اجرا کنید.');
  process.exit(1);
}

cpSync(`${ROOT}.next/static`, `${STANDALONE}/.next/static`, { recursive: true });
cpSync(`${ROOT}public`, `${STANDALONE}/public`, { recursive: true });

const port = process.argv[2] ?? process.env.PORT ?? '3200';
spawn(process.execPath, [`${STANDALONE}/server.js`], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOSTNAME: '127.0.0.1' },
}).on('exit', (code) => process.exit(code ?? 0));
