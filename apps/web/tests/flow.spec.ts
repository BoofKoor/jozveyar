import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * سقف باندل اولیهٔ صفحهٔ اصلی، کیلوبایت (۱۰۰۰ بایت، مثل `next build`). عدد اندازه‌گرفته
 * در CLAUDE.md است؛ سقف همان به‌علاوهٔ حدود ۳ کیلوبایت. از ۴ب (تصمیم صاحب پروژه): ۱۰۷٫۷ و سقف ۱۱۱،
 * چون رابط پس از فایل و موتور قیمت تکهٔ جدا شدند؛ با سقف پیشین (۱۲۱) برگشت اشتباهی همان رابط به
 * باندل اولیه (۱۱۹٫۶، سنجیده) از تست اندازه رد می‌شد.
 */
const INITIAL_JS_BUDGET_KB = 111;

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
/**
 * صفحه‌های رنگی در راهنمای «رنگ چاپ» (کارت «جزوهٔ تو»، docs/UI.md). حکم قطعی فقط بعد از بررسی همهٔ
 * صفحه‌ها می‌آید، پس هر ادعای «صفر صفحهٔ رنگی» پایان بررسی را هم می‌سنجد.
 */
const colorHint = (page: import('@playwright/test').Page) => page.getByTestId('color-hint');
const ALL_BW = 'فایل تماماً سیاه‌سفید است.';

test.describe('سئو و بار اولیه', () => {
  test('صفحه سمت سرور رندر می‌شود و متن در HTML خام هست', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    // متن باید در HTML باشد، نه اینکه جاوااسکریپت بسازدش — وگرنه سئو نداریم.
    expect(html).toContain('جزوه‌ات را بینداز');
    expect(html).toContain('<mark>همین حالا</mark>');
    expect(html).toContain('سه قدم تا جزوهٔ چاپ‌شده');
    expect(html).toContain('تعرفه، بی هزینهٔ پنهان');
    expect(html).toContain('جزوه‌ات را همین‌جا بینداز');
    expect(html).toContain('سؤال‌های پرتکرار');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toMatch(/<html[^>]+dir="rtl"/);
    expect(html).toMatch(/<html[^>]+lang="fa"/);
  });

  /**
   * باندل اولیهٔ صفحهٔ اصلی، اندازه‌گرفته نه فرض‌شده: همهٔ اسکریپت‌هایی که مرورگر پیش از
   * هر تعاملی می‌گیرد، هر کدام gzip سطح ۹ — همان سنجهٔ «First Load JS» که `next build`
   * چاپ می‌کند، مستقل از فشرده‌سازی سرور. سقف را فقط آگاهانه بالا ببر: عدد تازه و دلیلش
   * در CLAUDE.md.
   *
   * و با **محتوا**، نه نام فایل: chunkها نام عددی دارند، پس pdf.js یا آپلودگری که ایستا
   * وارد صفحه شود، از جست‌وجوی نام (تست پایین) رد می‌شد. هر نشانه رشته‌ای است که
   * کوچک‌سازی عوضش نمی‌کند.
   */
  test('باندل اولیهٔ صفحهٔ اصلی زیر سقف، بی pdf.js و آپلودگر و خوانندهٔ Word و zod و رابط پس از فایل و مسیر خرید', async ({ page }) => {
    const bodies = new Map<string, Promise<Buffer | null>>();
    page.on('response', (response) => {
      if (response.request().resourceType() !== 'script') return;
      bodies.set(response.url(), response.body().catch(() => null));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const scripts = (await Promise.all(bodies.values())).filter((body): body is Buffer => body !== null);
    const gzipBytes = scripts.reduce((sum, body) => sum + gzipSync(body, { level: 9 }).length, 0);
    console.log(`باندل اولیه: ${(gzipBytes / 1000).toFixed(1)} kB در ${scripts.length} اسکریپت (سقف ${INITIAL_JS_BUDGET_KB} kB)`);
    expect(scripts.length).toBeGreaterThan(0);
    expect(gzipBytes).toBeLessThanOrEqual(INITIAL_JS_BUDGET_KB * 1000);

    // نشانهٔ فارسی هم بایت‌های UTF-8 خودش است، همان‌طور که در کد کوچک‌شده می‌آید
    const code = scripts.map((body) => body.toString('latin1')).join('\n');
    for (const [marker, module] of [
      ['GlobalWorkerOptions', 'pdf.js'],
      ['jy.upload.', 'آپلودگر'],
      ['docProps/app.xml', 'خوانندهٔ فهرست zip (پیش‌فاکتور Word)'],
      ['ZodError', 'zod'],
      // رابط پس از فایل و موتور قیمت با اولین فایل (یا نشانهٔ قصد) بار می‌شوند، نه با صفحه (docs/UI.md، ۴ب)
      ['home-sum__total', 'رابط پس از فایل (خلاصهٔ سفارش)'],
      ['binding_band_missing', 'موتور قیمت (quote)'],
      // مسیر خرید و فهرست شهرها با «ادامه» بار می‌شوند (docs/UI.md، ۳ج)؛ شاهدش در `checkout.spec.ts`
      ['ck-cities', 'مسیر خرید (قدم شهر)'],
      ['/api/checkout/otp', 'مسیر خرید (کد پیامکی)'],
      ['بندرعباس', 'فهرست شهرها (@jozveyar/geo)'],
    ] as const) {
      expect(code.includes(Buffer.from(marker).toString('latin1')), `${module} در باندل اولیه آمده`).toBe(false);
    }
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

    // و صفحهٔ رنگی‌ای پیدا نمی‌شود — این خودِ ادعاست، نه قیمت. «تماماً» فقط بعد از بررسی هر ۱۴۷ صفحه.
    await expect(colorHint(page)).toHaveText(ALL_BW, { timeout: 30_000 });
    await expect(page.getByTestId('stat-page-count')).toHaveText('147');

    console.log(`اسکن زرد ۱۴۷ صفحه‌ای: قیمت در ${Date.now() - startedAt}ms`);
  });

  /**
   * اسکن واقعی — هر صفحه یک تصویر، نه مستطیل برداری.
   *
   * این تست بعد از اولین آزمایش روی گوشی واقعی اضافه شد: هر PDF اسکن‌شده با
   * «تحلیل در مرورگر کامل نشد» می‌افتاد، چون pdf.js برای کشیدن تصویر بوم کمکی
   * را با `document` می‌سازد و کارگر `document` ندارد. نمونه‌های قبلی همه
   * برداری بودند و به این مسیر نمی‌رسیدند.
   */
  test('اسکن تصویری واقعی خوانده می‌شود و رنگی اعلام نمی‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'image-scan-6.pdf'));
    // ۶ صفحه سیاه‌سفید: ۹,۶۰۰ + صحافی ۴۵,۰۰۰ = ۵۴,۶۰۰ تومان
    await expect(price(page)).toContainText('54,600', { timeout: 15_000 });
    await expect(page.getByTestId('stat-page-count')).toHaveText('6');
    await expect(colorHint(page)).toHaveText(ALL_BW, { timeout: 15_000 });
    await expect(page.getByText('تحلیل در مرورگر کامل نشد')).toHaveCount(0);
  });

  test('هایلایت واقعی رنگی تشخیص داده می‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'mixed-color-10.pdf'));
    // سه صفحه هایلایت قرمز دارند.
    await expect(colorHint(page)).toHaveText(
      '3 صفحهٔ رنگی در فایل پیدا شد. اگر سیاه‌سفید انتخاب کنی، این صفحه‌ها هم سیاه‌سفید چاپ می‌شوند.',
      { timeout: 20_000 },
    );
  });

  /**
   * هشدار جای مشکل را نام می‌برد و DPI از جای واقعی تصویر است (ADR-029): لوگوی
   * کوچک صفحهٔ ۱ و تصویری که داخل فرم نیم‌مقیاس صفحهٔ ۴ نشسته هشدار کیفیت
   * نمی‌گیرند. فرمول قدیمی به صفحهٔ ۱ «۴ DPI» می‌داد و هر چهار صفحه را نام می‌برد.
   */
  test('هشدار کیفیت فقط صفحهٔ واقعاً بی‌کیفیت را نام می‌برد', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'dpi-mix-4.pdf'));
    await expect(page.getByTestId('stat-page-count')).toHaveText('4', { timeout: 15_000 });
    await expect(page.getByTestId('warning-low-dpi')).toHaveText(
      'صفحهٔ 2 کیفیت اسکن یا عکس پایینی دارد و کمی مات چاپ می‌شود.',
      { timeout: 15_000 },
    );
    await expect(page.getByTestId('warning-tight-margin')).toContainText('صفحه‌های 3 و 4');
    await expect(page.getByTestId('warning-blank')).toHaveCount(0);
  });

  test('اسکنی که در ظاهر یک مهر نشسته هم جای واقعی‌اش سنجیده می‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'stamp-scan-1.pdf'));
    await expect(page.getByTestId('stat-page-count')).toHaveText('1', { timeout: 15_000 });
    // همان ۱۸ DPI سرور؛ بی دنبال کردن جای حاشیه‌نویسی، تصویر «۱ پوینتی» بود و هشداری نمی‌آمد.
    await expect(page.getByTestId('warning-low-dpi')).toContainText('صفحهٔ 1', { timeout: 15_000 });
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
    // تز محصول: قیمت قبل از هویت. تنها ورودی‌ها رادیوهای «تنظیمات چاپ» (رنگ، یکرو یا دورو) و
    // تعداد نسخه‌اند؛ هیچ فیلد متنی نیست.
    await expect(page.locator('input[type="radio"]')).toHaveCount(4);
    const textInputs = page.locator('input:not([type="file"]):not([type="number"]):not([type="radio"])');
    await expect(textInputs).toHaveCount(0);
  });
});

/**
 * Word، پاورپوینت و عکس (ADR-028). اینجا استوریج نیست، پس تبدیل سرور هرگز
 * نمی‌رسد؛ چیزی که سنجیده می‌شود پیش‌فاکتور فوری مرورگر است و اینکه نبودن سرور
 * بن‌بست نمی‌سازد. تبدیل واقعی در `upload.spec.ts`.
 */
test.describe('Word، پاورپوینت و عکس', () => {
  test('Word: قیمت فوری از عددی که خود Word نوشته', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'jozve-12.docx'));
    await expect(page.getByTestId('stat-page-count')).toHaveText('12');
    // ۱۲ صفحه سیاه‌سفید: ۱۹,۲۰۰ + صحافی ۴۵,۰۰۰ = ۶۴,۲۰۰ تومان — پیش‌فاکتور.
    await expect(price(page)).toContainText('64,200');
    await expect(page.getByTestId('office-estimate')).toBeVisible();
    // رنگ Word را فقط سرور بعد از تبدیل می‌داند؛ نه «صفر»، نه «تماماً».
    await expect(colorHint(page)).toHaveText('رنگی بودن صفحه‌ها بعد از بررسی روی سرور معلوم می‌شود.');
    // سرور نیست: قیمت تقریبی می‌ماند و راه جلو گفته می‌شود — نه خطا، نه انتظار بی‌پایان.
    await expect(page.getByTestId('estimate-unconfirmed')).toContainText('خروجی PDF');
  });

  test('پاورپوینت: اسلاید مخفی شمرده نمی‌شود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'slides-21.pptx'));
    await expect(page.getByTestId('stat-page-count')).toHaveText('21');
    await expect(page.getByTestId('office-estimate')).toContainText('پاورپوینت');
  });

  test('عکس: یک صفحه، قیمت فوری', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', join(FIXTURES, 'scan-photo.png'));
    await expect(page.getByTestId('stat-page-count')).toHaveText('1');
    // ۱ صفحه سیاه‌سفید: ۱,۶۰۰ + صحافی ۴۵,۰۰۰ = ۴۶,۶۰۰ تومان
    await expect(price(page)).toContainText('46,600');
  });

  test('Word بدون شمارهٔ صفحه: مسیر سرور، و بدون سرور راه جلو', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', {
      name: 'jozve.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK not a real docx'),
    });
    await expect(page.getByTestId('server-path')).toBeVisible();
    await expect(page.getByText('چند دقیقهٔ دیگر دوباره بینداز')).toBeVisible();
    await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toBeVisible();
  });
});

test.describe('بن‌بست نداریم', () => {
  test('نوع فایل ناشناخته پیام روشن و راه جلو می‌دهد', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', {
      name: 'jozve.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK'),
    });
    await expect(page.getByText('این نوع فایل را نمی‌گیریم')).toBeVisible();
    await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toBeVisible();
  });

  test('PDF خراب پیام روشن و راه جلو می‌دهد', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', {
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 this is not a real pdf at all'),
    });
    // خود پیام، نه فقط دکمه: ✕ کارت در حال بررسی هم همین نام را دارد و زودتر دیده می‌شد
    await expect(page.getByTestId('file-error')).toContainText('این فایل خوانده نشد', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'فایل دیگری بینداز' })).toHaveText('فایل دیگری بینداز');
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
    await expect(colorHint(page)).toHaveText(ALL_BW, { timeout: 30_000 });
    await expect(price(page)).toContainText('280,200');
  });
});
