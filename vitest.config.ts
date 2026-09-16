import { defineConfig } from 'vitest/config';

/**
 * تست واحد فقط در پکیج‌ها.
 *
 * تست سرتاسری Playwright است و اجرا کننده‌اش خودش (`pnpm test:e2e`).
 * بدون این جداسازی، vitest فایل spec پلی‌رایت را برمی‌دارد و در collect می‌شکند.
 */
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', 'apps/**'],
  },
});
