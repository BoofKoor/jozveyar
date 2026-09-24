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

/*
 * تحلیل سرور (ADR-025) — این سه تست کارگر اسناد را هم لازم دارند
 * (`python -m docworker` با همان متغیرهای محیطی).
 */

test('هشدار بعد از بررسی سرور همان صفحه‌ها را نام می‌برد که مرورگر (ADR-029)', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'dpi-mix-4.pdf'));
  await expect(status(page)).toContainText('همهٔ صفحات بررسی شد', { timeout: 60_000 });
  // حالا کارت عدد سرور را نشان می‌دهد: DPI از PyMuPDF، همان فرمول (بردارهای هم‌ارزی).
  await expect(page.getByTestId('warning-low-dpi')).toHaveText(
    'صفحهٔ 2 کیفیت اسکن یا عکس پایینی دارد و کمی مات چاپ می‌شود.',
  );
  await expect(page.getByTestId('warning-tight-margin')).toContainText('صفحه‌های 3 و 4');
});

test('بعد از رسیدن فایل، سرور همهٔ صفحات را بررسی می‌کند و قیمت همان می‌ماند', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'image-scan-6.pdf'));
  await expect(page.getByTestId('price-total')).toContainText('54,600', { timeout: 15_000 });
  await expect(status(page)).toContainText('همهٔ صفحات بررسی شد', { timeout: 60_000 });
  // سرور همان ۶ صفحه را دید؛ قیمت عوض نشد و یادداشت اصلاح نیامد.
  await expect(page.getByTestId('price-total')).toContainText('54,600');
  await expect(page.getByTestId('server-corrected')).toHaveCount(0);
  await expect(page.getByTestId('stat-color-pages')).toHaveText('0');
});

test('PDF بزرگ‌تر از توان مرورگر: قیمت از سرور می‌آید، نه بن‌بست', async ({ page }) => {
  // اسکن ۶ صفحه‌ای + ۱۵۱ مگابایت دنبالهٔ بی‌اثر: از سقف ۱۵۰ مگابایتی مرورگر رد
  // می‌شود، پس فقط سرور می‌تواند بخواندش.
  const file = join(tmpdir(), 'jozve-huge.pdf');
  writeFileSync(
    file,
    Buffer.concat([readFileSync(join(FIXTURES, 'image-scan-6.pdf')), Buffer.alloc(151 * 1024 * 1024, '%')]),
  );

  await page.goto('/');
  await page.setInputFiles('#jozve-file', file);
  await expect(page.getByTestId('server-path')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('price-total')).toContainText('54,600', { timeout: 180_000 });
  await expect(page.getByTestId('stat-page-count')).toHaveText('6');
});

/*
 * تبدیل روی سرور (ADR-028) — کارگر اسناد با LibreOffice لازم است (ایمیج پایه،
 * یا هر جا `soffice` و فونت‌های ایمیج نصب باشد).
 */

test('Word: پیش‌فاکتور فوری، بعد عدد سرور از PDF تبدیل‌شده', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'jozve-12.docx'));
  // خود فایل می‌گوید ۱۲ صفحه (Word با فونت‌های کاربر): ۱۹,۲۰۰ + ۴۵,۰۰۰.
  await expect(page.getByTestId('price-total')).toContainText('64,200', { timeout: 15_000 });
  await expect(status(page)).toContainText('همهٔ صفحات بررسی شد', { timeout: 120_000 });
  // LibreOffice با Nazli (جای B Nazanin) ۶ صفحه دید؛ قیمت همان می‌شود و کاربر می‌داند چرا.
  await expect(page.getByTestId('stat-page-count')).toHaveText('6');
  await expect(page.getByTestId('price-total')).toContainText('54,600');
  await expect(page.getByTestId('server-corrected')).toContainText('خود فایل Word');
  await expect(page.getByTestId('office-estimate')).toHaveCount(0);
  // و علتش را هم می‌بیند، با راه جلو (ADR-029): Nazli هم‌اندازهٔ B Nazanin نیست.
  // با فونت خصوصی واقعی روی سرور (ADR-027) نه جایگزینی هست نه این هشدار.
  await expect(page.getByTestId('warning-fonts')).toHaveText(
    'فونت B Nazanin روی سرور ما نیست و با فونت مشابه چاپ می‌شود؛ ظاهر و تعداد صفحه ممکن است' +
      ' فرق کند. برای چاپ دقیقاً مثل فایل خودت، از Word خروجی PDF بگیر و همان را بینداز.',
  );
});

test('عکس: روی سرور یک صفحه می‌شود و رنگش سنجیده می‌شود', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'scan-photo.png'));
  await expect(page.getByTestId('price-total')).toContainText('46,600', { timeout: 15_000 });
  await expect(status(page)).toContainText('همهٔ صفحات بررسی شد', { timeout: 60_000 });
  await expect(page.getByTestId('stat-color-pages')).toHaveText('0');
  await expect(page.getByTestId('price-total')).toContainText('46,600');
});

test('Word خراب: پیام روشن سرور و راه جلو، نه انتظار بی‌پایان', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', {
    name: 'jozve-broken.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('PK\x03\x04 not really a docx'),
  });
  await expect(page.getByTestId('server-path')).toBeVisible();
  // zip خراب: کارگر محتوا را می‌سنجد و Word نمی‌شناسدش (unsupported_format).
  await expect(page.getByText('محتوای این فایل با پسوندش جور نیست')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toBeVisible();
});

/*
 * جزوهٔ چندفایلی (ADR-030) — آپلودها پشت‌سرهم، هر لحظه یکی؛ و قیمت جزوه جمع شمارش‌های
 * سرور. کارگر اسناد را هم لازم دارد.
 */

/** کلید شیء از URL امضاشدهٔ تکه: `…/uploads/<id>.<ext>?partNumber=…`. */
const objectOf = (url: string) => new URL(url).pathname.split('/').pop() ?? '';

test('جزوهٔ سه‌فایلی: آپلودها روی هم نمی‌افتند و قیمت جمع شمارش‌های سرور است', async ({ page }) => {
  const spans = new Map<string, { start: number; end: number }>();
  page.on('request', (request) => {
    if (request.method() !== 'PUT' || !/partNumber=/.test(request.url())) return;
    const key = objectOf(request.url());
    const span = spans.get(key);
    spans.set(key, { start: span?.start ?? Date.now(), end: span?.end ?? Date.now() });
  });
  page.on('requestfinished', (request) => {
    if (request.method() !== 'PUT' || !/partNumber=/.test(request.url())) return;
    const span = spans.get(objectOf(request.url()));
    if (span) span.end = Date.now();
  });

  await page.goto('/');
  await page.setInputFiles('#jozve-file', [
    bigPdf(),
    { name: 'jozve-scan.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(FIXTURES, 'image-scan-6.pdf')) },
    { name: 'jozve-mixed.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(FIXTURES, 'mixed-color-10.pdf')) },
  ]);
  const uploads = page.getByTestId('section-upload');
  await expect(uploads.filter({ hasText: 'همهٔ صفحات بررسی شد' })).toHaveCount(3, { timeout: 120_000 });

  // سه سند، هر کدام بعد از رسیدن کامل قبلی: هیچ تکه‌ای از یکی وسط تکه‌های دیگری نیست.
  const ordered = [...spans.values()].sort((a, b) => a.start - b.start);
  expect(ordered).toHaveLength(3);
  for (let i = 1; i < ordered.length; i += 1) expect(ordered[i]!.start).toBeGreaterThanOrEqual(ordered[i - 1]!.end);

  // سرور منبع حقیقت است: ۱۰ + ۶ + ۱۰ صفحه، یک صحافی — همان قیمت مرورگر.
  await expect(page.getByTestId('stat-page-count')).toHaveText('26');
  await expect(page.getByTestId('price-total')).toContainText('86,600');
  await expect(page.getByTestId('stat-color-pages')).toHaveText('3');
});

test('شش فایل — بیشتر از سقف پنج آپلود باز هر نشست — همه می‌رسند', async ({ page }) => {
  const pdf = readFileSync(join(FIXTURES, 'plain-bw-10.pdf'));
  await page.goto('/');
  await page.setInputFiles(
    '#jozve-file',
    Array.from({ length: 6 }, (_, i) => ({ name: `jozve-part-${i + 1}.pdf`, mimeType: 'application/pdf', buffer: pdf })),
  );
  const uploads = page.getByTestId('section-upload');
  await expect(uploads.filter({ hasText: 'فایل رسید' })).toHaveCount(6, { timeout: 120_000 });
  await expect(page.getByTestId('section-blocked')).toHaveCount(0);
  await expect(page.getByTestId('stat-page-count')).toHaveText('60');
});
