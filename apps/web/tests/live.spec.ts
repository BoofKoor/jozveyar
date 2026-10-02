import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes, randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatTomans } from '@jozveyar/text';

/**
 * مسیر خرید روی سایت زنده، سرتاسری (برش ۷٫۵، ADR-052، سؤال ۱۷۱): همین build با `CHECKOUT_MODE=live`، زیبال و sms.ir ساختگی به شکل
 * مستند (`packages/payments/mock/zibal.mjs`، `packages/sms/mock/smsir.mjs`؛ هیچ درخواستی به سرویس واقعی نمی‌رود)، پستگرس، Garage و
 * کارگر واقعی. کد پیامکی را تست از همان sms.ir ساختگی می‌خواند، چون ردیف `sms_messages` کد را ندارد (ADR-033).
 *
 * مخاطب را تست با SQL می‌گذارد (پنل در `admin/tests/live.spec.ts` همین را با کد تازه)، و در پایان به پیش‌فرض «پیش‌نمایش مالک»
 * برمی‌گرداند، بی رویداد، تا تست پنل از «پیش‌فرض پس از استقرار» شروع کند. آخرین تست دو پرداخت نیمه‌کاره را به مرحلهٔ بعد CI می‌سپارد
 * (`E2E_LIVE_HANDOFF`)، که وب را با `CHECKOUT_MODE=off` دوباره بالا می‌آورد: برگشت و استعلام خودکار همیشه کار می‌کنند
 * (`live-off.spec.ts`).
 *
 *   E2E_LIVE_BASE_URL=http://127.0.0.1:3102 E2E_SMSIR_URL=http://127.0.0.1:3301 E2E_ZIBAL_URL=http://127.0.0.1:3401 DATABASE_URL=… \
 *     npx playwright test tests/live.spec.ts
 *
 * بی این متغیرها رد می‌شود؛ CI آن را در مرحلهٔ «مسیر خرید live، سرتاسری» اجرا می‌کند.
 */

const BASE = process.env.E2E_LIVE_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const SMSIR = process.env.E2E_SMSIR_URL?.replace(/\/+$/, '');
const ZIBAL = process.env.E2E_ZIBAL_URL?.replace(/\/+$/, '');
const HANDOFF = process.env.E2E_LIVE_HANDOFF;

test.skip(!BASE || !DATABASE_URL || !SMSIR || !ZIBAL, 'بدون E2E_LIVE_BASE_URL، E2E_SMSIR_URL، E2E_ZIBAL_URL و DATABASE_URL — سایت live لازم است');
test.use({ baseURL: BASE });
test.setTimeout(180_000);

/** شناسهٔ قالب‌های sms.ir ساختگی، همان `.env` این مرحله. */
const OTP_TEMPLATE = 100001;
const PAID_TEMPLATE = 100002;

const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', name);

let sqlClient: ReturnType<typeof postgres> | null = null;
const sql = () => (sqlClient ??= postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined }));
test.afterAll(async () => {
  await sqlClient?.end();
  sqlClient = null;
});

/** مخاطب مسیر خرید، مستقیم در پایگاه داده؛ سایت هر درخواست از نو می‌خواندش. */
const audience = (value: 'paused' | 'preview' | 'everyone') =>
  sql()`update settings set value = ${sql().json(value)} where key = 'checkout.audience'`;

/** ۱۰ صفحهٔ سیاه‌سفید دورو (`plain-bw-10.pdf`) به مشهد، با تعرفهٔ پایهٔ پایگاه دادهٔ تازه. */
const TOTAL = quote(
  {
    items: [
      {
        sections: [{ documentId: 'test', pageCount: 10 }],
        rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
        copies: 1,
        sidesMode: 'double',
        bindingTypeId: DEFAULT_BINDING_TYPE_ID,
      },
    ],
    shipping: { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId: 'other' },
  },
  SEED_PRICE_LIST,
).totalRials;
const toman = (rials: number) => formatTomans(rials, false);
const PAY = `پرداخت ${toman(TOTAL)} تومان`;

/** هر مرورگر IP خودش را دارد، تا سقف کد هر IP (ADR-033) بین تست‌ها پر نشود. */
async function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
}
const newMobile = () => `0912${String(randomInt(10_000_000)).padStart(7, '0')}`;
const visibleButton = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();

interface MockSms {
  mobile: string;
  templateId: number;
  parameters: { name: string; value: string }[];
}
async function smsTo(mobile: string, templateId: number): Promise<MockSms[]> {
  const response = await fetch(`${SMSIR}/__mock/messages`);
  const body = (await response.json()) as { messages: MockSms[] };
  return body.messages.filter((m) => m.mobile === mobile && m.templateId === templateId);
}
const param = (sms: MockSms | undefined, name: string) => sms?.parameters.find((p) => p.name === name)?.value ?? '';

async function zibal(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${ZIBAL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.ok, `زیبال ساختگی ${path}`).toBe(true);
  return response.json();
}

/** فایل، تا رسیدنش به سرور و بررسی کارگر: «ادامه» فقط آن‌وقت باز است (ADR-034). */
async function dropReady(page: Page) {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
  await expect(visibleButton(page, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });
}

async function toReview(page: Page, mobile: string) {
  await visibleButton(page, 'ادامه — آدرس و تحویل').click();
  await expect(page.getByRole('heading', { level: 1, name: 'به کدام شهر بفرستیم؟' })).toBeVisible();
  await page.getByRole('button', { name: 'مشهد' }).click();
  await page.getByLabel('نشانی', { exact: true }).fill('بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴');
  await page.getByLabel('نام گیرنده').fill('سارا احمدی');
  await page.getByLabel('نام گیرنده').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'تأیید با پیامک' })).toBeVisible();
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.getByLabel('شمارهٔ موبایل').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'کد تأیید' })).toBeVisible();
  // کد از sms.ir ساختگی، با قالب کد تأیید و پارامتر CODE.
  let code = '';
  await expect.poll(async () => (code = param((await smsTo(mobile, OTP_TEMPLATE)).at(-1), 'CODE'))).toMatch(/^\d{5}$/);
  await page.getByLabel('کد پیامک').fill(code);
  await page.getByLabel('کد پیامک').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();
}

/** «پرداخت» تا صفحهٔ زیبال ساختگی؛ برمی‌گرداند trackId را. */
async function toGateway(page: Page): Promise<number> {
  await visibleButton(page, PAY).click();
  await page.waitForURL(new RegExp(`^${ZIBAL!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/start/\\d+$`));
  await expect(page.getByRole('heading', { level: 1, name: 'درگاه پرداخت زیبال (ساختگی)' })).toBeVisible();
  return Number(page.url().split('/').at(-1));
}

/** پرداخت نیمه‌کاره‌ای که به مرحلهٔ off سپرده می‌شود (`live-off.spec.ts` همین شکل را می‌خواند). */
export interface LiveHandoff {
  startUrl: string;
  trackId: number;
  token: string;
  number: number;
  mobile: string;
  state: Awaited<ReturnType<BrowserContext['storageState']>>;
}

async function decide(page: Page, button: 'پرداخت موفق' | 'موجودی ناکافی' | 'انصراف') {
  await page.getByRole('button', { name: button }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]{36}$/);
}

test.describe.serial('مسیر خرید live', () => {
  test.afterAll(async () => {
    // پیش‌فرض پس از استقرار، بی رویداد، برای تست پنل.
    await audience('preview');
  });

  test('پیش‌فرض «پیش‌نمایش مالک»: مرورگر بی کوکی «به‌زودی» می‌بیند و هیچ مسیری باز نیست؛ پیوند ناشناس «دیگر کار نمی‌کند»؛ قوانین ۲۰۰', async ({ browser }) => {
    const [row] = await sql()`select value from settings where key = 'checkout.audience'`;
    expect(row?.value).toBe('preview');
    const context = await newContext(browser);
    const page = await context.newPage();
    expect(await (await page.request.get('/api/checkout')).json()).toEqual({ mode: 'off', auth: null });
    for (const path of ['/api/checkout/quote', '/api/checkout/otp']) {
      expect((await page.request.post(path, { data: {} })).status(), path).toBe(404);
    }
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(visibleButton(page, 'ثبت سفارش آنلاین به‌زودی')).toBeVisible({ timeout: 90_000 });
    // بی کوکی نشانه، نوار پیش‌نمایش نیست و هیچ درخواستی برایش نمی‌رود.
    await expect(page.getByTestId('preview-bar')).toHaveCount(0);

    const token = randomBytes(32).toString('base64url');
    await page.goto(`/preview/${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'این پیوند دیگر کار نمی‌کند' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect((await page.request.get('/preview/short')).status()).toBe(404);
    // POST ساختگی با توکن ناشناس: همان صفحه، بی کوکی.
    const opened = await page.request.post('/api/checkout/preview', { form: { token }, maxRedirects: 0 });
    expect(opened.status()).toBe(303);
    expect(opened.headers()['location']).toBe(`/preview/${token}`);
    expect(opened.headers()['set-cookie'] ?? '').not.toContain('jy_preview=');

    expect((await page.request.get('/terms')).status()).toBe(200);
    await context.close();
  });

  test('«همه»: کد با sms.ir، پرداخت با زیبال، برگشت، و «سفارش ثبت شد» با پیامک پرداخت', async ({ browser }) => {
    await audience('everyone');
    const context = await newContext(browser);
    const page = await context.newPage();
    expect(await (await page.request.get('/api/checkout')).json()).toEqual({ mode: 'live', auth: null });
    const mobile = newMobile();
    await dropReady(page);
    await toReview(page, mobile);
    await expect(page.locator('.home-sum__secure').filter({ visible: true })).toHaveText('پرداخت امن با درگاه زیبال و همهٔ کارت‌های بانکی');
    const trackId = await toGateway(page);
    await expect(page.locator('[data-amount]')).toHaveText(String(TOTAL));
    await decide(page, 'پرداخت موفق');
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();

    const [order] = await sql()`
      select o.order_number, o.status, p.provider, p.status as payment, p.gateway_status
        from payments p join orders o on o.id = p.order_id where p.authority = ${String(trackId)}`;
    expect(order).toMatchObject({ status: 'paid', provider: 'zibal', payment: 'succeeded', gateway_status: 1 });
    await expect(page.getByTestId('order-paid')).toContainText(`سفارش ${order!.order_number} · ${toman(TOTAL)} تومان پرداخت شد.`);
    // زیبال ساختگی: تأییدشده (۱)، با همان مبلغ.
    const { transactions } = (await zibal('/__mock/transactions')) as { transactions: { trackId: number; status: number; amount: number }[] };
    expect(transactions.find((tx) => tx.trackId === trackId)).toMatchObject({ status: 1, amount: TOTAL });
    // پیامک پرداخت با sms.ir: شمارهٔ سفارش و روز تحویل به پست.
    await expect.poll(async () => param((await smsTo(mobile, PAID_TEMPLATE)).at(-1), 'ORDER')).toBe(String(order!.order_number));
    expect(param((await smsTo(mobile, PAID_TEMPLATE)).at(-1), 'DAY')).not.toBe('');
    await context.close();
  });

  test('لغو در درگاه، و «دوباره پرداخت کن» از صفحهٔ سفارش با Referer همین سایت', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toReview(page, newMobile());
    await toGateway(page);
    await decide(page, 'انصراف');
    await expect(page.getByTestId('payment-failed')).toHaveText('پرداخت را در درگاه لغو کردی. پولی از حسابت کم نشده.');
    // فقط مبدأ به درگاه (سؤال ۱۲۲)؛ زیبال ساختگی بی Referer یا با میزبان دیگر ۴۰۳ می‌دهد.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin');
    await visibleButton(page, 'دوباره پرداخت کن').click();
    await page.waitForURL(/\/start\/\d+$/);
    const second = Number(page.url().split('/').at(-1));
    await expect(page.getByRole('heading', { level: 1, name: 'درگاه پرداخت زیبال (ساختگی)' })).toBeVisible();
    expect((await fetch(`${ZIBAL}/start/${second}`)).status).toBe(403);
    expect((await fetch(`${ZIBAL}/start/${second}`, { headers: { referer: 'https://example.com/' } })).status).toBe(403);
    await decide(page, 'پرداخت موفق');
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    const payments = await sql()`
      select p.status, p.provider from payments p join orders o on o.id = p.order_id
       where o.id = (select order_id from payments where authority = ${String(second)}) order by p.created_at`;
    expect(payments.map((p) => [p.provider, p.status])).toEqual([
      ['zibal', 'failed'],
      ['zibal', 'succeeded'],
    ]);
    await context.close();
  });

  test('«در حال بررسی»: پول گرفته شد و پاسخ verify نرسید؛ بی «دوباره پرداخت کن»، و برگشت دوباره «ثبت شد»', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toReview(page, newMobile());
    const trackId = await toGateway(page);
    await zibal('/__mock/config', { fail: { http: 500, times: 1, path: '/v1/verify' } });
    await decide(page, 'پرداخت موفق');
    await expect(page.getByRole('heading', { level: 1, name: 'پرداختت در حال بررسی است' })).toBeVisible();
    await expect(page.getByRole('button', { name: /دوباره پرداخت/ })).toHaveCount(0);
    const [row] = await sql()`
      select p.return_key, p.status, p.gateway_status, o.public_token, o.order_number
        from payments p join orders o on o.id = p.order_id where p.authority = ${String(trackId)}`;
    expect(row).toMatchObject({ status: 'pending', gateway_status: 2 });
    const again = await page.request.post(`/api/checkout/orders/${row!.public_token}/pay`);
    expect(again.status()).toBe(409);
    // همان برگشت دوباره (مثل بار شدن دوبارهٔ صفحهٔ برگشت): استعلام، verify، و «ثبت شد».
    await page.goto(`/pay/callback/${row!.return_key}?trackId=${trackId}&success=1&status=2&orderId=${row!.order_number}`);
    await page.waitForURL(`**/order/${row!.public_token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await context.close();
  });

  test('«متوقف» وسط مسیر: «پرداخت» تازه نه، ولی پرداخت در راه برمی‌گردد و ثبت می‌شود؛ مشتری تازه «متوقف» می‌بیند', async ({ browser }) => {
    const going = await newContext(browser);
    const atGateway = await going.newPage();
    await dropReady(atGateway);
    await toReview(atGateway, newMobile());
    await toGateway(atGateway);

    const waiting = await newContext(browser);
    const atReview = await waiting.newPage();
    await dropReady(atReview);
    await toReview(atReview, newMobile());

    await audience('paused');
    await visibleButton(atReview, PAY).click();
    await expect(atReview.getByTestId('pay-failed')).toContainText('ثبت سفارش موقتاً متوقف است.');
    await expect(atReview.getByTestId('pay-failed')).toContainText('جزوه، نشانی و انتخاب‌هایت همین‌جا می‌مانند');
    await expect(atReview.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();

    // برگشت از درگاه همیشه کار می‌کند (سؤال ۱۶۵).
    await decide(atGateway, 'پرداخت موفق');
    await expect(atGateway.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();

    const fresh = await newContext(browser);
    const page = await fresh.newPage();
    expect(await (await page.request.get('/api/checkout')).json()).toEqual({ mode: 'paused', auth: null });
    const quoted = await page.request.post('/api/checkout/quote', { data: {} });
    expect(quoted.status()).toBe(503);
    expect(await quoted.json()).toEqual({ error: 'checkout_paused' });
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(visibleButton(page, 'ثبت سفارش موقتاً متوقف است')).toBeVisible({ timeout: 90_000 });

    // دوباره «همه»: همان مرورگر مرور، همان «پرداخت»، بی دوباره انداختن جزوه.
    await audience('everyone');
    await visibleButton(atReview, PAY).click();
    await atReview.waitForURL(/\/start\/\d+$/);
    await decide(atReview, 'پرداخت موفق');
    await expect(atReview.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    for (const context of [going, waiting, fresh]) await context.close();
  });

  test('دو پرداخت نیمه‌کاره برای مرحلهٔ off: یکی برمی‌گردد، یکی را استعلام خودکار می‌بندد', async ({ browser }) => {
    test.skip(!HANDOFF, 'بدون E2E_LIVE_HANDOFF');
    const handoff: LiveHandoff[] = [];
    for (let i = 0; i < 2; i += 1) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const mobile = newMobile();
      await dropReady(page);
      await toReview(page, mobile);
      const trackId = await toGateway(page);
      const [row] = await sql()`select o.public_token, o.order_number from payments p join orders o on o.id = p.order_id
                                where p.authority = ${String(trackId)}`;
      // کوکی‌های همین مرورگر (نشست کد پیامکی، `jy_auth`) هم، تا مرحلهٔ off همان مرورگر را برگرداند؛ پایگاه دادهٔ این مرحله دورریختنی است.
      handoff.push({
        startUrl: page.url(),
        trackId,
        token: row!.public_token as string,
        number: row!.order_number as number,
        mobile,
        state: await context.storageState(),
      });
      await context.close();
    }
    writeFileSync(HANDOFF!, JSON.stringify(handoff));
  });
});
