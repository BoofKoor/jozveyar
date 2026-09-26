import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { base32Decode, hotp, totpStep } from '../lib/server/totp';

/**
 * پنل ادمین، سرتاسری (برش ۴٫۱؛ طرح `docs/ui/mockups/admin.html`، ADR-037 و ADR-038): دروازهٔ مسیر محرمانه،
 * اولین مالک با دستور سرور، ثبت با پیوند یک‌باره و QR، ورود با رمز و کد، قفل، متصدی، کار حساس با کد تازه،
 * رویدادها، CSP بی نقض، و گوشی و دسکتاپ. کد برنامهٔ تأیید را تست خودش از روی کلید صفحهٔ ثبت می‌سازد، مثل
 * گوشی. روی build تولیدی و پایگاه داده‌ای که وب مهاجرت و نقش‌هایش را نوشته:
 *
 *   DATABASE_URL=… SESSION_SECRET=<۳۲+ نویسه> node apps/web/scripts/serve-standalone.mjs 3100
 *   DATABASE_URL=… SESSION_SECRET=… SECRETS_KEY=<۶۴ رقم hex> ADMIN_BASE_PATH=/<۱۶+ نویسه> \
 *     ADMIN_ORIGIN=http://127.0.0.1:3200 node apps/admin/scripts/serve-standalone.mjs 3200
 *   (همان متغیرها) E2E_ADMIN_BASE_URL=http://127.0.0.1:3200 pnpm --filter @jozveyar/admin test:e2e
 *
 * بی این متغیرها رد می‌شود؛ CI آن را در مرحلهٔ «پنل، سرتاسری» اجرا می‌کند. هر اجرا نام‌های تازه دارد، پس
 * دوباره اجرا شدن روی همان پایگاه داده هم درست است.
 */

const BASE = process.env.E2E_ADMIN_BASE_URL;
const GATE = process.env.ADMIN_BASE_PATH?.trim();

test.skip(!BASE || !GATE || !process.env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const at = (path = '') => `${GATE}${path}`;
const RUN = randomInt(1000, 9999);
const PASSWORD = 'یک جملهٔ کوتاه و امن';

/** عددهای تصمیم (ADR-037)، صریح. */
const MAX_FAILURES = 5;

/** دستور سرور، همان که `infra/admin-invite.sh` درون کانتینر می‌زند. */
function serverInvite(username: string, ...args: string[]): string {
  const out = execFileSync(process.execPath, [join(process.cwd(), 'dist', 'cli.mjs'), 'invite', username, ...args], {
    env: process.env,
    encoding: 'utf8',
  });
  const link = /https?:\/\/\S+\/invite\/[A-Za-z0-9_-]{43}/.exec(out)?.[0];
  if (!link) throw new Error(`پیوندی در خروجی دستور نیست:\n${out}`);
  return link;
}

/**
 * کد تازهٔ برنامهٔ تأیید، مثل گوشی. هر کد یک بار (سرور گام را مصرف می‌کند)، پس گام جاری یا بعدی که هنوز
 * به کار نرفته؛ اگر هر دو رفته‌اند، تا گام بعد صبر.
 */
const usedSteps = new Map<string, number>();
async function codeFor(secret: string): Promise<string> {
  const key = base32Decode(secret);
  for (;;) {
    const now = totpStep(new Date());
    const last = usedSteps.get(secret) ?? -1;
    const step = [now, now + 1].find((s) => s > last);
    if (step !== undefined) {
      usedSteps.set(secret, step);
      return hotp(key, step);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** هر مرورگر IP خودش را دارد، تا سقف ۳۰ تلاش ورود در ساعت هر IP بین تست‌ها و اجراها پر نشود. */
async function newContext(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport,
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
}

/** نقض CSP، خطای صفحه و هر درخواست بیرون از خود پنل. */
function watch(page: Page) {
  const problems: string[] = [];
  const origin = new URL(BASE!).origin;
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== origin) problems.push(`بیرونی: ${request.url()}`);
  });
  return problems;
}

/** ثبت با پیوند: کلید از صفحه، رمز، و کد؛ برمی‌گرداند کلید برنامهٔ تأیید را. */
async function enroll(page: Page, link: string): Promise<string> {
  await page.goto(link);
  await expect(page.getByRole('img', { name: 'کد QR برنامهٔ تأیید' })).toBeVisible();
  const secret = (await page.locator('.ad-qr__key').innerText()).replace(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel('رمز', { exact: true }).fill(PASSWORD);
  await page.getByLabel('تکرار رمز').fill(PASSWORD);
  await page.getByLabel('کدی که برنامه نشان می‌دهد').fill(await codeFor(secret));
  await page.getByRole('button', { name: 'فعال کن و وارد شو' }).click();
  await expect(page.getByRole('heading', { name: 'پیشخوان' })).toBeVisible();
  return secret;
}

/** پیام خطا یا هشدار صفحه؛ اعلان‌گر مسیر نکست هم `role=alert` دارد ولی بیرون `main` است. */
const alertOf = (page: Page) => page.locator('main').getByRole('alert');

/**
 * ورود. تلاشی که رمزش نادرست است یا حسابش بسته، کد را نمی‌سنجد و گامی مصرف نمی‌کند؛ پس کد ساختگی
 * می‌گیرد (`WRONG`) تا کدهای درست برای تلاش‌های بعدی بمانند.
 */
const WRONG = { password: 'رمز نادرست است اینجا', code: '000000' };
async function login(page: Page, username: string, secret: string, over: { password?: string; code?: string } = {}) {
  await page.goto(at('/login'));
  await page.getByLabel('نام کاربری').fill(username);
  await page.getByLabel('رمز').fill(over.password ?? PASSWORD);
  await page.getByLabel('کد برنامهٔ تأیید').fill(over.code ?? (await codeFor(secret)));
  await page.getByRole('button', { name: 'ورود' }).click();
}

test.describe.serial('پنل ادمین', () => {
  const owner = `sara${RUN}`;
  const operator = `ali${RUN}`;
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];

  test.afterAll(async () => {
    await ownerContext?.close();
  });

  test('بیرون مسیر محرمانه همه‌چیز ۴۰۴ خالی است؛ فقط قلم، نشانک، robots و سلامت', async ({ request }) => {
    for (const path of ['/', '/login', `/${'x'.repeat(16)}/login`, '/fonts/login', '/api/healthz', `${at()}x/login`]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text(), path).toBe('Not Found');
      expect(response.headers()['x-robots-tag'], path).toContain('noindex');
    }
    expect((await request.get('/api/health')).status()).toBe(200);
    expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
    expect((await request.get('/fonts/Vazirmatn-Regular.woff2')).status()).toBe(200);
    expect((await request.post('/fonts/Vazirmatn-Regular.woff2', { data: 'x' })).status()).toBe(404);

    const login = await request.get(at('/login'));
    expect(login.status()).toBe(200);
    const headers = login.headers();
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('نوشتن فقط از خود پنل: POST بی Origin یا از جای دیگر ۴۰۳', async ({ request }) => {
    expect((await request.post(at('/login'), { headers: { origin: 'https://evil.example' }, data: 'x' })).status()).toBe(403);
    expect((await request.post(at('/login'), { headers: { origin: 'null' }, data: 'x' })).status()).toBe(403);
  });

  test('اولین مالک: دستور سرور، پیوند یک‌باره با QR، ثبت، و پیشخوان', async ({ browser }) => {
    const link = serverInvite(owner, '--name', 'سارا رضایی');
    expect(link).toContain(`${GATE}/invite/`);
    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);

    await ownerPage.goto(link);
    await expect(ownerPage.getByRole('heading', { name: 'خوش آمدی، سارا رضایی' })).toBeVisible();
    await expect(ownerPage.getByText('تو مالک پنل جزوه‌یار هستی.')).toBeVisible();
    // رمز کوتاه و کد نادرست، هر کدام پیام خودشان؛ پیوند مصرف نمی‌شود.
    await ownerPage.getByLabel('رمز', { exact: true }).fill('کوتاه');
    await ownerPage.getByLabel('تکرار رمز').fill('کوتاه');
    await ownerPage.getByLabel('کدی که برنامه نشان می‌دهد').fill('000000');
    await ownerPage.getByRole('button', { name: 'فعال کن و وارد شو' }).click();
    await expect(ownerPage.getByText('رمز دست‌کم 12 نویسه باشد.')).toBeVisible();

    ownerSecret = await enroll(ownerPage, link);
    await expect(ownerPage.locator('.ad-user')).toContainText('سارا رضایی · مالک');

    const cookies = await ownerContext.cookies();
    const session = cookies.find((cookie) => cookie.name === 'jy_admin');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(session!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // پیوند یک بار: بار دوم دیگر کار نمی‌کند.
    const again = await ownerContext.newPage();
    await again.goto(link);
    await expect(again.getByRole('heading', { name: 'این پیوند دیگر کار نمی‌کند' })).toBeVisible();
    await again.close();
  });

  test('ورود: یک پیام برای هر شکست؛ پنج اشتباه ورود را می‌بندد، حتی با رمز و کد درست', async ({ browser }) => {
    const locked = `lock${RUN}`;
    const enrollContext = await newContext(browser);
    const secret = await enroll(await enrollContext.newPage(), serverInvite(locked, '--operator'));
    await enrollContext.close();

    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await login(page, `nobody${RUN}`, secret, { code: WRONG.code });
    await expect(alertOf(page)).toHaveText('نام کاربری، رمز یا کد درست نیست. دوباره امتحان کن.');
    await expect(page.getByLabel('نام کاربری')).toHaveValue(`nobody${RUN}`);
    for (let i = 1; i < MAX_FAILURES; i += 1) {
      await login(page, locked, secret, WRONG);
      await expect(alertOf(page)).toHaveText('نام کاربری، رمز یا کد درست نیست. دوباره امتحان کن.');
    }
    await login(page, locked, secret, WRONG);
    await expect(alertOf(page)).toContainText('تلاش ناموفق زیاد شد. ورود تا ساعت');
    await expect(page.getByRole('button', { name: /ورود تا \d{2}:\d{2} بسته است/ })).toBeVisible();
    // رمز و کد درست، ولی حساب بسته.
    await login(page, locked, secret);
    await expect(alertOf(page)).toContainText('تلاش ناموفق زیاد شد.');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('افزودن متصدی با کد تازه؛ متصدی فقط پیشخوان را دارد', async ({ browser }) => {
    await ownerPage.goto(at('/admins'));
    await ownerPage.getByRole('link', { name: 'افزودن متصدی' }).click();
    await ownerPage.getByLabel('نام', { exact: true }).fill('علی محمدی');
    await ownerPage.getByLabel('نام کاربری').fill(operator);
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'پیوند ثبت علی محمدی آماده است' })).toBeVisible();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    expect(link).toContain(`${GATE}/invite/`);

    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await page.goto(link);
    await expect(page.getByText('سارا رضایی تو را متصدی پنل جزوه‌یار کرده است.')).toBeVisible();
    await enroll(page, link);
    await expect(page.locator('.ad-user')).toContainText('علی محمدی · متصدی');
    await expect(page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link')).toHaveText(['پیشخوان']);
    for (const path of ['/admins', '/events', '/admins/new']) {
      await page.goto(at(path));
      await expect(page.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();
    }
    expect(problems).toEqual([]);

    // کد ورود تازه برای متصدی: نشست بازش بسته می‌شود.
    await ownerPage.goto(at('/admins'));
    const row = ownerPage.locator(`li[data-username="${operator}"]`);
    await row.getByRole('link', { name: 'کد ورود تازه' }).click();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'پیوند ثبت تازهٔ علی محمدی آماده است' })).toBeVisible();
    const resetLink = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    await page.goto(at());
    await expect(page.getByRole('heading', { name: 'ورود به پنل' })).toBeVisible();

    // لغو دعوت، بی کد: پیوند تازه دیگر کار نمی‌کند؛ علی که پیش‌تر وارد شده بود غیرفعال نمی‌شود.
    await ownerPage.goto(at('/admins'));
    await expect(row).toContainText('دعوت شده؛ پیوند تا');
    await row.getByRole('button', { name: 'لغو دعوت' }).click();
    await expect(row).toContainText('هنوز ثبت نکرده؛ پیوندش گذشت');
    await expect(row.getByRole('link', { name: 'پیوند تازه' })).toBeVisible();
    await page.goto(resetLink);
    await expect(page.getByRole('heading', { name: 'این پیوند دیگر کار نمی‌کند' })).toBeVisible();
    await context.close();
  });

  test('غیرفعال کردن با کد تازه؛ ادمین غیرفعال وارد نمی‌شود', async ({ browser }) => {
    const target = `mina${RUN}`;
    const enrollContext = await newContext(browser);
    const secret = await enroll(await enrollContext.newPage(), serverInvite(target, '--operator', '--name', 'مینا'));
    await enrollContext.close();

    await ownerPage.goto(at('/admins'));
    const row = ownerPage.locator(`li[data-username="${target}"]`);
    await row.getByRole('link', { name: 'غیرفعال کن' }).click();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await ownerPage.getByRole('button', { name: 'مینا را غیرفعال کن' }).click();
    await expect(ownerPage.getByText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.')).toBeVisible();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'مینا را غیرفعال کن' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'ادمین‌ها' })).toBeVisible();
    await expect(row).toContainText('غیرفعال');
    await expect(row.getByRole('link', { name: 'فعال کن با پیوند تازه' })).toBeVisible();

    const context = await newContext(browser);
    const page = await context.newPage();
    await login(page, target, secret);
    await expect(alertOf(page)).toHaveText('نام کاربری، رمز یا کد درست نیست. دوباره امتحان کن.');
    await context.close();
  });

  test('رویدادها: ورود ناموفق با شمار و قفل، پیوندها، غیرفعال شدن', async () => {
    await ownerPage.goto(at('/events'));
    const log = ownerPage.locator('.ad-log');
    await expect(log.getByText(`با نام کاربری lock${RUN}؛ حساب قفل شد`)).toBeVisible();
    await expect(log.locator('li', { hasText: `lock${RUN}` }).filter({ hasText: `${MAX_FAILURES - 1} بار` })).toHaveCount(1);
    await expect(log.getByText(`با نام کاربری nobody${RUN}، که چنین کاربری نیست`)).toBeVisible();
    await expect(log.getByText(`پیوند ثبت برای ${operator} (متصدی) ساخته شد`)).toBeVisible();
    await expect(log.getByText(`mina${RUN} غیرفعال شد`)).toBeVisible();
    await ownerPage.goto(at('/events?kind=auth'));
    await expect(ownerPage.getByRole('link', { name: 'ورود', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(log.getByText('پیوند ثبت برای')).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: بی سرریز افقی، هدف لمسی دست‌کم ۴۴ پیکسل، «بیشتر» در گوشی', async ({ browser }) => {
    const spare = serverInvite(`view${RUN}`, '--operator');
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [at(), at('/admins'), at('/admins/new'), at('/events'), spare]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('main a, main button, main input:not([type=hidden]), nav a, nav summary, header button')]
            .map((el) => ({ el, box: el.getBoundingClientRect() }))
            .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden')
            .filter(({ el, box }) => box.height < 44 && !el.closest('.jy-tile') && el.getAttribute('type') !== 'radio')
            .map(({ el, box }) => `${el.tagName} «${(el.textContent ?? '').trim().slice(0, 20)}» ${Math.round(box.height)}`),
        );
        expect(small, `${width} ${path}`).toEqual([]);
        // هر آیکون شکل دارد: Tailwind فقط آیکونی را می‌سازد که نامش عیناً در کد آمده، و بی آن آیکون بی‌صدا شفاف است.
        const blank = await page.evaluate(() =>
          [...document.querySelectorAll('.jy-icon')]
            .filter((el) => !getComputedStyle(el).getPropertyValue('mask-image').startsWith('url('))
            .map((el) => el.className),
        );
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' });
      await page.goto(at('/events'));
      expect(await nav.getByRole('link').first().evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
      if (width <= 520) {
        await expect(nav.locator('summary')).toBeVisible();
        await nav.locator('summary').click();
        await expect(nav.locator('.ad-more__list').getByRole('link', { name: 'رویدادها' })).toHaveAttribute('aria-current', 'page');
      } else {
        await expect(nav.locator('summary')).toBeHidden();
        await expect(nav.locator('.ad-nav__wide', { hasText: 'رویدادها' })).toHaveAttribute('aria-current', 'page');
      }
      await page.goto(at('/login'));
      await expect(page.getByRole('heading', { name: 'پیشخوان' })).toBeVisible();
      expect(problems).toEqual([]);
      await context.close();
    }
  });

  test('خروج نشست را می‌بندد', async () => {
    await ownerPage.goto(at());
    await ownerPage.getByRole('button', { name: 'خروج' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'ورود به پنل' })).toBeVisible();
    await ownerPage.goto(at('/admins'));
    await expect(ownerPage.getByRole('heading', { name: 'ورود به پنل' })).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });
});
