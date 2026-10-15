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
/** منوی «جابه‌جایی» ردیف یک فایل (۸٫۲، سؤال ۲۱۸)، و یکی از کارهایش. */
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `جابه‌جایی «${name}»` });
async function moveFile(page: Page, name: string, action: string) {
  await menuOf(page, name).click();
  await page.getByRole('menuitem', { name: action }).click();
}
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

    await moveFile(page, 'جلسه 10.pdf', 'یکی بالاتر');
    await expect.poll(() => names(page)).toEqual(['جلسه ۱.pdf', 'جلسه 10.pdf', 'جلسه 2.pdf']);
    await expect(price(page)).toContainText('86,600');
    // ردیف در همان جزوه ماند: فوکوس به دکمهٔ منویش برمی‌گردد
    await expect(menuOf(page, 'جلسه 10.pdf')).toBeFocused();
    // فایل اول «یکی بالاتر» ندارد، و آخری «یکی پایین‌تر»؛ Esc منو را می‌بندد و فوکوس به دکمه‌اش برمی‌گردد
    await menuOf(page, 'جلسه ۱.pdf').click();
    await expect(page.getByRole('menuitem')).toHaveText(['یکی پایین‌تر', 'جزوهٔ تازه با همین فایل']);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(menuOf(page, 'جلسه ۱.pdf')).toBeFocused();
    await menuOf(page, 'جلسه 2.pdf').click();
    await expect(page.getByRole('menuitem')).toHaveText(['یکی بالاتر', 'جزوهٔ تازه با همین فایل']);
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

  /**
   * هشدار زیر همان فایل، با شمارهٔ صفحهٔ خود آن فایل (ADR-030): صفحهٔ ۲ فایل سوم «صفحهٔ 2» است، نه ۱۶. کیفیت اسکن و
   * حاشیهٔ `dpi-mix-4.pdf` از ۸٫۱ فقط در پنل‌اند (سؤال ۱۸۱).
   */
  test('هشدار زیر همان فایل و با شمارهٔ صفحهٔ خود آن فایل؛ کیفیت و حاشیه نه (۸٫۱)', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      renamed('plain-bw-10.pdf', 'جلسه 1.pdf'),
      renamed('dpi-mix-4.pdf', 'جلسه 2.pdf'),
      renamed('blank-mid-3.pdf', 'جلسه 3.pdf'),
    ]);
    await expect(row(page, 'جلسه 3.pdf').getByTestId('warning-blank')).toHaveText('صفحهٔ 2 خالی است و هزینهٔ چاپ می‌گیرد.', {
      timeout: 20_000,
    });
    await expect(page.getByText('همهٔ صفحه‌ها بررسی شد')).toBeVisible({ timeout: 20_000 });
    await expect(row(page, 'جلسه 1.pdf').getByTestId('warning-blank')).toHaveCount(0);
    await expect(row(page, 'جلسه 2.pdf').locator('.jy-note--warning')).toHaveCount(0);
    await expect(page.getByText(/کیفیت اسکن|حاشیهٔ کم/)).toHaveCount(0);
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
    // عکس: سرور فقط رنگ را به مشتری می‌گوید؛ کیفیت از ۸٫۱ فقط در پنل است (سؤال ۱۸۱).
    await expect(row(page, 'scan-photo.png').getByTestId('section-status')).toContainText('رنگ بعد از بررسی روی سرور');
    await expect(page.getByText(/کیفیت/)).toHaveCount(0);
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

/**
 * چند جزوه در یک سفارش (برش ۸٫۲، سؤال ۱۸۲؛ طرح میز، سؤال‌های ۲۱۵ تا ۲۲۵): پرسش چیدمان، کارت و تنظیمات هر جزوه، منوی ردیف،
 * «جزوهٔ تازه»، و خلاصه با قیمت هر جزوه. همه با تحلیل مرورگر، بی سرور. تعرفهٔ پایه: هر رو سیاه‌سفید ۱,۶۰۰ و رنگی ۲,۰۰۰ تومان،
 * طلق و سیم ۴۵,۰۰۰ هر جلد.
 */
const ask = (page: Page) => page.getByTestId('jozve-ask');
const arrangeTile = (page: Page, title: string) => ask(page).locator('label.jy-tile').filter({ hasText: title });
const cards = (page: Page) => page.getByTestId('jozve');
const titles = (page: Page) => cards(page).getByRole('heading', { level: 2 }).allTextContents();
const cardPrices = (page: Page) => cards(page).getByTestId('jozve-price').allTextContents();
const settingsButtons = (page: Page) => page.getByRole('button', { name: /^تنظیمات چاپ/ });
const expanded = (page: Page) => settingsButtons(page).evaluateAll((els) => els.map((el) => el.getAttribute('aria-expanded')));
const summaryTotal = (page: Page) => page.getByTestId('summary-total');
const optionTile = (page: Page, title: string) => page.locator('label.jy-tile').filter({ has: page.getByText(title, { exact: true }) });

test.describe('چند جزوه در یک سفارش (۸٫۲)', () => {
  const three = () => [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf'), fixture('mixed-color-10.pdf')];

  test('سه فایل با هم: «همه یک جزوه» از پیش، و «هر فایل جدا» سه جزوه، هر کدام قیمت و تنظیمات خودش؛ جمع یکی', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', three());
    // یک جزوه: ۲۶ صفحه و یک صحافی
    await expect(price(page)).toContainText('86,600', { timeout: 20_000 });
    await expect(ask(page).getByRole('heading')).toHaveText('3 فایل انداختی؛ چطور صحافی شوند؟');
    await expect(arrangeTile(page, 'همه یک جزوه، یک صحافی').locator('input')).toBeChecked();
    // دو صحافی دیگر
    await expect(arrangeTile(page, 'هر فایل جزوهٔ جدا')).toContainText('+90,000 تومان');
    await expect(arrangeTile(page, 'همه یک جزوه، یک صحافی')).not.toContainText('تومان');

    await arrangeTile(page, 'هر فایل جزوهٔ جدا').click();
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2', 'جزوهٔ 3']);
    expect(await names(page)).toEqual(['image-scan-6.pdf', 'mixed-color-10.pdf', 'plain-bw-10.pdf']);
    await expect.poll(() => cardPrices(page)).toEqual(['54,600', '61,000', '61,000']);
    await expect(summaryTotal(page)).toHaveText('176,600');
    await expect(price(page)).toContainText('176,600');
    await expect(page.getByTestId('summary-jozve')).toHaveText([
      'جزوهٔ 1سیاه‌سفید، دورو، A4، طلق و سیم · 6 صفحه54,600',
      'جزوهٔ 2سیاه‌سفید، دورو، A4، طلق و سیم · 10 صفحه61,000',
      'جزوهٔ 3سیاه‌سفید، دورو، A4، طلق و سیم · 10 صفحه61,000',
    ]);
    await expect(page.locator('.home-sum__label')).toHaveText('جمع · 3 جزوه');
    await expect(page.locator('.home-dock__label')).toHaveText('جمع · 3 جزوه');
    // پرسش می‌ماند، حالا با اثر برگشت
    await expect(arrangeTile(page, 'هر فایل جزوهٔ جدا').locator('input')).toBeChecked();
    await expect(arrangeTile(page, 'همه یک جزوه، یک صحافی')).toContainText('با تنظیمات جزوهٔ 1، پشت‌سرهم');
    await expect(arrangeTile(page, 'همه یک جزوه، یک صحافی')).toContainText('−90,000 تومان');

    // تنظیمات: در هر لحظه یکی باز، و فقط همان روی صفحه
    await expect.poll(() => expanded(page)).toEqual(['true', 'false', 'false']);
    await expect(page.getByRole('radio', { name: 'رنگی' })).toHaveCount(1);
    await settingsButtons(page).nth(1).click();
    await expect.poll(() => expanded(page)).toEqual(['false', 'true', 'false']);
    await optionTile(page, 'رنگی').click();
    // جزوهٔ ۲ رنگی: ۱۰ × ۲,۰۰۰ + ۴۵,۰۰۰؛ بقیه همان
    await expect.poll(() => cardPrices(page)).toEqual(['54,600', '65,000', '61,000']);
    await expect(summaryTotal(page)).toHaveText('180,600');
    await settingsButtons(page).nth(1).click();
    await expect.poll(() => expanded(page)).toEqual(['false', 'false', 'false']);
    await expect(settingsButtons(page).nth(1)).toHaveText(/رنگی، دورو، A4، طلق و سیم · 1 نسخه/);

    // «همه یک جزوه»: یک کارت با تنظیمات جزوهٔ ۱، و خلاصهٔ یک‌جزوه
    await arrangeTile(page, 'همه یک جزوه، یک صحافی').click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).getByRole('heading', { level: 2 })).toHaveText('جزوهٔ تو');
    await expect(price(page)).toContainText('86,600');
    await expect(page.getByTestId('summary-jozve')).toHaveCount(0);
    await expect(page.locator('.home-sum__label')).toHaveText('جمع');
  });

  test('بردن فایل به جزوهٔ دیگر یا جزوهٔ تازه: پرسش می‌رود و برنمی‌گردد؛ جزوهٔ خالی می‌رود', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', three());
    await expect(price(page)).toContainText('86,600', { timeout: 20_000 });
    await arrangeTile(page, 'هر فایل جزوهٔ جدا').click();
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2', 'جزوهٔ 3']);

    // تنها فایل یک جزوه: فقط به جزوه‌های دیگر، با نام فایل اولشان
    await menuOf(page, 'plain-bw-10.pdf').click();
    await expect(page.getByRole('menuitem')).toHaveText(['به جزوهٔ 1image-scan-6.pdf', 'به جزوهٔ 2mixed-color-10.pdf']);
    await page.getByRole('menuitem', { name: /به جزوهٔ 1/ }).click();
    await expect(ask(page)).toHaveCount(0);
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2']);
    // ردیف به جزوهٔ دیگر رفت: فوکوس به سر همان جزوه، نه گم
    await expect(cards(page).first().getByRole('heading', { level: 2 })).toBeFocused();
    expect(await names(page)).toEqual(['image-scan-6.pdf', 'plain-bw-10.pdf', 'mixed-color-10.pdf']);
    // جزوهٔ ۱: ۱۶ صفحه و یک صحافی
    await expect.poll(() => cardPrices(page)).toEqual(['70,600', '61,000']);
    await expect(summaryTotal(page)).toHaveText('131,600');
    await expect(cards(page).first()).toContainText('به همین ترتیب، پشت‌سرهم در یک جزوه صحافی می‌شوند.');

    // دوباره هر فایل یک جزوه، ولی پرسش برنمی‌گردد؛ جزوهٔ تازه تنظیماتش باز است
    await menuOf(page, 'plain-bw-10.pdf').click();
    await expect(page.getByRole('menuitem')).toHaveText(['یکی بالاتر', 'به جزوهٔ 2mixed-color-10.pdf', 'جزوهٔ تازه با همین فایل']);
    await page.getByRole('menuitem', { name: 'جزوهٔ تازه با همین فایل' }).click();
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2', 'جزوهٔ 3']);
    expect(await names(page)).toEqual(['image-scan-6.pdf', 'mixed-color-10.pdf', 'plain-bw-10.pdf']);
    await expect(ask(page)).toHaveCount(0);
    await expect.poll(() => expanded(page)).toEqual(['false', 'false', 'true']);

    // ✕ تنها فایل یک جزوه، آن جزوه را هم می‌برد
    await page.getByRole('button', { name: '«mixed-color-10.pdf» را از جزوه بردار' }).click();
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2']);
    await expect.poll(() => cardPrices(page)).toEqual(['54,600', '61,000']);
  });

  test('«جزوهٔ تازه»: فایل‌هایش یک جزوهٔ تازه با پیش‌فرض‌ها، تنظیماتش باز و بی پرسش؛ افزودن به همان جزوه', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 15_000 });
    await expect(ask(page)).toHaveCount(0);
    await optionTile(page, 'رنگی').click();
    await expect(price(page)).toContainText('65,000');

    await page.setInputFiles('#jozve-new', fixture('image-scan-6.pdf'));
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2']);
    await expect(ask(page)).toHaveCount(0);
    await expect.poll(() => cardPrices(page)).toEqual(['65,000', '54,600']);
    await expect.poll(() => expanded(page)).toEqual(['false', 'true']);
    await expect(optionTile(page, 'سیاه‌سفید').locator('input')).toBeChecked();
    await expect(settingsButtons(page).first()).toHaveText(/رنگی، دورو، A4، طلق و سیم · 1 نسخه/);

    // افزودن به همان جزوه: جزوهٔ ۲ دو فایل، پشت‌سرهم با یک صحافی
    await page.setInputFiles('#jozve-add-2', fixture('mixed-color-10.pdf'));
    await expect.poll(() => names(page)).toEqual(['plain-bw-10.pdf', 'image-scan-6.pdf', 'mixed-color-10.pdf']);
    await expect.poll(() => cardPrices(page)).toEqual(['65,000', '70,600']);
    await expect(summaryTotal(page)).toHaveText('135,600');
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

  for (const width of [320, 390]) {
    test(`چند جزوه در ${width} پیکسل: بی اسکرول افقی، منوی ردیف درون صفحه، هدف لمسی ۴۴، و جمع چندجزوه در نوار`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.setInputFiles('#jozve-file', [
        renamed('plain-bw-10.pdf', 'Thermodynamics lecture 01 - introduction and first law.pdf'),
        renamed('image-scan-6.pdf', 'image-scan-6.pdf'),
      ]);
      await expect(price(page)).toContainText('70,600', { timeout: 20_000 });
      await arrangeTile(page, 'هر فایل جزوهٔ جدا').click();
      await expect(price(page)).toContainText('115,600');
      await expect(page.locator('.home-dock__label')).toHaveText('جمع · 2 جزوه');
      const menu = menuOf(page, 'Thermodynamics lecture 01 - introduction and first law.pdf');
      await menu.click();
      const list = await page.getByRole('menu').boundingBox();
      expect(list!.x).toBeGreaterThanOrEqual(0);
      expect(list!.x + list!.width).toBeLessThanOrEqual(width);
      for (const target of [menu, ...(await page.getByRole('menuitem').all()), ...(await settingsButtons(page).all())]) {
        const box = await target.boundingBox();
        expect(box!.height, (await target.textContent()) ?? '').toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

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
    await moveFile(page, 'plain-bw-10.pdf', 'یکی بالاتر');
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

  test('پیش‌نویس دستکاری‌شده: صحافی و کاغذی که تعرفه ندارد (حتی «constructor») یعنی پیش‌فرض‌ها، نه صفحهٔ شکسته', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // پیش‌نویسی که صفحه با رفرش می‌نویسد، پیش از هر اسکریپت صفحه دستکاری می‌شود
    await page.addInitScript(() => {
      const raw = sessionStorage.getItem('jy.draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      draft.layout.jozves[0].config = { colorMode: 'bw', sidesMode: 'double', bindingTypeId: 'constructor', paperTypeId: 'constructor', copies: 1 };
      sessionStorage.setItem('jy.draft', JSON.stringify(draft));
    });
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId('file-waiting')).toBeVisible();
    await page.setInputFiles('#jozve-replace', fixture('plain-bw-10.pdf'));
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('چند جزوه (۸٫۲): چیدمان، تنظیمات هر جزوه و پرسش چیدمان برمی‌گردند', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(price(page)).toContainText('70,600', { timeout: 20_000 });
    await arrangeTile(page, 'هر فایل جزوهٔ جدا').click();
    await settingsButtons(page).nth(1).click();
    await tile(page, 'رنگی').click();
    // ۶ صفحه سیاه‌سفید و ۱۰ صفحه رنگی، هر کدام صحافی خودش
    await expect(summaryTotal(page)).toHaveText('119,600');

    await page.reload();
    await expect.poll(() => titles(page)).toEqual(['جزوهٔ 1', 'جزوهٔ 2']);
    await expect(page.getByTestId('jozve-waiting')).toHaveCount(2);
    await expect(arrangeTile(page, 'هر فایل جزوهٔ جدا').locator('input')).toBeChecked();
    // همه یک‌جا، از کارت اول: هر فایل سر جای خودش در جزوهٔ خودش
    await page.setInputFiles('#jozve-add', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(summaryTotal(page)).toHaveText('119,600', { timeout: 20_000 });
    expect(await names(page)).toEqual(['image-scan-6.pdf', 'plain-bw-10.pdf']);
    await expect.poll(() => cardPrices(page)).toEqual(['54,600', '65,000']);
    await expect(page.getByTestId('jozve-waiting')).toHaveCount(0);
  });

  test('پیش‌نویس نسخهٔ ۱ (زبانه‌ای که پیش از ۸٫۲ باز بود): یک جزوه با همان تنظیمات برمی‌گردد', async ({ page }) => {
    // همان پیش‌نویسی که صفحه با رفرش می‌نویسد، پیش از هر اسکریپت صفحه به شکل نسخهٔ ۱
    await page.addInitScript(() => {
      const raw = sessionStorage.getItem('jy.draft');
      const draft = raw ? JSON.parse(raw) : null;
      if (draft?.v !== 2) return;
      sessionStorage.setItem('jy.draft', JSON.stringify({ v: 1, files: draft.files, config: draft.layout.jozves[0].config, checkout: draft.checkout }));
    });
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(price(page)).toContainText('70,600', { timeout: 20_000 });
    await tile(page, 'رنگی').click();
    // ۱۶ صفحه رنگی: ۳۲,۰۰۰ + ۴۵,۰۰۰
    await expect(price(page)).toContainText('77,000');

    await page.reload();
    await expect(page.getByTestId('jozve-waiting')).toContainText('همان فایل‌ها را دوباره انتخاب کن');
    await page.setInputFiles('#jozve-add', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(price(page)).toContainText('77,000', { timeout: 20_000 });
    await expect(tile(page, 'رنگی').locator('input')).toBeChecked();
    await expect(cards(page)).toHaveCount(1);
    await expect(ask(page)).toHaveCount(0);
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
