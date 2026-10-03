import { createHash, randomBytes, randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, smsirMock, watch } from './helpers';

/**
 * کارت «مسیر خرید روی سایت»، سرتاسری (برش ۷٫۵، ADR-052، سؤال‌های ۱۶۱ تا ۱۷۱؛ طرح `docs/ui/mockups/admin.html`: `st-live-*` و
 * `m-dash-alerts`، طرح سایت `checkout.html`: `st-preview`): پنل و وب هر دو با `CHECKOUT_MODE=live`، زیبال و sms.ir ساختگی (هیچ درخواستی
 * به سرویس واقعی نمی‌رود)، روی پایگاه دادهٔ تازه‌ای که `apps/web/tests/live.spec.ts` پیش از این روی آن خرید کرده و مخاطب را به پیش‌فرض
 * برگردانده. آمادگی و «چه کم است» با مقدار پنلی که با `SECRETS_KEY` امروز باز نمی‌شود؛ پیوند پیش‌نمایش تا نوار سایت و «خروج»؛ «باز برای
 * همه» با کد تازه؛ «توقف» بی کد؛ «برگرداندن به پیش‌نمایش» با کد تازه و صفحه‌ای که در این میان کهنه شد؛ سطر پیشخوان مالک و متصدی؛ و
 * رویدادها زیر «تنظیمات و کلیدها». پیوند پیش‌نمایش فقط در صفحه است: نه در پایگاه داده (فقط هش)، نه در رویداد.
 *
 * پیامک چاپخانه با sms.ir (برش ۷٫۶، سؤال ۱۷۵): پیامک سفارش تازه‌ای که پرداخت تست وب ساخت و با شناسهٔ قالب خالی «نرفت»؛ هشدار پیشخوان،
 * علت با نام همان قالب، هشدار فرم چاپخانه، ورود شناسه با پیامک آزمایشی و کد تازه، و «دوباره بفرست» که با همان قالب می‌رود. اینجا، نه در
 * `smsir.spec.ts`: سقف ۱۰ «آزمایش» کلید در ساعت (همهٔ کلیدها، همهٔ ادمین‌ها) را اجرای اصلی پنل پر کرده است (هشت در `settings.spec.ts`،
 * دو در `payments.spec.ts`)، و پایگاه دادهٔ این مرحله تازه است.
 *
 *   CHECKOUT_MODE=live ADMIN_BASE_PATH=… E2E_ADMIN_BASE_URL=http://127.0.0.1:3203 E2E_WEB_BASE_URL=http://127.0.0.1:3102 DATABASE_URL=… \
 *     [E2E_PREVIEW_TOKEN_FILE=…] npx playwright test tests/live.spec.ts
 *
 * بی این متغیرها رد می‌شود؛ CI آن را در مرحلهٔ «مسیر خرید live، سرتاسری» اجرا می‌کند، پس از تست وب همان مرحله.
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL?.replace(/\/+$/, '');
const LIVE_ON = env.CHECKOUT_MODE?.trim().toLowerCase() === 'live';
test.skip(
  !BASE || !GATE || !env.DATABASE_URL || !WEB || !LIVE_ON,
  'بدون CHECKOUT_MODE=live، E2E_WEB_BASE_URL و متغیرهای پنل — پنل و سایت live لازم است',
);
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const OWNER = 'سارا رضایی';
/** شناسهٔ قالب پیامک چاپخانه‌ای که مالک در sms.ir ساخت؛ sms.ir ساختگی این مرحله همین را می‌شناسد، `.env` نه (سؤال ۱۷۵). */
const PARTNER_TEMPLATE = '100004';
const TIME = '\\d\\d:\\d\\d';
const FIXTURE = join(process.cwd(), '..', 'web', 'tests', 'fixtures', 'plain-bw-10.pdf');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let sql: postgres.Sql;

/** مخاطب امروز، همان که سایت هر درخواست می‌خواند. */
const audienceNow = async () => (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'checkout.audience'`)[0]?.value;

const card = (page: Page) => page.locator('#checkout');
const current = (page: Page) => card(page).locator('.ad-live__aud > li[aria-current="true"]');
const success = (page: Page) => card(page).locator('.jy-note--success');
const liveLine = (page: Page) => page.locator('[data-alert="checkout"]');

/** مرورگر مشتری روی سایت live، با IP خودش؛ نشان اینماد پاورقی جواب ساختگی می‌گیرد (مثل `refunds.spec.ts`). */
async function shopper(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: WEB,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
  await context.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return context;
}

/** حالتی که سایت به این مرورگر می‌گوید (`/api/checkout`). */
const siteMode = async (context: BrowserContext) => ((await (await context.request.get('/api/checkout')).json()) as { mode: string }).mode;

/** پنل در ۳۲۰، ۳۹۰ و ۱۲۸۰ پیکسل: بی سرریز افقی، هدف لمسی دست‌کم ۴۴ و آیکون‌هایی که شکل دارند (`layoutProblems`)؛ بعد همان ۱۲۸۰. */
async function fits(page: Page, what: string) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const { overflow, small, blank } = await layoutProblems(page);
    expect(overflow, `${what} در ${width}`).toBeLessThanOrEqual(0);
    expect(small, `${what} در ${width}`).toEqual([]);
    expect(blank, `${what} در ${width}`).toEqual([]);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** سایت در ۳۲۰، ۳۹۰ و ۱۲۸۰ پیکسل: بی سرریز افقی (مثل `flow.spec.ts`)؛ بعد همان ۱۲۸۰. */
async function siteFits(tab: Page, what: string) {
  for (const width of [320, 390, 1280]) {
    await tab.setViewportSize({ width, height: 800 });
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${what} در ${width}`).toBeLessThanOrEqual(0);
  }
  await tab.setViewportSize({ width: 1280, height: 800 });
}

/** «پلهٔ بالا» از صفحهٔ کد تازه: کد، و دکمه. */
async function raise(page: Page, secret: string, submit: 'باز کن' | 'برگردان') {
  await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
  await page.getByRole('button', { name: submit, exact: true }).click();
}

test.describe.serial('مسیر خرید روی سایت', () => {
  let owner: BrowserContext;
  let page: Page;
  let ownerSecret = '';
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let eventsBefore = 0;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);
    owner = await newContext(browser);
    page = await owner.newPage();
    ownerProblems = watch(page);
    ownerSecret = await enroll(page, serverInvite(`sara${RUN}`, '--name', OWNER));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await owner?.close();
    await operator?.close();
    if (sql) {
      await sql`DELETE FROM service_secrets WHERE name IN ('SMS_TRACKING_TEMPLATE', 'SMS_PARTNER_TEMPLATE')`;
      await sql.end();
    }
  });

  test('آمادگی: «آماده» با «پیش‌فرض پس از استقرار»؛ مقدار پنلی که خوانده نمی‌شود «خاموش» می‌کند و نامش را می‌گوید، هرگز مقدار', async ({ browser }) => {
    expect(await audienceNow()).toBe('preview');
    await page.goto(at('/settings'));
    // اول «تنظیمات»، بالای همه.
    await expect(page.locator('.ad-stack > section').first()).toHaveAttribute('id', 'checkout');
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
    await expect(card(page)).toHaveAttribute('data-audience', 'preview');
    await expect(card(page).locator('.jy-card__meta')).toHaveText('CHECKOUT_MODE=live · زیبال و sms.ir');
    await expect(card(page).locator('.ad-live__state .jy-badge')).toHaveText('آماده');
    await expect(card(page).locator('.ad-need')).toHaveCount(0);
    await expect(current(page)).toHaveText(
      'پیش‌نمایش مالک حالافقط مرورگری که پیوند پیش‌نمایش را باز کرد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند. پیش‌فرض پس از استقرار.',
    );
    await expect(card(page).locator('.ad-live__aud > li')).toHaveCount(3);
    await fits(page, 'کارت «پیش‌نمایش مالک»');

    // مهروموم به شکل درست ولی با کلید دیگر (مثل `.env`ی که بی پشتیبان از نو ساخته شد): پنل بر `.env` مقدم است، پس «خوانده نشد».
    const sealed = `v1.${randomBytes(12).toString('base64url')}.${randomBytes(40).toString('base64url')}`;
    await sql`INSERT INTO service_secrets (name, sealed, updated_at) VALUES ('SMS_TRACKING_TEMPLATE', ${sealed}, now())`;
    try {
      await page.goto(at('/settings'));
      await expect(card(page)).toHaveAttribute('data-state', 'off');
      await expect(card(page).locator('.ad-live__state .jy-badge')).toHaveText('خاموش');
      await expect(card(page).locator('.ad-live__who')).toHaveText('مشتری «ثبت سفارش آنلاین به‌زودی» می‌بیند، هر مخاطبی که اینجا باشد.');
      await expect(card(page).locator('.ad-need > li[data-ok="no"]')).toHaveCount(1);
      await expect(card(page).locator('.ad-need > li[data-part="SMS_TRACKING_TEMPLATE"]')).toHaveAttribute('data-ok', 'no');
      await expect(card(page).locator('.ad-need > li[data-part="PAYMENT_MERCHANT_ID"]')).toHaveAttribute('data-ok', 'yes');
      await expect(card(page).locator('[data-gap]')).toHaveText(
        '«شناسهٔ قالب پیامک رهگیری» پنل با SECRETS_KEY امروز خوانده نشد. پایین‌تر واردش کن و پیامک آزمایشی بگیر؛ مسیر خرید همان لحظه آماده می‌شود، با مخاطب «پیش‌نمایش مالک».',
      );
      await expect(card(page).getByRole('button')).toHaveCount(0);
      await expect(card(page).getByRole('link')).toHaveCount(0);
      await fits(page, 'کارت «خاموش»');
      // صفحهٔ «باز کردن» هم به کارت برمی‌گردد، با علت.
      await page.goto(at('/settings/checkout?to=everyone'));
      await expect(page).toHaveURL(/\/settings\?ce=checkout_not_ready#checkout$/);
      await expect(card(page).locator('.jy-note--error')).toHaveText(
        'مسیر خرید روی سایت آماده نیست؛ تا آماده نشده، مخاطب عوض نمی‌شود و پیوند پیش‌نمایش ساخته نمی‌شود.',
      );
      // پیشخوان: خطا، بالای همه، با «چه کم است».
      await page.goto(at('/'));
      await expect(liveLine(page)).toHaveAttribute('data-live', 'off');
      await expect(liveLine(page)).toHaveClass(/jy-note--error/);
      await expect(liveLine(page)).toHaveText(
        'مسیر خرید خاموش است: در .env «live» خواسته شد، ولی «شناسهٔ قالب پیامک رهگیری» پنل با SECRETS_KEY امروز خوانده نشد. چه کم است.',
      );
      await expect(page.locator('.ad-alerts > *').first()).toHaveAttribute('data-alert', 'checkout');
      await fits(page, 'پیشخوان با «مسیر خرید خاموش است»');
      // سایت همان لحظه خاموش است، با هر مخاطبی.
      const site = await shopper(browser);
      expect(await siteMode(site)).toBe('off');
      await site.close();
    } finally {
      await sql`DELETE FROM service_secrets WHERE name = 'SMS_TRACKING_TEMPLATE'`;
    }
    // ردیف رفت: همان لحظه آماده، با همان مخاطب؛ هیچ رویدادی برای مخاطب نوشته نشد.
    await page.goto(at('/settings'));
    await expect(card(page)).toHaveAttribute('data-state', 'ready');
    await expect(card(page)).toHaveAttribute('data-audience', 'preview');
    expect(await audienceNow()).toBe('preview');
    expect(ownerProblems).toEqual([]);
  });

  test('پیش‌نمایش مالک: سطر پیشخوان؛ پیوند یک‌باره تا نوار سایت و «ادامه»، مرورگر دیگر «به‌زودی»؛ «خروج از پیش‌نمایش»', async ({ browser }) => {
    test.setTimeout(240_000);
    await page.goto(at('/'));
    await expect(liveLine(page)).toHaveAttribute('data-live', 'preview');
    await expect(liveLine(page)).toHaveClass(/jy-note--info/);
    await expect(liveLine(page)).toHaveText(
      'مسیر خرید: پیش‌نمایش مالک. فقط مرورگری که پیوند پیش‌نمایش را باز کرد سفارش می‌دهد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند. باز برای همه.',
    );
    await liveLine(page).getByRole('link', { name: 'باز برای همه' }).click();
    await expect(page).toHaveURL(/\/settings#checkout$/);

    await card(page).getByRole('button', { name: 'پیوند پیش‌نمایش بساز' }).click();
    const box = card(page).locator('[data-preview-link]');
    await expect(box).toBeVisible();
    await fits(page, 'کارت با پیوند پیش‌نمایش');
    await expect(box.locator('.jy-note--warning')).toContainText(new RegExp(`^فقط یک بار و تا ساعت ${TIME} کار می‌کند، و دوباره نشان داده نمی‌شود.`));
    const link = await box.getByLabel('پیوند پیش‌نمایش').inputValue();
    // مبدأ همان `PAYMENT_CALLBACK_URL`، یعنی همان سایت.
    expect(link).toMatch(new RegExp(`^${escape(new URL(WEB!).origin)}/preview/[A-Za-z0-9_-]{43}$`));
    const token = link.split('/').at(-1)!;
    // CI همهٔ لاگ‌ها را پس از اجرا برای همین توکن می‌جوید (`grep -q`، بی چاپ).
    if (env.E2E_PREVIEW_TOKEN_FILE) writeFileSync(env.E2E_PREVIEW_TOKEN_FILE, token, { mode: 0o600 });
    // در پایگاه داده فقط هش؛ رویداد بی پیوند.
    const rows = await sql<{ token_hash: string }[]>`SELECT token_hash FROM checkout_previews ORDER BY created_at DESC LIMIT 1`;
    expect(rows[0]!.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(await sql`SELECT * FROM checkout_previews`).includes(token)).toBe(false);
    expect(JSON.stringify(await sql`SELECT * FROM admin_events WHERE id > ${eventsBefore}`).includes(token)).toBe(false);
    // با بار دوبارهٔ صفحه پیوند دیگر نشان داده نمی‌شود.
    await page.reload();
    await expect(card(page).locator('[data-preview-link]')).toHaveCount(0);

    // مرورگر مالک برای آزمایش: صفحهٔ پیوند با GET هیچ مصرف نمی‌کند؛ دکمه با POST، و نوار بالای صفحه.
    const preview = await shopper(browser);
    const tab = await preview.newPage();
    await tab.goto(link);
    await expect(tab.getByRole('heading', { level: 1, name: 'پیش‌نمایش مالک' })).toBeVisible();
    await siteFits(tab, 'صفحهٔ پیوند پیش‌نمایش');
    await tab.reload();
    await tab.getByRole('button', { name: 'باز کردن پیش‌نمایش در این مرورگر' }).click();
    await tab.waitForURL(`${WEB}/`);
    const bar = tab.getByTestId('preview-bar');
    await expect(bar).toContainText(new RegExp(`^پیش‌نمایش مالک: مسیر خرید فقط برای همین مرورگر باز است، تا \\S+ ${TIME}\\. پرداخت و پیامک واقعی‌اند\\.`));
    expect(await siteMode(preview)).toBe('live');
    const cookies = await preview.cookies();
    expect(cookies.find((c) => c.name === 'jy_preview')).toMatchObject({ httpOnly: true });
    expect(cookies.find((c) => c.name === 'jy_pv')).toMatchObject({ httpOnly: false });
    // نوار در ۳۲۰ تا ۱۲۸۰: صفحه بی سرریز افقی، آیکون نوار شکل دارد، و «خروج» دست‌کم ۴۴ پیکسل.
    await siteFits(tab, 'صفحهٔ اصلی با نوار پیش‌نمایش');
    for (const width of [320, 390, 1280]) {
      await tab.setViewportSize({ width, height: 800 });
      expect(await bar.locator('.jy-icon').evaluate((el) => getComputedStyle(el).getPropertyValue('mask-image').startsWith('url(')), `${width}`).toBe(true);
      expect((await bar.getByRole('button', { name: 'خروج از پیش‌نمایش' }).boundingBox())!.height, `${width}`).toBeGreaterThanOrEqual(44);
    }
    await tab.setViewportSize({ width: 1280, height: 800 });
    await tab.setInputFiles('#jozve-file', FIXTURE);
    await expect(tab.getByRole('button', { name: 'ادامه — آدرس و تحویل' }).filter({ visible: true }).first()).toBeEnabled({ timeout: 90_000 });

    // مرورگر دیگر: «به‌زودی»، و پیوند بازشده دیگر کار نمی‌کند.
    const other = await shopper(browser);
    const stranger = await other.newPage();
    expect(await siteMode(other)).toBe('off');
    await stranger.goto(link);
    await expect(stranger.getByRole('heading', { level: 1, name: 'این پیوند دیگر کار نمی‌کند' })).toBeVisible();
    await stranger.goto('/');
    await stranger.setInputFiles('#jozve-file', FIXTURE);
    await expect(stranger.getByRole('button', { name: 'ثبت سفارش آنلاین به‌زودی' }).filter({ visible: true }).first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(stranger.getByTestId('preview-bar')).toHaveCount(0);
    await other.close();

    // «خروج از پیش‌نمایش»: ردیف بسته، هر دو کوکی پاک، و همان مرورگر «به‌زودی».
    await bar.getByRole('button', { name: 'خروج از پیش‌نمایش' }).click();
    await expect(tab.getByTestId('preview-bar')).toHaveCount(0);
    expect(await siteMode(preview)).toBe('off');
    expect((await preview.cookies()).filter((c) => c.name === 'jy_preview' || c.name === 'jy_pv')).toEqual([]);
    const [closed] = await sql<{ closed: boolean }[]>`
      SELECT closed_at IS NOT NULL AS closed FROM checkout_previews WHERE token_hash = ${createHash('sha256').update(token).digest('hex')}`;
    expect(closed!.closed).toBe(true);
    await preview.close();
    expect(ownerProblems).toEqual([]);
  });

  test('«باز برای همه»: صفحهٔ جدا با چه عوض می‌شود، کد اشتباه بی هیچ تغییری، کد تازه، و پیشخوان بی سطر', async ({ browser }) => {
    await page.goto(at('/settings'));
    await card(page).getByRole('link', { name: 'باز برای همه…' }).click();
    await expect(page).toHaveURL(/\/settings\/checkout\?to=everyone$/);
    await expect(page).toHaveTitle(/^باز کردن مسیر خرید برای همه/);
    const form = page.locator('section[data-audience-to="everyone"]');
    await expect(form.locator('h1')).toHaveText('باز کردن مسیر خرید برای همه');
    await expect(form.locator('[data-changes] > li')).toHaveText([
      'مخاطبپیش‌نمایش مالک ← همه',
      'صفحهٔ اصلی«ثبت سفارش آنلاین به‌زودی» ← «ادامه» و پرداخت با زیبال',
      // اعتبار آخرین سنجش کلید sms.ir، اگر پیشخوان سنجیده است (هشدار اعتبار، ۷٫۱).
      /^پیامککد، پرداخت و رهگیری با sms\.ir(؛ اعتبار [\d,]+)?$/,
    ]);
    await expect(form.locator('.jy-note--info')).toHaveText(
      'از همین لحظه هر مشتری سفارش می‌دهد و پول واقعی جابه‌جا می‌شود. برای بستن، «توقف» در همین «تنظیمات» بی کد و همان لحظه است.',
    );
    await fits(page, 'صفحهٔ «باز کردن مسیر خرید برای همه»');

    await form.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await form.getByRole('button', { name: 'باز کن', exact: true }).click();
    await expect(form.locator('.jy-error')).toContainText('کد');
    expect(await audienceNow()).toBe('preview');

    await raise(page, ownerSecret, 'باز کن');
    await expect(page).toHaveURL(/\/settings\?done=audience&a=everyone&n=[0-9a-z]+(#checkout)?$/);
    await expect(success(page)).toHaveText('مسیر خرید برای همه باز شد: از همین لحظه هر مشتری سفارش می‌دهد، با پول و پیامک واقعی.');
    await expect(card(page)).toHaveAttribute('data-audience', 'everyone');
    await expect(current(page)).toHaveText(new RegExp(`^همه حالاهمهٔ مشتری‌ها؛ از امروز ${TIME}، ${OWNER}، با کد تازه\\.$`));
    await expect(card(page).getByRole('button', { name: 'توقف مسیر خرید' })).toBeVisible();
    await fits(page, 'کارت «همه»');
    expect(await audienceNow()).toBe('everyone');

    const site = await shopper(browser);
    expect(await siteMode(site)).toBe('live');
    await site.close();
    // «همه» هیچ سطری در پیشخوان ندارد.
    await page.goto(at('/'));
    await expect(page.getByRole('heading', { name: 'پیشخوان' })).toBeVisible();
    await expect(liveLine(page)).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });

  test('«توقف»: بی کد و همان لحظه؛ سایت «متوقف»، پیشخوان هشدار با «از امروز»، و متصدی همان سطر را بی پیوند', async ({ browser }) => {
    await page.goto(at('/settings'));
    await card(page).getByRole('button', { name: 'توقف مسیر خرید' }).click();
    await expect(page).toHaveURL(/\/settings\?done=audience&a=paused&n=[0-9a-z]+(#checkout)?$/);
    await expect(success(page)).toHaveText(
      'مسیر خرید متوقف شد: مشتری تازه «ثبت سفارش موقتاً متوقف است» می‌بیند؛ برگشت از درگاه و استعلام کار می‌کنند.',
    );
    await expect(card(page)).toHaveAttribute('data-audience', 'paused');
    await expect(current(page)).toHaveText(
      new RegExp(`^متوقف حالاهیچ‌کس سفارش تازه نمی‌دهد؛ برگشت از درگاه و استعلام کار می‌کنند\\. از امروز ${TIME}، ${OWNER}\\.$`),
    );
    await expect(card(page).getByRole('link', { name: 'برگرداندن به پیش‌نمایش…' })).toBeVisible();
    await expect(card(page).getByRole('link', { name: 'باز برای همه…' })).toBeVisible();
    await fits(page, 'کارت «متوقف»');
    expect(await audienceNow()).toBe('paused');

    const site = await shopper(browser);
    expect(await siteMode(site)).toBe('paused');
    await site.close();

    const line = `مسیر خرید متوقف است از امروز ${TIME}، ${OWNER}: سفارش تازه نمی‌آید؛ برگشت از درگاه و استعلام کار می‌کنند\\.`;
    await page.goto(at('/'));
    await expect(liveLine(page)).toHaveAttribute('data-live', 'paused');
    await expect(liveLine(page)).toHaveClass(/jy-note--warning/);
    await expect(liveLine(page)).toHaveText(new RegExp(`^${line} باز کردن\\.$`));
    await fits(page, 'پیشخوان با «مسیر خرید متوقف است»');
    // متصدی (`orders.money`) سطر را می‌بیند، بی پیوند؛ «تنظیمات» و صفحهٔ «باز کردن» فقط برای مالک.
    await operatorPage.goto(at('/'));
    await expect(liveLine(operatorPage)).toHaveText(new RegExp(`^${line}$`));
    await expect(liveLine(operatorPage).getByRole('link')).toHaveCount(0);
    for (const path of ['/settings', '/settings/checkout?to=everyone']) {
      await operatorPage.goto(at(path));
      await expect(operatorPage.getByRole('heading', { level: 1, name: 'این بخش فقط برای مالک است' })).toBeVisible();
    }
    expect(await audienceNow()).toBe('paused');
    expect(ownerProblems).toEqual([]);
  });

  test('«برگرداندن به پیش‌نمایش» با کد تازه؛ صفحهٔ «باز برای همه» که در این میان کهنه شد پیش از کد رد می‌شود', async () => {
    // زبانهٔ دوم همان مالک: «باز برای همه» از «متوقف»، باز و رها.
    const stale = await owner.newPage();
    await stale.goto(at('/settings/checkout?to=everyone'));
    await expect(stale.locator('section[data-audience-from="paused"][data-audience-to="everyone"]')).toBeVisible();

    await page.goto(at('/settings'));
    await card(page).getByRole('link', { name: 'برگرداندن به پیش‌نمایش…' }).click();
    await expect(page).toHaveURL(/\/settings\/checkout\?to=preview$/);
    const form = page.locator('section[data-audience-to="preview"]');
    await expect(form.locator('h1')).toHaveText('برگرداندن مسیر خرید به پیش‌نمایش مالک');
    await expect(form.locator('[data-changes] > li')).toHaveText([
      'مخاطبمتوقف ← پیش‌نمایش مالک',
      'صفحهٔ اصلی«ثبت سفارش موقتاً متوقف است» ← «ثبت سفارش آنلاین به‌زودی»؛ مرورگر پیش‌نمایش «ادامه» می‌بیند',
      /^پیامککد، پرداخت و رهگیری با sms\.ir، فقط برای مرورگر پیش‌نمایش(؛ اعتبار [\d,]+)?$/,
    ]);
    await expect(form.locator('.ad-hint')).toHaveCount(0);
    await fits(page, 'صفحهٔ «برگرداندن به پیش‌نمایش»');
    await raise(page, ownerSecret, 'برگردان');
    await expect(page).toHaveURL(/\/settings\?done=audience&a=preview&n=[0-9a-z]+(#checkout)?$/);
    await expect(success(page)).toHaveText(
      'مسیر خرید روی «پیش‌نمایش مالک» است: فقط مرورگری که پیوند پیش‌نمایش را باز کند سفارش می‌دهد.',
    );
    await expect(current(page)).toHaveText(
      new RegExp(
        `^پیش‌نمایش مالک حالافقط مرورگری که پیوند پیش‌نمایش را باز کرد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند\\. از امروز ${TIME}، ${OWNER}، با کد تازه\\.$`,
      ),
    );
    const failedBefore = Number(
      (await sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_events WHERE id > ${eventsBefore} AND action = 'auth.code_failed'`)[0]!.n,
    );

    // زبانهٔ کهنه با کد درست: مخاطب دیگر «متوقف» نیست، پس رد پیش از کد، و همان صفحه با وضعیت تازه.
    await stale.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await stale.getByRole('button', { name: 'باز کن', exact: true }).click();
    await expect(stale).toHaveURL(/\/settings\/checkout\?to=everyone&e=checkout_changed$/);
    await expect(stale.locator('.jy-note--error')).toHaveText(
      'مخاطب مسیر خرید همین حالا جای دیگری عوض شد؛ وضعیت تازه را ببین و اگر هنوز لازم است، دوباره بزن.',
    );
    await expect(stale.locator('section[data-audience-from="preview"][data-audience-to="everyone"]')).toBeVisible();
    expect(await audienceNow()).toBe('preview');
    expect(
      Number((await sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_events WHERE id > ${eventsBefore} AND action = 'auth.code_failed'`)[0]!.n),
    ).toBe(failedBefore);
    await stale.close();

    await page.goto(at('/'));
    await expect(liveLine(page)).toHaveAttribute('data-live', 'preview');
    expect(ownerProblems).toEqual([]);
  });

  test('رویدادها: سه پله با «از» و «به» و کد تازه، و پیوند پیش‌نمایش با ساعت پایانش، زیر «تنظیمات و کلیدها»', async () => {
    const events = await sql<{ action: string; target: string; detail: Record<string, unknown>; name: string }[]>`
      SELECT e.action, e.target_id AS target, e.detail, u.display_name AS name
        FROM admin_events e JOIN admin_users u ON u.id = e.admin_user_id
       WHERE e.id > ${eventsBefore} AND e.action LIKE 'settings.checkout_%' ORDER BY e.id`;
    expect(events.map((e) => [e.action, e.target, e.name])).toEqual([
      ['settings.checkout_preview', 'checkout.audience', OWNER],
      ['settings.checkout_audience', 'checkout.audience', OWNER],
      ['settings.checkout_audience', 'checkout.audience', OWNER],
      ['settings.checkout_audience', 'checkout.audience', OWNER],
    ]);
    expect(events.slice(1).map((e) => e.detail)).toEqual([
      { from: 'preview', to: 'everyone', fresh: true },
      { from: 'everyone', to: 'paused', fresh: false },
      { from: 'paused', to: 'preview', fresh: true },
    ]);
    expect(Object.keys(events[0]!.detail).sort()).toEqual(['preview', 'until']);

    await page.goto(at('/events?kind=settings'));
    await expect(page.getByRole('link', { name: 'تنظیمات و کلیدها' })).toHaveAttribute('aria-current', 'page');
    const log = page.locator('.ad-log').first();
    await expect(log).toContainText('مسیر خرید روی سایت: متوقف ← پیش‌نمایش مالک، با کد تازه');
    await expect(log).toContainText('مسیر خرید روی سایت: همه ← متوقف');
    await expect(log).toContainText('مسیر خرید روی سایت: پیش‌نمایش مالک ← همه، با کد تازه');
    await expect(log).toContainText(new RegExp(`پیوند پیش‌نمایش مسیر خرید ساخته شد، تا ${TIME}`));
    expect(ownerProblems).toEqual([]);
  });

  test('پیامک چاپخانه با sms.ir (۷٫۶، سؤال ۱۷۵): قالب خالی «نرفت» با نام همان قالب، هشدار پیشخوان و فرم؛ مالک شناسه را با پیامک آزمایشی وارد می‌کند و «دوباره بفرست» با همان قالب می‌رود', async () => {
    test.setTimeout(120_000);
    // تنها پیامک سفارش تازه: همان که پرداخت `apps/web/tests/live.spec.ts` ساخت و نرفت، چون شناسهٔ قالب پیامک چاپخانه هنوز نبود.
    const rows = await sql<{ number: number; mobile: string; partner: string; status: string; error: string | null }[]>`
      SELECT o.order_number AS number, m.to_mobile AS mobile, p.name AS partner, m.status, m.error
        FROM order_assignments a JOIN sms_messages m ON m.id = a.sms_message_id
        JOIN orders o ON o.id = a.order_id JOIN print_partners p ON p.id = a.to_partner_id
       WHERE m.purpose = 'partner_order'`;
    expect(rows).toHaveLength(1);
    const sms = rows[0]!;
    expect(sms).toMatchObject({ status: 'failed', error: 'unconfigured' });
    const to = `${sms.mobile.slice(0, 4)} ${sms.mobile.slice(4, 7)} ${sms.mobile.slice(7)}`;

    // پیشخوان: هشدار با شماره و نام چاپخانه، برای مالک و متصدی.
    const alert = `پیامک سفارش تازهٔ ${sms.number} به ${sms.partner} نرفت؛ از کارت «چاپخانه» دوباره بفرست.`;
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="partner-sms"]')).toHaveText(alert);
    await fits(page, 'پیشخوان با هشدار پیامک سفارش تازه');
    await operatorPage.goto(at('/'));
    await expect(operatorPage.locator('[data-alert="partner-sms"]')).toHaveText(alert);
    // کارت «چاپخانه»: علت با نام همان قالب (کلید API هست)، و «دوباره بفرست».
    await page.goto(at(`/orders/${sms.number}`));
    const row = page.locator('[data-partner-sms]');
    await expect(row).toHaveAttribute('data-partner-sms', 'failed');
    await expect(row.locator('.ad-paysms__fail')).toHaveText(
      new RegExp(`^نرفت: کلید API یا شناسهٔ قالب پیامک چاپخانه خالی است یا خوانده نشد، (امروز|دیروز) ${TIME}$`),
    );
    await expect(row.getByRole('button', { name: 'دوباره بفرست' })).toBeVisible();
    await fits(page, 'کارت «چاپخانه» با پیامکی که نرفت');

    // فرم چاپخانه: sms.ir در کار است و شناسهٔ قالب پیامک چاپخانه نیست، پس هشدار زیر موبایل با پیوند «تنظیمات و کلیدها».
    await page.goto(at('/partners/new'));
    const warning = page.locator('[data-partner-template="missing"]');
    await expect(warning).toHaveText(
      'شناسهٔ قالب پیامک چاپخانه در «تنظیمات و کلیدها» هنوز گذاشته نشده؛ تا گذاشته نشود، این پیامک‌ها نمی‌روند. پس از گذاشتنش، هر پیامکی که نرفت را از کارت «چاپخانه» همان سفارش دوباره بفرست.',
    );
    await fits(page, 'فرم چاپخانه با هشدار قالب');
    await warning.getByRole('link', { name: '«تنظیمات و کلیدها»' }).click();
    await expect(page).toHaveURL(/\/settings#keys$/);

    // مالک قالب «جزوه‌یار: سفارش تازه #ORDER#؛ تحویل به پست تا #DAY#» را در sms.ir ساخت و تأیید گرفت: شناسه، پیامک آزمایشی با پارامتر
    // نمونه، بعد «ذخیره» با کد تازه.
    const key = page.locator('li[data-key="SMS_PARTNER_TEMPLATE"]');
    await expect(key.locator('.jy-badge')).toHaveText('خالی');
    await key.getByRole('link', { name: 'وارد کن' }).click();
    await key.getByLabel('شناسهٔ قالب').fill(PARTNER_TEMPLATE);
    await key.getByLabel('موبایل برای پیامک آزمایشی').fill('09351234567');
    await key.getByRole('button', { name: 'پیامک آزمایشی بفرست' }).click();
    await expect(key.locator('[data-key-note="sent"]')).toContainText(
      'پیامک آزمایشی رفت (sms.ir پذیرفت) به 0935 ••• 4567. روی گوشی ببین همین رسیده: «جزوه‌یار: سفارش تازه 10027؛ تحویل به پست تا دوشنبه 13 مهر»',
    );
    await key.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await key.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.locator('#keys .jy-note--success')).toHaveText('«شناسهٔ قالب پیامک چاپخانه» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(key.locator('.jy-badge')).toHaveText('از پنل');
    // هشدار فرم همان لحظه می‌رود؛ آمادگی مسیر خرید از اول به این قالب بسته نبود.
    await page.goto(at('/partners/new'));
    await expect(page.locator('[data-partner-template]')).toHaveCount(0);

    // «دوباره بفرست»: با sms.ir و همان قالب، به همان موبایلی که پیامک با آن ساخته شد (سؤال ۱۷۷).
    await page.goto(at(`/orders/${sms.number}`));
    await row.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.getByText('پیامک سفارش تازه دوباره به چاپخانه فرستاده شد و رفت.')).toBeVisible();
    await expect(row).toHaveAttribute('data-partner-sms', 'sent');
    await expect(row.locator('.ad-paysms__ok')).toHaveText(new RegExp(`^به ${to} رفت، امروز ${TIME}$`));
    await expect(row.getByRole('button')).toHaveCount(0);
    const sent = (await smsirMock.messages()).messages.filter((m) => m.mobile === sms.mobile);
    expect(sent.map((m) => [m.templateId, m.parameters.map((p) => p.name), m.parameters[0]?.value])).toEqual([
      [Number(PARTNER_TEMPLATE), ['ORDER', 'DAY'], String(sms.number)],
    ]);
    expect(await sql`SELECT status, provider, error, attempts FROM sms_messages WHERE purpose = 'partner_order'`).toEqual([
      { status: 'sent', provider: 'smsir', error: null, attempts: 2 },
    ]);
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="partner-sms"]')).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });
});
