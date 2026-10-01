import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, formatJalaliWeekday, formatTomans } from '@jozveyar/text';

import { assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * بازپرداخت سفارش لغوشده، سرتاسری (برش ۷٫۳، ADR-051؛ طرح `docs/ui/mockups/admin.html`: `m-refund`، `m-refund-manual`، `m-refunding`،
 * `m-refunded`، `m-refund-failed` و `m-dash-alerts`؛ طرح سایت `checkout.html`، «سفارش لغو شد»): کارت «بازپرداخت» با کارمزد پیش از کد
 * تازه، «در حال برگشت» و «استعلام از درگاه» تا «برگشت داده شد» با کد پیگیری؛ رد کیف پول («برنگشت») و بعد «ثبت بازپرداخت دستی»؛ پاسخ
 * گم‌شده («معلوم نیست»، بی «دوباره») که استعلام روشنش می‌کند؛ پیش‌استعلامی که می‌گوید پول همین حالا برگشته؛ کد اشتباه بی هیچ ردیفی؛ متصدی
 * فقط می‌بیند؛ لغوی که پولش برگشته دیگر برنمی‌گردد؛ هشدار پیشخوان؛ رویدادها زیر «پرداخت و بازپرداخت»؛ صفحهٔ مشتری روی وب؛ گوشی و دسکتاپ.
 *
 * بازپرداخت از درگاه فقط با درگاه نمونه (سؤال ۱۵۲)، پس پنل باید `CHECKOUT_MODE=mock` داشته باشد؛ رفتار درگاه نمونه را `refund` در
 * `payments.raw` هر پرداخت می‌گوید (`MockRefundPlan`). هیچ پولی جابه‌جا نمی‌شود و هیچ درخواستی بیرون نمی‌رود. همان پایگاه دادهٔ
 * `admin.spec.ts` (طرز اجرا بالای همان)، و برای صفحهٔ مشتری `E2E_WEB_BASE_URL=http://127.0.0.1:3101`. CI پس از اجرای اصلی پنل سومی روی
 * ۳۲۰۲ با `CHECKOUT_MODE=mock` بالا می‌آورد و فقط همین فایل را اجرا می‌کند؛ اجرای اصلی بی آن است و این فایل خودش را رد می‌کند.
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL;
const MOCK_ON = env.CHECKOUT_MODE?.trim().toLowerCase() === 'mock';
test.skip(
  !BASE || !GATE || !env.DATABASE_URL || !WEB || !MOCK_ON,
  'بدون CHECKOUT_MODE=mock، E2E_WEB_BASE_URL و متغیرهای پنل — پنل با درگاه نمونه و وب لازم است',
);
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TEHRAN = { provinceId: 8, cityId: 394 };
const TODAY = 'امروز \\d\\d:\\d\\d';
/** کارت پوشیده در پنل یک تکه است (همان کارت «پرداخت‌ها»)؛ در سایت با فاصلهٔ معمولی و `nw`. */
const CARD = '6037\u00a099••\u00a0••••\u00a01234';
const SITE_CARD = '6037 99•• •••• 1234';
let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  token: string;
  userId: string;
  totalRials: number;
  paymentId: string;
}

/**
 * سفارش «لغو شد» با پرداخت موفق درگاه نمونه، همان‌طور که سرور می‌نویسد: سفارش، پرداخت تأییدشده با کارت پوشیده، چاپخانه در پرداخت، و
 * لغو با دلیل. `plan` رفتار بازپرداخت درگاه نمونه است (`payments.raw.refund`).
 */
async function cancelledOrder(name: string, phone: string, plan: string | null, adminId: string): Promise<Seeded> {
  const paidAt = new Date(Date.now() - 3 * 60 * MINUTE);
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'آمار و احتمال.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
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
    const [row] = await tx<{ id: string; order_number: number; public_token: string }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'tehran',
              ${TEHRAN.provinceId}, ${TEHRAN.cityId}, ${name}, ${phone}, 'خیابان انقلاب، کوچهٔ لاله، پلاک 9', ${new Date(paidAt.getTime() - 20 * MINUTE)})
      RETURNING id, order_number, public_token`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const raw = { decision: 'success', verified: true, refId: '803114', ...(plan ? { refund: plan } : {}) };
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, card_mask, raw,
                            verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded',
              ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`}, '803114', '603799******1234', ${tx.json(raw)},
              ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${new Date(paidAt.getTime() + 3 * DAY)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    const cancelledAt = new Date(Date.now() - 30 * MINUTE);
    await tx`UPDATE orders SET status = 'cancelled' WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, admin_user_id, note)
             VALUES (${row!.id}, 'paid', 'cancelled', ${cancelledAt}, 'admin', ${adminId}, ${tx.json({ reason: 'مشتری خواست؛ هنوز چاپ نشده بود.' })})`;
    return {
      id: row!.id,
      number: row!.order_number,
      token: row!.public_token,
      userId: user!.id,
      totalRials: breakdown.totalRials,
      paymentId: payment!.id,
    };
  });
}

/** نشست صاحب سفارش روی وب (`jy_auth`)، همان‌طور که تأیید کد پیامکی می‌سازد: فقط هش توکن در پایگاه داده (مثل `sms.spec.ts`). */
async function customer(browser: Browser, o: Seeded): Promise<BrowserContext> {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (${createHash('sha256').update(token).digest('hex')}, ${o.userId}, ${new Date(Date.now() + DAY)})`;
  const context = await browser.newContext({ baseURL: WEB, viewport: { width: 390, height: 800 } });
  // نشان اینماد پاورقی از اجراگر CI گاهی جواب نمی‌دهد (مثل `sms.spec.ts`).
  await context.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  await context.addCookies([{ name: 'jy_auth', value: token, url: WEB! }]);
  return context;
}

const refunds = (o: Seeded) =>
  sql<{ status: string; method: string; fee_rials: string | null; reference: string | null; settled_via: string | null; gateway_error: string | null }[]>`
    SELECT status, method, fee_rials::text AS fee_rials, reference, settled_via, gateway_error FROM refunds WHERE order_id = ${o.id} ORDER BY created_at`;
const card = (page: Page) => page.locator('.ad-side .ad-refund');
const flash = (page: Page) => page.locator('main > .jy-note').first();

test.describe.serial('بازپرداخت سفارش لغوشده', () => {
  let owner: BrowserContext;
  let ownerPage: Page;
  let ownerSecret = '';
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const o = {} as Record<'A' | 'B' | 'C' | 'D', Seeded>;
  const phone = (n: number) => `0916${String(RUN).slice(1)}8${String(n).padStart(3, '0')}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    owner = await newContext(browser);
    ownerPage = await owner.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(`sarar${RUN}`, '--name', 'سارا رضایی'));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`alir${RUN}`, '--operator', '--name', 'علی محمدی'));
    // لغو با متصدی، همان‌طور که فرم لغو می‌نویسد.
    const [canceller] = await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${`alir${RUN}`}`;
    o.A = await cancelledOrder('کیان رستمی', phone(1), null, canceller!.id);
    o.B = await cancelledOrder('نگار صادقی', phone(2), 'balance', canceller!.id);
    o.C = await cancelledOrder('مریم کاظمی', phone(3), 'lost', canceller!.id);
    o.D = await cancelledOrder('بهار نوری', phone(4), 'already', canceller!.id);
  });

  test.afterAll(async () => {
    await owner?.close();
    await operator?.close();
    // بازپرداخت پاک نمی‌شود (`refunds_append_only`) و پرداخت و سفارشش را نگه می‌دارد؛ پایگاه داده دورریختنی است، و تست‌های بعدی سفارش‌ها
    // را با `DELETE` پاک می‌کنند، پس بازپرداخت‌های همین اجرا با TRUNCATE می‌روند.
    if (sql) {
      await sql`TRUNCATE refunds`;
      await sql.end();
    }
  });

  test('پیشخوان: «پول سفارش لغوشده هنوز برنگشته»، مالک و متصدی؛ کارت «پول برنگشته» با دو راه برای مالک، و متصدی فقط می‌بیند', async () => {
    await ownerPage.goto(at('/'));
    const alert = ownerPage.locator('[data-alert="unrefunded"]');
    await expect(alert).toContainText('پول سفارش‌های لغوشدهٔ');
    for (const x of [o.A, o.B, o.C, o.D]) await expect(alert).toContainText(String(x.number));
    await operatorPage.goto(at('/'));
    await expect(operatorPage.locator('[data-alert="unrefunded"]')).toContainText(String(o.A.number));

    await ownerPage.goto(at(`/orders/${o.A.number}`));
    const owned = card(ownerPage);
    await expect(owned).toHaveAttribute('data-refund', 'none');
    await expect(owned.locator('.jy-badge')).toHaveText('پول برنگشته');
    await expect(owned.locator('.ad-refund__sum')).toHaveText(`${formatTomans(o.A.totalRials, false)} تومان`);
    await expect(owned.locator('.ad-meta')).toHaveText(new RegExp(`^پرداخت .+ با درگاه نمونه، کارت ${CARD}$`));
    await expect(owned.getByRole('link', { name: 'بازپرداخت از درگاه…' })).toBeVisible();
    await expect(owned.getByRole('link', { name: 'ثبت بازپرداخت دستی…' })).toBeVisible();

    await operatorPage.goto(at(`/orders/${o.A.number}`));
    const seen = card(operatorPage);
    await expect(seen.locator('.jy-badge')).toHaveText('پول برنگشته');
    await expect(seen.getByRole('link')).toHaveCount(0);
    await expect(seen).toContainText('بازپرداخت با مالک است؛ پیشخوان تا برگشت پول یادآوری می‌کند.');
    // نشانی فرم برای متصدی هیچ نمی‌کند.
    await operatorPage.goto(at(`/orders/${o.A.number}?do=refund`));
    await expect(card(operatorPage)).toHaveAttribute('data-refund', 'none');
    expect(operatorProblems).toEqual([]);
  });

  test('از درگاه: کارمزد پیش از کد؛ کد اشتباه بی ردیف؛ «در حال برگشت» و مشتری «در حال برگشت»؛ «استعلام از درگاه» تا «برگشت داده شد»', async ({ browser }) => {
    const page = ownerPage;
    await page.goto(at(`/orders/${o.A.number}`));
    await card(page).getByRole('link', { name: 'بازپرداخت از درگاه…' }).click();
    const form = page.locator('[data-refund-form="gateway"]');
    await expect(form.locator('.jy-card__title')).toHaveText('بازپرداخت از درگاه');
    await expect(form.locator('.ad-changes > li')).toHaveText([
      `مبلغ${formatTomans(o.A.totalRials, false)} تومان، کل پرداخت`,
      `بهکارت ${CARD}، همان که پرداخت کرد`,
      // 0.1٪ کمتر از کمینه است، پس 1,500 تومان (سؤال ۱۵۵).
      'کارمزد درگاه نمونه1,500 تومان، از کیف پول درگاه نمونه جزوه‌یار',
    ]);
    await expect(form.locator('.jy-note--info')).toContainText(`دست‌کم ${formatTomans(o.A.totalRials + 15_000, false)} تومان`);
    await expect(form.locator('.jy-hint')).toHaveText('پول جابه‌جا می‌شود؛ کد تازه لازم است.');

    await form.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await form.getByRole('button', { name: `${formatTomans(o.A.totalRials, false)} تومان را برگردان` }).click();
    await expect(form.locator('.jy-error')).toContainText('کد');
    expect(await refunds(o.A)).toEqual([]);

    await form.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await form.getByRole('button', { name: `${formatTomans(o.A.totalRials, false)} تومان را برگردان` }).click();
    await expect(page).toHaveURL(/done=refund&r=refunding/);
    await expect(flash(page)).toHaveText('درگاه بازپرداخت را پذیرفت و پول در راه کارت مشتری است؛ مشتری «در حال برگشت» را می‌بیند.');
    const refunding = card(page);
    await expect(refunding).toHaveAttribute('data-refund', 'refunding');
    await expect(refunding.locator('.jy-badge')).toHaveText('در حال برگشت');
    await expect(refunding.locator('.ad-meta')).toHaveText(new RegExp(`^از درگاه، ${TODAY}، سارا رضایی · به کارت ${CARD}$`));
    await expect(refunding.locator('.jy-note')).toContainText('مشتری «در حال برگشت» را می‌بیند.');
    expect(await refunds(o.A)).toEqual([
      { status: 'pending', method: 'gateway', fee_rials: '15000', reference: null, settled_via: null, gateway_error: null },
    ]);
    // لغوی که پولش در راه برگشت است دیگر برنمی‌گردد.
    await expect(page.locator('.ad-status').getByRole('link', { name: /برگرداندن/ })).toHaveCount(0);

    const shopper = await customer(browser, o.A);
    const site = await shopper.newPage();
    await site.goto(`/order/${o.A.token}`);
    await expect(site.getByTestId('order-refunding')).toHaveText(
      `در حال برگشت: ${formatTomans(o.A.totalRials, false)} تومان به همان کارتی که با آن پرداختی (${SITE_CARD}) برمی‌گردد؛ معمولاً تا نیم ساعت.`,
    );
    await expect(site.locator('.home-sum__label')).toHaveText('در حال برگشت');

    await refunding.getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(page).toHaveURL(/done=refund_inquiry&r=refunded/);
    const done = card(page);
    await expect(done).toHaveAttribute('data-refund', 'refunded');
    await expect(done.locator('.jy-badge')).toHaveText('برگشت داده شد');
    await expect(done.locator('.ad-facts')).toContainText(`از درگاه نمونه، به کارت ${CARD} · کارمزد 1,500 تومان`);
    await expect(done).toContainText('لغو این سفارش دیگر برنمی‌گردد: پولش برگشته است.');
    const [row] = await sql<{ reference: string; settled_via: string }[]>`SELECT reference, settled_via FROM refunds WHERE order_id = ${o.A.id}`;
    expect(row).toMatchObject({ settled_via: 'panel' });
    expect(row!.reference).toMatch(/^\d{6}$/);
    await expect(page.locator('.ad-log')).toContainText(`بازپرداخت ${formatTomans(o.A.totalRials, false)} تومان از درگاه درخواست شد`);
    await expect(page.locator('.ad-log')).toContainText(`بازپرداخت برگشت داده شد، کد پیگیری ${row!.reference}`);

    await site.reload();
    await expect(site.getByTestId('order-refunded')).toHaveText(
      new RegExp(
        `^برگشت داده شد: ${formatTomans(o.A.totalRials, false)} تومان ${formatJalaliWeekday(new Date())}، ساعت \\d\\d:\\d\\d به کارتت \\(${SITE_CARD}\\) برگشت\\. کد پیگیری ${row!.reference}\\.$`,
      ),
    );
    await expect(site.locator('.home-sum__label')).toHaveText('برگشت داده شد');
    await shopper.close();

    // برگرداندن لغو از نشانی هم نه.
    const [refunded] = await sql<{ status: string }[]>`SELECT status FROM orders WHERE id = ${o.A.id}`;
    expect(refunded!.status).toBe('cancelled');
    expect(ownerProblems).toEqual([]);
  });

  test('کیف پول کافی نیست: «برنگشت» و پولی جابه‌جا نشد؛ بعد «ثبت بازپرداخت دستی» با روز و کد پیگیری، و مشتری فقط روز می‌بیند', async ({ browser }) => {
    const page = ownerPage;
    await page.goto(at(`/orders/${o.B.number}?do=refund`));
    const form = page.locator('[data-refund-form="gateway"]');
    await form.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await form.getByRole('button', { name: /تومان را برگردان$/ }).click();
    await expect(page).toHaveURL(/done=refund&r=failed/);
    const failed = card(page);
    await expect(failed).toHaveAttribute('data-refund', 'failed');
    await expect(failed.locator('.jy-badge')).toHaveText('برنگشت');
    await expect(failed.locator('.jy-note--error')).toHaveText(
      new RegExp(
        `^درگاه نمونه بازپرداخت را نپذیرفت: موجودی کیف پول کافی نیست \\(${TODAY}\\)\\. پولی جابه‌جا نشد؛ کیف پول را شارژ کن و دوباره بزن، یا پول را از راه دیگری برگردان و ثبتش کن\\.$`,
      ),
    );
    await expect(failed.getByRole('link', { name: 'دوباره از درگاه…' })).toBeVisible();
    // «برنگشت» پول را در راه نمی‌گذارد: مشتری همان «برمی‌گردد» را می‌بیند (سؤال ۱۵۷).
    const shopper = await customer(browser, o.B);
    const site = await shopper.newPage();
    await site.goto(`/order/${o.B.token}`);
    await expect(site.getByTestId('order-cancelled')).toContainText('برمی‌گردد');
    await expect(site.getByTestId('order-refunding')).toHaveCount(0);

    await failed.getByRole('link', { name: 'ثبت بازپرداخت دستی…' }).click();
    const manual = page.locator('[data-refund-form="manual"]');
    await expect(manual.getByLabel('روز برگشت')).toHaveValue(formatJalaliNumeric(new Date()));
    // روز آینده: خطا کنار فیلد، و نوشته‌ها می‌مانند.
    await manual.getByLabel('روز برگشت').fill('1499/01/01');
    await manual.getByLabel('کد پیگیری بانک').fill('552190');
    await manual.getByLabel('چطور برگشت').fill('کارت‌به‌کارت به همان کارت');
    await manual.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await manual.getByRole('button', { name: 'ثبت بازپرداخت' }).click();
    await expect(manual.locator('#rm-day-error')).toHaveText('روز برگشت نمی‌تواند پس از امروز باشد.');
    await expect(manual.getByLabel('کد پیگیری بانک')).toHaveValue('552190');
    await manual.getByLabel('روز برگشت').fill(formatJalaliNumeric(new Date()));
    await manual.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await manual.getByRole('button', { name: 'ثبت بازپرداخت' }).click();
    await expect(page).toHaveURL(/done=refund&r=refunded/);
    const done = card(page);
    await expect(done.locator('.jy-badge')).toHaveText('برگشت داده شد');
    await expect(done.locator('.ad-facts')).toContainText('دستی: کارت‌به‌کارت به همان کارت');
    await expect(done.locator('.ad-facts')).toContainText('552190');
    expect((await refunds(o.B)).map((r) => [r.status, r.method, r.fee_rials, r.reference])).toEqual([
      ['failed', 'gateway', '15000', null],
      ['succeeded', 'manual', null, '552190'],
    ]);

    await site.reload();
    await expect(site.getByTestId('order-refunded')).toHaveText(
      `برگشت داده شد: ${formatTomans(o.B.totalRials, false)} تومان ${formatJalaliWeekday(new Date())} برگشت. کد پیگیری 552190.`,
    );
    // «چطور برگشت» فقط در پنل است.
    expect(await site.content()).not.toContain('کارت‌به‌کارت');
    await shopper.close();
    expect(ownerProblems).toEqual([]);
  });

  test('پاسخ گم‌شده: «معلوم نیست» بی «دوباره» و مشتری هنوز «برمی‌گردد»؛ «استعلام از درگاه» متصدی روشنش می‌کند', async () => {
    const page = ownerPage;
    await page.goto(at(`/orders/${o.C.number}?do=refund`));
    const form = page.locator('[data-refund-form="gateway"]');
    await form.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await form.getByRole('button', { name: /تومان را برگردان$/ }).click();
    await expect(page).toHaveURL(/done=refund&r=unknown/);
    const unknown = card(page);
    await expect(unknown).toHaveAttribute('data-refund', 'unknown');
    await expect(unknown.locator('.jy-badge')).toHaveText('معلوم نیست');
    await expect(unknown.getByRole('link')).toHaveCount(0);
    expect(await refunds(o.C)).toEqual([
      { status: 'pending', method: 'gateway', fee_rials: '15000', reference: null, settled_via: null, gateway_error: 'unavailable' },
    ]);
    // دو کلیک یا فرم کهنه: بازپرداخت دوم نه.
    await page.goto(at(`/orders/${o.C.number}?do=refund`));
    await expect(page.locator('[data-refund-form="gateway"]')).toHaveCount(0);

    await operatorPage.goto(at(`/orders/${o.C.number}`));
    await card(operatorPage).getByRole('button', { name: 'استعلام از درگاه' }).click();
    await expect(operatorPage).toHaveURL(/done=refund_inquiry&r=refunded/);
    await expect(card(operatorPage).locator('.jy-badge')).toHaveText('برگشت داده شد');
    expect((await refunds(o.C)).map((r) => [r.status, r.settled_via])).toEqual([['succeeded', 'panel']]);
    expect(operatorProblems).toEqual([]);
  });

  test('پیش‌استعلام: درگاه می‌گوید پول همین حالا در راه برگشت است؛ درخواست نمی‌رود و هیچ ردیفی نیست', async () => {
    const page = ownerPage;
    await page.goto(at(`/orders/${o.D.number}?do=refund`));
    const form = page.locator('[data-refund-form="gateway"]');
    await form.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await form.getByRole('button', { name: /تومان را برگردان$/ }).click();
    await expect(page).toHaveURL(/e=refund_already_at_gateway/);
    await expect(flash(page)).toContainText('درخواست تازه نرفت و پولی جابه‌جا نشد');
    await expect(card(page)).toHaveAttribute('data-refund', 'none');
    expect(await refunds(o.D)).toEqual([]);
  });

  test('رویدادها زیر «پرداخت و بازپرداخت»، و پیشخوان پس از برگشت', async () => {
    await ownerPage.goto(at('/events?kind=payments'));
    const log = ownerPage.locator('main');
    await expect(log).toContainText(`سفارش ${o.A.number}: بازپرداخت ${formatTomans(o.A.totalRials, false)} تومان از درگاه نمونه درخواست شد؛ کارمزد 1,500 تومان`);
    await expect(log).toContainText(`سفارش ${o.A.number}: استعلام بازپرداخت از درگاه؛ پول به کارت برگشت`);
    await expect(log).toContainText(`سفارش ${o.B.number}: بازپرداخت دستی ${formatTomans(o.B.totalRials, false)} تومان ثبت شد، کد پیگیری 552190`);
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('main')).not.toContainText('بازپرداخت دستی');

    await ownerPage.goto(at('/'));
    const alert = ownerPage.locator('[data-alert="unrefunded"]');
    await expect(alert).toContainText(String(o.D.number));
    for (const x of [o.A, o.B, o.C]) await expect(alert).not.toContainText(String(x.number));
  });

  test('گوشی و دسکتاپ: کارت و فرم‌های بازپرداخت بی سرریز و با هدف لمسی ۴۴ پیکسل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await owner.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [`/orders/${o.A.number}`, `/orders/${o.D.number}`, `/orders/${o.D.number}?do=refund`, `/orders/${o.D.number}?do=refund-manual`, '/']) {
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
