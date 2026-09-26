import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * جزوهٔ چندفایلی (ADR-030): چند فایل، یک جزوه، یک صحافی، یک قیمت.
 *
 * مثل `flow.spec.ts` بدون استوریج: آپلود بی‌صدا «در دسترس نیست» می‌گیرد و قیمت از مرورگر
 * و پیش‌فاکتورهاست. آپلود پشت‌سرهم روی سرویس واقعی در `upload.spec.ts` است.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);
/** همان بایت‌های یک نمونه، با نام دیگر — ترتیب جزوه از نام است. */
const renamed = (source: string, name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: readFileSync(fixture(source)),
});

const price = (page: Page) => page.getByTestId('price-total');
const rows = (page: Page) => page.getByTestId('section');
const row = (page: Page, name: string) => rows(page).filter({ has: page.getByTestId('section-name').getByText(name, { exact: true }) });
const names = (page: Page) => page.getByTestId('section-name').allTextContents();
/**
 * «ادامه» وقتی جزوه کامل و بی فایل خوانده‌نشده است. این تست‌ها بی پایگاه داده اجرا می‌شوند، پس مسیر خرید
 * خاموش است و «ادامه» همان «ثبت سفارش آنلاین به‌زودی» (ADR-035، برش ۳ج)؛ مسیر خرید باز در `checkout.spec.ts`.
 */
const ready = (page: Page) => page.getByRole('button', { name: 'ثبت سفارش آنلاین به‌زودی' });

test.describe('چند فایل در یک جزوه', () => {
  test('سه PDF با هم: صفحه‌ها جمع و یک صحافی — ۸۶,۶۰۰ نه ۱۷۶,۶۰۰', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      fixture('plain-bw-10.pdf'),
      fixture('image-scan-6.pdf'),
      fixture('mixed-color-10.pdf'),
    ]);
    await expect(rows(page)).toHaveCount(3);
    // ۲۶ صفحه سیاه‌سفید: ۴۱,۶۰۰ + یک صحافی ۴۵,۰۰۰. سه سفارش جدا سه صحافی می‌خورد.
    await expect(page.getByTestId('stat-page-count')).toHaveText('26', { timeout: 20_000 });
    await expect(price(page)).toContainText('86,600');
    // رنگ هر فایل جدا بررسی شده و جمع می‌شود: سه صفحهٔ هایلایت‌دار mixed-color، در راهنمای «رنگ چاپ».
    await expect(page.getByTestId('color-hint')).toHaveText(
      '3 صفحهٔ رنگی در فایل‌های این جزوه پیدا شد. اگر سیاه‌سفید انتخاب کنی، این صفحه‌ها هم سیاه‌سفید چاپ می‌شوند.',
      { timeout: 20_000 },
    );
    await expect(ready(page)).toBeVisible();
  });

  test('ترتیب اولیه از نام، با فهم عدد؛ جابه‌جایی فقط ترتیب است', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      renamed('plain-bw-10.pdf', 'جلسه 10.pdf'),
      renamed('image-scan-6.pdf', 'جلسه 2.pdf'),
      renamed('plain-bw-10.pdf', 'جلسه ۱.pdf'),
    ]);
    await expect.poll(() => names(page)).toEqual(['جلسه ۱.pdf', 'جلسه 2.pdf', 'جلسه 10.pdf']);
    // ۲۶ صفحه: ۴۱,۶۰۰ + ۴۵,۰۰۰
    await expect(price(page)).toContainText('86,600', { timeout: 20_000 });

    await page.getByRole('button', { name: '«جلسه 10.pdf» یکی بالاتر' }).click();
    await expect.poll(() => names(page)).toEqual(['جلسه ۱.pdf', 'جلسه 10.pdf', 'جلسه 2.pdf']);
    await expect(price(page)).toContainText('86,600');
    await expect(page.getByRole('button', { name: '«جلسه ۱.pdf» یکی بالاتر' })).toBeDisabled();
  });

  test('حذف قیمت را عوض می‌کند؛ با یک فایل کارت همیشگی برمی‌گردد، با صفر محل انداختن', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(price(page)).toContainText('70,600', { timeout: 20_000 });

    await page.getByRole('button', { name: '«image-scan-6.pdf» را از جزوه بردار' }).click();
    // یک فایل: همان کارت و همان قیمت تک‌فایلی.
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByTestId('stat-page-count')).toHaveText('10');
    await expect(price(page)).toContainText('61,000');

    await page.getByRole('button', { name: 'فایل دیگری بینداز' }).click();
    await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
  });

  test('فایل بعدی را می‌شود به همان جزوه اضافه کرد', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 15_000 });
    await page.setInputFiles('#jozve-add', [fixture('image-scan-6.pdf')]);
    await expect.poll(() => names(page)).toEqual(['plain-bw-10.pdf', 'image-scan-6.pdf']);
    await expect(price(page)).toContainText('70,600', { timeout: 20_000 });
  });

  test('هشدار زیر همان فایل و با شمارهٔ صفحهٔ خود آن فایل', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('dpi-mix-4.pdf')]);
    await expect(row(page, 'dpi-mix-4.pdf').getByTestId('warning-low-dpi')).toHaveText(
      'صفحهٔ 2 کیفیت اسکن یا عکس پایینی دارد و کمی مات چاپ می‌شود.',
      { timeout: 20_000 },
    );
    await expect(row(page, 'dpi-mix-4.pdf').getByTestId('warning-tight-margin')).toContainText('صفحه‌های 3 و 4');
    await expect(row(page, 'plain-bw-10.pdf').getByTestId('warning-low-dpi')).toHaveCount(0);
  });

  test('PDF، Word و عکس با هم: پیش‌فاکتور فوری، و بدون سرور راه جلو برای هر فایل', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      fixture('plain-bw-10.pdf'),
      fixture('jozve-12.docx'),
      fixture('scan-photo.png'),
    ]);
    // ۱۰ + ۱۲ (خود Word نوشته) + ۱ عکس = ۲۳ صفحه: ۳۶,۸۰۰ + ۴۵,۰۰۰
    await expect(page.getByTestId('stat-page-count')).toHaveText('23', { timeout: 20_000 });
    await expect(price(page)).toContainText('81,800');
    await expect(row(page, 'jozve-12.docx').getByTestId('section-status')).toContainText('به گفتهٔ خود فایل Word');
    // استوریج نیست: عدد Word تقریبی می‌ماند و راه جلو گفته می‌شود — نه خطا، نه انتظار بی‌پایان.
    await expect(row(page, 'jozve-12.docx').getByTestId('section-unconfirmed')).toContainText('خروجی PDF', {
      timeout: 20_000,
    });
  });

  test('PDF خراب وسط دو فایل: پیام و دو راه جلو، قیمت بی آن، و جایگزینی همان‌جا', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      renamed('plain-bw-10.pdf', 'فصل 1.pdf'),
      { name: 'فصل 2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 not really a pdf') },
      renamed('image-scan-6.pdf', 'فصل 3.pdf'),
    ]);
    const broken = row(page, 'فصل 2.pdf');
    await expect(broken.getByTestId('section-blocked')).toContainText('این فایل خوانده نشد', { timeout: 20_000 });
    // بقیه ادامه دادند: ۱۶ صفحه، ۲۵,۶۰۰ + ۴۵,۰۰۰.
    await expect(price(page)).toContainText('70,600', { timeout: 20_000 });
    await expect(page.getByTestId('price-blocked')).toContainText('فصل 2.pdf');
    await expect(page.getByRole('button', { name: 'اول تکلیف فایل خوانده‌نشده را روشن کن' })).toBeDisabled();
    await expect(page.getByText('تلگرام')).toHaveCount(0);

    const chooser = page.waitForEvent('filechooser');
    await broken.getByRole('button', { name: 'جایگزین کن' }).click();
    await (await chooser).setFiles(fixture('mixed-color-10.pdf'));
    await expect.poll(() => names(page)).toEqual(['فصل 1.pdf', 'mixed-color-10.pdf', 'فصل 3.pdf']);
    await expect(price(page)).toContainText('86,600', { timeout: 20_000 });
    await expect(page.getByTestId('price-blocked')).toHaveCount(0);
    await expect(ready(page)).toBeVisible({ timeout: 20_000 });
  });

  test('هر لحظه حداکثر یک کارگر تحلیل — یک pdf.js برای کل صف', async ({ page }) => {
    let alive = 0;
    let most = 0;
    let spawned = 0;
    page.on('worker', (worker) => {
      if (/pdf\.worker/.test(worker.url())) return; // کارگر درونی خود pdf.js
      spawned += 1;
      alive += 1;
      most = Math.max(most, alive);
      worker.on('close', () => {
        alive -= 1;
      });
    });
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      fixture('plain-bw-10.pdf'),
      fixture('image-scan-6.pdf'),
      fixture('mixed-color-10.pdf'),
      fixture('dpi-mix-4.pdf'),
    ]);
    await expect(page.getByTestId('stat-page-count')).toHaveText('30', { timeout: 20_000 });
    await expect(ready(page)).toBeVisible({ timeout: 20_000 });
    expect(spawned).toBe(1);
    expect(most).toBe(1);
    // صف خالی شد: کارگر و حافظهٔ pdf.js آزاد شدند.
    await expect.poll(() => alive).toBe(0);
  });

  test('بیش از سی فایل اضافه نمی‌شود و نام بقیه گفته می‌شود', async ({ page }) => {
    await page.goto('/');
    const pdf = readFileSync(fixture('plain-bw-10.pdf'));
    await page.setInputFiles(
      '#jozve-file',
      Array.from({ length: 31 }, (_, i) => ({ name: `f${String(i + 1).padStart(2, '0')}.pdf`, mimeType: 'application/pdf', buffer: pdf })),
    );
    await expect(rows(page)).toHaveCount(30);
    await expect(page.getByTestId('jozve-overflow')).toContainText('f31.pdf');
    await expect(page.getByTestId('stat-page-count')).toHaveText('300', { timeout: 60_000 });
  });
});

test.describe('چند فایل روی موبایل', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('فهرست جزوه افقی اسکرول نمی‌خورد و قیمت پایین صفحه می‌ماند', async ({ page }) => {
    await page.goto('/');
    // Playwright مسیر و بافر را با هم نمی‌گیرد؛ همه بافر.
    await page.setInputFiles('#jozve-file', [
      renamed('plain-bw-10.pdf', 'Thermodynamics lecture 01 - introduction and first law.pdf'),
      { ...renamed('jozve-12.docx', 'jozve-12.docx'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      renamed('image-scan-6.pdf', 'image-scan-6.pdf'),
    ]);
    await expect(price(page)).toContainText('89,800', { timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, 3000);
    await expect(price(page)).toBeInViewport();
  });

  /**
   * سنجهٔ تک‌فایل (زیر ۲ ثانیه تا اولین قیمت با پردازندهٔ ۴× کند)، برای کل جزوه: قیمت کامل
   * سه فایل، از جمله اسکن زرد ۱۴۷ صفحه‌ای. شمارش پیش از بررسی همین را ممکن می‌کند — بدون آن
   * قیمت کامل منتظر بررسی رنگ همهٔ صفحه‌های فایل‌های قبلی می‌ماند.
   */
  test('قیمت کامل سه فایل زیر ۲ ثانیه، با پردازندهٔ ۴ برابر کند', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const startedAt = Date.now();
    await page.setInputFiles('#jozve-file', [
      fixture('yellow-scan-147.pdf'),
      fixture('plain-bw-10.pdf'),
      fixture('image-scan-6.pdf'),
    ]);
    // ۱۶۳ صفحه: ۲۶۰,۸۰۰ + یک صحافی ۴۵,۰۰۰ (۸۲ برگ).
    await expect(price(page)).toContainText('305,800', { timeout: 20_000 });
    const fullPriceMs = Date.now() - startedAt;
    console.log(`قیمت کامل سه فایل با throttle 4×: ${fullPriceMs}ms`);
    expect(fullPriceMs).toBeLessThan(2_000);

    // و بررسی تا آخر تمام می‌شود بی اینکه عدد عوض شود؛ اسکن زرد رنگی نیست.
    await expect(ready(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('color-hint')).toHaveText('همهٔ فایل‌ها تماماً سیاه‌سفیدند.');
    await expect(price(page)).toContainText('305,800');
  });
});

/**
 * برگشت بعد از رفرش (برش ۳د، ADR-036)، بی سرور: آپلود «در دسترس نیست»، پس هیچ فایلی روی سرور نیست و جزوهٔ
 * برگشته منتظر همان فایل‌هاست. با سرور (فایل روی سرور، قدم‌های خرید، «پرداخت» دوباره، سند پاک‌شده، زمان) در
 * `restore.spec.ts`. فایل‌ها از دیسک‌اند، نه بافر: بافر هر بار تاریخ تغییر تازه می‌گیرد و «همان فایل» نیست.
 */
test.describe('برگشت بعد از رفرش (۳د)، بی سرور', () => {
  const tile = (page: Page, title: string) => page.locator('label.jy-tile').filter({ has: page.getByText(title, { exact: true }) });

  test('همان فایل‌ها به همان ترتیب، منتظر انتخاب دوباره؛ همه یک‌جا سر جای خودشان، با همان تنظیمات چاپ', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf'), fixture('mixed-color-10.pdf')]);
    await expect(price(page)).toContainText('86,600', { timeout: 20_000 });
    // ترتیبی که کاربر ساخت، و تنظیمی که عوض کرد، هر دو باید برگردند
    await page.getByRole('button', { name: '«plain-bw-10.pdf» یکی بالاتر' }).click();
    await expect.poll(() => names(page)).toEqual(['image-scan-6.pdf', 'plain-bw-10.pdf', 'mixed-color-10.pdf']);
    await tile(page, 'رنگی').click();
    const order = await names(page);
    await expect(price(page)).not.toContainText('86,600');
    const total = await price(page).textContent();

    await page.reload();
    await expect(page.getByTestId('jozve-waiting')).toContainText('همان فایل‌ها را دوباره انتخاب کن');
    expect(await names(page)).toEqual(order);
    await expect(rows(page).getByTestId('section-waiting')).toHaveCount(3);
    await expect(rows(page).getByTestId('section-status').first()).toContainText('منتظر همان فایل');

    // همه یک‌جا و به هر ترتیبی: هر فایل سر جای خودش
    await page.setInputFiles('#jozve-add', [fixture('mixed-color-10.pdf'), fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(price(page)).toHaveText(total!, { timeout: 20_000 });
    expect(await names(page)).toEqual(order);
    await expect(tile(page, 'رنگی').locator('input')).toBeChecked();
    await expect(page.getByTestId('jozve-waiting')).toHaveCount(0);
  });

  test('تک‌فایل: «همان فایل را انتخاب کن»، و «ادامه» تا آن موقع بسته', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId('file-waiting')).toContainText('plain-bw-10.pdf');
    await expect(page.getByTestId('jozve-waiting')).toContainText('همان فایل را دوباره انتخاب کن');
    // هیچ فایلی در قیمت نیست، پس هنوز قیمت و «ادامه»ای نیست
    await expect(price(page)).toHaveCount(0);
    await page.setInputFiles('#jozve-replace', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    await expect(page.getByTestId('file-waiting')).toHaveCount(0);
  });

  test('پیش از هر اسکریپتی حالت سفارش است و کارت «در حال برگرداندن جزوه…» می‌گوید، نه لحظه‌ای صفحهٔ اول', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });

    // اسکریپت‌های صفحه تا اجازهٔ تست نمی‌رسند: فقط HTML، CSS و اسکریپت چندبایتی درون HTML
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/_next/static/chunks/**', async (route) => {
      await held;
      await route.continue();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-restoring', '');
    await expect(page.locator('.home-restoring')).toHaveText('در حال برگرداندن جزوه…');
    await expect(page.locator('.home-restoring')).toBeVisible();
    await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeHidden();
    await expect(page.locator('#how')).toBeHidden();
    await expect(page.locator('#jozve-file')).toBeHidden();

    release();
    await expect(page.getByTestId('file-waiting')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-restoring');
    await expect(page.locator('.home-restoring')).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('زبانهٔ تازه جزوهٔ تازه است؛ «فایل دیگری بینداز» پیش‌نویس را هم پاک می‌کند', async ({ page, context }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId('file-waiting')).toBeVisible();

    const other = await context.newPage();
    await other.goto('/');
    await other.waitForLoadState('networkidle');
    await expect(other.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
    await expect(other.getByTestId('file-waiting')).toHaveCount(0);
    await other.close();

    await page.getByRole('button', { name: 'فایل دیگری بینداز' }).click();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
    await expect(page.getByTestId('file-waiting')).toHaveCount(0);
  });

  test('حافظهٔ بستهٔ سایت: صفحهٔ معمول، بی خطا', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() {
          throw new DOMException('بسته', 'SecurityError');
        },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
    await expect(page.getByTestId('file-waiting')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
