import { createHash, randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, BASE, download, enroll, GATE, layoutProblems, newContext, serverInvite, watch, xlsxParts } from './helpers';

/**
 * گزارش تولید و خروجی اکسل و PDF، سرتاسری (برش ۱۰٫۲؛ ADR-061، سؤال‌های ۲۰۱، ۲۰۲ و ۲۷۱ تا ۲۸۱): زبانهٔ «گزارش‌ها» برای مالک، حسابدار و
 * کاربر چاپخانه، متصدی نه؛ بازهٔ شمارهٔ سفارش و چیپ چاپخانه؛ کاشی‌ها، جدول‌ها، «هنوز آماده نیست» و لغوشده جدا؛ خطای بازه زیر فیلد؛ اکسل با
 * رویداد، که این تست بازش می‌کند؛ و PDF که همان کارگر (`docworker-admin`) با موتور قالب برگه‌ها می‌سازد، فقط برای خواهنده. کاربر چاپخانه فقط
 * سفارش‌های خودش را دارد، بی مبلغ، و خروجی دیگران برایش «پیدا نشد» است.
 *
 * سفارش‌ها مثل `roles.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت به چاپخانهٔ همین اجرا در مشهد؛ کار فایل چاپ و برگه در دست «کارگر دیگری»، پس
 * هر دو سفارش باز «هنوز آماده نیست»‌اند. بازهٔ گزارش شمارهٔ همین سفارش‌ها و چاپخانهٔ همین اجراست، پس سفارش specهای دیگر عددها را عوض
 * نمی‌کند. حسابدار و کاربر چاپخانه با دستور سرور (متصدی) ساخته و نقششان با SQL عوض می‌شود (دستور سرور این دو نقش را نمی‌سازد؛ «افزودن
 * ادمین» در `roles.spec.ts` و `scope.spec.ts`). در پایان خروجی‌ها، سفارش‌ها و سندها پاک و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل، پایگاه داده و کارگر؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SAHAR = `چاپ سحر ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };

let sql: postgres.Sql;

interface Jozve {
  pages: number;
  copies: number;
  sides: 'single' | 'double';
  color: 'color' | 'bw';
}

interface Seeded {
  number: number;
  id: string;
  docIds: string[];
  totalRials: bigint;
}

/** سفارش پرداخت‌شده با یک فایل برای هر جزوه، با قیمت همان موتور؛ `cancelledBy` همان سفارش پس از لغو. */
async function order(name: string, phone: string, jozves: Jozve[], cancelledBy: string | null = null): Promise<Seeded> {
  const docIds = jozves.map(() => randomUUID());
  for (const [i, jozve] of jozves.entries()) {
    await sql`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docIds[i]!}, ${`فصل ${i + 1}.pdf`}, 'pdf', 'application/pdf', 1000, ${`uploads/${docIds[i]!}.pdf`}, 'ready', ${jozve.pages},
              ${'e2e'.padEnd(64, '7')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  }
  const zoneId = 'other';
  const items = jozves.map((jozve, i) => ({
    sections: [{ documentId: docIds[i]!, pageCount: jozve.pages }],
    rules: [{ pageRanges: [[1, jozve.pages]] as [number, number][], colorMode: jozve.color, paperTypeId: 'tahrir80' }],
    copies: jozve.copies,
    sidesMode: jozve.sides,
    paperSize: 'a4' as const,
    bindingTypeId: 'spiral_clear',
  }));
  const breakdown = quote({ items, shipping: { methodId: 'post', zoneId } }, SEED_PRICE_LIST);
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
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار سجاد، سجاد 9، پلاک 14', '9187654321', ${createdAt})
      RETURNING id, order_number`;
    for (const [i, jozve] of jozves.entries()) {
      const [item] = await tx<{ id: string }[]>`
        INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
        VALUES (${row!.id}, ${i + 1}, ${jozve.pages}, ${jozve.copies}, ${jozve.sides}, 'a4', 'spiral_clear') RETURNING id`;
      await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count)
               VALUES (${item!.id}, 1, ${docIds[i]!}, ${jozve.pages})`;
      await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
               VALUES (${item!.id}, 1, ${tx.json([[1, jozve.pages]])}, ${jozve.color}, 'tahrir80')`;
    }
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, card_mask, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', '603799******1234', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    if (cancelledBy) {
      await tx`UPDATE orders SET status = 'cancelled' WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, admin_user_id, note)
               VALUES (${row!.id}, 'paid', 'cancelled', ${new Date(Date.now() - 30 * MINUTE)}, 'admin', ${cancelledBy},
                       ${tx.json({ reason: 'مشتری خواست؛ هنوز چاپ نشده بود.' })})`;
    } else {
      await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
               VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                      ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    }
    return { number: row!.order_number, id: row!.id, docIds, totalRials: BigInt(breakdown.totalRials) };
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
const reportsNav = (page: Page) => page.getByRole('navigation', { name: 'گزارش‌ها' }).getByRole('link');
const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const cells = (page: Page, row: string) => page.locator(row).locator('td');
/** تومان گردشده (نیم از صفر دور) با جداکنندهٔ هزارگان، مثل صفحه. */
const tomans = (rials: bigint) => ((rials + 5n) / 10n).toLocaleString('en-US');

test.describe.serial('گزارش تولید و خروجی‌ها (۱۰٫۲)', () => {
  const owner = `zohre${RUN}`;
  const accountant = `nima${RUN}`;
  const partnerUser = `reza${RUN}`;
  const operator = `omid${RUN}`;
  const who = {} as Record<'owner' | 'accountant' | 'partner' | 'operator', { context: BrowserContext; page: Page; problems: string[] }>;
  let ownerId = '';
  let saharId = '';
  let a: Seeded;
  let b: Seeded;
  let c: Seeded;
  let range = '';
  let pdfUrl = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    saharId = (
      await sql<{ id: string }[]>`INSERT INTO print_partners (name, province_id, city_id, created_at)
                                  VALUES (${SAHAR}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday}) RETURNING id`
    )[0]!.id;

    for (const [key, username, name] of [
      ['owner', owner, 'زهره کریمی'],
      ['accountant', accountant, 'نیما رستمی'],
      ['partner', partnerUser, 'رضا'],
      ['operator', operator, 'امید'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      await enroll(page, serverInvite(username, key === 'owner' ? '--owner' : '--operator', '--name', name));
    }
    ownerId = (await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${owner}`)[0]!.id;
    // نقش حسابدار و چاپخانه با SQL؛ مجوز و محدوده با هر درخواست خوانده می‌شود (۹٫۴)، پس نشست باز همان نقش تازه را دارد.
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${accountant})`;
    await sql`UPDATE admin_user_roles SET role_id = 'print_partner', print_partner_id = ${saharId}
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${partnerUser})`;

    const phone = (n: number) => `0915${String(RUN).slice(1)}${n}`;
    // الف: دو جزوه، سیاه‌سفید ۱۰ صفحهٔ دورو دو نسخه (۵ برگ × ۲) و رنگی ۷ صفحهٔ یکرو (فرد، ۷ برگ)؛ ب: سیاه‌سفید ۲۱ صفحهٔ دورو (فرد، ۱۱ برگ)؛
    // ج: لغوشده پس از پرداخت.
    a = await order('سمانه رحیمی', phone(7111), [
      { pages: 10, copies: 2, sides: 'double', color: 'bw' },
      { pages: 7, copies: 1, sides: 'single', color: 'color' },
    ]);
    b = await order('کاوه صدری', phone(7222), [{ pages: 21, copies: 1, sides: 'double', color: 'bw' }]);
    c = await order('هانیه نوری', phone(7333), [{ pages: 4, copies: 1, sides: 'double', color: 'bw' }], ownerId);
    const assigned = await sql<{ id: string }[]>`
      SELECT id FROM orders WHERE id IN ${sql([a.id, b.id, c.id])} AND print_partner_id = ${saharId}`;
    expect(assigned).toHaveLength(3);
    range = `nfrom=${a.number}&nto=${c.number}&p=${saharId}`;
  });

  test.afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM report_exports WHERE requested_by IN (SELECT id FROM admin_users WHERE username IN ${sql([owner, accountant, partnerUser, operator])})`;
      for (const o of [a, b, c].filter(Boolean)) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        await sql`DELETE FROM documents WHERE id IN ${sql(o.docIds)}`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE id = ${saharId} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: زبانهٔ «گزارش‌ها»، بازهٔ شماره و چیپ چاپخانه؛ کاشی‌ها و جدول‌ها با احتساب نسخه‌ها، «هنوز آماده نیست» و لغوشده جدا', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/'));
    await nav(page).filter({ hasText: 'گزارش‌ها' }).first().click();
    await expect(page.getByRole('heading', { name: 'گزارش تولید', level: 1 })).toBeVisible();
    // از ۱۰٫۳ «تسویه» هم.
    await expect(reportsNav(page)).toHaveText(['گزارش تولید', 'گزارش ارسال', 'تسویه']);
    await expect(reportsNav(page).first()).toHaveAttribute('aria-current', 'page');
    // پیش‌فرض امروز.
    await expect(page.getByRole('navigation', { name: 'روز پرداخت' }).getByRole('link', { name: 'امروز' })).toHaveAttribute('aria-current', 'page');

    const numbers = page.locator('[data-range="number"]');
    await numbers.getByLabel('شمارهٔ سفارش، از').fill(String(a.number));
    // ارقام فارسی هم پذیرفته است.
    await numbers.getByLabel('تا').fill(String(c.number).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!));
    await numbers.getByRole('button', { name: 'نشان بده' }).click();
    await expect(page.locator('[data-production="label"]')).toHaveText(`سفارش‌های ${a.number} تا ${c.number} · همهٔ چاپخانه‌ها`);
    await expect(numbers.getByLabel('تا')).toHaveValue(String(c.number));
    await page.getByRole('navigation', { name: 'چاپخانه' }).getByRole('link', { name: `${SAHAR} · مشهد` }).click();
    await expect(page).toHaveURL(new RegExp(`\\?${range.replace(/[?&]/g, (ch) => `\\${ch}`)}$`));
    await expect(page.locator('[data-production="label"]')).toHaveText(`سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`);

    await expect(tile(page, 'orders').locator('.ad-tile__n')).toHaveText('2');
    await expect(tile(page, 'orders').locator('.ad-tile__t')).toHaveText('3 جزوه، 3 فایل');
    await expect(tile(page, 'copies').locator('.ad-tile__n')).toHaveText('4');
    await expect(tile(page, 'pages').locator('.ad-tile__n')).toHaveText('48');
    await expect(tile(page, 'pages').locator('.ad-tile__t')).toHaveText('رنگی 7، سیاه‌سفید 41');
    await expect(tile(page, 'sheets').locator('.ad-tile__n')).toHaveText('28');
    await expect(tile(page, 'amount').locator('.ad-tile__n')).toHaveText(tomans(a.totalRials + b.totalRials));

    await expect(page.locator('[data-production="not-ready"]')).toContainText(`⏳ 2 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): ${a.number}، ${b.number}`);
    await expect(page.locator('[data-production="not-ready"]').getByRole('link', { name: String(a.number) })).toHaveAttribute(
      'href',
      at(`/orders/${a.number}`),
    );
    await expect(page.locator('[data-production="cancelled"]')).toContainText(`1 سفارش لغوشده در بازه، در هیچ جمعی نیست: ${c.number}`);
    await expect(page.locator('[data-production="cancelled"]')).toContainText(`(پرداخت مشتری ${tomans(c.totalRials)} تومان)`);

    await expect(cells(page, '[data-kind="color"]')).toHaveText(['1', '1', '1', '7']);
    await expect(cells(page, '[data-kind="bw"]')).toHaveText(['2', '1', '3', '41']);
    await expect(cells(page, '[data-kind="all"]')).toHaveText(['3', '2', '4', '48']);
    await expect(cells(page, '[data-binding="spiral_clear"]')).toHaveText(['4', '4']);
    await expect(page.locator('[data-binding="spiral_clear"] th')).toHaveText('طلق و سیم');
    await expect(cells(page, '[data-stock="a4:tahrir80"]')).toHaveText(['4', '28']);
    await expect(page.locator('[data-stock="a4:tahrir80"] th')).toHaveText('A4 · تحریر ۸۰ گرم');
    // یک چاپخانه انتخاب شد: جدول چاپخانه‌ها نیست.
    await expect(page.locator('[data-production="partner-table"]')).toHaveCount(0);

    // خطای بازه زیر فیلد خودش، بی گزارش؛ فرم همان که نوشته شد.
    await numbers.getByLabel('شمارهٔ سفارش، از').fill(String(c.number));
    await numbers.getByLabel('تا').fill(String(a.number));
    await numbers.getByRole('button', { name: 'نشان بده' }).click();
    await expect(page.locator('#r-nto-error')).toHaveText('شمارهٔ آخر از شمارهٔ اول کمتر است.');
    await expect(numbers.getByLabel('تا')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-production="tiles"]')).toHaveCount(0);
    await expect(page.locator('[data-production="export"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('خروجی اکسل: همان گزارش در کتاب راست‌به‌چپ، عدد به شکل عدد و شمارهٔ سفارش بی جداکننده؛ رویداد با بازه', async () => {
    const { page, problems } = who.owner;
    await page.goto(at(`/reports?${range}`));
    const file = await download(page, () => page.locator('[data-export="xlsx"]').click());
    expect(file.name).toBe(`gozaresh-tolid-${a.number}-ta-${c.number}.xlsx`);
    const parts = xlsxParts(file.bytes);
    const summary = parts.get('xl/worksheets/sheet1.xml')!;
    const detail = parts.get('xl/worksheets/sheet2.xml')!;
    expect(summary).toContain('rightToLeft="1"');
    expect(summary).toContain('گزارش تولید');
    expect(summary).toContain(`سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`);
    expect(summary).toContain(`⏳ 2 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): ${a.number}، ${b.number}`);
    // برگ: نام متن و عدد ۲۸ به شکل عدد با قالب هزارگان.
    expect(summary).toMatch(/<t xml:space="preserve">برگ<\/t><\/is><\/c><c r="B\d+" s="1"><v>28<\/v><\/c>/);
    expect(summary).toMatch(new RegExp(`<v>${(a.totalRials + b.totalRials + 5n) / 10n}</v>`));
    // فهرست سفارش‌ها: سرستون ردیف اول، و شمارهٔ هر سفارش عدد بی قالب هزارگان.
    expect(detail).toContain('<t xml:space="preserve">شماره</t>');
    expect(detail).toContain(`<c r="A2"><v>${a.number}</v></c>`);
    expect(detail).toContain(`<c r="A3"><v>${b.number}</v></c>`);
    expect(detail).not.toContain(`<v>${c.number}</v>`);
    expect(parts.get('xl/workbook.xml')).toContain('<sheet name="سفارش‌ها" sheetId="2"');

    const events = await sql<{ target_type: string | null; detail: unknown }[]>`
      SELECT target_type, detail FROM admin_events WHERE action = 'reports.export' AND admin_user_id = ${ownerId} ORDER BY id`;
    expect(events).toEqual([
      { target_type: null, detail: { report: 'production', format: 'xlsx', range: `سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد` } },
    ]);
    expect(problems).toEqual([]);
  });

  test('خروجی PDF: صفحهٔ خروجی تا ساخته شدن خودش را تازه می‌کند، و PDF همان که کارگر روی ردیف نوشت؛ رویداد و چیپ «گزارش‌ها»', async () => {
    test.setTimeout(180_000);
    const { page, problems } = who.owner;
    await page.goto(at(`/reports?${range}`));
    await page.locator('[data-export="pdf"]').getByRole('button', { name: 'خروجی PDF' }).click();
    await expect(page).toHaveURL(/\/reports\/exports\/[0-9a-f-]{36}$/);
    // نشانی درون پنل، بی مسیر محرمانه (`at` خودش می‌گذاردش).
    pdfUrl = new URL(page.url()).pathname.slice(GATE!.length);
    expect(pdfUrl).toMatch(/^\/reports\/exports\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'خروجی PDF گزارش تولید', level: 1 })).toBeVisible();
    await expect(page.locator('.ad-lead')).toHaveText(`سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`);
    // کارگر واقعی می‌سازدش؛ صفحه خودش را تازه می‌کند.
    await expect(page.locator('[data-export-state]')).toHaveAttribute('data-export-state', 'ready', { timeout: 120_000 });
    await expect(page.locator('main')).toContainText(/PDF ساخته شد: \d+ صفحه، [\d,.]+ (کیلوبایت|مگابایت)\./);
    const file = await download(page, () => page.locator('[data-export="download"]').click());
    expect(file.name).toBe(`gozaresh-tolid-${a.number}-ta-${c.number}.pdf`);
    expect(file.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const id = pdfUrl.split('/').at(-1)!;
    const [row] = await sql<{ sha256: string; pages: number; money: boolean; print_partner_id: string | null }[]>`
      SELECT sha256, pages, money, print_partner_id FROM report_exports WHERE id = ${id}`;
    expect(row).toMatchObject({ sha256: createHash('sha256').update(file.bytes).digest('hex'), money: true, print_partner_id: null });
    // خلاصه عمودی و فهرست سفارش‌ها افقی: دست‌کم دو صفحه.
    expect(row!.pages).toBeGreaterThanOrEqual(2);

    await page.goto(at('/events?kind=reports'));
    await expect(page.locator('.ad-log li')).toHaveText([
      new RegExp(`خروجی PDF گزارش تولید خواسته شد: سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`),
      new RegExp(`خروجی اکسل گزارش تولید دانلود شد: سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`),
    ]);
    expect(problems).toEqual([]);
  });

  test('حسابدار: «گزارش‌ها» در ردیف، با مبلغ و چیپ گزارش ارسال که زبانه را جاری نگه می‌دارد؛ خروجی مالک برایش «پیدا نشد»', async () => {
    const { page, problems } = who.accountant;
    await page.goto(at('/'));
    // از ۱۱٫۴ «تخفیف‌ها» هم (فقط دیدن).
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'گزارش‌ها', 'تخفیف‌ها']);
    await nav(page).filter({ hasText: 'گزارش‌ها' }).click();
    await expect(page.getByRole('heading', { name: 'گزارش تولید', level: 1 })).toBeVisible();
    await page.goto(at(`/reports?${range}`));
    await expect(tile(page, 'amount').locator('.ad-tile__n')).toHaveText(tomans(a.totalRials + b.totalRials));
    await reportsNav(page).filter({ hasText: 'گزارش ارسال' }).click();
    await expect(page.getByRole('heading', { name: 'گزارش ارسال', level: 1 })).toBeVisible();
    await expect(nav(page).filter({ hasText: 'گزارش‌ها' })).toHaveAttribute('aria-current', 'page');
    await expect(reportsNav(page).filter({ hasText: 'گزارش ارسال' })).toHaveAttribute('aria-current', 'page');
    // فقط خواهنده دانلودش می‌کند.
    const response = await page.goto(at(pdfUrl));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'این خروجی پیدا نشد' })).toBeVisible();
    expect((await page.request.get(at(`${pdfUrl}/pdf`), { maxRedirects: 0 })).status()).toBe(404);
    expect(problems).toEqual([]);
  });

  test('کاربر چاپخانه: فقط سفارش‌های خودش، بی چیپ چاپخانه، بی مبلغ و بی گزارش ارسال؛ اکسل خودش بی مبلغ', async () => {
    const { page, problems } = who.partner;
    await page.goto(at('/'));
    // «ارسال» فایل پست خودش است (۶٫۲).
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'گزارش‌ها']);
    // چاپخانهٔ دیگری در نشانی هم همان محدودهٔ خودش است.
    const defaultId = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE is_default`)[0]!.id;
    await page.goto(at(`/reports?nfrom=${a.number}&nto=${c.number}&p=${defaultId}`));
    await expect(page.getByRole('heading', { name: 'گزارش تولید', level: 1 })).toBeVisible();
    await expect(page.locator('.ad-sub')).toContainText('فقط سفارش‌های همین چاپخانه.');
    // بی گزارش ارسال؛ از ۱۰٫۳ صورت‌حساب تسویهٔ خودش هست، پس چیپ‌ها.
    await expect(reportsNav(page)).toHaveText(['گزارش تولید', 'تسویه']);
    await expect(page.getByRole('navigation', { name: 'چاپخانه' })).toHaveCount(0);
    await expect(page.locator('[data-production="label"]')).toHaveText(`سفارش‌های ${a.number} تا ${c.number} · ${SAHAR} · مشهد`);
    await expect(tile(page, 'orders').locator('.ad-tile__n')).toHaveText('2');
    await expect(tile(page, 'amount')).toHaveCount(0);
    await expect(page.locator('[data-production="cancelled"]')).not.toContainText('تومان');
    await expect(page.locator('main')).not.toContainText('مبلغ');

    const file = await download(page, () => page.locator('[data-export="xlsx"]').click());
    const parts = xlsxParts(file.bytes);
    for (const part of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      expect(parts.get(part)).not.toContain('مبلغ');
      expect(parts.get(part)).not.toContain('تومان');
    }

    await page.goto(at('/shipments/report'));
    await expect(page.getByRole('heading', { name: 'این بخش برای چاپخانه باز نیست' })).toBeVisible();
    expect((await page.request.get(at('/shipments/report/xlsx'), { maxRedirects: 0 })).status()).not.toBe(200);
    expect((await page.goto(at(pdfUrl)))?.status()).toBe(404);
    expect(problems).toEqual([]);
  });

  test('متصدی: نه زبانه، نه صفحه، نه خروجی', async () => {
    const { page, problems } = who.operator;
    await page.goto(at('/'));
    await expect(nav(page).filter({ hasText: 'گزارش‌ها' })).toHaveCount(0);
    await page.goto(at(`/reports?${range}`));
    await expect(page.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();
    await expect(page.locator('main')).toContainText('و گزارش‌ها و کدهای تخفیف با مالک و حسابدار.');
    const xlsx = await page.request.get(at(`/reports/xlsx?${range}`), { maxRedirects: 0 });
    expect(xlsx.status()).not.toBe(200);
    expect(xlsx.headers()['content-type'] ?? '').not.toContain('spreadsheet');
    const events = await sql`SELECT 1 FROM admin_events WHERE action = 'reports.export'
                              AND admin_user_id = (SELECT id FROM admin_users WHERE username = ${operator})`;
    expect(events).toHaveLength(0);
    expect(problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: گزارش تولید و صفحهٔ خروجی بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل؛ زبانه‌های حسابدار و چاپخانه در گوشی', async ({
    browser,
  }) => {
    const pages = {
      owner: [`/reports?${range}`, '/reports?nfrom=10&nto=1', pdfUrl, '/shipments/report'],
      accountant: [`/reports?${range}`, '/shipments/report'],
      partner: [`/reports?nfrom=${a.number}&nto=${c.number}`],
    } as const;
    for (const key of ['owner', 'accountant', 'partner'] as const) {
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
