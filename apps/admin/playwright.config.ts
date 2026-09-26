import { defineConfig, devices } from '@playwright/test';

/**
 * تست سرتاسری پنل روی build تولیدی، مثل سایت. پنل پایگاه داده‌ای می‌خواهد که وب مهاجرت و دادهٔ پایه‌اش را
 * نوشته باشد؛ طرز اجرا بالای `tests/admin.spec.ts`.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_ADMIN_BASE_URL ?? 'http://127.0.0.1:3200',
    ...devices['Desktop Chrome'],
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'node scripts/serve-standalone.mjs 3200',
    url: 'http://127.0.0.1:3200/api/health',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
