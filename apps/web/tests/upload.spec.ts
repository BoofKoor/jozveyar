import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * آپلود واقعی: مرورگر ← نکست ← پستگرس و Garage.
 *
 * تست‌های `flow.spec.ts` بدون استوریج اجرا می‌شوند و فقط ثابت می‌کنند که
 * نبودنش بی‌صداست. این یکی خودِ آپلود را می‌سنجد — قطع شبکه، رفرش، ادامه —
 * پس سرویس‌ها را لازم دارد و بدون `E2E_UPLOAD_BASE_URL` رد می‌شود:
 *
 *   ./infra/garage-init.sh  (یک Garage و یک پستگرس بالا)
 *   DATABASE_URL=… S3_ENDPOINT=… S3_PUBLIC_ENDPOINT=… S3_ACCESS_KEY=… \
 *   S3_SECRET_KEY=… S3_BUCKET=jozveyar NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3300 \
 *     node scripts/serve-standalone.mjs 3300
 *   E2E_UPLOAD_BASE_URL=http://127.0.0.1:3300 npx playwright test upload
 *
 * اگر S3_PUBLIC_ENDPOINT مستقیم آدرس Garage باشد، مسیر میان‌مبدأ (CORS، همان
 * که روز انتقال به آروان پیش می‌آید) سنجیده می‌شود؛ اگر پراکسی هم‌مبدأ جلویش
 * باشد، مسیر Nginx.
 */

const BASE = process.env.E2E_UPLOAD_BASE_URL;
const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

test.skip(!BASE, 'بدون E2E_UPLOAD_BASE_URL — سرویس‌های واقعی لازم است');
test.use({ baseURL: BASE });

/** PDF واقعی ۱۰ صفحه‌ای، با ~۲۰ مگابایت دنبالهٔ بی‌اثر بعد از %%EOF: سه تکه. */
function bigPdf() {
  const pdf = readFileSync(join(FIXTURES, 'plain-bw-10.pdf'));
  const padding = Buffer.alloc(20 * 1024 * 1024, '%');
  return { name: 'jozve-big.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([pdf, padding]) };
}

const partOf = (url: string) => new URL(url).searchParams.get('partNumber') ?? '';
const status = (page: import('@playwright/test').Page) => page.getByTestId('upload-status');

test('آپلود کامل بعد از اولین قیمت، و «فایل رسید»', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
  await expect(page.getByTestId('price-total')).toContainText('61,000', { timeout: 15_000 });
  await expect(status(page)).toContainText('فایل رسید', { timeout: 30_000 });
});

test('قطع شبکه وسط آپلود، و ادامه از همان‌جا', async ({ page, context }) => {
  const puts: string[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'PUT' && r.ok()) puts.push(partOf(r.url()));
  });
  // لینک کند: هر تکه نیم ثانیه، تا وقت قطع کردن باشد.
  await page.route(/partNumber=/, async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });

  await page.goto('/');
  await page.setInputFiles('#jozve-file', bigPdf());
  await expect(status(page)).toContainText('در حال ارسال', { timeout: 15_000 });

  await context.setOffline(true);
  await expect(status(page)).toContainText('اینترنت قطع شد', { timeout: 15_000 });
  await context.setOffline(false);

  await expect(status(page)).toContainText('فایل رسید', { timeout: 60_000 });
  // هر تکه حداقل یک بار رسید؛ چیزی جا نیفتاد.
  expect(new Set(puts)).toEqual(new Set(['1', '2', '3']));
});

test('رفرش وسط آپلود: همان فایل فقط تکه‌های باقی‌مانده را می‌فرستد', async ({ page }) => {
  // فایل واقعی روی دیسک، نه بافر: بافر هر بار تاریخ تغییر تازه می‌گیرد و
  // «همان فایل» شناخته نمی‌شود. کاربر واقعی همان فایل دیسکش را دوباره می‌اندازد.
  const file = join(tmpdir(), 'jozve-big.pdf');
  writeFileSync(file, bigPdf().buffer);
  let putsBeforeReload = 0;
  page.on('response', (r) => {
    if (r.request().method() === 'PUT' && r.ok()) putsBeforeReload += 1;
  });
  // تکهٔ اول سریع، بقیه گیر: وقتی تکهٔ اول رسید، صفحه را می‌بندیم.
  await page.route(/partNumber=[23]&/, () => undefined);

  await page.goto('/');
  await page.setInputFiles('#jozve-file', file);
  await expect.poll(() => putsBeforeReload, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  await page.unroute(/partNumber=[23]&/);
  await page.reload();

  const putsAfter: string[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'PUT' && r.ok()) putsAfter.push(partOf(r.url()));
  });
  await page.setInputFiles('#jozve-file', file);
  await expect(status(page)).toContainText('فایل رسید', { timeout: 60_000 });
  expect(putsAfter.sort()).toEqual(['2', '3']);
});
