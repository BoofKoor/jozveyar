import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

/**
 * هویت در سایت (docs/UI.md، قدم ۳): سربرگ و پاورقی با لوگوی بی‌شعار، حالت سفارش، نشانک و ۴۰۴.
 *
 * مثل flow.spec.ts روی build تولیدی و بی استوریج. سربرگ و پاورقی کامپوننت سرورند و JS ندارند؛
 * حالت سفارش را CSS با `:has()` از نشانهٔ جزیرهٔ سفارش می‌گیرد، پس اینجا در مرورگر سنجیده می‌شود.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

const price = (page: Page) => page.getByTestId('price-total');
const header = (page: Page) => page.getByRole('banner');
const footer = (page: Page) => page.getByRole('contentinfo');
const homeLink = (page: Page) => header(page).getByRole('link', { name: 'جزوه‌یار، صفحهٔ اصلی' });
const nav = (page: Page) => page.getByRole('navigation', { name: 'پیوندهای صفحه' });

async function dropFile(page: Page) {
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
  await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
}

test.describe('سربرگ', () => {
  test('لوگو پیوند صفحهٔ اصلی است با متن جایگزین؛ ناوبری فقط «سؤال‌ها»', async ({ page }) => {
    await page.goto('/');
    await expect(homeLink(page)).toHaveAttribute('href', '/');
    await expect(homeLink(page).getByRole('img', { name: 'جزوه‌یار' })).toBeVisible();

    // پیوند فقط به جایی که وجود دارد: «چطور کار می‌کند» و «تعرفه» با بخش‌هایشان در قدم ۴.
    const links = nav(page).getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveText('سؤال‌ها');
    await expect(links).toHaveAttribute('href', '/#faq');
    await expect(page.locator('#faq')).toHaveCount(1);
  });

  test('«سؤال‌ها» صفحه را دوباره بار نمی‌کند و تا سؤال‌ها می‌رود', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      Object.assign(window, { sameDocument: true });
    });
    await nav(page).getByRole('link', { name: 'سؤال‌ها' }).click();

    await expect(page).toHaveURL(/\/#faq$/);
    await expect(page.getByRole('heading', { name: 'سؤال‌های پرتکرار' })).toBeInViewport();
    expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true);
  });

  test('در حالت سفارش ناوبری پنهان است و لوگو پیوند نیست؛ جزوهٔ خالی برش می‌گرداند', async ({ page }) => {
    await page.goto('/');
    await dropFile(page);

    // جزوهٔ نیمه‌کاره با یک کلیک پاک نمی‌شود: هیچ پیوندی در سربرگ نمانده، ولی نام سایت هست.
    await expect(homeLink(page)).toBeHidden();
    await expect(nav(page)).toBeHidden();
    await expect(header(page).getByRole('link')).toHaveCount(0);
    await expect(header(page).getByRole('img', { name: 'جزوه‌یار' })).toBeVisible();

    await page.getByRole('button', { name: 'فایل دیگری بینداز' }).click();
    await expect(homeLink(page)).toBeVisible();
    await expect(nav(page)).toBeVisible();
  });

  test('لوگو یک بار دانلود می‌شود، هرچند در سربرگ دو جا و در پاورقی هم هست', async ({ page }) => {
    const logos: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('jozveyar-logo-no-tagline')) logos.push(request.url());
    });
    await page.goto('/');
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(footer(page).getByRole('img', { name: 'جزوه‌یار' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(logos).toHaveLength(1);
  });
});

test.describe('پاورقی', () => {
  test('لوگوی تنبل، معرفی، مسئولیت محتوا و سال شمسی', async ({ page }) => {
    await page.goto('/');
    await expect(footer(page).getByRole('img', { name: 'جزوه‌یار' })).toHaveAttribute('loading', 'lazy');
    await expect(footer(page)).toContainText('چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران.');
    await expect(footer(page)).toContainText('مسئولیت محتوای فایل ارسالی بر عهدهٔ سفارش‌دهنده است.');
    // سال شمسی موقع ساخت صفحه؛ نه ۲۰۲۶ میلادی.
    await expect(footer(page)).toContainText(/© 1[34]\d\d جزوه‌یار/);
  });

  test.describe('موبایل', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    /** پایین خط «مسئولیت محتوا» و بالای نوار قیمت ثابت، وقتی صفحه تا ته پایین رفته. */
    const bottomEdges = (page: Page) =>
      page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        const legal = [...document.querySelectorAll('footer p')].find((p) => p.textContent?.includes('مسئولیت'));
        let bar = document.querySelector<HTMLElement>('[data-testid="price-total"]');
        while (bar && getComputedStyle(bar).position !== 'fixed') bar = bar.parentElement;
        return { legalBottom: legal!.getBoundingClientRect().bottom, barTop: bar!.getBoundingClientRect().top };
      });

    test('پاورقی زیر نوار قیمت ثابت نمی‌ماند', async ({ page }) => {
      await page.goto('/');
      await dropFile(page);
      const { legalBottom, barTop } = await bottomEdges(page);
      expect(legalBottom).toBeLessThanOrEqual(barTop);

      // شاهد: بی جایی که پاورقی برای نوار کنار می‌گذارد، همان خط زیر نوار می‌رفت (مثل پیش از قدم ۳).
      await page.evaluate(() => document.querySelector<HTMLElement>('footer')!.style.setProperty('padding-block-end', '24px'));
      const without = await bottomEdges(page);
      expect(without.legalBottom).toBeGreaterThan(without.barTop);
    });
  });
});

test.describe('نشانک', () => {
  test('favicon.ico و icon.svg اعلام شده‌اند و با نوع درست می‌آیند', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const icons = [...html.matchAll(/<link rel="icon" href="([^"]+)" type="([^"]+)"/g)].map(([, href, type]) => ({
      href: href!,
      type: type!,
    }));
    expect(icons.map(({ type }) => type).sort()).toEqual(['image/svg+xml', 'image/x-icon']);

    for (const { href, type } of icons) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect(response.headers()['content-type'], href).toContain(type);
      expect((await response.body()).length, href).toBeGreaterThan(0);
    }
  });
});

test.describe('۴۰۴', () => {
  test('نشانی ناموجود: کد ۴۰۴، فارسی و راست‌به‌چپ، noindex، بی canonical', async ({ request }) => {
    const response = await request.get('/no-such-page');
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).toContain('این صفحه پیدا نشد');
    expect(html).toContain('<title>صفحه پیدا نشد | جزوه‌یار</title>');
    expect(html).toMatch(/<html[^>]+lang="fa"/);
    expect(html).toMatch(/<html[^>]+dir="rtl"/);
    expect(html).toContain('noindex');
    // نه «index» و نه canonical صفحهٔ اصلی از layout به ۴۰۴ نرسیده باشد.
    expect(html).not.toMatch(/<meta name="robots" content="index/);
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('This page could not be found');
  });

  test('با سربرگ و پاورقی، و دکمه به صفحهٔ اصلی برمی‌گرداند', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(homeLink(page)).toBeVisible();
    await expect(footer(page)).toContainText('مسئولیت محتوای فایل ارسالی');
    await page.getByRole('link', { name: 'برگشت به صفحهٔ اصلی' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/جزوه‌ات را بینداز/);
  });
});

test.describe('بی منبع بیرونی و بی اسکرول افقی در ۳۹۰ پیکسل', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const pages = [
    { name: 'صفحهٔ اصلی', path: '/', order: false },
    { name: 'حالت سفارش', path: '/', order: true },
    { name: '۴۰۴', path: '/no-such-page', order: false },
  ];

  for (const { name, path, order } of pages) {
    test(name, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin;
      const external: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith('http') && url.origin !== origin) external.push(request.url());
      });

      await page.goto(path);
      if (order) await dropFile(page);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.waitForLoadState('networkidle');

      expect(external).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
