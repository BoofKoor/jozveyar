import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

import type { LiveHandoff } from './live.spec';

/**
 * پول در راه، پس از خاموش شدن مسیر خرید (برش ۷٫۵، ADR-052، سؤال‌های ۱۶۴ و ۱۷۱): همان سایت `live.spec.ts`، دوباره بالا با
 * `CHECKOUT_MODE=off` و همان زیبال و sms.ir ساختگی. مسیر خرید ۴۰۴ است، ولی برگشت از درگاه و استعلام خودکار همیشه کار می‌کنند: دو
 * پرداختی که `live.spec.ts` نیمه‌کاره گذاشت (`E2E_LIVE_HANDOFF`)، یکی با برگشت همان مرورگر از درگاه و یکی بی برگشت، که استعلام خودکار
 * دقیقه‌ای می‌بندد؛ هر دو «سفارش ثبت شد» و پیامک پرداخت با sms.ir.
 *
 *   E2E_LIVE_BASE_URL=http://127.0.0.1:3102 E2E_SMSIR_URL=… E2E_ZIBAL_URL=… E2E_LIVE_HANDOFF=… DATABASE_URL=… \
 *     npx playwright test tests/live-off.spec.ts
 *
 * بی این متغیرها رد می‌شود؛ CI آن را در پایان مرحلهٔ «مسیر خرید live، سرتاسری» اجرا می‌کند.
 */

const BASE = process.env.E2E_LIVE_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const SMSIR = process.env.E2E_SMSIR_URL?.replace(/\/+$/, '');
const ZIBAL = process.env.E2E_ZIBAL_URL?.replace(/\/+$/, '');
const HANDOFF = process.env.E2E_LIVE_HANDOFF;

test.skip(
  !BASE || !DATABASE_URL || !SMSIR || !ZIBAL || !HANDOFF,
  'بدون E2E_LIVE_BASE_URL، E2E_SMSIR_URL، E2E_ZIBAL_URL، E2E_LIVE_HANDOFF و DATABASE_URL — سایت off پس از live.spec.ts لازم است',
);
test.use({ baseURL: BASE });
test.setTimeout(180_000);

/** شناسهٔ قالب پیامک پرداخت در sms.ir ساختگی، همان `.env` این مرحله. */
const PAID_TEMPLATE = 100002;

let sqlClient: ReturnType<typeof postgres> | null = null;
const sql = () => (sqlClient ??= postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined }));
test.afterAll(async () => {
  await sqlClient?.end();
  sqlClient = null;
});

const handoff = (): LiveHandoff[] => JSON.parse(readFileSync(HANDOFF!, 'utf8')) as LiveHandoff[];

async function paidSms(mobile: string): Promise<string> {
  const response = await fetch(`${SMSIR}/__mock/messages`);
  const { messages } = (await response.json()) as { messages: { mobile: string; templateId: number; parameters: { name: string; value: string }[] }[] };
  const sms = messages.filter((m) => m.mobile === mobile && m.templateId === PAID_TEMPLATE).at(-1);
  return sms?.parameters.find((p) => p.name === 'ORDER')?.value ?? '';
}

const paymentOf = async (trackId: number) =>
  (
    await sql()`select p.status, p.settled_via, p.gateway_status, o.status as order_status
                  from payments p join orders o on o.id = p.order_id where p.authority = ${String(trackId)}`
  )[0];

test.describe.serial('پول در راه پس از off', () => {
  test('مسیر خرید off: همه ۴۰۴، پیوند پیش‌نمایش هم؛ وضعیت «off»', async ({ request }) => {
    expect(handoff()).toHaveLength(2);
    expect(await (await request.get('/api/checkout')).json()).toEqual({ mode: 'off', auth: null });
    for (const path of ['/api/checkout/quote', '/api/checkout/otp', '/api/checkout/orders']) {
      expect((await request.post(path, { data: {} })).status(), path).toBe(404);
    }
    const token = randomBytes(32).toString('base64url');
    expect((await request.get(`/preview/${token}`)).status()).toBe(404);
    expect((await request.post('/api/checkout/preview', { form: { token }, maxRedirects: 0 })).status()).toBe(404);
  });

  test('برگشت از درگاه در off: همان مرورگر از صفحهٔ زیبال «پرداخت موفق» می‌زند و «سفارش ثبت شد» می‌بیند', async ({ browser }) => {
    const [customer] = handoff();
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 }, storageState: customer!.state });
    const page = await context.newPage();
    // صفحهٔ درگاه که پیش از off باز بود: زیبال Referer همین سایت را می‌خواهد.
    await page.goto(customer!.startUrl, { referer: `${new URL(BASE!).origin}/` });
    await expect(page.getByRole('heading', { level: 1, name: 'درگاه پرداخت زیبال (ساختگی)' })).toBeVisible();
    await page.getByRole('button', { name: 'پرداخت موفق' }).click();
    await page.waitForURL(`**/order/${customer!.token}`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await expect(page.getByTestId('order-paid')).toContainText(`سفارش ${customer!.number} ·`);
    expect(await paymentOf(customer!.trackId)).toMatchObject({ status: 'succeeded', settled_via: 'callback', gateway_status: 1, order_status: 'paid' });
    await expect.poll(() => paidSms(customer!.mobile)).toBe(String(customer!.number));
    await context.close();
  });

  test('پرداخت بی برگشت در off: استعلام خودکار دقیقه‌ای می‌بندد، با پیامک پرداخت', async ({ browser }) => {
    test.setTimeout(300_000);
    const [, customer] = handoff();
    // مشتری در درگاه پرداخت کرد و مرورگرش را بست. استعلام خودکار فقط تلاشی را می‌پرسد که بیش از ۲ دقیقه از ساختنش گذشته، و هر دقیقه
    // یک دور است؛ زمان ساختن تلاش عوض‌شدنی نیست (`payments_frozen`)، پس تست صبر می‌کند، نه اینکه زمان را دست‌کاری کند.
    const paid = await fetch(`${ZIBAL}/__mock/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trackId: customer!.trackId, outcome: 'success' }),
    });
    expect(paid.status).toBe(200);
    expect(await paymentOf(customer!.trackId)).toMatchObject({ status: 'pending', order_status: 'awaiting_payment' });
    await expect
      .poll(async () => (await paymentOf(customer!.trackId))?.status, { timeout: 240_000, intervals: [2_000] })
      .toBe('succeeded');
    expect(await paymentOf(customer!.trackId)).toMatchObject({ settled_via: 'auto', gateway_status: 1, order_status: 'paid' });
    await expect.poll(() => paidSms(customer!.mobile)).toBe(String(customer!.number));

    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 }, storageState: customer!.state });
    const page = await context.newPage();
    await page.goto(`/order/${customer!.token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await context.close();
  });
});
