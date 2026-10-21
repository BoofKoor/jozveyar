import { expect, test, type Page } from '@playwright/test';

/**
 * «تعرفه» و ماشین‌حساب بی فایل (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۵۱، ۴۵۳، ۴۵۷ و ۴۵۸؛ طرح `seo.html`)، و نشانی صفحه‌ها: `/chap-jozve` با ۳۰۱ به
 * صفحهٔ اصلی و نشانی بی صفحه ۴۰۴. مثل `site.spec.ts` روی build تولیدی و بی پایگاه داده، پس متن «تعرفه» متن پیش‌فرض است و عددها از تعرفهٔ پایه
 * (همان عددهای طرح). صفحه‌های فرود منتشرشده، ۳۰۱ نشانی قبلی و «آخرین تغییر قیمت» پایگاه داده می‌خواهند: `apps/admin/tests/pages.spec.ts`.
 */

const out = (page: Page) => page.getByTestId('calc-out');
const calc = (page: Page) => page.getByTestId('tariff-calc');
const pagesField = (page: Page) => calc(page).getByLabel('چند صفحه؟');
const tile = (page: Page, name: string) => calc(page).locator('label.jy-tile').filter({ has: page.getByText(name, { exact: true }) });
const nav = (page: Page) => page.getByRole('navigation', { name: 'پیوندهای صفحه' });

/** گراف‌های دادهٔ ساختاریافتهٔ یک صفحه. */
function ldScripts(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(([, json]) => JSON.parse(json!));
}

test.describe('«تعرفه»', () => {
  test('۲۰۰، عنوان گوگل با سال امروز، canonical خودش، و مسیر دیدنی با BreadcrumbList؛ FAQPage نه (سؤال ۴۲۷)', async ({ request }) => {
    const response = await request.get('/tarefe');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<title>قیمت چاپ جزوه و پرینت سیاه‌سفید و رنگی 1[45]\d\d \| جزوه‌یار<\/title>/);
    expect(html).toMatch(/<meta name="description" content="تعرفهٔ امروز چاپ هر رو، صحافی و کرایهٔ پست، با ماشین‌حساب بی فایل: سیاه‌سفید 1,600 و رنگی 2,000 تومان هر رو."/);
    expect(html).toMatch(/<meta name="robots" content="index, follow"/);
    const canonical = new URL(/<link rel="canonical" href="([^"]+)"/.exec(html)![1]!);
    expect(canonical.pathname).toBe('/tarefe');

    const scripts = ldScripts(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'جزوه‌یار', item: canonical.origin },
        { '@type': 'ListItem', position: 2, name: 'تعرفه', item: `${canonical.origin}/tarefe` },
      ],
    });
  });

  test('مسیر دیدنی، تیتر و جملهٔ متن پیش‌فرض؛ «تعرفه»ی سربرگ جاری است و بقیه نه', async ({ page }) => {
    await page.goto('/tarefe');
    const crumbs = page.getByRole('navigation', { name: 'مسیر' });
    await expect(crumbs.getByRole('link')).toHaveText(['جزوه‌یار']);
    await expect(crumbs.getByRole('link', { name: 'جزوه‌یار' })).toHaveAttribute('href', '/');
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('تعرفه');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('قیمت چاپ جزوه و پرینت، امروز');
    await expect(page.locator('.tf-lead')).toContainText('همان عددهایی که موقع سفارش حساب می‌شوند');
    // بی پایگاه داده روز فعال شدن تعرفه معلوم نیست، پس خطش نمی‌آید.
    await expect(page.getByTestId('tariff-changed')).toHaveCount(0);

    await expect(nav(page).getByRole('link', { name: 'تعرفه' })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).getByRole('link', { name: 'سفارش‌های من' })).not.toHaveAttribute('aria-current', /.+/);
    await expect(nav(page).locator('[aria-current]:visible')).toHaveCount(1);
  });

  test('ماشین‌حساب در HTML: بی JS هم ۱۲۰ صفحه با قیمت و ارسال هر دو منطقه', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/tarefe');
    await expect(pagesField(page)).toHaveValue('120');
    await expect(out(page).locator('h3')).toHaveText('جزوهٔ 120 صفحه‌ای');
    await expect(out(page)).toContainText('چاپ 120 رو، سیاه‌سفید192,000 تومان');
    await expect(out(page)).toContainText('صحافی طلق و سیم، 60 برگ45,000 تومان');
    await expect(page.getByTestId('calc-total')).toHaveText('237,000 تومان');
    await expect(page.getByTestId('calc-ship')).toHaveText('با ارسال: تهران 366,500 و شهرهای دیگر 374,750 تومان');
    await expect(page.getByTestId('calc-fixed')).toHaveText('اندازهٔ A4، کاغذ تحریر 80 گرم و صحافی طلق و سیم؛ امروز گزینهٔ دیگری در تعرفه نیست.');
    await context.close();
  });

  test('ماشین‌حساب: صفحه، یکرو یا دورو، رنگ و نسخه همان لحظه؛ دوروی ارزان‌تر با ارسال یادداشت دارد (طرح «دو جلد»)', async ({ page }) => {
    await page.goto('/tarefe');
    await pagesField(page).fill('1100');
    await expect(out(page).locator('h3')).toHaveText('جزوهٔ 1,100 صفحه‌ای');
    await expect(page.getByTestId('calc-total')).toHaveText('1,822,000 تومان');
    await expect(page.getByTestId('calc-cheaper')).toHaveCount(0);

    await tile(page, 'یکرو').click();
    await expect(out(page).locator('h3')).toHaveText('جزوهٔ 1,100 صفحه‌ای، یکرو');
    await expect(out(page)).toContainText('صحافی طلق و سیم، 2 جلد (550 و 550 برگ)124,000 تومان');
    await expect(page.getByTestId('calc-total')).toHaveText('1,884,000 تومان');
    await expect(page.getByTestId('calc-ship')).toHaveText('با ارسال: تهران 2,084,000 و شهرهای دیگر 2,091,200 تومان');
    await expect(page.getByTestId('calc-cheaper')).toHaveText('دورو: یک جلد 550 برگی و بستهٔ سبک‌تر؛ با ارسال به تهران 1,972,000 تومان، 112,000 تومان کمتر.');
    // اثر کاشی دورو بی ارسال است، همان میز: 62,000 تومان کمتر.
    await expect(tile(page, 'دورو')).toContainText('550 برگ، −62,000 تومان');

    await tile(page, 'رنگی').click();
    await expect(page.getByTestId('calc-total')).toHaveText('2,324,000 تومان');
    await calc(page).getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(out(page).locator('h3')).toHaveText('جزوهٔ 1,100 صفحه‌ای، یکرو، 2 نسخه');
    await expect(page.getByTestId('calc-total')).toHaveText('4,648,000 تومان');
  });

  test('«چند صفحه؟» با رقم فارسی هم؛ بیرون از ۱ تا سقف خطای زیر فیلد و بی عدد، و کاشی‌ها با آخرین شمار درست', async ({ page }) => {
    await page.goto('/tarefe');
    await pagesField(page).fill('۵۰');
    await expect(out(page).locator('h3')).toHaveText('جزوهٔ 50 صفحه‌ای');
    await expect(page.getByTestId('calc-total')).toHaveText('125,000 تومان');

    for (const bad of ['0', '1501', 'صد', '']) {
      await pagesField(page).fill(bad);
      await expect(pagesField(page), bad).toHaveAttribute('aria-invalid', 'true');
      await expect(calc(page).locator('.jy-error')).toHaveText('یک عدد از 1 تا 1,500 بنویس.');
      await expect(out(page)).toContainText('قیمت با شمار صفحه‌ها می‌آید.');
      await expect(page.getByTestId('calc-total')).toHaveCount(0);
      await expect(tile(page, 'دورو')).toContainText('25 برگ');
    }
    await pagesField(page).fill('200');
    await expect(pagesField(page)).not.toHaveAttribute('aria-invalid', /.+/);
    await expect(page.getByTestId('calc-total')).toHaveText('365,000 تومان');
  });

  test('«فایلت را بینداز» به صفحهٔ اصلی', async ({ page }) => {
    await page.goto('/tarefe');
    await out(page).getByRole('link', { name: 'فایلت را بینداز' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/جزوه‌ات را بینداز/);
  });

  test('جدول‌ها از تعرفهٔ فعال: چاپ هر رو، صحافی، ارسال، سه جزوهٔ نمونه، و سؤال‌های قیمت', async ({ page }) => {
    await page.goto('/tarefe');
    const print = page.getByRole('table', { name: 'قیمت چاپ هر رو، کاغذ A4' });
    await expect(print.locator('tbody tr')).toHaveText(['سیاه‌سفید1,6001,600', 'رنگی2,0002,000']);
    await expect(page.locator('#tf-print ~ .tf-note')).toHaveText('تومان، هر روی چاپ‌شده. در دورو هر برگ دو رو است. کاغذ تحریر 80 گرم، بی هزینهٔ جدا.');

    await expect(page.getByRole('heading', { level: 2, name: 'صحافی طلق و سیم' })).toBeVisible();
    const binding = page.getByRole('table', { name: 'قیمت صحافی طلق و سیم بر اساس شمار برگ' });
    await expect(binding.locator('tbody tr')).toHaveText(['تا 15045,000', '151 تا 30050,000', '301 تا 45055,000', '451 تا 60062,000', '601 تا 70068,000', '701 تا 80078,000']);

    const shipping = page.getByRole('table', { name: 'کرایهٔ پست بر اساس وزن بسته و مقصد' });
    await expect(shipping.locator('thead th')).toHaveText(['وزن بسته', 'تهران', 'شهرهای دیگر']);
    await expect(shipping.locator('tbody tr')).toHaveText(['تا 1 کیلو129,500137,750', '1 تا 3 کیلو150,000161,812', 'بالای 3 کیلو200,000207,200']);
    await expect(page.getByText(/جزوهٔ 200 صفحه‌ای دورو با بسته‌بندی حدود \d+ گرم است/)).toBeVisible();

    const samples = page.locator('.lp-samples .lp-sample');
    await expect(samples.locator('.lp-sample__title')).toHaveText([
      'جزوهٔ 50 صفحه‌ای، سیاه‌سفید و دورو',
      'جزوهٔ 200 صفحه‌ای، سیاه‌سفید و دورو',
      'جزوهٔ 600 صفحه‌ای، سیاه‌سفید و دورو',
    ]);
    await expect(samples.locator('.lp-sample__total dd')).toHaveText(['125,000 تومان', '365,000 تومان', '1,010,000 تومان']);
    await expect(samples.locator('.lp-sample__ship')).toHaveText([
      'با ارسال: تهران 254,500 و شهرهای دیگر 262,750 تومان',
      'با ارسال: تهران 494,500 و شهرهای دیگر 502,750 تومان',
      'با ارسال: تهران 1,160,000 و شهرهای دیگر 1,171,812 تومان',
    ]);
    await expect(page.getByText('همه طلق و سیم، یک نسخه، با تعرفهٔ امروز. تخفیف سفارش بزرگ امروز پله‌ای ندارد؛ وقتی داشت، جدولش همین‌جاست.')).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'سؤال‌های قیمت' })).toBeVisible();
    await expect(page.locator('#faq summary')).toHaveText(['قیمت هر برگ است یا هر رو؟', 'کرایه چطور حساب می‌شود؟', 'اگر تعرفه عوض شود، قیمت سفارشم هم عوض می‌شود؟']);
  });

  for (const width of [320, 390]) {
    test(`گوشی ${width}: بی سرریز افقی، و هر پیوند، کاشی و دکمه دست‌کم ۴۴ پیکسل`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/tarefe');
      const { overflow, small } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        small: [...document.querySelectorAll<HTMLElement>('main a, main summary, main button, main label.jy-tile, main input:not([type=radio])')]
          .filter((el) => el.checkVisibility())
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return Math.min(r.width, r.height) < 44;
          })
          .map((el) => el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30) || el.id),
      }));
      expect(overflow).toBeLessThanOrEqual(0);
      expect(small).toEqual([]);
    });
  }

  test('صفحهٔ اصلی زیر تعرفه به «تعرفه» پیوند می‌دهد', async ({ page }) => {
    await page.goto('/');
    const more = page.getByTestId('tariff-more');
    await expect(more).toHaveText('همهٔ قیمت‌ها و ماشین‌حساب بی فایل');
    await more.click();
    await expect(page).toHaveURL(/\/tarefe$/);
  });
});

test.describe('نشانی صفحه‌ها (۱۵٫۲)', () => {
  test('«/chap-jozve» با ۳۰۱ (نه ۳۰۸) به صفحهٔ اصلی، چون «چاپ جزوه» خود صفحهٔ اصلی است (سؤال ۴۳۱)', async ({ request }) => {
    const response = await request.get('/chap-jozve', { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(new URL(response.headers().location!, 'http://127.0.0.1').pathname).toBe('/');
  });

  test('نشانی‌ای که صفحه‌ای ندارد، با شکل نشانی صفحه‌ها یا بی آن: ۴۰۴ فارسی، noindex و بی canonical', async ({ request }) => {
    for (const path of ['/print-pdf', '/wp-login.php', '/Print-PDF', '/a-b-']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      const html = await response.text();
      expect(html, path).toContain('این صفحه پیدا نشد');
      expect(html, path).toContain('<title>صفحه پیدا نشد | جزوه‌یار</title>');
      expect(html, path).toContain('noindex');
      expect(html, path).not.toContain('rel="canonical"');
    }
  });
});
