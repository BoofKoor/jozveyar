import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatTomans } from '@jozveyar/text';

import { at, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch, ZIBAL, zibalMock } from './helpers';

/**
 * درگاه زیبال در پنل، سرتاسری (برش ۷٫۲؛ طرح `docs/ui/mockups/admin.html`: `m-order-unpaid`، `m-order-second`، `m-dash-alerts` و
 * `m-key-rejected`؛ ADR-050): کارت «پرداخت‌ها» با شناسهٔ زیبال، کارت پوشیده، کد پیگیری و وضعیت درگاه؛ «استعلام از درگاه» روی تلاش «در
 * حال بررسی» که سفارش را «در صف چاپ» می‌برد و پیامک پرداخت می‌فرستد؛ پرداخت دوم که پولش نزد درگاه است تا «برگشت خورد»؛ مبلغ ناهمخوان بی
 * `verify`؛ هشدار «زیبال IP سرور را نپذیرفت» تا اولین «آزمایش» درست کد پذیرنده؛ رویدادها زیر «پرداخت و بازپرداخت»؛ و گوشی و دسکتاپ.
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، به‌علاوهٔ زیبال ساختگی که پنل با `ZIBAL_API_URL` به آن وصل است:
 *
 *   ZIBAL_MOCK_MERCHANTS=<همان PAYMENT_MERCHANT_ID> node packages/payments/mock/zibal.mjs 3400
 *   PAYMENT_MERCHANT_ID=… PAYMENT_CALLBACK_URL=http://127.0.0.1:3101/pay/callback ZIBAL_API_URL=http://127.0.0.1:3400 (پنل و این تست)
 *
 * بی آن رد می‌شود، تا هیچ درخواستی به زیبال واقعی نرود. تلاش‌ها را تست خودش در زیبال ساختگی می‌سازد (همان `request` که سایت می‌زند) و
 * ردیفشان را مثل `startPayment` می‌نشاند؛ سایت روی ۳۱۰۱ مسیر خرید خاموش دارد. «آزمایش» کد پذیرنده دو بار است و با ۸ آزمایش
 * `settings.spec.ts` همان سقف ۱۰ در ساعت کل پنل را پر می‌کند؛ اجرای دوباره در همان ساعت پایگاه دادهٔ تازه می‌خواهد، مثل CI.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.skip(!ZIBAL || !env.PAYMENT_MERCHANT_ID || !env.PAYMENT_CALLBACK_URL, 'بدون ZIBAL_API_URL، PAYMENT_MERCHANT_ID و PAYMENT_CALLBACK_URL — زیبال ساختگی لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * MINUTE * 60;
const TEHRAN = { provinceId: 8, cityId: 394 };
/** «امروز 11:14»؛ ساعت هر چه باشد. */
const TODAY = 'امروز \\d\\d:\\d\\d';
const CARD = '6037\u00a099••\u00a0••••\u00a01234';
let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  totalRials: number;
  phone: string;
}

/** سفارش در انتظار پرداخت، همان‌طور که «پرداخت» سایت می‌سازد؛ فایل‌هایش دو روز دیگر روی سرورند. */
async function awaitingOrder(name: string, phone: string): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'فیزیک پایه ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '7')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
    SEED_PRICE_LIST,
  );
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${phone}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'tehran',
              ${TEHRAN.provinceId}, ${TEHRAN.cityId}, ${name}, ${phone}, 'خیابان ولیعصر، کوچهٔ نسترن، پلاک 7', ${new Date(Date.now() - 20 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${new Date(Date.now() - 20 * MINUTE)}, 'user')`;
    return { id: row!.id, number: row!.order_number, totalRials: breakdown.totalRials, phone };
  });
}

/**
 * تلاش زیبال، مثل `startPayment` سایت: `request` به زیبال ساختگی با شناسهٔ سفارش «شماره-۸ نویسه» و نشانی برگشت با کلید تصادفی، و ردیف
 * `payments` با همان. `amountRials` آنچه به درگاه رفت؛ ردیف همیشه جمع منجمد سفارش (`payments_amount_is_total`).
 */
async function zibalAttempt(o: Seeded, over: { amountRials?: number; createdAt?: Date; extra?: Record<string, unknown> } = {}) {
  const gatewayOrderId = `${o.number}-${randomBytes(4).toString('hex')}`;
  const returnKey = randomBytes(16).toString('hex');
  const trackId = await zibalMock.request({
    amountRials: over.amountRials ?? o.totalRials,
    orderId: gatewayOrderId,
    callbackUrl: `${env.PAYMENT_CALLBACK_URL}/${returnKey}`,
  });
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO payments (order_id, provider, amount_rials, authority, gateway_order_id, return_key, created_at)
    VALUES (${o.id}, 'zibal', ${o.totalRials}, ${trackId}, ${gatewayOrderId}, ${returnKey}, ${over.createdAt ?? new Date(Date.now() - 3 * MINUTE)})
    RETURNING id`;
  return { trackId, id: row!.id };
}

const payRow = (page: Page, trackId: string) => page.locator('.ad-pay > li').filter({ hasText: `شناسهٔ زیبال ${trackId}` });
const flash = (page: Page) => page.locator('main > .jy-note').first();

test.describe.serial('درگاه زیبال در پنل', () => {
  let owner: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const o = {} as Record<'A' | 'B' | 'C', Seeded>;
  const phone = (n: number) => `0915${String(RUN).slice(1)}7${String(n).padStart(3, '0')}`;
  let first = { trackId: '', id: '' };
  let second = { trackId: '', id: '' };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await zibalMock.configure({ ipRejected: false, fail: null });
    o.A = await awaitingOrder('کیان رستمی', phone(1));
    o.B = await awaitingOrder('نگار صادقی', phone(2));
    o.C = await awaitingOrder('مریم کاظمی', phone(3));
    owner = await newContext(browser);
    ownerPage = await owner.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(`sarap${RUN}`, '--name', 'سارا رضایی'));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`alip${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await zibalMock.configure({ ipRejected: false, fail: null }).catch(() => undefined);
    await owner?.close();
    await operator?.close();
    await sql?.end();
  });

  test('«در حال بررسی» → «استعلام از درگاه»: استعلام پیش از `verify`، سفارش «در صف چاپ» و پیامک پرداخت، با رویداد', async () => {
    // پول گرفته شد و پاسخ `verify` نرسید (همان حالِ پس از سقف زمان، با SQL).
    first = await zibalAttempt(o.A);
    await zibalMock.pay(first.trackId, 'success');
    await sql`UPDATE payments SET gateway_status = 2, gateway_error = 'unavailable', gateway_checked_at = ${new Date(Date.now() - MINUTE)},
                                  returned_at = ${new Date(Date.now() - 2 * MINUTE)}
              WHERE id = ${first.id}`;

    const page = operatorPage;
    await page.goto(at(`/orders/${o.A.number}`));
    await expect(page.locator('.ad-status .jy-card__title')).toHaveText('پرداخت در حال بررسی');
    await expect(page.locator('#t-pay').locator('..').locator('.jy-card__meta')).toHaveText('زیبال');
    const row = payRow(page, first.trackId);
    await expect(row).toHaveAttribute('data-payment', 'checking');
    await expect(row.locator('.jy-badge')).toHaveText('در حال بررسی');
    // کارت هنوز نه: تلاش در انتظار فقط آنچه از درگاه دانستیم را دارد (`gateway_*`)؛ کارت با بستن تلاش می‌نشیند (طرح `m-order-unpaid`).
    await expect(row.locator('.ad-pay__meta')).toHaveText(
      new RegExp(
        `^شناسهٔ زیبال ${first.trackId} · زیبال می‌گوید پرداخت شده، ولی تأییدش هنوز نهایی نشده؛ زیبال جواب نداد\\. استعلام خودکار هر دقیقه، آخرین \\d\\d:\\d\\d؛ برگشتش تا \\d\\d:\\d\\d پذیرفته می‌شود\\.$`,
      ),
    );
    await row.getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(page).toHaveURL(/done=inquiry&r=succeeded/);
    await expect(flash(page)).toHaveText('درگاه پرداخت را تأیید کرد و سفارش «در صف چاپ» رفت؛ پیامک پرداخت به مشتری می‌رود.');
    await expect(row).toHaveAttribute('data-payment', 'succeeded');
    await expect(row.locator('.ad-pay__meta')).toHaveText(
      new RegExp(`^شناسهٔ زیبال ${first.trackId} · کارت ${CARD} · کد پیگیری \\d+ · درگاه: پرداخت‌شده، تأییدشده$`),
    );
    await expect(row.getByRole('button', { name: 'استعلام از درگاه' })).toHaveCount(0);
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    await expect(page.locator('.ad-log')).toContainText('استعلام از درگاه: پرداخت تأیید شد و سفارش در صف چاپ رفت');

    const [payment] = await sql`SELECT status, settled_via, verified_amount_rials, gateway_status FROM payments WHERE id = ${first.id}`;
    expect(payment).toMatchObject({ status: 'succeeded', settled_via: 'panel', gateway_status: 1 });
    expect(Number(payment!.verified_amount_rials)).toBe(o.A.totalRials);
    const sms = await sql`SELECT status FROM sms_messages WHERE to_mobile = ${o.A.phone} AND purpose = 'order_paid'`;
    // پنل این مرحله کنسولی است: پیامک «ثبت شد» (`logged`)، همان که `smsir.spec.ts` با sms.ir «رفت» می‌بیند.
    expect(sms.map((m) => m.status)).toEqual(['logged']);
    const events = await sql`SELECT detail FROM admin_events WHERE action = 'payments.inquiry' AND target_id = ${o.A.id}`;
    expect(events.map((e) => e.detail)).toEqual([{ orderNumber: o.A.number, outcome: 'succeeded', status: 1 }]);
    expect(operatorProblems).toEqual([]);
  });

  test('پرداخت دوم: هرگز `verify`، پول نزد درگاه («پول مشتری برمی‌گردد») تا استعلام بگوید «برگشت خورد»', async () => {
    second = await zibalAttempt(o.A, { createdAt: new Date(Date.now() - 2 * MINUTE) });
    await zibalMock.pay(second.trackId, 'success');
    const page = ownerPage;
    await page.goto(at(`/orders/${o.A.number}`));
    const row = payRow(page, second.trackId);
    await expect(row).toHaveAttribute('data-payment', 'pending');
    await row.getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(page).toHaveURL(/done=inquiry&r=held/);
    await expect(flash(page)).toHaveText('این تلاش تأیید نشد و پولش نزد درگاه است؛ خودکار به کارت مشتری برمی‌گردد. علتش در کارت «پرداخت‌ها» است.');
    await expect(row.locator('.ad-pay__meta')).toContainText(
      'پرداخت دوم: سفارش پیش‌تر پرداخت شده بود، پس تأیید نشد؛ زیبال پولش را خودکار به کارت برمی‌گرداند (درگاه: پرداخت‌شده، تأییدنشده)',
    );
    // شاهد: زیبال ساختگی تأییدش نکرد.
    const [held] = await sql`SELECT status, failure_code, gateway_status FROM payments WHERE id = ${second.id}`;
    expect(held).toMatchObject({ status: 'failed', failure_code: 'order_not_payable', gateway_status: 2 });

    await page.goto(at('/'));
    await expect(page.locator('[data-alert="held"]')).toContainText(
      `پول مشتری برمی‌گردد: پرداخت دوم سفارش ${o.A.number} تأیید نشد؛ زیبال 15 دقیقه پس از هر پرداخت خودکار برش می‌گرداند. تا استعلام بگوید «برگشت خورد»، اینجا می‌ماند.`,
    );

    // زیبال برش گرداند؛ استعلام همین را می‌گوید و هشدار می‌رود.
    await zibalMock.status(second.trackId, 18);
    await page.goto(at(`/orders/${o.A.number}`));
    await row.getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(page).toHaveURL(/done=inquiry&r=returned/);
    await expect(row).toHaveAttribute('data-payment', 'returned');
    await expect(row.locator('.jy-badge')).toHaveText('برگشت خورد');
    await expect(row.locator('.ad-pay__meta')).toContainText('زیبال پولش را به کارت برگرداند (درگاه: ریورس‌شده) · استعلام پنل');
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="held"]')).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });

  test('مبلغ ناهمخوان: ناموفق بی `verify`، خطای پیشخوان با مبلغی که زیبال گفت', async () => {
    const odd = await zibalAttempt(o.C, { amountRials: o.C.totalRials - 100_000 });
    await zibalMock.pay(odd.trackId, 'success');
    const page = ownerPage;
    await page.goto(at(`/orders/${o.C.number}`));
    await payRow(page, odd.trackId).getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(page).toHaveURL(/done=inquiry&r=held/);
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('در انتظار پرداخت');
    await expect(payRow(page, odd.trackId).locator('.ad-pay__meta')).toContainText(
      `مبلغ با سفارش نخواند: زیبال ${formatTomans(o.C.totalRials - 100_000, false)} تومان گفت، نه ${formatTomans(o.C.totalRials, false)}`,
    );
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="mismatch"]')).toHaveText(
      `مبلغ ناهمخوان: زیبال برای یک تلاش پرداخت سفارش ${o.C.number} مبلغ ${formatTomans(o.C.totalRials - 100_000, false)} تومان گزارش داد، نه ` +
        `${formatTomans(o.C.totalRials, false)}. تأیید نشد و سفارش پرداخت‌نشده ماند؛ پول مشتری خودکار برمی‌گردد. یعنی کسی یا چیزی مبلغ دیگری به ` +
        'درگاه داده؛ جزئیاتش در همان سفارش است.',
    );
    await expect(page.locator('[data-alert="held"]')).toContainText(`پرداخت ناهمخوان سفارش ${o.C.number}`);
    const [row] = await sql`SELECT status, failure_code, gateway_status FROM payments WHERE id = ${odd.id}`;
    expect(row).toMatchObject({ status: 'failed', failure_code: 'amount_mismatch', gateway_status: 2 });
    expect(ownerProblems).toEqual([]);
  });

  test('«زیبال IP سرور را نپذیرفت»: هشدار پیشخوان تا اولین «آزمایش» درست کد پذیرنده؛ رویدادها زیر «پرداخت و بازپرداخت»', async () => {
    // همان رویداد سیستمی که شروع پرداخت سایت با ۱۱۵ می‌نویسد (`recordGatewayRejection`).
    await sql`INSERT INTO admin_events (admin_user_id, action, target_type, target_id, detail, at)
              VALUES (NULL, 'payments.gateway_rejected', 'order', ${o.B.id},
                      ${sql.json({ orderNumber: o.B.number, provider: 'zibal', result: 115 })}, now())`;
    const alert = (page: Page) => page.locator('[data-alert="gateway"]');
    const text = (tail: string) =>
      new RegExp(
        `^زیبال IP سرور را نپذیرفت \\(کد 115\\)، ${TODAY} هنگام پرداخت سفارش ${o.B.number}\\. تا IP همین سرور در پنل زیبال ثبت نشود، پرداخت تازه شروع ` +
          `نمی‌شود و پرداخت‌های در راه تأیید نمی‌شوند \\(پولشان خودکار برمی‌گردد\\)\\. بعد از ثبت IP، ${tail}$`,
      );
    await ownerPage.goto(at('/'));
    await expect(alert(ownerPage)).toHaveText(text('کد پذیرنده را در «تنظیمات» بیازما\\.'));
    await operatorPage.goto(at('/'));
    await expect(alert(operatorPage)).toHaveText(text('به مالک بگو کد پذیرنده را در «تنظیمات» بیازماید\\.'));

    // «آزمایش» کد پذیرندهٔ .env: IP رد شد؛ هشدار می‌ماند.
    await zibalMock.configure({ ipRejected: true });
    await ownerPage.goto(at('/settings'));
    const merchant = ownerPage.locator('[data-key="PAYMENT_MERCHANT_ID"]');
    await merchant.getByRole('button', { name: 'آزمایش' }).click();
    await expect(ownerPage.locator('#keys .jy-note--error')).toHaveText(
      new RegExp(`^«کد پذیرندهٔ زیبال»: رد شد · آزمایش ${TODAY}: زیبال IP سرور را نپذیرفت \\(کد 115\\)\\.$`),
    );
    await expect(merchant.locator('.ad-keys__test')).toHaveText(new RegExp(`^رد شد · آزمایش ${TODAY}: زیبال IP سرور را نپذیرفت \\(کد 115\\)\\.$`));
    await ownerPage.goto(at('/'));
    await expect(alert(ownerPage)).toHaveCount(1);

    // IP ثبت شد: «آزمایش» درست، و هشدار خودش می‌رود (سؤال ۱۳۹).
    await zibalMock.configure({ ipRejected: false });
    await ownerPage.goto(at('/settings'));
    await merchant.getByRole('button', { name: 'آزمایش' }).click();
    await expect(merchant.locator('.ad-keys__test')).toHaveText(new RegExp(`^درست · آزمایش ${TODAY}: زیبال پذیرفت\\.$`));
    await ownerPage.goto(at('/'));
    await expect(alert(ownerPage)).toHaveCount(0);

    await ownerPage.goto(at('/events?kind=payments'));
    const log = ownerPage.locator('main');
    await expect(log).toContainText(`سفارش ${o.A.number}: استعلام از درگاه؛ پرداخت تأیید شد`);
    await expect(log).toContainText(`سفارش ${o.A.number}: استعلام از درگاه؛ پول به کارت برگشت`);
    await expect(log).toContainText(`زیبال شروع پرداخت سفارش ${o.B.number} را رد کرد: IP سرور (کد 115)`);
    await ownerPage.goto(at('/events?kind=settings'));
    await expect(ownerPage.locator('main')).toContainText('کلید «کد پذیرندهٔ زیبال» آزمایش شد: رد شد، IP سرور (کد 115)');
    for (const page of [ownerPage, operatorPage]) expect((await page.content()).includes(env.PAYMENT_MERCHANT_ID!)).toBe(false);
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: کارت «پرداخت‌ها» و هشدارهای پیشخوان بی سرریز و با هدف لمسی ۴۴ پیکسل', async ({ browser }) => {
    // یک تلاش باز «در حال بررسی» تا دکمهٔ استعلام و کارت کنار هم دیده شوند.
    const open = await zibalAttempt(o.B);
    await sql`UPDATE payments SET returned_at = now(), gateway_error = 'unavailable', gateway_checked_at = now() WHERE id = ${open.id}`;
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await owner.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [`/orders/${o.A.number}`, `/orders/${o.B.number}`, `/orders/${o.C.number}`, '/']) {
        await page.goto(at(path));
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
