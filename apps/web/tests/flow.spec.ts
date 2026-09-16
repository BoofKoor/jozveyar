import { expect, test } from '@playwright/test';
import { join } from 'node:path';

// Playwright اجرا را از apps/web شروع می‌کند؛ مسیر نسبی از import.meta
// مستقل‌تر است چون لودر تست به CommonJS ترجمه می‌کند.
const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

/**
 * تست سرتاسری برش «لحظهٔ جادو».
 *
 * چیزی که اینجا اثبات می‌شود و هیچ تست واحدی نمی‌تواند: pdf.js واقعاً در کارگر
 * بالا می‌آید، رندر می‌کند، و قیمت درست روی صفحه می‌نشیند — زیر سقف زمانی.
 */

// locator پایدار: متن «تومان» در پرسش‌های پرتکرار هم هست، پس جست‌وجوی متنی
// نوار قیمت را نمی‌گیرد. testid تنها چیزی است که به بازنویسی متن حساس نیست.
const price = (page: import('@playwright/test').Page) => page.getByTestId('price-total');
const colorPages = (page: import('@playwright/test').Page) =>
  page.getByTestId('stat-color-pages');

test.describe('سئو و بار اولیه', () => {
  test('صفحه سمت سرور رندر می‌شود و متن در HTML خام هست', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    // متن باید در HTML باشد، نه اینکه جاوااسکریپت بسازدش — وگرنه سئو نداریم.
    expect(html).toContain('جزوه‌ات را بینداز');
    expect(html).toContain('سؤال‌های پرتکرار');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toMatch(/<html[^>]+dir="rtl"/);
    expect(html).toMatch(/<html[^>]+lang="fa"/);
  });

  test('pdf.js در باندل اولیه نیست', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // تا وقتی کاربر فایلی نینداخته، هیچ تکه‌ای از pdf.js نباید دانلود شود.
    expect(scripts.filter((url) => /pdf\.?(worker|js)/i.test(url))).toHaveLength(0);
  });

  test('نقشهٔ سایت و robots سالم‌اند', async ({ request }) => {
    expect((await request.get('/sitemap.xml')).ok()).toBe(true);
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap:');
    expect(robots).toContain('Disallow: /api/');
  });

  test('سلامت سرویس', async ({ request }) => {
    const body = await (await request.get('/api/health')).json();
    expect(body.status).toBe('ok');
  });
});

test.describe('تحلیل در مرورگر', () => {
  test('جزوهٔ سادهٔ ۱۰ صفحه‌ای: تعداد صفحه و قیمت درست', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));

    await expect(page.getByTestId('stat-page-count')).toHaveText('10', { timeout: 15_000 });
    // ۱۰ صفحه سیاه‌سفید = ۱۶,۰۰۰ + صحافی ۴۵,۰۰۰ = ۶۱,۰۰۰ تومان
    await expect(price(page)).toContainText('61,000', { timeout: 15_000 });
  });

  test('اسکن زرد ۱۴۷ صفحه‌ای رنگی اعلام نمی‌شود — تلهٔ (الف)', async ({ page }) => {
    await page.goto('/');
    const startedAt = Date.now();
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'yellow-scan-147.pdf'));

    // قیمت سیاه‌سفید ۱۴۷ صفحه: ۲۳۵,۲۰۰ + ۴۵,۰۰۰ صحافی = ۲۸۰,۲۰۰ تومان.
    // اگر تشخیص رنگ می‌شکست، ۲۹۴,۰۰۰ + ۴۵,۰۰۰ = ۳۳۹,۰۰۰ می‌شد.
    await expect(price(page)).toContainText('280,200', { timeout: 30_000 });
    await expect(price(page)).not.toContainText('339,000');

    // و شمارندهٔ صفحات رنگی صفر می‌مانَد — این خودِ ادعاست، نه قیمت.
    await expect(colorPages(page)).toHaveText('0');
    await expect(page.getByTestId('stat-page-count')).toHaveText('147');

    console.log(`اسکن زرد ۱۴۷ صفحه‌ای: قیمت در ${Date.now() - startedAt}ms`);
  });

  test('هایلایت واقعی رنگی تشخیص داده می‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'mixed-color-10.pdf'));
    // سه صفحه هایلایت قرمز دارند.
    await expect(colorPages(page)).toHaveText('3', { timeout: 20_000 });
  });

  test('تغییر تنظیمات قیمت را زنده عوض می‌کند', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 15_000 });

    // رنگی: ۱۰ × ۲,۰۰۰ + ۴۵,۰۰۰ = ۶۵,۰۰۰
    await page.getByRole('radio', { name: 'رنگی' }).click();
    await expect(price(page)).toContainText('65,000');

    // دو نسخه: ۶۵,۰۰۰ × ۲ = ۱۳۰,۰۰۰
    await page.getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(price(page)).toContainText('130,000');
  });

  test('ارسال قبل از انتخاب شهر هم اعلام می‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
    // «+ ارسال از ۱۲۹,۵۰۰ تومان» — پرش قیمت در مرحلهٔ آدرس را حذف می‌کند.
    await expect(page.getByTestId('shipping-from')).toContainText('129,500', {
      timeout: 15_000,
    });
  });

  test('بدون ثبت‌نام: هیچ فرم ورودی هویتی روی صفحه نیست', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 15_000 });
    // تز محصول: قیمت قبل از هویت. تنها ورودی متنی، تعداد نسخه است.
    const textInputs = page.locator('input:not([type="file"]):not([type="number"])');
    await expect(textInputs).toHaveCount(0);
  });
});

test.describe('بن‌بست نداریم', () => {
  test('فایل Word به مسیر سرور می‌رود، نه خطا', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', {
      name: 'jozve.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK not a real docx'),
    });
    await expect(page.getByText('این فایل سمت سرور بررسی می‌شود')).toBeVisible();
    // و راه جلو دارد
    await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toBeVisible();
  });

  test('PDF خراب پیام روشن و راه جلو می‌دهد', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', {
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 this is not a real pdf at all'),
    });
    await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toBeVisible({
      timeout: 20_000,
    });
    // پیام نباید کاربر را به جایی بیرون سایت بفرستد.
    await expect(page.getByText('تلگرام')).toHaveCount(0);
  });
});

test.describe('موبایل', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('نوار قیمت در موبایل چسبان پایین می‌ماند', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });

    await page.mouse.wheel(0, 2000);
    const bar = price(page);
    await expect(bar).toBeInViewport();
  });

  test('صفحه در عرض موبایل افقی اسکرول نمی‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('کارایی روی موبایل ضعیف', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * سنجهٔ پذیرش تلهٔ (ب): زیر ۲ ثانیه تا اولین قیمت برای یک جزوهٔ اسکن‌شدهٔ
   * ۱۴۷ صفحه‌ای.
   *
   * دستگاه اندروید قدیمی در دسترس نیست، پس پردازنده ۴ برابر کند می‌شود — روش
   * استانداردِ تقریب گوشی میان‌رده. عدد واقعی روی گوشی واقعی باید دوباره
   * سنجیده شود؛ این تست فقط جلوی پس‌رفت را می‌گیرد.
   */
  test('اولین قیمت زیر ۲ ثانیه، با پردازندهٔ ۴ برابر کند', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const startedAt = Date.now();
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'yellow-scan-147.pdf'));
    // اولین قیمت، نه قیمت نهایی: به محض هشت صفحهٔ اول عدد روی صفحه می‌آید.
    await expect(price(page)).toContainText('280,200', { timeout: 20_000 });
    const firstPriceMs = Date.now() - startedAt;

    console.log(`اولین قیمت با throttle 4×: ${firstPriceMs}ms`);
    expect(firstPriceMs).toBeLessThan(2_000);

    // و تحلیل تا آخر کامل می‌شود، بدون اینکه عدد عوض شود.
    await expect(page.getByTestId('stat-color-pages')).toHaveText('0', { timeout: 30_000 });
    await expect(price(page)).toContainText('280,200');
  });
});
