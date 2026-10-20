import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';

import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { formatMobile } from '../lib/checkout/format';

/**
 * «سفارش‌های من» و پیام به پشتیبانی، سرتاسری (برش ۱۲٫۱، ADR-068؛ طرح `docs/ui/mockups/account.html`، سؤال‌های ۳۰۵ تا ۳۱۲): ورود با کد پیامکی
 * فقط برای شماره‌ای که سفارش دارد، با همان پاسخ برای هر شماره و بی پیامک برای شمارهٔ بی سفارش؛ فهرست سفارش‌ها با کار بعدی هر کدام؛ پیام از
 * صفحهٔ سفارش و «سؤال کلی»؛ پاسخ پشتیبانی بی نام ادمین با «پاسخ تازه» تا مشتری ببیند؛ گفت‌وگوی بسته که با پیام تازه باز می‌شود؛ غریبه با «این
 * سفارش توست؟» تا ورود و برگشت به همان سفارش؛ «خروج»؛ و گوشی. پاسخ و بستن را پنل می‌نویسد (`apps/admin/tests/support.spec.ts`)؛ اینجا همان
 * ردیف‌ها با SQL.
 *
 * مثل `checkout.spec.ts` روی build تولیدی با `CHECKOUT_MODE=mock` (پیامک کنسولی: کد از `sms_messages`)؛ «سفارش‌های من» پشت حالت مسیر خرید
 * نیست، فقط پایگاه داده و `SESSION_SECRET` می‌خواهد. سفارش‌ها با SQL، به شکل همان که مسیر خرید می‌نویسد. طرز اجرای محلی همان بالای
 * `checkout.spec.ts`، با `tests/account.spec.ts`.
 */

const BASE = process.env.E2E_CHECKOUT_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

test.skip(!BASE || !DATABASE_URL, 'بدون E2E_CHECKOUT_BASE_URL و DATABASE_URL — سرور mock و پستگرس لازم است');
test.use({ baseURL: BASE });
test.setTimeout(120_000);

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
/**
 * صاحب سفارش‌ها؛ صاحب سفارشی که از مرورگر دیگری «این سفارش توست؟» را می‌زند (شمارهٔ جدا: کد هر شماره تا حدود ۹۰ ثانیه همان کد قبلی است و به
 * مرورگری که خواستش بسته)؛ و شماره‌ای که هیچ سفارشی ندارد.
 */
const MOBILE = `0915${RUN}${String(randomInt(1000)).padStart(3, '0')}`;
const CLAIM_MOBILE = `0912${RUN}${String(randomInt(1000)).padStart(3, '0')}`;
const STRANGER_MOBILE = `0936${RUN}${String(randomInt(1000)).padStart(3, '0')}`;
const NAME = 'مریم کاظمی';

let sql: postgres.Sql;

/** هر مرورگر IP خودش را دارد، تا سقف کد هر IP بین تست‌ها پر نشود (همان `checkout.spec.ts`). */
async function newContext(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport,
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
  // نشان اینماد پاورقی از اجراگر CI گاهی جواب نمی‌دهد و `load` می‌ماند.
  await context.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return context;
}

interface Seeded {
  id: string;
  number: number;
  token: string;
}

interface Owner {
  userId: string;
  mobile: string;
  name: string;
}

/**
 * سفارش یک‌فایلی ۱۰ صفحه‌ای این مشتری، همان ردیف‌های مسیر خرید: در انتظار پرداخت با فایلی که هنوز روی سرور است، یا پرداخت‌شده («در صف
 * چاپ»، با پرداخت موفق درگاه نمونه).
 */
async function seedOrder(owner: Owner, kind: 'awaiting' | 'paid', createdAt: Date): Promise<Seeded> {
  const docId = randomUUID();
  const breakdown = quote(
    {
      items: [
        {
          sections: [{ documentId: docId, pageCount: 10 }],
          rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: 'double',
          paperSize: 'a4',
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId: 'other' },
    },
    SEED_PRICE_LIST,
  );
  return sql.begin(async (tx) => {
    await tx`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docId}, 'فیزیک - جلسه ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
              ${'e2e'.padEnd(64, '7')}, 'e2e', ${8 * 1024 * 1024}, ${createdAt}, ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
    const [row] = await tx<{ id: string; order_number: number; public_token: string }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${owner.userId}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'other',
              11, 1326, ${owner.name}, ${owner.mobile}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321', ${createdAt})
      RETURNING id, order_number, public_token`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'a4', ${DEFAULT_BINDING_TYPE_ID}) RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json([[1, 10]])}, 'bw', ${DEFAULT_PAPER_TYPE_ID})`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    if (kind === 'paid') {
      const paidAt = new Date(createdAt.getTime() + MINUTE);
      const [payment] = await tx<{ id: string }[]>`
        INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
        VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded',
                ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`}, '803115', ${paidAt}, ${createdAt})
        RETURNING id`;
      await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)} WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
               VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    }
    return { id: row!.id, number: row!.order_number, token: row!.public_token };
  });
}

/** آخرین کد پیامکی این شماره، از پیامک کنسولی. */
async function codeOf(mobile: string): Promise<string> {
  let body = '';
  await expect
    .poll(async () => {
      const [row] = await sql<{ body: string }[]>`select body from sms_messages where to_mobile = ${mobile} and purpose = 'otp' order by id desc limit 1`;
      body = row?.body ?? '';
      return body;
    })
    .toMatch(/\d{5}/);
  return /(\d{5})/.exec(body)![1]!;
}

/** ورود «سفارش‌های من» با کد پیامکی، از صفحهٔ ورود همان لحظه. */
async function signIn(page: Page, mobile: string) {
  await expect(page.getByTestId('account-login')).toBeVisible();
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.getByRole('button', { name: 'ارسال کد' }).click();
  await expect(page.getByTestId('account-code')).toContainText(`اگر با ${formatMobile(mobile)} سفارشی ثبت شده، کدش را پیامک کردیم.`);
  await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
  await page.getByRole('button', { name: 'ورود' }).click();
}

const threadOf = async (orderId: string | null, userId: string) =>
  (
    await sql<{ id: number; status: string }[]>`
      SELECT id, status FROM support_threads WHERE user_id = ${userId} AND order_id IS NOT DISTINCT FROM ${orderId}`
  )[0];

/** پیام پشتیبانی یا بستن، همان ردیفی که پنل می‌نویسد؛ زمانش پس از آخرین پیام گفت‌وگو. */
async function staff(threadId: number, adminId: string, body: string | null) {
  await sql`
    INSERT INTO support_messages (thread_id, kind, admin_user_id, body, request_id, created_at)
    VALUES (${threadId}, ${body === null ? 'closed' : 'staff'}, ${adminId}, ${body}, ${randomUUID()},
            greatest(now(), (SELECT last_message_at FROM support_threads WHERE id = ${threadId}) + interval '1 millisecond'))`;
}

/** پهنای افقی بیش از صفحه، و پیوند یا دکمه‌ای که از ۴۴ پیکسل کوچک‌تر است (بیرون جمله‌ها). */
async function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const small = [...document.querySelectorAll<HTMLElement>('a.jy-btn, button, label.jy-tile, .site-nav a')]
      .filter((el) => el.checkVisibility())
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) < 44;
      })
      .map((el) => el.textContent!.trim().slice(0, 30));
    return { overflow, small };
  });
}

test.describe.serial('سفارش‌های من و پیام به پشتیبانی (۱۲٫۱)', () => {
  let userId = '';
  let adminId = '';
  let older: Seeded;
  let newer: Seeded;
  let claimed: Seeded;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    sql = postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const [user] = await sql<{ id: string }[]>`INSERT INTO users (mobile) VALUES (${MOBILE}) RETURNING id`;
    userId = user!.id;
    const owner = { userId, mobile: MOBILE, name: NAME };
    older = await seedOrder(owner, 'paid', new Date(Date.now() - 60 * MINUTE));
    newer = await seedOrder(owner, 'awaiting', new Date(Date.now() - 2 * MINUTE));
    const [claimer] = await sql<{ id: string }[]>`INSERT INTO users (mobile) VALUES (${CLAIM_MOBILE}) RETURNING id`;
    claimed = await seedOrder({ userId: claimer!.id, mobile: CLAIM_MOBILE, name: 'حسین رضایی' }, 'paid', new Date(Date.now() - 30 * MINUTE));
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO admin_users (username, display_name) VALUES (${`ali${RUN}`}, 'علی محمدی') RETURNING id`;
    adminId = admin!.id;
    context = await newContext(browser);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    await sql?.end();
  });

  test('ورود (سؤال ۳۰۶): شمارهٔ بی سفارش همان پاسخ را می‌گیرد و پیامکی نمی‌رود؛ شمارهٔ صاحب سفارش کد می‌گیرد و فهرستش را می‌بیند', async () => {
    await page.goto('/orders');
    // پیوند «سفارش‌های من» سربرگ (سؤال ۳۰۵) در صفحهٔ خودش جاری است.
    const navLink = page.getByRole('navigation', { name: 'پیوندهای صفحه' }).getByRole('link', { name: 'سفارش‌های من' });
    await expect(navLink).toHaveAttribute('href', '/orders');
    await expect(page.getByTestId('account-login')).toContainText('با موبایلی که با آن سفارش دادی وارد شو.');

    // شمارهٔ بی سفارش: همان قدم کد، ولی هیچ پیامکی ساخته نمی‌شود و هیچ کدی پذیرفته نمی‌شود.
    await page.getByLabel('شمارهٔ موبایل').fill(STRANGER_MOBILE);
    await page.getByRole('button', { name: 'ارسال کد' }).click();
    await expect(page.getByTestId('account-code')).toContainText(`اگر با ${formatMobile(STRANGER_MOBILE)} سفارشی ثبت شده، کدش را پیامک کردیم.`);
    await page.getByLabel('کد پیامک').fill('12345');
    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page.locator('#ac-otp-error')).toContainText('کد درست نیست.');
    expect((await sql`SELECT 1 FROM sms_messages WHERE to_mobile = ${STRANGER_MOBILE}`).length).toBe(0);

    // شمارهٔ صاحب سفارش: کد واقعی، و فهرست تازه‌ترین اول با کار بعدی هر کدام.
    await page.getByRole('button', { name: 'شماره را عوض کن' }).first().click();
    await signIn(page, MOBILE);
    await expect(page).toHaveURL(/\/orders$/);
    const list = page.getByTestId('account-orders');
    await expect(list.locator('.ac-who')).toContainText(formatMobile(MOBILE));
    const cards = list.getByTestId('account-order');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-order', String(newer.number));
    await expect(cards.nth(0)).toContainText('در انتظار پرداخت');
    await expect(cards.nth(0)).toContainText('پرداخت نشده؛ سفارشت با همین قیمت نگه داشته شده.');
    await expect(cards.nth(0).getByRole('link', { name: 'پرداخت' })).toHaveAttribute('href', `/order/${newer.token}`);
    await expect(cards.nth(1)).toHaveAttribute('data-order', String(older.number));
    await expect(cards.nth(1)).toContainText('در صف چاپ؛ تحویل به پست تا');
    await expect(cards.nth(1)).toContainText('1 فایل، 10 صفحه');
    await expect(list.getByRole('heading', { level: 2, name: 'پیام‌ها' })).toBeVisible();
    await expect(list).toContainText('سؤالی دربارهٔ سفارش‌هایت داری؟');

    // نشست همان نشست مسیر خرید است (۳۰ روز): بار دیگر مستقیم فهرست.
    await page.goto('/orders');
    await expect(page.getByTestId('account-orders')).toBeVisible();
  });

  test('پیام از صفحهٔ سفارش (سؤال ۳۰۹)، «منتظر پاسخ»، و پاسخ پشتیبانی با نام «پشتیبانی جزوه‌یار» و «پاسخ تازه» تا مشتری ببیند', async () => {
    await page.goto(`/order/${older.token}`);
    const help = page.getByTestId('order-help');
    await expect(help).toContainText('سؤالی دربارهٔ این سفارش داری؟');
    await help.getByRole('link', { name: 'پیام به پشتیبانی' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/messages/new\\?order=${older.number}$`));
    // سفارشی که از صفحه‌اش آمده از پیش انتخاب شده؛ و «سؤال کلی» هم هست.
    await expect(page.getByRole('radio', { name: `سفارش ${older.number}` })).toBeChecked();
    await expect(page.getByRole('radio', { name: /سؤال کلی/ })).toBeVisible();
    await page.getByLabel('پیامت').fill('سلام.\nپنجشنبه امتحان دارم؛ تا چهارشنبه به مشهد می‌رسد؟ jozveyar.com/orders');
    await page.getByRole('button', { name: 'فرستادن' }).click();

    await expect(page).toHaveURL(/\/orders\/messages\/\d+\?sent=1$/);
    const thread = page.getByTestId('account-thread-view');
    await expect(thread.getByRole('heading', { level: 1 })).toHaveText(`پیام دربارهٔ سفارش ${older.number}`);
    await expect(thread).toContainText('منتظر پاسخ');
    await expect(page.getByTestId('account-sent')).toContainText(`پیامت رسید. پاسخ را همین‌جا می‌بینی و به ${formatMobile(MOBILE)} هم پیامک می‌کنیم.`);
    // پیوند درون متن فقط متن است (سؤال ۳۱۰).
    await expect(thread.getByTestId('account-message')).toHaveCount(1);
    await expect(thread.getByTestId('account-message').getByRole('link')).toHaveCount(0);
    await expect(page.getByLabel('چیزی جا ماند؟')).toBeVisible();
    const row = (await threadOf(older.id, userId))!;
    expect(row.status).toBe('open');

    await page.goto('/orders');
    const line = page.getByTestId('account-thread');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText('منتظر پاسخ');

    // پاسخ پشتیبانی (پنل): «پاسخ تازه» بالای فهرست، و نام ادمین هرگز.
    await staff(row.id, adminId, 'سلام. جزوه‌ات امروز تحویل پست می‌شود و تا چهارشنبه به مشهد می‌رسد.');
    await page.goto('/orders');
    await expect(page.getByTestId('account-fresh')).toContainText(`پشتیبانی به پیامت دربارهٔ سفارش ${older.number} پاسخ داد.`);
    await expect(page.getByTestId('account-thread')).toContainText('پاسخ تازه');
    await page.getByTestId('account-fresh').getByRole('link', { name: 'دیدن پاسخ' }).click();
    const view = page.getByTestId('account-thread-view');
    await expect(view).toContainText('پاسخ داده شد');
    const staffMessage = view.locator('[data-testid="account-message"][data-kind="staff"]');
    await expect(staffMessage).toContainText('پشتیبانی جزوه‌یار');
    await expect(view).not.toContainText('علی');
    await expect(page.getByLabel('پاسخ تو')).toBeVisible();

    // دیده شد: «پاسخ تازه» می‌رود، و کارت صفحهٔ سفارش «دیدن پیام‌ها» دارد.
    await page.goto('/orders');
    await expect(page.getByTestId('account-fresh')).toHaveCount(0);
    await page.goto(`/order/${older.token}`);
    await expect(page.getByTestId('order-help').getByRole('link', { name: 'دیدن پیام‌ها' })).toHaveAttribute('href', `/orders/messages/${row.id}`);
  });

  test('«سؤال کلی»؛ گفت‌وگوی بسته با «بنویس؛ دوباره باز می‌شود»، و پیام تازه که بازش می‌کند', async () => {
    await page.goto('/orders');
    await page.getByRole('link', { name: 'پیام به پشتیبانی' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'پیام به پشتیبانی' })).toBeVisible();
    // بی سفارش از پیش انتخاب‌شده، «فرستادن» بی انتخاب خطای همان‌جا را دارد.
    await page.getByLabel('پیامت').fill('برای 20 نسخه از یک جزوه تخفیف دارید؟');
    await page.getByRole('button', { name: 'فرستادن' }).click();
    await expect(page.locator('#ac-about-error')).toHaveText('یکی را انتخاب کن.');
    await page.getByRole('radio', { name: /سؤال کلی/ }).check();
    await page.getByRole('button', { name: 'فرستادن' }).click();
    await expect(page).toHaveURL(/\/orders\/messages\/\d+\?sent=1$/);
    await expect(page.getByTestId('account-thread-view').getByRole('heading', { level: 1 })).toHaveText('سؤال کلی');

    const general = (await threadOf(null, userId))!;
    await staff(general.id, adminId, 'بله؛ از 10 نسخه به بالا تخفیف سفارش بزرگ هست.');
    await staff(general.id, adminId, null);
    await page.goto(`/orders/messages/${general.id}`);
    const view = page.getByTestId('account-thread-view');
    await expect(view).toContainText('بسته');
    await expect(view.locator('.ac-sys')).toContainText('پشتیبانی این گفت‌وگو را بست');
    await expect(page.getByTestId('account-closed-note')).toHaveText('این گفت‌وگو بسته شده. هنوز سؤالی داری؟ بنویس؛ دوباره باز می‌شود.');
    await page.getByLabel('پیامت').fill('ممنون. برای 30 نسخه چقدر می‌شود؟');
    await page.getByRole('button', { name: 'فرستادن' }).click();
    await expect(view).toContainText('منتظر پاسخ');
    await expect(view.getByTestId('account-message')).toHaveCount(3);
    expect((await threadOf(null, userId))!.status).toBe('open');
  });

  test('غریبه (سؤال ۳۰۸): «این سفارش توست؟» تا ورود و برگشت به همان سفارش؛ با نشست شمارهٔ دیگر «ورود با شمارهٔ دیگر»', async ({ browser }) => {
    const other = await newContext(browser);
    const stranger = await other.newPage();
    await stranger.goto(`/order/${claimed.token}`);
    const claim = stranger.getByTestId('order-claim');
    await expect(claim).toContainText('این سفارش توست؟');
    await expect(stranger.getByTestId('order-help')).toHaveCount(0);
    await claim.getByRole('link', { name: 'ورود با موبایل' }).click();
    await expect(stranger).toHaveURL(new RegExp(`/orders\\?next=${encodeURIComponent(`/order/${claimed.token}`)}$`));
    await signIn(stranger, CLAIM_MOBILE);
    await expect(stranger).toHaveURL(new RegExp(`/order/${claimed.token}$`));
    await expect(stranger.getByTestId('order-help')).toBeVisible();
    await expect(stranger.getByTestId('order-stranger')).toHaveCount(0);

    // سفارش شمارهٔ دیگر با همین نشست: «ورود با موبایل» با نشست باز همین‌جا برمی‌گشت، پس اول همین نشست بسته می‌شود.
    await stranger.goto(`/order/${older.token}`);
    await expect(claim).toContainText(`با شمارهٔ دیگری ثبت شده و تو با ${formatMobile(CLAIM_MOBILE)} وارد شده‌ای.`);
    await expect(claim.getByRole('link')).toHaveCount(0);
    await claim.getByRole('button', { name: 'ورود با شمارهٔ دیگر' }).click();
    await expect(stranger).toHaveURL(new RegExp(`/orders\\?next=${encodeURIComponent(`/order/${older.token}`)}$`));
    await expect(stranger.getByTestId('account-login')).toBeVisible();
    await stranger.goto(`/order/${claimed.token}`);
    await expect(claim.getByRole('link', { name: 'ورود با موبایل' })).toBeVisible();
    await other.close();

    // `next` فقط صفحه‌ای از همین سایت است: با نشست، نشانی بیرونی همان فهرست و صفحهٔ سفارش همان سفارش.
    await page.goto('/orders?next=https%3A%2F%2Fevil.example%2F');
    await expect(page).toHaveURL(/\/orders\?next=/);
    await expect(page.getByTestId('account-orders')).toBeVisible();
    await page.goto(`/orders?next=${encodeURIComponent(`/order/${older.token}`)}`);
    await expect(page).toHaveURL(new RegExp(`/order/${older.token}$`));
  });

  for (const width of [320, 390]) {
    test(`گوشی ${width}: سربرگ «تعرفه» و «سفارش‌های من»، بی سرریز افقی و هدف لمسی دست‌کم ۴۴ پیکسل`, async ({ browser }) => {
      const phone = await newContext(browser, { width, height: 800 });
      await phone.addCookies(await context.cookies());
      const p = await phone.newPage();
      const thread = (await threadOf(older.id, userId))!;
      for (const path of ['/orders', '/orders/messages/new', `/orders/messages/${thread.id}`, `/order/${older.token}`]) {
        await p.goto(path);
        const { overflow, small } = await layoutProblems(p);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
      }
      await p.goto('/orders');
      const nav = p.getByRole('navigation', { name: 'پیوندهای صفحه' });
      await expect(nav.getByRole('link', { name: 'تعرفه' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'سفارش‌های من' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'سؤال‌ها' })).toBeHidden();
      await phone.close();
    });
  }

  test('«خروج» (سؤال ۳۰۵): نشست همین مرورگر بسته می‌شود، و سفارش دوباره از چشم غریبه است', async () => {
    await page.goto('/orders');
    await page.getByRole('button', { name: 'خروج' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByTestId('account-login')).toBeVisible();
    await page.goto(`/order/${older.token}`);
    await expect(page.getByTestId('order-claim').getByRole('link', { name: 'ورود با موبایل' })).toBeVisible();
    await expect(page.getByTestId('order-help')).toHaveCount(0);
  });
});
