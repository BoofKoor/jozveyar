import { defineConfig, devices } from '@playwright/test';

/**
 * تست سرتاسری روی build تولیدی، نه dev server.
 *
 * دلیل: باندل dev و تولیدی یکی نیستند و اتفاقاً همان چیزی که می‌خواهیم بسنجیم
 * (اندازهٔ باندل اولیه و تنبل بودن pdf.js) فقط در build تولیدی معنا دارد.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    ...devices['Desktop Chrome'],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      // نشان اینماد تنها منبع بیرونی سایت است (ADR-032). تست‌ها به سرور اینماد بند نیستند: نامش «پیدا
      // نشد» می‌شود و درخواست همان لحظه می‌افتد، نه اینکه اگر CI به آن نرسید `networkidle` گیر کند.
      // درخواست هنوز دیده می‌شود؛ `site.spec.ts` خودش و Referer آن را می‌سنجد.
      args: ['--host-resolver-rules=MAP trustseal.enamad.ir ~NOTFOUND'],
    },
  },
  webServer: {
    command: 'node scripts/serve-standalone.mjs 3100',
    url: 'http://127.0.0.1:3100/api/health',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
