import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTACT } from '../lib/contact';

/**
 * هویت در سایت (docs/UI.md، قدم ۳): سربرگ و پاورقی با لوگوی بی‌شعار، حالت سفارش، نشانک، آیکون گوشی،
 * manifest، تصویر اشتراک، ۴۰۴، اینماد (فایل تأیید دامنه و نشان پاورقی، ADR-032)، و صفحه‌های ثابت با پیوندهای پاورقی
 * و نقشهٔ سایت (قدم ۵، برش ۷٫۴).
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

/** پیوندهای سربرگ و بخشی که هر کدام به آن می‌رود (۴الف). */
const SECTIONS = [
  { link: 'چطور کار می‌کند', id: 'how', heading: 'سه قدم تا جزوهٔ چاپ‌شده' },
  { link: 'تعرفه', id: 'tariff', heading: 'تعرفه، بی هزینهٔ پنهان' },
  { link: 'سؤال‌ها', id: 'faq', heading: 'سؤال‌های پرتکرار' },
];

test.describe('سربرگ', () => {
  test('لوگو پیوند صفحهٔ اصلی است با متن جایگزین؛ ناوبری سه بخش صفحه، هر کدام با مقصد', async ({ page }) => {
    await page.goto('/');
    await expect(homeLink(page)).toHaveAttribute('href', '/');
    await expect(homeLink(page).getByRole('img', { name: 'جزوه‌یار' })).toBeVisible();

    // پیوند فقط به جایی که وجود دارد: هر مقصد یک بخش با تیتر خودش است.
    const links = nav(page).getByRole('link');
    await expect(links).toHaveText(SECTIONS.map(({ link }) => link));
    for (const { link, id, heading } of SECTIONS) {
      await expect(nav(page).getByRole('link', { name: link })).toHaveAttribute('href', `/#${id}`);
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
      await expect(page.locator(`section#${id}`).getByRole('heading', { level: 2 })).toHaveText(heading);
    }
  });

  test('هر پیوند صفحه را دوباره بار نمی‌کند و تا بخش خودش می‌رود', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      Object.assign(window, { sameDocument: true });
    });
    for (const { link, id, heading } of SECTIONS) {
      await nav(page).getByRole('link', { name: link }).click();
      await expect(page).toHaveURL(new RegExp(`/#${id}$`));
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeInViewport();
    }
    expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true);
  });

  test.describe('موبایل', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('فقط «تعرفه» و «سؤال‌ها»، هر کدام دست‌کم ۴۴ پیکسل', async ({ page }) => {
      await page.goto('/');
      await expect(nav(page).getByRole('link', { name: 'چطور کار می‌کند' })).toBeHidden();
      for (const name of ['تعرفه', 'سؤال‌ها']) {
        const box = (await nav(page).getByRole('link', { name }).boundingBox())!;
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.width, name).toBeGreaterThanOrEqual(44);
      }
    });
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

/**
 * کد نشان اینماد، همان‌طور که اینماد داده (۱۴۰۵/۰۷/۰۳). اینماد می‌خواهد «بدون تغییر» در سایت بنشیند؛
 * سایت فقط نام پیوند را به آن افزوده، چون `alt` خالی است (ADR-032).
 */
const ENAMAD_SNIPPET =
  "<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=7896821&Code=pyzBITp0WBebVFYdP4CZIvGX69k9oy6R'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=7896821&Code=pyzBITp0WBebVFYdP4CZIvGX69k9oy6R' alt='' style='cursor:pointer' code='pyzBITp0WBebVFYdP4CZIvGX69k9oy6R'></a>";
const ENAMAD_LOGO = 'https://trustseal.enamad.ir/logo.aspx?id=7896821&Code=pyzBITp0WBebVFYdP4CZIvGX69k9oy6R';
const SEAL_NAME = 'نماد اعتماد الکترونیکی';

test.describe('اینماد', () => {
  /*
   * تأیید مالکیت دامنه (تصمیم صاحب پروژه، ۱۴۰۵/۰۷/۰۳): فایلی خالی با نام کد اینماد در ریشهٔ سایت
   * (`public/77170883.txt`). اینماد ممکن است دوباره سرش بزند، پس فایل می‌ماند و این تست جلوی پاک
   * شدنش را می‌گیرد.
   */
  test('فایل خالی تأیید دامنه در ریشهٔ سایت است', async ({ request }) => {
    const response = await request.get('/77170883.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect((await response.body()).length).toBe(0);
  });

  /*
   * نشان در پاورقی همهٔ صفحه‌ها. ویژگی‌های پیوند و تصویر باید همان کد اینماد باشند: `referrerpolicy`
   * که دامنه را به اینماد می‌رساند، `target` که جزوهٔ نیمه‌کاره را نگه می‌دارد، و بی `rel`، که به گفتهٔ
   * اینماد با `noopener noreferrer` نشان نمایش داده نمی‌شود. تنها افزوده `aria-label` پیوند است.
   */
  for (const { name, path, order } of [
    { name: 'صفحهٔ اصلی', path: '/', order: false },
    { name: 'حالت سفارش', path: '/', order: true },
    { name: '۴۰۴', path: '/no-such-page', order: false },
    { name: 'قوانین', path: '/terms', order: false },
  ]) {
    test(`نشان در پاورقی، عین کد اینماد و با نام پیوند: ${name}`, async ({ page }) => {
      await page.goto(path);
      if (order) await dropFile(page);
      const seal = footer(page).getByRole('link', { name: SEAL_NAME });
      await expect(seal).toBeVisible();
      const { actual, given } = await seal.evaluate((link, snippet) => {
        const attributes = (el: Element) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
        const template = document.createElement('template');
        template.innerHTML = snippet;
        const code = template.content.firstElementChild!;
        return {
          actual: { link: attributes(link), children: [...link.children].map(attributes) },
          given: { link: attributes(code), children: [...code.children].map(attributes) },
        };
      }, ENAMAD_SNIPPET);
      expect(actual).toEqual({ ...given, link: { ...given.link, 'aria-label': SEAL_NAME } });
    });
  }
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

test.describe('آیکون گوشی، manifest و تصویر اشتراک', () => {
  /** مقدار content یک meta، با property یا name. */
  const meta = (html: string, key: string) =>
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
  /** اندازهٔ یک PNG از سرآیندش. */
  const pngSize = (png: Buffer) => `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`;
  /** یک رنگ از فایل برند؛ کد رنگ در تست نوشته نمی‌شود. */
  const brandColor = (token: string) =>
    new RegExp(`--jy-${token}\\s*:\\s*(#[0-9A-Fa-f]{6})`).exec(
      readFileSync(join(process.cwd(), '..', '..', 'docs', 'brand', 'jozveyar-colors.css'), 'utf8'),
    )?.[1];

  async function getPng(request: APIRequestContext, href: string) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(response.headers()['content-type'], href).toContain('image/png');
    return response.body();
  }

  test('apple-touch-icon: PNG ۱۸۰ پیکسلی', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const link = /<link rel="apple-touch-icon" href="([^"]+)" type="([^"]+)" sizes="([^"]+)"/.exec(html);
    expect(link?.slice(2)).toEqual(['image/png', '180x180']);
    expect(pngSize(await getPng(request, link![1]!))).toBe('180×180');
  });

  test('manifest: فارسی و راست‌به‌چپ، green-50، و آیکون‌های ۱۹۲ و ۵۱۲ با نوع درست', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const href = /<link rel="manifest" href="([^"]+)"/.exec(html)?.[1];
    expect(href).toBe('/manifest.webmanifest');
    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');

    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'جزوه‌یار',
      short_name: 'جزوه‌یار',
      lang: 'fa',
      dir: 'rtl',
      start_url: '/',
      display: 'browser',
    });
    // همان رنگ نوار مرورگر صفحه (BAND_COLOR، نوار بالای صفحه)، که green-50 است.
    expect(manifest.theme_color).toBe(meta(html, 'theme-color'));
    expect(manifest.background_color).toBe(brandColor('green-50'));

    const icons: { src: string; sizes: string; type: string; purpose: string }[] = manifest.icons;
    expect(icons.map(({ src, sizes, purpose }) => `${src} ${sizes} ${purpose}`)).toEqual([
      '/icons/icon-192.png 192x192 any',
      '/icons/icon-512.png 512x512 any',
      '/icons/icon-512.png 512x512 maskable',
    ]);
    for (const { src, sizes, type } of icons) {
      expect(type).toBe('image/png');
      expect(pngSize(await getPng(request, src))).toBe(sizes.replace('x', '×'));
    }
  });

  test('og:image نشانی مطلق دارد و PNG ۱۲۰۰×۶۳۰ است؛ توییتر کارت بزرگ همان تصویر را دارد', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const image = meta(html, 'og:image');
    // شبکه‌های اجتماعی نشانی نسبی را نمی‌خوانند؛ دامنه همان canonical است (metadataBase).
    expect(image).toMatch(/^https?:\/\//);
    const url = new URL(image!);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(url.origin).toBe(new URL(canonical!).origin);
    expect(url.pathname).toBe('/opengraph-image.png');

    expect(meta(html, 'og:image:type')).toBe('image/png');
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(meta(html, 'og:image:alt')).toContain('جزوه‌ات را بینداز، قیمت را همین حالا ببین');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'twitter:image')).toBe(image);

    // همین تصویر را سرور خودمان می‌دهد؛ دامنهٔ تولید از اینجا در دسترس نیست.
    expect(pngSize(await getPng(request, url.pathname + url.search))).toBe('1200×630');
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

/**
 * صفحه‌های ثابت (قدم ۵، برش ۷٫۴؛ طرح `checkout.html`، سؤال ۱۴۲)، به ترتیب پاورقی. «تماس» فقط با اطلاعات تماس واقعی
 * (`lib/contact.ts`): اطلاعات ساختگی روی سایت زنده نمی‌رود، پس تا آن موقع ۴۰۴ است و در پاورقی و نقشهٔ سایت نیست. با رسیدن
 * اطلاعات، همین فهرست و تست‌ها خودشان صفحهٔ تماس را هم می‌سنجند.
 */
const STATIC_PAGES = [
  { path: '/about', label: 'دربارهٔ ما', heading: 'دربارهٔ جزوه‌یار' },
  ...(CONTACT ? [{ path: '/contact', label: 'تماس', heading: 'تماس با جزوه‌یار' }] : []),
  { path: '/terms', label: 'قوانین و مقررات', heading: 'قوانین جزوه‌یار' },
  { path: '/privacy', label: 'حریم خصوصی', heading: 'حریم خصوصی' },
];
const footerNav = (page: Page) => footer(page).getByRole('navigation', { name: 'پیوندهای پاورقی' });

test.describe('صفحه‌های ثابت', () => {
  for (const { path, label, heading } of STATIC_PAGES) {
    test(`${label}: ۲۰۰، فارسی و راست‌به‌چپ، عنوان و canonical خودش، تصویر اشتراک، سربرگ و پاورقی`, async ({ page, request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<title>${label} | جزوه‌یار</title>`);
      expect(html).toMatch(/<html[^>]+lang="fa"/);
      expect(html).toMatch(/<html[^>]+dir="rtl"/);
      expect(html).toMatch(/<meta name="robots" content="index, follow"/);
      // canonical خود صفحه، نه canonical صفحهٔ اصلی از layout؛ و openGraph صفحه تصویر اشتراک سایت را گم نکرده باشد.
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
      expect(new URL(canonical!).pathname).toBe(path);
      expect(/<meta property="og:url" content="([^"]+)"/.exec(html)?.[1]).toBe(canonical);
      expect(/<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]).toMatch(/\/opengraph-image\.png/);
      expect(/<meta name="twitter:card" content="([^"]+)"/.exec(html)?.[1]).toBe('summary_large_image');

      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(homeLink(page)).toBeVisible();
      await expect(nav(page)).toBeVisible();
      await expect(footerNav(page).getByRole('link', { name: label })).toHaveAttribute('href', path);
    });
  }

  test('قوانین و حریم خصوصی: عددها همان پیش‌فرض‌های سایت، «به‌روز شده» شمسی، و بازپرداخت بی وعدهٔ «همان کارت»', async ({ page }) => {
    // این مرحله پایگاه داده ندارد، پس عددها پیش‌فرض‌اند: روز کاری تحویل ۲، آپلود ۲ روز، فایل‌های سفارش ۳۰ روز
    // (`lib/server/siteFacts.ts`؛ خواندن از settings در تست واحد).
    await page.goto('/terms');
    const terms = page.getByRole('article');
    await expect(page.getByText(/^به‌روز شده در \d{4}\/\d{2}\/\d{2}$/)).toBeVisible();
    await expect(terms).toContainText('جزوه تا 2 روز کاری بعد از پرداخت به پست تحویل می‌شود.');
    await expect(terms).toContainText('فایلی که می‌اندازی 2 روز بعد خودکار از سرور پاک می‌شود');
    await expect(terms).toContainText('30 روز پس از تحویل به پست یا لغو سفارش');
    // بازپرداخت سفارش لغوشده امروز دستی است (۷٫۳)؛ متن «به همان کارت» نمی‌گوید، فقط پرداخت تأییدنشده را.
    const refund = terms.getByRole('heading', { level: 2, name: 'لغو و بازپرداخت' }).locator('xpath=following-sibling::*[1]');
    await expect(refund).toHaveText('اگر سفارشی پیش از تحویل به پست لغو شود، مبلغ کاملش برمی‌گردد، و وضعیت برگشت در صفحهٔ سفارش دیده می‌شود.');
    await expect(refund).not.toContainText('کارت');

    await page.goto('/privacy');
    const privacy = page.getByRole('article');
    await expect(page.getByText(/^به‌روز شده در \d{4}\/\d{2}\/\d{2}$/)).toBeVisible();
    await expect(privacy).toContainText('2 روز بعد خودکار پاک می‌شود');
    await expect(privacy).toContainText('30 روز پس از تحویل به پست');
    await expect(privacy).toContainText('(30 روز)');
  });

  test('تماس فقط با اطلاعات واقعی: تا آن موقع ۴۰۴، نه در پاورقی و نه در نقشهٔ سایت', async ({ page, request }) => {
    const response = await request.get('/contact');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    await page.goto('/');
    if (!CONTACT) {
      expect(response.status()).toBe(404);
      expect(await response.text()).toContain('این صفحه پیدا نشد');
      await expect(footer(page).getByRole('link', { name: 'تماس' })).toHaveCount(0);
      expect(sitemap).not.toContain('/contact');
      return;
    }
    expect(response.status()).toBe(200);
    await expect(footerNav(page).getByRole('link', { name: 'تماس' })).toHaveAttribute('href', '/contact');
    expect(sitemap).toContain('/contact');
    await page.goto('/contact');
    for (const value of Object.values(CONTACT).filter((value) => value !== undefined)) {
      await expect(page.getByRole('article')).toContainText(value);
    }
  });

  test('نقشهٔ سایت: صفحهٔ اصلی و صفحه‌های ثابت، به ترتیب پاورقی', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc!).pathname);
    expect(locs).toEqual(['/', ...STATIC_PAGES.map(({ path }) => path)]);
  });

  test('پاورقی: دو گروه طرح با همهٔ صفحه‌ها؛ بی جزوه همان زبانه', async ({ page }) => {
    await page.goto('/');
    await expect(footerNav(page).getByRole('heading', { level: 2 })).toHaveText(['جزوه‌یار', 'قوانین']);
    // هر پیوند یک بار در درخت دسترسی است، هرچند در HTML دو بار است (حالت عادی و حالت سفارش).
    await expect(footerNav(page).getByRole('link')).toHaveText(STATIC_PAGES.map(({ label }) => label));
    for (const { label } of STATIC_PAGES) {
      await expect(footerNav(page).getByRole('link', { name: label })).not.toHaveAttribute('target', /.+/);
    }

    let popups = 0;
    page.on('popup', () => popups++);
    await footerNav(page).getByRole('link', { name: 'قوانین و مقررات' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('قوانین جزوه‌یار');
    expect(popups).toBe(0);
  });

  test('در حالت سفارش پیوندها زبانهٔ تازه باز می‌کنند و جزوهٔ نیمه‌کاره سر جایش می‌ماند', async ({ page }) => {
    await page.goto('/');
    await dropFile(page);
    await expect(footerNav(page).getByRole('link')).toHaveText(STATIC_PAGES.map(({ label }) => label));
    for (const { label } of STATIC_PAGES) {
      const link = footerNav(page).getByRole('link', { name: label });
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener');
    }

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      footerNav(page).getByRole('link', { name: 'حریم خصوصی' }).click(),
    ]);
    await expect(popup).toHaveURL(/\/privacy$/);
    await expect(popup.getByRole('heading', { level: 1 })).toHaveText('حریم خصوصی');
    await popup.close();
    await expect(price(page)).toContainText('61,000');
    await expect(page).toHaveURL(/\/$/);
  });

  test.describe('موبایل', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('پیوندهای پاورقی هر کدام دست‌کم ۴۴ پیکسل', async ({ page }) => {
      await page.goto('/terms');
      for (const { label } of STATIC_PAGES) {
        const box = (await footerNav(page).getByRole('link', { name: label }).boundingBox())!;
        expect(box.height, label).toBeGreaterThanOrEqual(44);
        expect(box.width, label).toBeGreaterThanOrEqual(44);
      }
    });
  });
});

for (const width of [320, 390, 1280]) {
  test.describe(`تنها منبع بیرونی نشان اینماد، و بی اسکرول افقی در ${width} پیکسل`, () => {
    test.use({ viewport: { width, height: width < 1000 ? 844 : 800 } });

    const pages = [
      { name: 'صفحهٔ اصلی', path: '/', order: false },
      { name: 'حالت سفارش', path: '/', order: true },
      { name: '۴۰۴', path: '/no-such-page', order: false },
      ...STATIC_PAGES.map(({ label, path }) => ({ name: label, path, order: false })),
    ];

    for (const { name, path, order } of pages) {
      test(name, async ({ page, baseURL }) => {
        const origin = new URL(baseURL!).origin;
        const external: { url: string; referer?: string }[] = [];
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.protocol.startsWith('http') && url.origin !== origin) {
            external.push({ url: request.url(), referer: request.headers()['referer'] });
          }
        });

        await page.goto(path);
        if (order) await dropFile(page);
        // ریز تعرفه و سؤال‌ها باز، تا جدول و متن‌شان هم سنجیده شوند
        await page.evaluate(() => document.querySelectorAll('details').forEach((details) => (details.open = true)));
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForLoadState('networkidle');

        // تنها منبع بیرونی تصویر نشان اینماد است، یک بار (ADR-032). اینماد دامنه را از Referer می‌خواند:
        // فقط دامنه می‌رسد، نه نشانی صفحه (۴۰۴ مسیر دارد)، و نه هیچ، که بی آن نشان نمایش داده نمی‌شود.
        expect(external).toEqual([{ url: ENAMAD_LOGO, referer: `${origin}/` }]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  });
}
