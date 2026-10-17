import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * مسدودی موبایل مشتری، سرتاسری (برش ۱۲٫۲؛ ADR-063، سؤال ۲۱۲): مالک از کارت «ارسال به» صفحهٔ سفارش شمارهٔ صاحب سفارش را با دلیل مسدود
 * می‌کند (بی کد تازه)؛ متصدی فهرست «شماره‌های مسدود» را می‌بیند، شماره‌ای بی سفارش را از همان‌جا مسدود و مسدودی را رفع می‌کند؛ رویدادها
 * زیر «مشتری‌ها» با شمارهٔ پوشیده و بی دلیل؛ حسابدار و چاپخانه نه کارت دارند و نه فهرست. اثرش در سایت (کد پیامکی، «پرداخت» و «دوباره پرداخت
 * کن») در `apps/web/tests/checkout.spec.ts` است.
 *
 * سفارش مثل `notes.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت به چاپخانهٔ همین اجرا؛ کار فایل چاپ و برگه در دست «کارگر دیگری»، پس استوریج و
 * کارگر لازم نیست. ادمین‌ها با دستور سرور، و نقش حسابدار و چاپخانه با SQL (مثل `production.spec.ts`). مسدودی پاک‌نشدنی است: در پایان هر
 * مسدودی زندهٔ همین اجرا رفع می‌شود، سفارش و سندش پاک، و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SOHA = `چاپ سها ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
/** موبایل صاحب سفارش، و شماره‌ای بی سفارش که متصدی از فهرست مسدود می‌کند. */
const PHONE = `0915${String(RUN).slice(1)}8111`;
const STRANGER = `0936${String(RUN).slice(1)}8222`;
const masked = (mobile: string) => `${mobile.slice(0, 4)} ••• ${mobile.slice(7)}`;
const spaced = (mobile: string) => `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`;
const REASON = 'سه سفارش پرداخت‌نشده و پیامک‌های پشت‌سرهم';

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
}

/** سفارش پرداخت‌شدهٔ یک‌فایلی، همان ردیف‌های `notes.spec.ts`، با کارهای فایل چاپ و برگه در دست «کارگر دیگری». */
async function order(docId: string, name: string, phone: string): Promise<Seeded> {
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
    SEED_PRICE_LIST,
  );
  const createdAt = new Date(Date.now() - 2 * 60 * MINUTE);
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
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', ${zoneId},
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
              ${createdAt})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'a4', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    return { number: row!.order_number, id: row!.id };
  });
}

const toCard = (page: Page) => page.getByRole('region', { name: 'ارسال به' });
const liveBlocks = (mobile: string) =>
  sql<{ id: string; reason: string; order_number: number | null }[]>`
    SELECT id, reason, order_number FROM mobile_blocks WHERE mobile = ${mobile} AND unblocked_at IS NULL`;
const blockEvents = () =>
  sql<{ action: string; detail: unknown }[]>`
    SELECT action, detail FROM admin_events WHERE target_type = 'mobile_block'
       AND (detail ->> 'mobile') IN ${sql([masked(PHONE), masked(STRANGER)])} ORDER BY id`;

test.describe.serial('مسدودی موبایل مشتری (۱۲٫۲)', () => {
  const users = { owner: `parvin${RUN}`, operator: `kaveh${RUN}`, accountant: `nima${RUN}`, partner: `yaser${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[] }>;
  let o: Seeded | null = null;
  let docId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    const [partner] = await sql<{ id: string }[]>`
      INSERT INTO print_partners (name, province_id, city_id, created_at)
      VALUES (${SOHA}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday}) RETURNING id`;
    docId = randomUUID();
    await sql`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docId}, 'شیمی - جلسه ۴.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
              ${'e2e'.padEnd(64, '8')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
    o = await order(docId, 'مینا کاظمی', PHONE);

    for (const [key, name] of [
      ['owner', 'پروین شاکری'],
      ['operator', 'کاوه نادری'],
      ['accountant', 'نیما رستمی'],
      ['partner', 'یاسر نوری'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      await enroll(page, serverInvite(users[key], key === 'owner' ? '--owner' : '--operator', '--name', name));
    }
    // نقش حسابدار و چاپخانه با SQL؛ مجوز و محدوده با هر درخواست خوانده می‌شود (۹٫۴).
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.accountant})`;
    await sql`UPDATE admin_user_roles SET role_id = 'print_partner', print_partner_id = ${partner!.id}
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.partner})`;
  });

  test.afterAll(async () => {
    if (sql) {
      // مسدودی پاک‌نشدنی است (`mobile_blocks_append_only`): هر زندهٔ همین اجرا رفع می‌شود.
      await sql`UPDATE mobile_blocks SET unblocked_at = now(), unblocked_by = blocked_by
                 WHERE mobile IN ${sql([PHONE, STRANGER])} AND unblocked_at IS NULL`;
      if (o) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
      }
      if (docId) await sql`DELETE FROM documents WHERE id = ${docId}`;
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${SOHA} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک از صفحهٔ سفارش: دلیل خالی همان‌جا، مسدود با نشان و از کی و دلیل، دو کلیک یکی، و رویداد زیر «مشتری‌ها» با شمارهٔ پوشیده', async () => {
    // «امروز» زیر مسدودی تا نیمه‌شب تهران است.
    await awayFromMidnight(120_000, 3 * MINUTE);
    const order = o!;
    const { page, problems } = who.owner;
    await page.goto(at(`/orders/${order.number}`));
    const card = toCard(page);
    await expect(card.locator('.jy-badge', { hasText: 'مسدود' })).toHaveCount(0);
    await card.getByRole('link', { name: 'مسدود کردن این شماره' }).click();
    await expect(page).toHaveURL(/\?do=block$/);
    const form = card.getByTestId('block-form');
    await expect(form.locator('.ad-step__title')).toHaveText(`مسدود کردن ${spaced(PHONE)}`);
    await expect(form).toContainText('سفارش‌های پرداخت‌شده‌اش همان‌طور چاپ و ارسال می‌شوند.');

    // دلیل فقط‌فاصله از `required` مرورگر می‌گذرد و سرور نمی‌پذیرد: خطا زیر همان فیلد، و فرم باز.
    await form.getByLabel('دلیل').fill('   ');
    await form.getByRole('button', { name: 'مسدود کن' }).click();
    await expect(form.locator('.jy-error')).toHaveText('دلیل را بنویس.');
    expect(await liveBlocks(PHONE)).toEqual([]);

    // دو کلیک پشت‌سرهم یک مسدودی و یک رویداد است؛ دلیل فارسی‌نرمال (ي عربی، فاصلهٔ اضافه).
    await form.getByLabel('دلیل').fill(`  ${REASON.replace('ی', 'ي')}  `);
    await form.getByRole('button', { name: 'مسدود کن' }).dblclick();
    await expect(page.locator('.jy-note--success', { hasText: 'این شماره مسدود شد' })).toBeVisible();
    await expect(card.locator('.jy-badge', { hasText: 'مسدود' })).toBeVisible();
    const note = card.getByTestId('mobile-blocked');
    await expect(note).toContainText(new RegExp(`از امروز \\d{2}:\\d{2}، پروین شاکری\\. دلیل: ${REASON}`));
    await expect(card.getByRole('link', { name: 'مسدود کردن این شماره' })).toHaveCount(0);
    expect(await liveBlocks(PHONE)).toEqual([expect.objectContaining({ reason: REASON, order_number: order.number })]);
    expect((await blockEvents()).map((e) => [e.action, e.detail])).toEqual([['customers.block', { mobile: masked(PHONE), orderNumber: order.number }]]);

    // رویداد زیر «مشتری‌ها»، شمارهٔ پوشیده و بی دلیل.
    await page.goto(at('/events?kind=customers'));
    await expect(page.getByRole('link', { name: 'مشتری‌ها' })).toHaveAttribute('aria-current', /.+/);
    const line = page.locator('.ad-log li', { hasText: masked(PHONE) });
    await expect(line).toContainText(`شمارهٔ ${masked(PHONE)} مسدود شد (از سفارش ${order.number})`);
    await expect(line).toContainText('پروین شاکری');
    await expect(page.locator('main')).not.toContainText(PHONE);
    await expect(page.locator('main')).not.toContainText('پیامک‌های پشت‌سرهم');
    expect(problems).toEqual([]);
  });

  test('متصدی: «شماره‌های مسدود» با همان مسدودی، شمارهٔ بی سفارش از همان‌جا، و رفع مسدودی تا «رفع‌شده‌ها»', async () => {
    const order = o!;
    const { page, problems } = who.operator;
    await page.goto(at('/orders'));
    await page.getByRole('link', { name: 'شماره‌های مسدود' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'شماره‌های مسدود' })).toBeVisible();
    const live = page.getByTestId('blocked-live');
    const mine = live.locator(`li[data-mobile="${PHONE}"]`);
    await expect(mine).toContainText(spaced(PHONE));
    await expect(mine).toContainText(new RegExp(`از امروز \\d{2}:\\d{2}، پروین شاکری · از سفارش ${order.number}`));
    await expect(mine).toContainText(`دلیل: ${REASON}`);

    // شماره‌ای بی سفارش: شمارهٔ نادرست خطای فیلد، و شمارهٔ درست با ارقام فارسی و +98.
    const form = page.getByTestId('block-form');
    await form.getByLabel('شمارهٔ موبایل').fill('0936123');
    await form.getByLabel('دلیل').fill('مزاحمت تلفنی');
    await form.getByRole('button', { name: 'مسدود کن' }).click();
    await expect(form.locator('#b-mobile-error')).toHaveText('شمارهٔ موبایل درست نیست؛ 11 رقم است و با 09 شروع می‌شود.');
    await expect(form.getByLabel('دلیل')).toHaveValue('مزاحمت تلفنی');
    const persian = `+98 ${STRANGER.slice(1)}`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    await form.getByLabel('شمارهٔ موبایل').fill(persian);
    await form.getByRole('button', { name: 'مسدود کن' }).click();
    await expect(page.locator('.jy-note--success', { hasText: 'شماره مسدود شد.' })).toBeVisible();
    await expect(live.locator(`li[data-mobile="${STRANGER}"]`)).toContainText('کاوه نادری');
    await expect(live.locator(`li[data-mobile="${STRANGER}"]`)).not.toContainText('از سفارش');
    expect(await liveBlocks(STRANGER)).toEqual([expect.objectContaining({ reason: 'مزاحمت تلفنی', order_number: null })]);

    // همان شماره دوباره با دلیل دیگر: «همین حالا مسدود است».
    await form.getByLabel('شمارهٔ موبایل').fill(STRANGER);
    await form.getByLabel('دلیل').fill('دلیل دیگر');
    await form.getByRole('button', { name: 'مسدود کن' }).click();
    await expect(page.locator('main .jy-note--error')).toContainText('این شماره همین حالا مسدود است');

    // رفع مسدودی صاحب سفارش: به «رفع‌شده‌ها» می‌رود، با نام هر دو.
    await mine.getByRole('button', { name: 'رفع مسدودی' }).click();
    await expect(page.locator('.jy-note--success', { hasText: 'مسدودی برداشته شد' })).toBeVisible();
    await expect(live.locator(`li[data-mobile="${PHONE}"]`)).toHaveCount(0);
    const past = page.getByTestId('blocked-past').locator(`li[data-mobile="${PHONE}"]`);
    await expect(past).toContainText('پروین شاکری');
    await expect(past).toContainText(new RegExp(`رفع امروز \\d{2}:\\d{2}، کاوه نادری`));
    expect(await liveBlocks(PHONE)).toEqual([]);
    expect((await blockEvents()).map((e) => e.action)).toEqual(['customers.block', 'customers.block', 'customers.unblock']);
    expect(problems).toEqual([]);

    // صفحهٔ سفارش دوباره «مسدود کردن این شماره» دارد.
    await page.goto(at(`/orders/${order.number}`));
    await expect(toCard(page).getByRole('link', { name: 'مسدود کردن این شماره' })).toBeVisible();
    await expect(toCard(page).locator('.jy-badge', { hasText: 'مسدود' })).toHaveCount(0);
  });

  test('حسابدار و چاپخانه: نه کارت مسدودی، نه فهرست، نه دکمه؛ `?do=block` چاپخانه «باز نیست»', async () => {
    const order = o!;
    // مسدودی زنده تا ببینیم حسابدار و چاپخانه حتی نشانش را نمی‌بینند.
    await sql`INSERT INTO mobile_blocks (mobile, reason, order_number, blocked_by)
              SELECT ${PHONE}, 'آزمایش دیدن', ${order.number}, id FROM admin_users WHERE username = ${users.owner}`;
    const accountant = who.accountant.page;
    await accountant.goto(at(`/orders/${order.number}`));
    await expect(toCard(accountant)).toBeVisible();
    await expect(toCard(accountant).getByRole('link', { name: 'مسدود کردن این شماره' })).toHaveCount(0);
    await expect(toCard(accountant).getByTestId('mobile-blocked')).toHaveCount(0);
    await expect(toCard(accountant).locator('.jy-badge', { hasText: 'مسدود' })).toHaveCount(0);
    await accountant.goto(at(`/orders/${order.number}?do=block`));
    await expect(accountant.getByTestId('block-form')).toHaveCount(0);
    await accountant.goto(at('/orders'));
    await expect(accountant.getByRole('link', { name: 'شماره‌های مسدود' })).toHaveCount(0);
    await accountant.goto(at('/orders/blocked'));
    await expect(accountant.locator('main')).toContainText('این بخش برای حسابدار باز نیست');

    const partner = who.partner.page;
    await partner.goto(at(`/orders/${order.number}`));
    await expect(partner.locator('main')).toContainText('شیمی - جلسه ۴.pdf');
    await expect(partner.getByTestId('mobile-blocked')).toHaveCount(0);
    await expect(partner.getByRole('link', { name: 'مسدود کردن این شماره' })).toHaveCount(0);
    await partner.goto(at(`/orders/${order.number}?do=block`));
    await expect(partner.locator('main')).toContainText('این بخش برای چاپخانه باز نیست');
    await partner.goto(at('/orders/blocked'));
    await expect(partner.locator('main')).toContainText('این بخش برای چاپخانه باز نیست');
    expect(who.accountant.problems).toEqual([]);
    expect(who.partner.problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: کارت «ارسال به» با مسدودی و فرم، و فهرست، بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    const order = o!;
    for (const path of [`/orders/${order.number}`, '/orders/blocked']) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who.operator.context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(at(path));
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${path} ${width}`).toBeLessThanOrEqual(0);
        expect(small, `${path} ${width}`).toEqual([]);
        expect(blank, `${path} ${width}`).toEqual([]);
        expect(problems, `${path} ${width}`).toEqual([]);
        await context.close();
      }
    }
    // فرم باز صفحهٔ سفارش، پس از رفع مسدودی همین آزمون.
    await sql`UPDATE mobile_blocks SET unblocked_at = now(), unblocked_by = blocked_by WHERE mobile = ${PHONE} AND unblocked_at IS NULL`;
    for (const width of [320, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await who.owner.context.cookies());
      const page = await context.newPage();
      await page.goto(at(`/orders/${order.number}?do=block`));
      await expect(page.getByTestId('block-form')).toBeVisible();
      const { overflow, small, blank } = await layoutProblems(page);
      expect([overflow <= 0, small, blank], `form ${width}`).toEqual([true, [], []]);
      await context.close();
    }
  });
});
