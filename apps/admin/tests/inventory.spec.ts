import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * موجودی کاغذ، سرتاسری (برش ۱۰٫۴؛ ADR-070، سؤال ۲۰۴ «همهٔ چاپخانه‌ها» و اجرا ۴۰۴ تا ۴۲۰): «کاغذ تازه» با شمارش اول و خطای هر فیلد زیر خودش؛
 * صفحهٔ هر کاغذ با موجودی، نیاز سفارش‌های «در صف چاپ» و آستانه؛ ورود، ضایعات و شمارش بی کد تازه، با دلیل لازم و دو کلیک که یک ردیف است؛ کم
 * شدن خودکار با «شروع چاپ» و برگشت با برگرداندن به صف، و لغو پس از شروع چاپ که برنمی‌گرداند؛ هشدار پیشخوان؛ کاربر چاپخانه فقط موجودی
 * خودش، و حسابدار هیچ؛ و رویدادهای «موجودی کاغذ» بی یادداشت و دلیل.
 *
 * سفارش‌ها مثل `settlement.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت (`assignAtPayment`) به چاپخانهٔ همین اجرا در مشهد؛ «شروع چاپ» و برگرداندن هم با
 * SQL، چون تریگر `orders_paper_stock` به راه تغییر وضعیت کاری ندارد (تست یکپارچگی همان را با سرویس پنل هم می‌سنجد). ادمین‌ها با دستور سرور، و
 * نقش حسابدار و چاپخانه با SQL. موجودی پاک‌نشدنی است و ردیف چاپ به سفارش اشاره می‌کند، پس در پایان `TRUNCATE paper_stock_moves,
 * paper_stock_items` پیش از پاک کردن سفارش‌ها، و چاپخانه غیرفعال؛ پس هیچ spec دیگری قلم پیگیری‌شده نمی‌بیند.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const NAVID = `چاپ نوید ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const PAPER = 'تحریر ۸۰ گرم A4';

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  docId: string;
}

/** سفارش پرداخت‌شدهٔ یک‌جزوه‌ای سیاه‌سفید دورو تحریر A4، سپرده به چاپخانهٔ همین اجرا، «در صف چاپ». برگش: نصف صفحه‌ها × نسخه. */
async function order(name: string, phone: string, pages: number, copies: number): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'فیزیک ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', ${pages},
            ${'e2e'.padEnd(64, '8')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const breakdown = quote(
    {
      items: [
        {
          sections: [{ documentId: docId, pageCount: pages }],
          rules: [{ pageRanges: [[1, pages]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
          copies,
          sidesMode: 'double',
          paperSize: 'a4',
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: { methodId: 'post', zoneId: 'other' },
    },
    SEED_PRICE_LIST,
  );
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${phone}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'other',
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار وکیل‌آباد، وکیل‌آباد 12، پلاک 3', '9189876543',
              ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, ${pages}, ${copies}, 'double', 'a4', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, ${pages})`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json([[1, pages]])}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${new Date(paidAt.getTime() - 30 * MINUTE)}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    return { number: row!.order_number, id: row!.id, docId };
  });
}

/** وضعیت سفارش با SQL، با رویداد وضعیتش؛ تریگر موجودی همان کاری را می‌کند که دکمهٔ پنل. */
async function moveOrder(o: Seeded, from: string, to: string) {
  await sql.begin(async (tx) => {
    await tx`UPDATE orders SET status = ${to} WHERE id = ${o.id} AND status = ${from}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${o.id}, ${from}, ${to}, now(), 'system')`;
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"] .ad-tile__n`);
const moves = (page: Page) => page.locator('[data-stock="moves"] tbody tr');
const success = (page: Page) => page.locator('main .jy-note--success');

test.describe.serial('موجودی کاغذ (۱۰٫۴)', () => {
  const owner = `nasrin${RUN}`;
  const operator = `kaveh${RUN}`;
  const partnerUser = `omid${RUN}`;
  const accountant = `leila${RUN}`;
  const who = {} as Record<'owner' | 'operator' | 'partner' | 'accountant', { context: BrowserContext; page: Page; problems: string[] }>;
  let navidId = '';
  let defaultId = '';
  let itemPath = '';
  let q1: Seeded;
  let q2: Seeded;

  test.beforeAll(async ({ browser }) => {
    // «امروز» زیر ردیف‌ها تا نیمه‌شب تهران است.
    await awayFromMidnight(180_000, 10 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    navidId = (
      await sql<{ id: string }[]>`INSERT INTO print_partners (name, province_id, city_id)
                                  VALUES (${NAVID}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}) RETURNING id`
    )[0]!.id;
    defaultId = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE is_default`)[0]!.id;

    for (const [key, username, name] of [
      ['owner', owner, 'نسرین کریمی'],
      ['operator', operator, 'کاوه'],
      ['partner', partnerUser, 'امید'],
      ['accountant', accountant, 'لیلا'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      await enroll(page, serverInvite(username, key === 'owner' ? '--owner' : '--operator', '--name', name));
    }
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${accountant})`;
    await sql`UPDATE admin_user_roles SET role_id = 'print_partner', print_partner_id = ${navidId}
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${partnerUser})`;

    // دو سفارش در صف چاپ همین چاپخانه: ۲۰ برگ و ۱۵ × ۲ برگ.
    q1 = await order('مهسا رحیمی', `0915${String(RUN).slice(1)}7101`, 40, 1);
    q2 = await order('رضا توکلی', `0915${String(RUN).slice(1)}7202`, 30, 2);
    const assigned = await sql<{ print_partner_id: string }[]>`SELECT print_partner_id FROM orders WHERE id IN ${sql([q1.id, q2.id])}`;
    expect(assigned.map((row) => row.print_partner_id)).toEqual([navidId, navidId]);
  });

  test.afterAll(async () => {
    if (sql) {
      // موجودی فقط افزودنی است و تریگر ردیفی TRUNCATE را نمی‌گیرد؛ ردیف چاپ به سفارش اشاره می‌کند، پس پیش از پاک کردن سفارش‌ها.
      await sql`TRUNCATE paper_stock_moves, paper_stock_items`;
      for (const o of [q1, q2].filter(Boolean)) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        await sql`DELETE FROM documents WHERE id = ${o.docId}`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE id = ${navidId} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('متصدی: «کاغذ تازه» با خطای فیلد، صفحهٔ کاغذ با نیاز صف، هشدار پیشخوان، و ورود و ضایعات و شمارش با دو کلیک که یک ردیف است', async () => {
    const { page, problems } = who.operator;
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'پشتیبانی', 'ارسال', 'موجودی کاغذ', 'تعرفه', 'محتوای سایت']);
    await nav(page).filter({ hasText: 'موجودی کاغذ' }).click();
    const card = page.locator(`[data-stock-partner="${NAVID}"]`);
    await expect(card).toContainText('هنوز موجودی هیچ کاغذی نگه داشته نمی‌شود.');
    await card.getByRole('link', { name: 'کاغذ تازه' }).click();
    await expect(page.getByRole('heading', { name: `موجودی کاغذ ${NAVID} · مشهد`, level: 1 })).toBeVisible();

    // تنها کاغذ تعرفهٔ پایه از پیش انتخاب شده؛ موجودی با حروف خطای زیر همان فیلد (خالی را خود مرورگر نمی‌فرستد)، و آستانه همان‌جا می‌ماند.
    const form = page.locator('[data-stock-form="track"]');
    await expect(form.getByRole('radio', { name: PAPER })).toBeChecked();
    await expect(form.locator('#track-counted-hint')).toHaveText('شمارش اول؛ صفر هم می‌شود. هر بند 500 برگ است.');
    await form.getByLabel('آستانهٔ هشدار (برگ)').fill('1,500');
    await form.getByLabel('موجودی امروز (برگ)').fill('دو هزار');
    await form.getByRole('button', { name: 'شروع پیگیری' }).click();
    await expect(page.locator('#track-counted-error')).toHaveText('موجودی را با رقم بنویس، از 0 تا 10,000,000 برگ؛ مثلاً 1,200.');
    await expect(form.getByLabel('آستانهٔ هشدار (برگ)')).toHaveValue('1,500');
    await form.getByLabel('موجودی امروز (برگ)').fill('۱٬۰۰۰');
    await form.getByRole('button', { name: 'شروع پیگیری' }).click();

    await expect(page.getByRole('heading', { name: `${PAPER} · ${NAVID}`, level: 1 })).toBeVisible();
    // نشانی صفحهٔ کاغذ پس از مسیر پنل، برای `at()`.
    itemPath = new URL(page.url()).pathname.slice(GATE!.length);
    await expect(success(page)).toHaveText('پیگیری شروع شد؛ از این به بعد «شروع چاپ» هر سفارش این چاپخانه از همین کاغذ کم می‌کند.');
    await expect(tile(page, 'balance')).toHaveText('1,000');
    await expect(tile(page, 'queued')).toHaveText('50');
    await expect(page.locator('[data-tile="queued"]')).toContainText('2 سفارش در صف چاپ');
    await expect(tile(page, 'after')).toHaveText('950');
    await expect(tile(page, 'threshold')).toHaveText('1,500');
    await expect(page.locator('[data-stock="state"]')).toHaveText('زیر آستانه');
    await expect(moves(page)).toHaveCount(1);
    await expect(moves(page).first()).toContainText('شمارش');
    await expect(moves(page).first()).toContainText('شمارش اول');
    // «کاغذ تازه» دیگر این کاغذ را ندارد.
    await page.goto(at(`/inventory/${navidId}`));
    await expect(page.locator('[data-stock="all-tracked"]')).toBeVisible();
    await expect(page.locator(`[data-stock="${PAPER}"]`)).toContainText('زیر آستانه');

    // هشدار پیشخوان با پیوند همان کاغذ.
    await page.goto(at('/'));
    const alert = page.locator('[data-alert="stock"]').filter({ hasText: NAVID });
    await expect(alert).toHaveText(`${PAPER} ${NAVID}: فقط 1,000 برگ مانده؛ آستانه 1,500 برگ است.`);
    await alert.getByRole('link', { name: PAPER }).click();
    await expect(page).toHaveURL(new RegExp(`${itemPath}$`));

    const move = page.locator('[data-stock-form="move"]');
    const sheets = move.getByLabel('برگ', { exact: true });
    const note = move.getByLabel('یادداشت یا دلیل');
    // ضایعات بی دلیل: خطا زیر دلیل، و برگ می‌ماند.
    await move.getByRole('radio', { name: /ضایعات/ }).check();
    await sheets.fill('40');
    await move.getByRole('button', { name: 'ثبت' }).click();
    await expect(page.locator('#move-note-error')).toHaveText('دلیل را بنویس؛ ضایعات و شمارش بی دلیل ثبت نمی‌شوند.');
    await expect(sheets).toHaveValue('40');
    await expect(moves(page)).toHaveCount(1);
    // ورود با دو کلیک پشت‌سرهم: یک ردیف.
    await move.getByRole('radio', { name: /ورود/ }).check();
    await sheets.fill('500');
    await note.fill('خرید از پخش صبا');
    await move.getByRole('button', { name: 'ثبت' }).dblclick();
    await expect(success(page)).toHaveText('ورود ثبت شد.');
    await expect(tile(page, 'balance')).toHaveText('1,500');
    await expect(moves(page)).toHaveCount(2);
    await expect(page.locator('[data-stock="state"]')).toHaveText('کافی');
    await page.locator('[data-stock-form="move"]').getByRole('radio', { name: /ضایعات/ }).check();
    await page.locator('[data-stock-form="move"]').getByLabel('برگ', { exact: true }).fill('40');
    await page.locator('[data-stock-form="move"]').getByLabel('یادداشت یا دلیل').fill('خیس شد');
    await page.locator('[data-stock-form="move"]').getByRole('button', { name: 'ثبت' }).click();
    await expect(success(page)).toHaveText('ضایعات ثبت شد.');
    await expect(tile(page, 'balance')).toHaveText('1,460');
    // شمارش: موجودی واقعی؛ تفاوت در ردیف.
    await page.locator('[data-stock-form="move"]').getByRole('radio', { name: /شمارش/ }).check();
    await page.locator('[data-stock-form="move"]').getByLabel('برگ', { exact: true }).fill('1,450');
    await page.locator('[data-stock-form="move"]').getByLabel('یادداشت یا دلیل').fill('شمارش هفتگی');
    await page.locator('[data-stock-form="move"]').getByRole('button', { name: 'ثبت' }).click();
    await expect(success(page)).toHaveText('شمارش ثبت شد؛ موجودی حالا همان است که شمردی.');
    await expect(tile(page, 'balance')).toHaveText('1,450');
    await expect(moves(page).first()).toContainText('−10');
    await expect(moves(page).first()).toContainText('شمرده: 1,450');
    await expect(moves(page).first()).toContainText('کاوه');
    expect(await moves(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-move')))).toEqual(['count', 'waste', 'purchase', 'count']);
    expect(problems).toEqual([]);
  });

  test('«شروع چاپ» کم می‌کند و برگرداندن به صف برمی‌گرداند؛ لغو پس از شروع چاپ نه', async () => {
    const { page, problems } = who.operator;
    await moveOrder(q1, 'paid', 'printing');
    await page.goto(at(itemPath));
    await expect(tile(page, 'balance')).toHaveText('1,430');
    await expect(tile(page, 'queued')).toHaveText('30');
    const printRow = moves(page).first();
    await expect(printRow).toHaveAttribute('data-move', 'print');
    await expect(printRow).toContainText('شروع چاپ');
    await expect(printRow).toContainText('−20');
    await expect(printRow).toContainText('خودکار');
    await expect(printRow.getByRole('link', { name: String(q1.number) })).toHaveAttribute('href', at(`/orders/${q1.number}`));

    await moveOrder(q1, 'printing', 'paid');
    await page.reload();
    await expect(tile(page, 'balance')).toHaveText('1,450');
    await expect(moves(page).first()).toHaveAttribute('data-move', 'unprint');
    await expect(moves(page).first()).toContainText('+20');
    await expect(moves(page).nth(1)).toContainText('برگشت خورد');

    await moveOrder(q1, 'paid', 'printing');
    await moveOrder(q1, 'printing', 'cancelled');
    await page.reload();
    await expect(tile(page, 'balance')).toHaveText('1,430');
    await expect(tile(page, 'queued')).toHaveText('30');
    expect(problems).toEqual([]);
  });

  test('آستانه: ذخیره با هشدار پیشخوان، همان آستانه «عوض نشد»، و خالی بی هشدار', async () => {
    const { page, problems } = who.operator;
    await page.goto(at(itemPath));
    const form = page.locator('[data-stock-form="threshold"]');
    await form.getByLabel('آستانه (برگ)').fill('ده');
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.locator('#stock-threshold-error')).toHaveText('آستانه را با رقم بنویس، از 0 تا 10,000,000 برگ؛ یا خالی بگذار.');
    await form.getByLabel('آستانه (برگ)').fill('2,000');
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(success(page)).toHaveText('آستانه ذخیره شد.');
    await expect(tile(page, 'threshold')).toHaveText('2,000');
    await page.locator('[data-stock-form="threshold"]').getByRole('button', { name: 'ذخیره' }).click();
    await expect(success(page)).toHaveText('آستانه همان بود؛ چیزی عوض نشد.');

    await page.goto(at('/'));
    await expect(page.locator('[data-alert="stock"]').filter({ hasText: NAVID })).toHaveText(
      `${PAPER} ${NAVID}: فقط 1,430 برگ مانده؛ آستانه 2,000 برگ است.`,
    );
    await page.goto(at(itemPath));
    await page.locator('[data-stock-form="threshold"]').getByLabel('آستانه (برگ)').fill('');
    await page.locator('[data-stock-form="threshold"]').getByRole('button', { name: 'ذخیره' }).click();
    await expect(success(page)).toHaveText('آستانه ذخیره شد.');
    await expect(page.locator('[data-tile="threshold"]')).toContainText('بی هشدار آستانه');
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="stock"]').filter({ hasText: NAVID })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('کاربر چاپخانه: زبانه و صفحهٔ خودش، ثبت، و چاپخانهٔ دیگر «پیدا نشد»؛ حسابدار نه زبانه دارد نه صفحه', async () => {
    const { page, problems } = who.partner;
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'موجودی کاغذ', 'گزارش‌ها']);
    await nav(page).filter({ hasText: 'موجودی کاغذ' }).click();
    await expect(page).toHaveURL(new RegExp(`/inventory/${navidId}$`));
    await expect(page.getByRole('link', { name: 'همهٔ چاپخانه‌ها' })).toHaveCount(0);
    await page.locator(`[data-stock="${PAPER}"]`).getByRole('link', { name: PAPER }).click();
    const move = page.locator('[data-stock-form="move"]');
    await move.getByLabel('برگ', { exact: true }).fill('100');
    await move.getByRole('button', { name: 'ثبت' }).click();
    await expect(success(page)).toHaveText('ورود ثبت شد.');
    await expect(tile(page, 'balance')).toHaveText('1,530');
    await expect(moves(page).first()).toContainText('امید');

    await page.goto(at(`/inventory/${defaultId}`));
    await expect(page.getByRole('heading', { name: 'این چاپخانه پیدا نشد', level: 1 })).toBeVisible();
    await page.goto(at(`/inventory/${defaultId}/${itemPath.split('/').at(-1)}`));
    await expect(page.getByRole('heading', { name: 'این کاغذ پیدا نشد', level: 1 })).toBeVisible();
    expect(problems).toEqual([]);

    const accountantPage = who.accountant.page;
    await accountantPage.goto(at('/'));
    await expect(nav(accountantPage).filter({ hasText: 'موجودی کاغذ' })).toHaveCount(0);
    await accountantPage.goto(at(itemPath));
    await expect(accountantPage.getByRole('heading', { name: 'این بخش برای حسابدار باز نیست', level: 1 })).toBeVisible();
    await expect(accountantPage.locator('[data-noaccess="accountant"]')).toContainText('موجودی کاغذ');
    await accountantPage.goto(at('/inventory'));
    await expect(accountantPage.getByRole('heading', { name: 'این بخش برای حسابدار باز نیست', level: 1 })).toBeVisible();
    expect(who.accountant.problems).toEqual([]);
  });

  test('مالک: نمای کلی با همه، و رویدادهای «موجودی کاغذ» بی یادداشت و دلیل', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/inventory'));
    const card = page.locator(`[data-stock-partner="${NAVID}"]`);
    await expect(card.locator(`[data-stock="${PAPER}"]`)).toContainText('1,530');
    await expect(card.locator(`[data-stock="${PAPER}"]`)).toContainText('30 برگ، 1 سفارش');

    await page.goto(at('/events?kind=inventory'));
    await expect(page.getByRole('navigation', { name: 'نوع رویداد' }).getByRole('link', { name: 'موجودی کاغذ' })).toHaveAttribute('aria-current', 'page');
    const lines = page.locator('.ad-log li').filter({ hasText: NAVID });
    await expect(lines).toHaveText([
      new RegExp(`امید.*ورود 100 برگ به ${PAPER} «${NAVID}»؛ موجودی 1,530 برگ`),
      new RegExp(`آستانهٔ ${PAPER} «${NAVID}»: 2,000 برگ ← بی آستانه`),
      new RegExp(`آستانهٔ ${PAPER} «${NAVID}»: 1,500 برگ ← 2,000 برگ`),
      new RegExp(`شمارش ${PAPER} «${NAVID}»: 1,450 برگ \\(−10 برگ\\)`),
      new RegExp(`ضایعات 40 برگ از ${PAPER} «${NAVID}»؛ موجودی 1,460 برگ`),
      new RegExp(`ورود 500 برگ به ${PAPER} «${NAVID}»؛ موجودی 1,500 برگ`),
      new RegExp(`کاوه.*پیگیری ${PAPER} «${NAVID}» شروع شد با 1,000 برگ، آستانه 1,500 برگ`),
    ]);
    for (const secret of ['پخش صبا', 'خیس شد', 'شمارش هفتگی']) await expect(page.locator('.ad-log')).not.toContainText(secret);
    expect(problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: موجودی کاغذ بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({ browser }) => {
    const pages = {
      owner: ['/inventory', `/inventory/${navidId}`, itemPath, '/'],
      partner: [`/inventory/${navidId}`, itemPath],
    } as const;
    for (const key of ['owner', 'partner'] as const) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[key].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        for (const path of pages[key]) {
          await page.goto(at(path));
          const found = await layoutProblems(page);
          expect(found, `${key} ${path} در ${width}`).toEqual({ overflow: 0, small: [], blank: [] });
        }
        expect(problems).toEqual([]);
        await context.close();
      }
    }
  });
});
