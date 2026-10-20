import { randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, pngOf, pngSize, serverInvite, watch, WRONG } from './helpers';

/**
 * لوگو و بنر صفحهٔ اصلی، سرتاسری (برش ۱۱٫۲؛ ADR-067، سؤال ۲۰۶): مالک از «محتوای سایت» لوگو بارگذاری می‌کند؛ SVG همان‌جا رد می‌شود، لوگوی کوچک را
 * کارگر واقعی (`build_site_image`) با پیام خودش رد می‌کند، و لوگوی درست با همهٔ فایل‌های ساخته‌اش (سربرگ، نشانک، آیکون گوشی، تصویر اشتراک) می‌آید؛
 * لوگویی که SQL پشت سر صفحه عوض کرد پیش از کد رد می‌شود، و با کد تازه روی سایت می‌رود تا سربرگ، پاورقی، نشانک، تصویر اشتراک و manifest همان وب
 * ۳۱۰۱ (`E2E_WEB_BASE_URL`، ISR یک دقیقه‌ای) همان شوند، با `/media/<sha256>` که فقط فایل روی سایت رفته را می‌دهد؛ و «برگشت به لوگوی جزوه‌یار».
 * متصدی بنر را با تصویر دسکتاپ و گوشی بارگذاری می‌کند، خطای متن جایگزین و پیوند را بی کد می‌بیند، و با کد تازه روشنش می‌کند تا بالای سه قدم صفحهٔ
 * اصلی بیاید (گوشی تصویر خودش را)، و «خاموش کن» بی کد. حسابدار هیچ‌کدام را ندارد و متصدی لوگو را نه.
 *
 * ادمین‌ها با دستور سرور، و نقش حسابدار با SQL. لوگو و بنر دو تنظیم‌اند (`content.logo` و `content.banner`): در آغاز و پایان لوگوی برند و بنر خاموش.
 * بارگذاری‌ای که روی سایت رفت پاک‌نشدنی است (`site_images_published_kept`) و ماندنش در پایگاه دادهٔ آزمایشی بی اثر است؛ رویدادها هم، پس فقط
 * رویدادهای پس از آغاز همین اجرا سنجیده می‌شوند. تصویرها را `pngOf` همین‌جا می‌سازد.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل، پایگاه داده و کارگر دوم؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` سایت سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const ISR = { timeout: 100_000, intervals: [5_000] };
const WORKER = { timeout: 60_000 };
const BANNER_OFF = { mode: 'off', imageId: null, alt: '', href: '' };
const MEDIA = /^\/media\/[0-9a-f]{64}\.(png|jpg|ico)$/;

/** رنگ‌های فایل برند (green-600، green-200، green-50 و کاغذ)، به شکل RGBA. */
type Rgba = readonly [number, number, number, number];
const GREEN: Rgba = [0x6c, 0x79, 0x5e, 255];
const LIGHT: Rgba = [0xd4, 0xdf, 0xca, 255];
const BAND: Rgba = [0xf2, 0xf7, 0xee, 255];
const PAPER: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** لوگوی پهن (۶۰۰ در ۱۶۰ پس از بریدن حاشیهٔ شفاف ۲۰ پیکسلی، نسبت ۳٫۷۵): در گوشی ۳۲۰ پیکسلی کوچک می‌شود تا ناوبری جا شود. */
const LOGO = pngOf(640, 200, (x, y) => (x < 20 || x >= 620 || y < 20 || y >= 180 ? CLEAR : x < 180 ? GREEN : LIGHT));
/** لوگوی کوتاه: ارتفاع ۱۰۰ پیکسل، کمتر از ۱۲۸. */
const SMALL = pngOf(300, 100, () => GREEN);
/** نشان مربع ۲۴۰ پیکسلی، برای نشانک و آیکون گوشی. */
const MARK = pngOf(240, 240, (x, y) => (Math.hypot(x - 120, y - 120) < 100 ? GREEN : CLEAR));
/** بنر دسکتاپ ۱۲۰۰ در ۴۰۰ (نسبت ۳) و گوشی ۷۲۰ در ۳۶۰ (نسبت ۲)، مات، پس کارگر JPEG می‌سازد. */
const DESKTOP = pngOf(1200, 400, (x) => (x < 400 ? GREEN : x < 800 ? LIGHT : BAND));
const MOBILE = pngOf(720, 360, (_x, y) => (y < 180 ? GREEN : PAPER));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><script>alert(1)</script></svg>');

let sql: postgres.Sql;
/** آخرین رویداد پیش از این فایل: رویدادها پاک‌نشدنی‌اند (`admin_events_append_only`)، پس فقط رویدادهای همین اجرا سنجیده می‌شوند. */
let before = 0;
/** شمارهٔ بارگذاری‌های این اجرا، برای تست‌های بعدی. */
const ids = { logo: 0, banner: 0 };

const setting = async (key: string) => (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${key}`)[0]?.value;
const fileSha = async (id: number, name: string) =>
  (await sql<{ sha256: string }[]>`SELECT sha256 FROM site_image_files WHERE image_id = ${id} AND name = ${name}`)[0]?.sha256;
const events = (action: string) =>
  sql<{ detail: Record<string, unknown> }[]>`SELECT detail FROM admin_events WHERE action = ${action} AND id > ${before} ORDER BY id`;

/** صفحه‌ای از سایت در زبانهٔ تازه؛ نشان اینماد پاورقی جواب خالی می‌گیرد، مثل `bar.spec.ts`. */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

/** نشانی لوگوی سربرگ صفحهٔ اصلی سایت، برای پاییدن ISR. */
async function headerLogo(site: Page): Promise<string> {
  const response = await site.goto(`${WEB}/`);
  if (!response?.ok()) return `HTTP ${response?.status()}`;
  return (await site.locator('.site-logo.site-idle img').getAttribute('src')) ?? '';
}

/** هر `<img>` درون این بخش بار شده و پهنا دارد. */
async function allLoaded(page: Page, selector: string): Promise<boolean> {
  return page.locator(`${selector} img`).evaluateAll((imgs) => imgs.length > 0 && imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
}

/** بارگذاری یک یا دو فایل از فرم صفحهٔ همان نوع، و شمارهٔ بارگذاری از نشانی صفحه‌ای که پس از آن باز می‌شود. */
async function upload(page: Page, kind: 'logo' | 'banner', main: { name: string; buffer: Buffer }, extra?: { name: string; buffer: Buffer }): Promise<number> {
  await page.goto(at(`/content/${kind}`));
  await page.locator('input[name="main"]').setInputFiles({ ...main, mimeType: 'image/png' });
  if (extra) await page.locator('input[name="extra"]').setInputFiles({ ...extra, mimeType: 'image/png' });
  await page.getByRole('button', { name: 'بارگذاری' }).click();
  await expect(page).toHaveURL(new RegExp(`/content/${kind}/\\d+\\?done=upload$`));
  return Number(/\/content\/(?:logo|banner)\/(\d+)/.exec(page.url())![1]);
}

test.describe.serial('لوگو و بنر (۱۱٫۲)', () => {
  const users = { owner: `sima${RUN}`, operator: `navid${RUN}`, accountant: `mina${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[]; secret: string }>;

  test.beforeAll(async ({ browser }) => {
    // «امروز 10:05» زیر کارت‌ها تا نیمه‌شب تهران است، و کل این فایل با چهار صبر ISR چند دقیقه است.
    await awayFromMidnight(240_000, 12 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`UPDATE settings SET value = ${sql.json({ imageId: null })} WHERE key = 'content.logo'`;
    await sql`UPDATE settings SET value = ${sql.json(BANNER_OFF)} WHERE key = 'content.banner'`;
    before = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]?.id ?? 0);
    for (const [key, name] of [
      ['owner', 'سیما کرمی'],
      ['operator', 'نوید شریفی'],
      ['accountant', 'مینا صالحی'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      const secret = await enroll(page, serverInvite(users[key], key === 'owner' ? '--owner' : '--operator', '--name', name));
      who[key] = { context, page, problems, secret };
    }
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.accountant})`;
  });

  test.afterAll(async () => {
    if (sql) {
      await sql`UPDATE settings SET value = ${sql.json({ imageId: null })} WHERE key = 'content.logo'`;
      await sql`UPDATE settings SET value = ${sql.json(BANNER_OFF)} WHERE key = 'content.banner'`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: SVG و لوگوی کوچک رد؛ لوگوی درست با همهٔ فایل‌هایش، و با کد تازه روی سربرگ، نشانک، تصویر اشتراک و manifest سایت؛ و برگشت به لوگوی جزوه‌یار', async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const { page, problems, secret } = who.owner;
    await page.goto(at('/content'));
    const card = page.getByTestId('content-logo');
    await expect(card).toContainText('لوگوی جزوه‌یار، همان فایل برند. نشانک مرورگر، آیکون گوشی و تصویر اشتراک هم از همین است.');
    await card.getByRole('link', { name: 'عوض کردن' }).click();
    await expect(page).toHaveURL(/\/content\/logo$/);
    await expect(page.getByRole('heading', { level: 1, name: 'لوگو' })).toBeVisible();
    await expect(page.getByTestId('logo-live')).toContainText('لوگوی جزوه‌یار');
    await expect(page.getByTestId('logo-live').getByRole('link', { name: 'برگشت به لوگوی جزوه‌یار…' })).toHaveCount(0);

    // SVG با پسوند png: همین‌جا از خود بایت‌ها، زیر همان فیلد؛ هیچ بارگذاری‌ای نمی‌نشیند.
    const rows = async () => Number((await sql<{ n: string }[]>`SELECT count(*) AS n FROM site_images`)[0]!.n);
    const count = await rows();
    await page.locator('input[name="main"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: SVG });
    await page.getByRole('button', { name: 'بارگذاری' }).click();
    await expect(page.locator('#img-logo-main-error')).toHaveText('SVG پذیرفته نیست، چون اسکریپت می‌پذیرد؛ همان تصویر را PNG یا WebP بارگذاری کن.');
    expect(await rows()).toBe(count);

    // لوگوی کوتاه: کارگر واقعی با پیام خودش رد می‌کند؛ صفحه تا آن وقت «در حال آماده شدن» است و خودش تازه می‌شود.
    await upload(page, 'logo', { name: 'کوچک.png', buffer: SMALL });
    await expect(page.locator('[data-image-page]')).toHaveAttribute('data-image-page', 'failed', WORKER);
    await expect(page.locator('[data-image-error="too_small"]')).toContainText(
      'ساخته نشد: لوگو: ارتفاع پس از بریدن حاشیهٔ شفاف 100 پیکسل است؛ دست‌کم 128 پیکسل لازم است',
    );
    await expect(page.locator('.ad-title-row [data-image-state]')).toHaveText('ساخته نشد');
    await expect(page.getByRole('heading', { name: 'روی سایت بگذار' })).toHaveCount(0);

    // لوگوی درست: همهٔ فایل‌هایی که سایت می‌دهد، بار شده؛ لوگو ۱۲۸ پیکسل ارتفاع و تصویر اشتراک ۱۲۰۰ در ۶۳۰.
    const id = await upload(page, 'logo', { name: 'لوگوی تازه.png', buffer: LOGO });
    ids.logo = id;
    await expect(page.getByText(/^نسخهٔ \d+ بارگذاری شد\./)).toBeVisible();
    await expect(page.locator('[data-image-page]')).toHaveAttribute('data-image-page', 'ready', WORKER);
    await expect(page.locator('.ad-title-row [data-image-state]')).toHaveText('آماده');
    const files = page.getByTestId('logo-files');
    for (const name of ['favicon', 'apple', 'icon512', 'og']) await expect(files.locator(`[data-file="${name}"]`)).toBeVisible();
    await expect.poll(() => allLoaded(page, '[data-testid="logo-files"]')).toBe(true);
    const preview = (name: string) => page.request.get(at(`/content/images/${id}/${name}`));
    for (const [name, width, height] of [
      ['logo', 480, 128],
      ['og', 1200, 630],
      ['apple', 180, 180],
    ] as const) {
      const response = await preview(name);
      expect(response.headers()['content-type'], name).toBe('image/png');
      expect(pngSize(await response.body()), name).toEqual({ width, height });
    }
    expect((await preview('favicon')).headers()['content-type']).toBe('image/x-icon');

    // لوگویی که SQL پشت سر صفحه عوض کرد: پیش از کد رد، با حال تازه.
    await sql`UPDATE settings SET value = ${sql.json({ imageId: 999_999 })} WHERE key = 'content.logo'`;
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.getByText('لوگوی روی سایت همین حالا جای دیگری عوض شد؛ حال تازه را ببین و اگر هنوز لازم است دوباره بزن.')).toBeVisible();
    expect(await setting('content.logo')).toEqual({ imageId: 999_999 });
    await sql`UPDATE settings SET value = ${sql.json({ imageId: null })} WHERE key = 'content.logo'`;

    // کد نادرست، بعد کد تازه.
    await page.goto(at(`/content/logo/${id}`));
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await setting('content.logo')).toEqual({ imageId: null });
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page).toHaveURL(/\/content\/logo\?done=publish&v=\d+/);
    await expect(page.getByText(/^لوگوی نسخهٔ \d+ روی سایت رفت؛ تا یک دقیقه بعد سربرگ، پاورقی، نشانک، آیکون گوشی و تصویر اشتراک همهٔ صفحه‌ها همین است\.$/)).toBeVisible();
    const live = page.getByTestId('logo-live');
    await expect(live.locator('img')).toHaveAttribute('src', at(`/content/images/${id}/logo`));
    await expect(live).toContainText(/از امروز \d{2}:\d{2}، سیما کرمی، با کد تازه\./);
    expect(await setting('content.logo')).toEqual({ imageId: id });
    expect((await events('content.logo')).map(({ detail }) => [detail.change, detail.imageId, detail.fresh])).toEqual([['publish', id, true]]);

    if (WEB) {
      const site = await sitePage(page.context());
      const logoSrc = `/media/${await fileSha(id, 'logo')}.png`;
      await expect.poll(() => headerLogo(site), ISR).toBe(logoSrc);
      await expect(site.locator('.site-foot__brand img')).toHaveAttribute('src', logoSrc);
      // نشانک و آیکون گوشی و تصویر اشتراک هم، و هیچ فایل برند کنارشان.
      const html = await (await site.request.get(`${WEB}/`)).text();
      const icons = [...html.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"]+)"/g)].map(([, rel, href]) => `${rel} ${href}`);
      expect(icons).toEqual([
        `icon /media/${await fileSha(id, 'favicon')}.ico`,
        `icon /media/${await fileSha(id, 'icon192')}.png`,
        `apple-touch-icon /media/${await fileSha(id, 'apple')}.png`,
      ]);
      expect(new URL(/<meta property="og:image" content="([^"]+)"/.exec(html)![1]!).pathname).toBe(`/media/${await fileSha(id, 'og')}.png`);
      // manifest ساعت ISR خودش را دارد.
      const [icon192, icon512] = [`/media/${await fileSha(id, 'icon192')}.png`, `/media/${await fileSha(id, 'icon512')}.png`];
      await expect
        .poll(async () => ((await (await site.request.get(`${WEB}/manifest.webmanifest`)).json()) as { icons: { src: string }[] }).icons.map((i) => i.src), ISR)
        .toEqual([icon192, icon512, icon512]);
      // `/media/…`: کش همیشگی، nosniff، و همان PNG ۱۲۸ پیکسلی.
      const media = await site.request.get(`${WEB}${logoSrc}`);
      expect(media.status()).toBe(200);
      expect(media.headers()['content-type']).toBe('image/png');
      expect(media.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(media.headers()['x-content-type-options']).toBe('nosniff');
      expect(pngSize(await media.body())).toEqual({ width: 480, height: 128 });
      await site.close();

      // گوشی ۳۲۰ پیکسلی: لوگوی پهن کوچک می‌شود، ناوبری می‌ماند، بی سرریز افقی.
      const narrow = await newContext(browser, { width: 320, height: 700 });
      const phone = await sitePage(narrow);
      await phone.goto(`${WEB}/`);
      const logoBox = await phone.locator('.site-logo.site-idle img').boundingBox();
      expect(logoBox!.height).toBeLessThanOrEqual(56);
      expect(logoBox!.height).toBeGreaterThan(20);
      // از ۱۲٫۱ پیوندهای گوشی «تعرفه» و «سفارش‌های من» است، نه «سؤال‌ها».
      for (const name of ['تعرفه', 'سفارش‌های من']) {
        await expect(phone.getByRole('navigation', { name: 'پیوندهای صفحه' }).getByRole('link', { name })).toBeVisible();
      }
      expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await narrow.close();
    }

    // بارگذاری با نشان، که روی سایت نمی‌رود: پیش‌نمایش پنل آری، `/media/…` سایت نه.
    const other = await upload(page, 'logo', { name: 'لوگو.png', buffer: LOGO }, { name: 'نشان.png', buffer: MARK });
    await expect(page.locator('[data-image-page]')).toHaveAttribute('data-image-page', 'ready', WORKER);
    expect((await page.request.get(at(`/content/images/${other}/favicon`))).status()).toBe(200);
    if (WEB) expect((await page.request.get(`${WEB}/media/${await fileSha(other, 'favicon')}.ico`)).status()).toBe(404);

    // برگشت به لوگوی جزوه‌یار: دو پیش‌نمایش کنار هم، و کد تازه.
    await page.goto(at('/content/logo'));
    await page.getByTestId('logo-live').getByRole('link', { name: 'برگشت به لوگوی جزوه‌یار…' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'برگشت به لوگوی جزوه‌یار' })).toBeVisible();
    await expect(page.locator('[data-logo-preview]')).toHaveCount(2);
    await expect(page.locator(`[data-logo-preview="${id}"]`)).toBeVisible();
    await expect(page.locator('[data-logo-preview="brand"]')).toBeVisible();
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'برگشت به لوگوی جزوه‌یار' }).click();
    await expect(page).toHaveURL(/\/content\/logo\?done=brand/);
    await expect(page.getByText('لوگوی جزوه‌یار برگشت؛ تا یک دقیقه بعد روی سایت است.')).toBeVisible();
    await expect(page.getByTestId('logo-live')).toContainText('لوگوی جزوه‌یار');
    expect(await setting('content.logo')).toEqual({ imageId: null });
    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => headerLogo(site), ISR).not.toMatch(MEDIA);
      expect(await headerLogo(site)).toMatch(/\.svg$/);
      await site.close();
    }

    // رویدادها زیر «محتوای سایت»، بی نام فایل.
    await page.goto(at('/events?kind=content'));
    const log = page.locator('main');
    await expect(log).toContainText('لوگو به لوگوی جزوه‌یار برگشت، با کد تازه');
    await expect(log).toContainText(/لوگوی نسخهٔ \d+ روی سایت رفت، با کد تازه/);
    await expect(log).toContainText(/لوگوی تازه بارگذاری شد، نسخهٔ \d+/);
    await expect(log).not.toContainText('لوگوی تازه.png');
    expect((await events('content.upload')).map(({ detail }) => detail.kind)).toEqual(['logo', 'logo', 'logo']);
    expect(problems).toEqual([]);
  });

  test('متصدی: بنر با تصویر دسکتاپ و گوشی؛ خطای فیلدها بی کد، روشن کردن با کد تازه تا بالای سه قدم صفحهٔ اصلی، و «خاموش کن» بی کد', async ({ browser }) => {
    test.setTimeout(360_000);
    const { page, problems, secret } = who.operator;
    await page.goto(at('/content'));
    await expect(page.getByTestId('content-bar')).toBeVisible();
    await expect(page.getByTestId('content-logo')).toHaveCount(0);
    await expect(page.getByTestId('content-texts')).toHaveCount(0);
    const card = page.getByTestId('content-banner');
    await expect(card.locator('[data-banner-state]')).toHaveText('خاموش');
    await expect(card).toContainText('تصویری ندارد؛ با «ویرایش» بارگذاری‌اش کن و روی سایت بگذار.');
    await card.getByRole('link', { name: 'ویرایش' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'بنر صفحهٔ اصلی' })).toBeVisible();

    const id = await upload(page, 'banner', { name: 'بنر.png', buffer: DESKTOP }, { name: 'بنر گوشی.png', buffer: MOBILE });
    ids.banner = id;
    await expect(page.locator('[data-image-page]')).toHaveAttribute('data-image-page', 'ready', WORKER);
    await expect.poll(() => allLoaded(page, '[data-testid="banner-files"]')).toBe(true);
    // مات است، پس کارگر JPEG ساخت.
    for (const name of ['desktop', 'mobile']) {
      expect((await page.request.get(at(`/content/images/${id}/${name}`))).headers()['content-type'], name).toBe('image/jpeg');
    }

    // متن جایگزین خالی و پیوند به سایت دیگر: خطای هر دو زیر فیلدشان، پیش از کد.
    await page.getByLabel('پیوند (اختیاری)').fill('https://t.me/jozveyar');
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.getByText('بنر ذخیره نشد؛ خطای هر فیلد زیر همان فیلد است.')).toBeVisible();
    await expect(page.locator('#banner-alt-error')).toHaveText('خالی است.');
    await expect(page.locator('#banner-href-error')).toContainText('پیوند بنر فقط به صفحه‌ای از همین سایت می‌رود');
    await expect(page.locator('#step-code-error')).toHaveCount(0);
    const alt = `تخفیف دانشجویی ${RUN}`;
    await page.getByLabel('متن جایگزین').fill(alt);
    await page.getByLabel('پیوند (اختیاری)').fill('/#tariff');
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('روشن کردن و هر تغییر بنر روشن کد تازهٔ برنامهٔ تأیید می‌خواهد؛ «خاموش کن» بی کد است.');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await setting('content.banner')).toEqual(BANNER_OFF);
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page).toHaveURL(/\/content\/banner\?done=on/);
    await expect(page.getByText('بنر روشن شد؛ تا یک دقیقه بعد روی صفحهٔ اصلی است.')).toBeVisible();
    await expect(page.locator('.ad-title-row [data-banner-state]')).toHaveText('روشن');
    await expect(page.getByTestId('banner-live')).toContainText(`پیوند به تعرفهٔ صفحهٔ اصلی. متن جایگزین: «${alt}».`);
    expect(await setting('content.banner')).toEqual({ mode: 'on', imageId: id, alt, href: '/#tariff' });

    // همان متن و پیوند دوباره: بی کد و بی رویداد.
    await page.goto(at(`/content/banner/${id}`));
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page).toHaveURL(/\/content\/banner\?done=same/);
    await expect(page.getByText('چیزی عوض نشد؛ بنر همان است که بود.')).toBeVisible();
    expect((await events('content.banner')).map(({ detail }) => [detail.change, detail.fresh])).toEqual([['on', true]]);

    if (WEB) {
      const site = await sitePage(page.context());
      const banner = site.locator('.home-banner');
      // بی صبر Playwright برای عنصری که هنوز نیست: `getAttribute` تا آمدنش می‌ماند و صفحه دیگر خوانده نمی‌شد.
      const bannerAlt = async () => {
        await site.goto(`${WEB}/`);
        return site.evaluate(() => document.querySelector('.home-banner img')?.getAttribute('alt') ?? '');
      };
      await expect.poll(bannerAlt, ISR).toBe(alt);
      await expect(banner.locator('a')).toHaveAttribute('href', '/#tariff');
      await expect(banner.locator('source')).toHaveAttribute('media', '(max-width: 520px)');
      await expect(banner.locator('source')).toHaveAttribute('srcset', `/media/${await fileSha(id, 'mobile')}.jpg`);
      await expect(banner.locator('img')).toHaveAttribute('src', `/media/${await fileSha(id, 'desktop')}.jpg`);
      // بالای سه قدم؛ و پس از انداختن فایل (نشانهٔ `data-jozve` جزیرهٔ سفارش) کنار می‌رود.
      expect(await site.evaluate(() => document.querySelector('.home-banner')?.nextElementSibling?.id)).toBe('how');
      await site.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), { hidden: true })).setAttribute('data-jozve', ''));
      await expect(banner).toBeHidden();
      await site.close();

      // گوشی تصویر خودش را می‌گیرد، بی سرریز افقی.
      const narrow = await newContext(browser, { width: 390, height: 800 });
      const phone = await sitePage(narrow);
      await phone.goto(`${WEB}/`);
      const img = phone.locator('.home-banner img');
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).currentSrc)).toContain(`/media/${await fileSha(id, 'mobile')}.jpg`);
      expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await narrow.close();
    }

    // «خاموش کن» از کارت، بی کد.
    await page.goto(at('/content'));
    await card.getByRole('button', { name: 'خاموش کن' }).click();
    await expect(page.getByText('بنر خاموش شد؛ تا یک دقیقه بعد از صفحهٔ اصلی می‌رود.')).toBeVisible();
    await expect(card.locator('[data-banner-state]')).toHaveText('خاموش');
    await expect(card).toContainText(/روی سایت نیست\. خاموش از امروز \d{2}:\d{2}، نوید شریفی\./);
    expect(await setting('content.banner')).toEqual({ mode: 'off', imageId: id, alt, href: '/#tariff' });
    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => site.goto(`${WEB}/`).then(() => site.locator('.home-banner').count()), ISR).toBe(0);
      await site.close();
    }
    expect((await events('content.banner')).map(({ detail }) => [detail.change, detail.fresh])).toEqual([
      ['on', true],
      ['off', false],
    ]);
    expect(problems).toEqual([]);
  });

  test('دسترسی: حسابدار نه لوگو دارد نه بنر؛ متصدی لوگو را نه، و فایل پیش‌نمایش لوگو برایش ۴۰۳', async () => {
    const accountant = who.accountant.page;
    for (const path of ['/content', '/content/logo', `/content/logo/${ids.logo}`, '/content/banner', `/content/banner/${ids.banner}`]) {
      await accountant.goto(at(path));
      await expect(accountant.locator('main'), path).toContainText('این بخش برای حسابدار باز نیست');
      await expect(accountant.locator('main form'), path).toHaveCount(0);
    }
    expect((await accountant.request.get(at(`/content/images/${ids.banner}/desktop`))).status()).toBe(403);
    const operator = who.operator.page;
    for (const path of ['/content/logo', `/content/logo/${ids.logo}`, '/content/logo/brand']) {
      await operator.goto(at(path));
      await expect(operator.locator('main'), path).toContainText('این بخش فقط برای مالک است');
    }
    expect((await operator.request.get(at(`/content/images/${ids.logo}/logo`))).status()).toBe(403);
    expect((await operator.request.get(at(`/content/images/${ids.banner}/desktop`))).status()).toBe(200);
    // بارگذاری لوگو با نشانی بنر: همان «پیدا نشد».
    await who.owner.page.goto(at(`/content/banner/${ids.logo}`));
    await expect(who.owner.page.locator('main')).toContainText('این بارگذاری پیدا نشد');
    expect([who.accountant.problems, who.operator.problems]).toEqual([[], []]);
  });

  test('گوشی و دسکتاپ: صفحه‌های لوگو و بنر بی سرریز افقی، هدف لمسی ۴۴ و آیکون با شکل', async ({ browser }) => {
    test.setTimeout(240_000);
    const pages = [
      ['owner', '/content'],
      ['owner', '/content/logo'],
      ['owner', `/content/logo/${ids.logo}`],
      ['owner', '/content/logo/brand'],
      ['operator', '/content/banner'],
      ['operator', `/content/banner/${ids.banner}`],
    ] as const;
    for (const [role, path] of pages) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[role].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(at(path));
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const { overflow, small, blank } = await layoutProblems(page);
        expect([overflow <= 0, small, blank], `${role} ${path} @ ${width}`).toEqual([true, [], []]);
        expect(problems, `${role} ${path} @ ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
