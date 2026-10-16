import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * یادداشت داخلی سفارش، سرتاسری (برش ۹٫۳؛ ADR-058، سؤال ۱۹۵): مالک و متصدی در ستون کنار صفحهٔ سفارش یادداشت می‌نویسند و همه را می‌بینند،
 * با نام و زمان و نشان «چاپخانه هم می‌بیند»؛ کاربر چاپخانه فقط یادداشتی را که تیک دارد، بی فرم، در صفحهٔ سفارش و مشخصات فهرست
 * جمع‌وجور (۹٫۱). یادداشت پاک و ویرایش نمی‌شود، دو کلیک یک یادداشت است، و رویدادش زیر «سفارش» بی متن یادداشت.
 *
 * سفارش مثل `warnings.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت (`assignAtPayment`) به چاپخانهٔ همین اجرا، که کاربرش را مالک از «ادمین‌ها»
 * می‌سازد؛ کار فایل چاپ و برگه در دست «کارگر دیگری»، پس استوریج و کارگر لازم نیست. در پایان سفارش و سندش پاک (یادداشت‌ها با سفارش)،
 * و چاپخانه‌اش غیرفعال، مثل پیش از تست.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SADAF = `چاپ صدف ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
}

/** سفارش پرداخت‌شدهٔ یک‌فایلی، همان ردیف‌های `warnings.spec.ts`، با کارهای فایل چاپ و برگه در دست «کارگر دیگری». */
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

const notesCard = (page: Page) => page.getByRole('region', { name: 'یادداشت‌ها' });
const noteRows = (page: Page) => notesCard(page).locator('.ad-notes > li');
const dbNotes = async (orderId: string) =>
  sql<{ body: string; partner_visible: boolean; request_id: string }[]>`
    SELECT body, partner_visible, request_id FROM order_notes WHERE order_id = ${orderId} ORDER BY id`;

/** یادداشت از فرم ستون کنار، همان‌طور که ادمین می‌نویسد. */
async function writeNote(page: Page, body: string, partnerVisible: boolean) {
  const card = notesCard(page);
  await card.getByLabel('یادداشت تازه').fill(body);
  await card.getByRole('checkbox', { name: 'چاپخانه هم ببیند' }).setChecked(partnerVisible);
  await card.getByRole('button', { name: 'افزودن یادداشت' }).click();
}

/** نام و «امروز ساعت» زیر یادداشت. */
const meta = (name: string) => new RegExp(`^${name} · امروز \\d{2}:\\d{2}`);

test.describe.serial('یادداشت داخلی سفارش (۹٫۳)', () => {
  const owner = `parvin${RUN}`;
  let ownerSecret = '';
  const who = {} as Record<'owner' | 'operator' | 'partner', { context: BrowserContext; page: Page; problems: string[] }>;
  let o: Seeded | null = null;
  let docId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    await sql`INSERT INTO print_partners (name, province_id, city_id, created_at)
              VALUES (${SADAF}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday})`;
    docId = randomUUID();
    await sql`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docId}, 'ادبیات - جلسه ۳.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
              ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
    o = await order(docId, 'نگار صالحی', `0915${String(RUN).slice(1)}9111`);
    const [assigned] = await sql<{ name: string | null }[]>`
      SELECT p.name FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id = ${o.id}`;
    expect(assigned!.name).toBe(SADAF);

    for (const [key, args] of [
      ['owner', ['--name', 'پروین شاکری']],
      ['operator', ['--operator', '--name', 'کاوه نادری']],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      const secret = await enroll(page, serverInvite(key === 'owner' ? owner : `kaveh${RUN}`, ...args));
      if (key === 'owner') ownerSecret = secret;
      who[key] = { context, page, problems };
    }
    // کاربر چاپخانه را فقط مالک از «ادمین‌ها» می‌سازد، با کد تازه.
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/admins/new'));
    await ownerPage.getByLabel('نام', { exact: true }).fill('یاسر نوری');
    await ownerPage.getByLabel('نام کاربری').fill(`sadaf${RUN}`);
    await ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / }).check();
    await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: SADAF }).getByRole('radio').check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await enroll(page, link);
    await expect(page.locator('.ad-user')).toContainText(`یاسر نوری · ${SADAF}`);
    who.partner = { context, page, problems };
  });

  test.afterAll(async () => {
    // همان پیش از تست: سفارش و سندش پاک (یادداشت‌ها با سفارش، cascade)، و چاپخانه غیرفعال.
    if (sql) {
      if (o) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        expect(await dbNotes(o.id)).toEqual([]);
      }
      if (docId) await sql`DELETE FROM documents WHERE id = ${docId}`;
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${SADAF} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک و متصدی: یادداشت با خط‌هایش، نام و زمان و نشان «چاپخانه هم می‌بیند»؛ متن خالی همان‌جا؛ دو کلیک یک یادداشت', async () => {
    // «امروز» زیر یادداشت تا نیمه‌شب تهران است.
    await awayFromMidnight(120_000, 3 * MINUTE);
    const order = o!;
    const { page, problems } = who.owner;
    await page.goto(at(`/orders/${order.number}`));
    await expect(notesCard(page)).toContainText('هنوز یادداشتی نیست.');
    // در ستون کنار، زیر وضعیت و کار بعدی.
    await expect(page.locator('.ad-side').getByRole('region', { name: 'یادداشت‌ها' })).toBeVisible();

    // متن فقط‌فاصله از `required` مرورگر می‌گذرد و سرور نمی‌پذیرد: خطا زیر همان فیلد، و متن و تیک می‌مانند.
    await writeNote(page, '   \n   ', true);
    await expect(notesCard(page).locator('.jy-error')).toHaveText('متن یادداشت را بنویس.');
    await expect(notesCard(page).getByRole('checkbox', { name: 'چاپخانه هم ببیند' })).toBeChecked();
    expect(await dbNotes(order.id)).toEqual([]);

    // هر خط فارسی‌نرمال (ي و ك عربی، ارقام فارسی)، خط خالی نه، خط تازه می‌ماند.
    await writeNote(page, ' اسم استاد روي جلد نيايد \n\n جلد ۲ را جدا ببند ', true);
    await expect(noteRows(page)).toHaveCount(1);
    const first = noteRows(page).first();
    // خط تازه همان خط تازه است (`white-space: pre-line`)، نه یک فاصله.
    expect(await first.locator('.ad-note__body').innerText()).toBe('اسم استاد روی جلد نیاید\nجلد 2 را جدا ببند');
    await expect(first.locator('.ad-note__meta')).toHaveText(new RegExp(`${meta('پروین شاکری').source}چاپخانه هم می‌بیند$`));
    await expect(first).toHaveAttribute('data-note', 'partner');
    // فرم تازه: خالی، بی خطای قبلی و بی تیک.
    await expect(notesCard(page).getByLabel('یادداشت تازه')).toHaveValue('');
    await expect(notesCard(page).locator('.jy-error')).toHaveCount(0);
    await expect(notesCard(page).getByRole('checkbox', { name: 'چاپخانه هم ببیند' })).not.toBeChecked();
    const [stored] = await dbNotes(order.id);
    expect(stored).toMatchObject({ body: 'اسم استاد روی جلد نیاید\nجلد 2 را جدا ببند', partner_visible: true });

    // متصدی: بی تیک، فقط مالک و متصدی؛ دو کلیک پشت‌سرهم یک یادداشت است.
    const operator = who.operator;
    await operator.page.goto(at(`/orders/${order.number}`));
    const card = notesCard(operator.page);
    await card.getByLabel('یادداشت تازه').fill('مشتری زنگ زد؛ عجله دارد');
    await card.getByRole('button', { name: 'افزودن یادداشت' }).dblclick();
    await expect(noteRows(operator.page)).toHaveCount(2);
    const second = noteRows(operator.page).nth(1);
    await expect(second.locator('.ad-note__body')).toHaveText('مشتری زنگ زد؛ عجله دارد');
    await expect(second.locator('.ad-note__meta')).toHaveText(new RegExp(`${meta('کاوه نادری').source}$`));
    await expect(second).toHaveAttribute('data-note', 'internal');
    const rows = await dbNotes(order.id);
    expect(rows.map((row) => [row.body, row.partner_visible])).toEqual([
      ['اسم استاد روی جلد نیاید\nجلد 2 را جدا ببند', true],
      ['مشتری زنگ زد؛ عجله دارد', false],
    ]);
    // هر فرم شناسهٔ خودش را دارد.
    expect(new Set(rows.map((row) => row.request_id)).size).toBe(2);

    // سطر «رویدادها»ی سفارش نه (کارت خودش هست)؛ رویداد زیر «سفارش» بی متن یادداشت.
    await expect(page.getByRole('region', { name: 'رویدادها' })).not.toContainText('یادداشت');
    await page.goto(at('/events?kind=orders'));
    const log = page.locator('.ad-log li');
    const lines = log.filter({ hasText: `یادداشت تازه روی سفارش ${order.number}` });
    await expect(lines).toHaveCount(2);
    await expect(lines.filter({ hasText: 'پروین شاکری' })).toContainText('، چاپخانه هم می‌بیند');
    await expect(lines.filter({ hasText: 'کاوه نادری' })).not.toContainText('چاپخانه هم می‌بیند');
    const details = await sql<{ detail: unknown }[]>`
      SELECT detail FROM admin_events WHERE action = 'orders.note' AND target_id = ${order.id} ORDER BY id`;
    expect(details.map((row) => (row.detail as { partnerVisible: boolean }).partnerVisible)).toEqual([true, false]);
    expect(JSON.stringify(details)).not.toMatch(/استاد|زنگ/);
    expect(problems).toEqual([]);
    expect(operator.problems).toEqual([]);
  });

  test('چاپخانه فقط یادداشت «چاپخانه هم ببیند» را می‌بیند، بی فرم و بی نشان؛ در مشخصات فهرست جمع‌وجور هم', async () => {
    const order = o!;
    const { page, problems } = who.partner;
    await page.goto(at(`/orders/${order.number}`));
    await expect(noteRows(page)).toHaveCount(1);
    expect(await noteRows(page).first().locator('.ad-note__body').innerText()).toBe('اسم استاد روی جلد نیاید\nجلد 2 را جدا ببند');
    await expect(noteRows(page).first().locator('.jy-badge')).toHaveCount(0);
    await expect(notesCard(page).getByLabel('یادداشت تازه')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('عجله دارد');

    await page.goto(at('/orders'));
    const row = page.locator(`details.ad-fold:has(> summary[data-order="${order.number}"])`);
    await row.locator('summary').click();
    const notes = row.getByRole('region', { name: 'یادداشت‌ها' }).locator('.ad-notes > li');
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toContainText('اسم استاد روی جلد نیاید');
    await expect(row).not.toContainText('عجله دارد');
    expect(problems).toEqual([]);

    // مالک: هر دو، با نشان روی اولی.
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/orders'));
    const ownerRow = ownerPage.locator(`details.ad-fold:has(> summary[data-order="${order.number}"])`);
    await ownerRow.locator('summary').click();
    const ownerNotes = ownerRow.getByRole('region', { name: 'یادداشت‌ها' }).locator('.ad-notes > li');
    await expect(ownerNotes).toHaveCount(2);
    await expect(ownerNotes.locator('.jy-badge')).toHaveText(['چاپخانه هم می‌بیند']);
    expect(who.owner.problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: کارت یادداشت‌ها بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const key of ['owner', 'partner'] as const) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[key].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(at(`/orders/${o!.number}`));
        await expect(notesCard(page)).toBeVisible();
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${key} ${width}`).toBeLessThanOrEqual(0);
        expect(small, `${key} ${width}`).toEqual([]);
        expect(blank, `${key} ${width}`).toEqual([]);
        expect(problems, `${key} ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
