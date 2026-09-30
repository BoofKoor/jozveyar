import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { barcodeOf, parcel } from '@jozveyar/db/postfile.fixtures';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { trackingText } from '@jozveyar/sms';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import {
  assignAtPayment,
  at,
  BASE,
  enroll,
  fakeMode,
  fakeSms,
  GATE,
  layoutProblems,
  newContext,
  postFile,
  SENT_STATUS,
  serverInvite,
  SMSIR,
  uploadPostFile as upload,
  watch,
} from './helpers';

/**
 * پیامک رهگیری، سرتاسری (برش ۶٫۳؛ طرح `docs/ui/mockups/admin.html`: `m-ship-preview`، `m-ship-done`، `m-ship-revert`،
 * `m-order-shipped`، `m-dash`، `m-c-shipped` و `m-c-guest`؛ ADR-047): فایل پست با **کارگر واقعی**؛ پیش‌نمایش با «و برای هر کدام یک
 * پیامک می‌رود» و نمونهٔ متن؛ «ثبت» با پیامک هر کد در `sms_messages` (از ۷٫۱ در CI با sms.ir ساختگی: قالب رهگیری با دو پارامترش؛ بی آن
 * کنسولی)؛ ردیف «پیامک» کارت «بستهٔ پستی»؛ پیامکی که نیمه‌کاره ماند
 * با هشدار پیشخوان و «دوباره بفرست»؛ برگرداندن با فهرست پیامک‌گرفته‌ها و همان فایل دوباره بی پیامک تازه (سؤال ۶۷)؛ و صفحهٔ سفارش
 * مشتری روی همان وب: صاحب با کد و پیوند پست، غریبه بی کد، کد کنارگذاشته نه، و هیچ درخواست بیرونی؛ و گوشی و دسکتاپ.
 *
 * همان پنل، پایگاه داده و کارگر `shipments.spec.ts` (طرز اجرا بالای همان)، و برای صفحهٔ مشتری `E2E_WEB_BASE_URL=http://127.0.0.1:3101`.
 * نشست صاحب سفارش را خود تست در `sessions` می‌نشاند (هش توکن، مثل کد پیامکی).
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL;
test.skip(!BASE || !GATE || !env.DATABASE_URL || !WEB, 'بدون متغیرهای پنل، E2E_WEB_BASE_URL و DATABASE_URL — پنل، وب، پایگاه داده و کارگر لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TEHRAN = { provinceId: 8, cityId: 394 };
let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  token: string;
  userId: string;
  phone: string;
  grams: number;
}

/** سفارش «در حال چاپ» همان‌طور که سرور می‌نویسد (سفارش، پرداخت، چاپخانه در پرداخت)؛ مثل `review.spec.ts`. */
async function printingOrder(name: string, phone: string): Promise<Seeded> {
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '3')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
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
              ${TEHRAN.provinceId}, ${TEHRAN.cityId}, ${name}, ${phone}, 'خیابان ولیعصر، پلاک 12', ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number, public_token`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(paidAt, 3)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`UPDATE orders SET status = 'printing' WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, 'paid', 'printing', ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    return { id: row!.id, number: row!.order_number, token: row!.public_token, userId: user!.id, phone, grams: breakdown.estWeightGrams };
  });
}

const today = () => formatJalaliNumeric(new Date());
const code = (n: number) => barcodeOf(RUN * 1000 + n);
const row = (n: number, nameG: string, grams: number) => parcel(n, code(n), nameG, 'تهران', grams, 1_295_000, { date: today() });
const trackingRows = async (o: Seeded) =>
  sql<{ id: number; status: string; body: string; to_mobile: string; attempts: number }[]>`
    SELECT m.id, m.status, m.body, m.to_mobile, m.attempts FROM sms_messages m
     WHERE m.purpose = 'tracking' AND m.to_mobile = ${o.phone} ORDER BY m.id`;

/** نشست صاحب سفارش روی وب (`jy_auth`)، همان‌طور که تأیید کد پیامکی می‌سازد: فقط هش توکن در پایگاه داده. */
async function ownerContext(browser: Browser, o: Seeded, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  const token = randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (${createHash('sha256').update(token).digest('hex')}, ${o.userId}, ${new Date(Date.now() + DAY)})`;
  const context = await customerContext(browser, viewport);
  await context.addCookies([{ name: 'jy_auth', value: token, url: WEB! }]);
  return context;
}

/**
 * زمینهٔ مرورگر مشتری. نشان اینماد پاورقی از `trustseal.enamad.ir` است و از اجراگر CI گاهی جواب نمی‌دهد، پس `load` صفحه دو دقیقه
 * می‌ماند؛ جوابش این‌جا خالی است. درخواستش همچنان دیده می‌شود (`external`، رویداد `request` پیش از route).
 */
async function customerContext(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: WEB, viewport });
  await context.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return context;
}

/** هر درخواست بیرون از وب، جز نشان اینماد پاورقی (ADR-032): سایت پست هرگز بار نمی‌شود. */
function external(page: Page) {
  const seen: string[] = [];
  const origin = new URL(WEB!).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== origin && url.hostname !== 'trustseal.enamad.ir') seen.push(request.url());
  });
  return seen;
}

test.describe.serial('پیامک رهگیری', () => {
  let ownerSecret = '';
  let owner: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const o = {} as Record<'A' | 'B' | 'C', Seeded>;
  let fileId = '';
  const fileName = `FileName-${RUN}3.xls`;
  let rows: string[][] = [];
  const phone = (n: number) => `0914${String(RUN).slice(1)}3${String(n).padStart(3, '0')}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // «امروز» فایل تا نیمه‌شب تهران است؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 5 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    o.A = await printingOrder('مهسا طاهری', phone(1));
    o.B = await printingOrder('امید شریفی', phone(2));
    o.C = await printingOrder('علی کریمی', phone(3));
    // A دو بسته دارد؛ B یکی؛ C نامش نمی‌خواند (صف تأیید، بی پیامک).
    rows = [
      row(1, `طاهری ${o.A.number}`, o.A.grams),
      row(2, `طاهری ${o.A.number}`, o.A.grams),
      row(3, `شریفی ${o.B.number}`, o.B.grams),
      row(4, `رضایی ${o.C.number}`, o.C.grams),
    ];
    owner = await newContext(browser);
    ownerPage = await owner.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    expect(ownerSecret).not.toBe('');
  });

  test.afterAll(async () => {
    if (sql) {
      const ids = Object.values(o).map((one) => one.id);
      if (ids.length > 0) {
        await sql`DELETE FROM payments WHERE order_id = ANY(${ids})`;
        await sql`DELETE FROM orders WHERE id = ANY(${ids})`;
      }
    }
    await owner?.close();
    await operator?.close();
    await sql?.end();
  });

  test('پیش‌نمایش و «ثبت»: یک پیامک برای هر کد قطعی در sms_messages؛ صف تأیید بی پیامک؛ شمار پیامک‌ها در صفحهٔ ورود', async () => {
    const page = operatorPage;
    const sentBefore = SMSIR ? (await fakeSms()).messages.length : 0;
    fileId = await upload(page, fileName, postFile(rows));
    await expect(page.locator('[data-count="ok"] .ad-tile__n')).toHaveText('3', { timeout: 30_000 });
    await expect(page.locator('main')).toContainText(
      'با «ثبت»، 3 کد رهگیری به سفارش‌ها می‌نشیند و برای هر کدام یک پیامک می‌رود',
    );
    await expect(page.locator('[data-count="ok"] .ad-tile__t')).toHaveText('کد رهگیری و پیامک، با «ثبت»');
    await expect(page.locator('[data-count="review"] .ad-tile__t')).toHaveText('تا تأیید مالک یا متصدی، بی کد و بی پیامک');
    await expect(page.locator('[data-sms-sample]')).toHaveText(trackingText(o.A.number, code(1)));
    await page.getByRole('button', { name: /^ثبت/ }).click();
    await expect(page.getByText('ثبت شد: 3 کد رهگیری نشست و 3 پیامک رفت.')).toBeVisible();
    await expect(page.locator('#g-ok .ad-list__sub')).toContainText('پیامک: 3 رفت.');

    const a = await trackingRows(o.A);
    expect(a.map((m) => [m.status, m.body, m.to_mobile, m.attempts])).toEqual([
      [SENT_STATUS, trackingText(o.A.number, code(1)), o.A.phone, 1],
      [SENT_STATUS, trackingText(o.A.number, code(2)), o.A.phone, 1],
    ]);
    expect((await trackingRows(o.B)).map((m) => m.body)).toEqual([trackingText(o.B.number, code(3))]);
    expect(await trackingRows(o.C)).toEqual([]);
    if (SMSIR) {
      // به sms.ir فقط قالب رهگیری با دو پارامترش رفت، نه متن؛ شناسهٔ پیامک و هزینه در ردیف.
      const sent = (await fakeSms()).messages.slice(sentBefore);
      expect(sent.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual(
        [
          [o.A.phone, code(1)],
          [o.A.phone, code(2)],
          [o.B.phone, code(3)],
        ].map(([mobile, barcode]) => [
          mobile,
          Number(env.SMS_TRACKING_TEMPLATE),
          [
            { name: 'ORDER', value: String(mobile === o.A.phone ? o.A.number : o.B.number) },
            { name: 'BARCODE', value: barcode },
          ],
        ]),
      );
      const [row] = await sql<{ provider: string; provider_message_id: string; cost: number }[]>`
        SELECT provider, provider_message_id, cost FROM sms_messages WHERE id = ${a[0]!.id}`;
      expect([row!.provider, row!.cost]).toEqual(['smsir', 1]);
      expect(sent.map((m) => String(m.id))).toContain(row!.provider_message_id);
    }
    const [linked] = await sql<{ n: number }[]>`
      SELECT count(DISTINCT s.sms_message_id)::int AS n FROM shipments s WHERE s.import_id = ${fileId} AND s.voided_at IS NULL`;
    expect(linked!.n).toBe(3);
    expect(operatorProblems).toEqual([]);
  });

  test('کارت «بستهٔ پستی»: ردیف «پیامک» هر کد؛ «به پست رسید» «به موبایل مشتری پیامک شد»؛ رویداد «پیامک رهگیری … به مشتری رفت · سیستم»', async () => {
    const page = operatorPage;
    await page.goto(at(`/orders/${o.A.number}`));
    const facts = page.locator('[data-sms="sent"]');
    await expect(facts).toHaveCount(2);
    await expect(facts.first()).toContainText(`به ${o.A.phone.slice(0, 4)} ${o.A.phone.slice(4, 7)} ${o.A.phone.slice(7)} رفت، امروز`);
    await expect(page.locator('[data-tracking]')).toContainText('به موبایل مشتری پیامک شد.');
    await expect(page.locator('.ad-log')).toContainText('پیامک رهگیری');
    await expect(page.locator('.ad-log')).toContainText('به مشتری رفت');
    await expect(page.getByRole('button', { name: 'دوباره بفرست' })).toHaveCount(0);
  });

  test('پیامکی که نیمه‌کاره ماند: هشدار پیشخوان، «نرفت» با «دوباره بفرست» برای متصدی، و بعد «رفت» با رویداد', async () => {
    // «همین است» C از صف، که پیامکش پیش از فرستادن گم شد (پنل افتاد): همان ردیف منتظر، ده دقیقه پیش.
    const page = operatorPage;
    await sql.begin(async (tx) => {
      const [sms] = await tx<{ id: number }[]>`
        INSERT INTO sms_messages (provider, to_mobile, purpose, body, params, status, created_at)
        VALUES ('queued', ${o.C.phone}, 'tracking', ${trackingText(o.C.number, code(4))}, ${tx.json([String(o.C.number), code(4)])}, 'pending',
                ${new Date(Date.now() - 10 * MINUTE)})
        RETURNING id`;
      await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() WHERE id = ${o.C.id}`;
      const [admin] = await tx<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${`ali${RUN}`}`;
      await tx`INSERT INTO shipments (order_id, barcode, import_id, row_no, weight_grams, fare_rials, tax_rials, post_day, matched_by,
                                      handed_order, admin_user_id, sms_message_id)
               SELECT ${o.C.id}, barcode, import_id, row_no, weight_grams, fare_rials, tax_rials, post_day, 'review', true, ${admin!.id}, ${sms!.id}
                 FROM shipment_import_rows WHERE import_id = ${fileId} AND row_no = 4`;
    });
    await page.goto(at('/'));
    const alert = page.locator('[data-alert="sms"]');
    await expect(alert).toContainText(`پیامک رهگیری سفارش ${o.C.number} نرفت؛ از کارت «بستهٔ پستی» دوباره بفرست.`);
    await alert.getByRole('link', { name: String(o.C.number) }).click();
    await expect(page.locator('[data-sms="failed"]')).toContainText('نرفت: فرستادنش نیمه‌کاره ماند.');
    if (SMSIR) {
      // sms.ir جواب نداد (۷٫۱): «باز نرفت» با علتش، و «دوباره بفرست» می‌ماند.
      await fakeMode('down');
      try {
        await page.getByRole('button', { name: 'دوباره بفرست' }).click();
        await expect(page.getByText('پیامک رهگیری باز نرفت؛ پنل پیامک جواب نداد.', { exact: false })).toBeVisible();
        await expect(page.locator('[data-sms="failed"]')).toContainText('نرفت: پنل پیامک جواب نداد.');
      } finally {
        await fakeMode('ok');
      }
    }
    await page.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.getByText('پیامک رهگیری دوباره فرستاده شد و رفت.')).toBeVisible();
    await expect(page.locator('[data-sms="sent"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'دوباره بفرست' })).toHaveCount(0);
    await expect(page.locator('.ad-log')).toContainText('دوباره رفت');
    expect((await trackingRows(o.C)).map((m) => [m.status, m.attempts])).toEqual([[SENT_STATUS, SMSIR ? 2 : 1]]);
    const events = await sql<{ detail: { outcome: string; orderNumber: number; error?: string } }[]>`
      SELECT detail FROM admin_events WHERE action = 'shipments.sms_resend' AND target_id = ${o.C.id} ORDER BY id`;
    expect(events.map((e) => e.detail)).toMatchObject([
      ...(SMSIR ? [{ outcome: 'failed', orderNumber: o.C.number, error: 'unavailable' }] : []),
      { outcome: 'sent', orderNumber: o.C.number },
    ]);
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="sms"]')).toHaveCount(0);
    // «رویدادها» مال مالک است؛ با چیپ «ارسال».
    await ownerPage.goto(at('/events'));
    await expect(ownerPage.locator('main')).toContainText(`پیامک رهگیری سفارش ${o.C.number} دوباره فرستاده شد و رفت`);
    expect(operatorProblems).toEqual([]);
  });

  test('صفحهٔ سفارش مشتری: صاحب کد هر بسته را با پیوند پست می‌بیند، غریبه فقط «پیامک شد»؛ هیچ درخواست بیرونی', async ({ browser }) => {
    const mine = await ownerContext(browser, o.A);
    const page = await mine.newPage();
    const seen = external(page);
    await page.goto(`/order/${o.A.token}`);
    const step = page.getByTestId('tracking');
    await expect(step).toContainText('2 بسته؛ هر کدام کد خودش را دارد.');
    await expect(step).toContainText(`به ${o.A.phone.slice(0, 4)} ${o.A.phone.slice(4, 7)} ${o.A.phone.slice(7)} هم پیامک شد.`);
    // کپی و متن همان ۲۴ رقم پشت‌سرهم؛ فاصلهٔ گروه‌ها در CSS است.
    expect(await page.locator('[data-barcode]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-barcode'), el.textContent]))).toEqual([
      [code(1), code(1)],
      [code(2), code(2)],
    ]);
    const links = step.getByRole('link', { name: /رهگیری در سایت پست/ });
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAttribute('href', `https://tracking.post.ir/search.aspx?id=${code(1)}`);
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    expect(seen).toEqual([]);
    await mine.close();

    const stranger = await customerContext(browser);
    const other = await stranger.newPage();
    const strangerSeen = external(other);
    await other.goto(`/order/${o.A.token}`);
    await expect(other.getByTestId('order-stranger')).toBeVisible();
    await expect(other.getByTestId('tracking-sent')).toHaveText('کد رهگیری به موبایل گیرنده پیامک شد.');
    const html = await other.content();
    expect(html).not.toContain(code(1));
    expect(html).not.toContain('tracking.post.ir');
    expect(strangerSeen).toEqual([]);
    await stranger.close();
  });

  test('برگرداندن: فهرست پیامک‌گرفته‌ها؛ همان فایل دوباره بی پیامک تازه (سؤال ۶۷)؛ کنار گذاشتن یک کد با هشدار پیامک، و مشتری دیگر آن را نمی‌بیند', async ({ browser }) => {
    const page = ownerPage;
    await page.goto(at(`/shipments/${fileId}/revert`));
    const reached = page.locator('[data-sms-reached]');
    await expect(reached).toContainText('پیامکی که رفت برنمی‌گردد.');
    await expect(reached).toContainText(`${o.A.number}`);
    await expect(reached).toContainText(`${o.B.number}`);
    await expect(reached).toContainText(`${o.C.number}`);
    await expect(reached).toContainText('اگر همین کدها دوباره برای همان سفارش‌ها وارد شوند، پیامک دوباره نمی‌رود.');
    await page.getByLabel('دلیل').fill('فایل روز اشتباه بود؛ فایل درست را جایش می‌آورم.');
    await page.getByRole('button', { name: 'این ورود را برگردان' }).click();
    await expect(page).toHaveURL(new RegExp(`/shipments/${fileId}\\?done=revert`));
    const before = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM sms_messages WHERE purpose = 'tracking'`)[0]!.n;

    const again = await upload(page, `FileName-${RUN}4.xls`, postFile(rows));
    await expect(page.locator('[data-sms-before]')).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator('main')).toContainText('(جز 3 کد که پیش‌تر برای همان سفارش پیامک شده؛ دوباره نه)');
    await page.getByRole('button', { name: /^ثبت/ }).click();
    await expect(page.getByText(/ثبت شد: 3 کد رهگیری نشست و 3 پیامک رفت/)).toBeVisible();
    expect((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM sms_messages WHERE purpose = 'tracking'`)[0]!.n).toBe(before);
    expect(again).not.toBe(fileId);

    await page.goto(at(`/orders/${o.A.number}`));
    await expect(page.locator('[data-sms="sent"]').first()).toContainText('(همین کد، پیش‌تر)');
    const [second] = await sql<{ id: string }[]>`SELECT id FROM shipments WHERE order_id = ${o.A.id} AND barcode = ${code(2)} AND voided_at IS NULL`;
    await page.goto(at(`/orders/${o.A.number}?do=void&code=${second!.id}`));
    await expect(page.locator('[data-sms-warning]')).toContainText('پیامکی که رفت برنمی‌گردد');
    await page.getByLabel('دلیل').fill('بستهٔ دوم مال سفارش دیگری بود.');
    await page.getByRole('button', { name: 'این کد را کنار بگذار' }).click();
    await expect(page.getByText('کد رهگیری کنار رفت')).toBeVisible();

    const mine = await ownerContext(browser, o.A);
    const customer = await mine.newPage();
    await customer.goto(`/order/${o.A.token}`);
    await expect(customer.locator('[data-barcode]')).toHaveCount(1);
    expect(await customer.content()).not.toContain(code(2));
    await mine.close();
    expect(ownerProblems).toEqual([]);
  });

  test('۳۲۰، ۳۹۰ و ۱۲۸۰: بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل، در «بستهٔ پستی»، ورود ثبت‌شده و صفحهٔ مشتری', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const viewport = { width, height: 800 };
      const context = await newContext(browser, viewport);
      await context.addCookies(await owner.cookies());
      const page = await context.newPage();
      for (const path of [`/orders/${o.A.number}`, `/orders/${o.C.number}`, `/shipments/${fileId}`]) {
        await page.goto(at(path));
        expect(await layoutProblems(page), `${path} در ${width}`).toEqual({ overflow: 0, small: [], blank: [] });
      }
      await context.close();
      const mine = await ownerContext(browser, o.B, viewport);
      const customer = await mine.newPage();
      await customer.goto(`/order/${o.B.token}`);
      await expect(customer.getByTestId('tracking')).toBeVisible();
      const overflow = await customer.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `صفحهٔ مشتری در ${width}`).toBe(0);
      const small = await customer.getByTestId('tracking').getByRole('link').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().height < 44).length);
      expect(small).toBe(0);
      await mine.close();
    }
  });
});
