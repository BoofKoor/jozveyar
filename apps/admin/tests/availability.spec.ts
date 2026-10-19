import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatDeadlineDay, formatJalaliNumeric, formatJalaliWeekday, tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * «شلوغ» و «تعطیل» چاپخانه، تخصیص با فاصله و تخصیص دستی، سرتاسری (برش ۱۰٫۱؛ ADR-060، سؤال‌های ۱۹۸ تا ۲۰۰ و ۲۶۱ تا ۲۷۰): کارت «چاپخانه‌ها»ی
 * پیشخوان برای مالک و متصدی، و «چاپخانهٔ تو» برای کاربر چاپخانه؛ «شلوغ» با یادداشت و «تعطیل از … تا …» از صفحهٔ «در دسترس بودن»، بی کد تازه؛
 * هشدار «تعطیل است» با سفارش صفش؛ «همه تعطیل‌اند» در پیشخوان و نوار صفحهٔ اصلی سایت (`E2E_WEB_BASE_URL`، ISR یک دقیقه‌ای)؛ و تخصیص دستی
 * از «تنظیمات»: سفارش بی چاپخانه با خبر پیشخوان و سپردن با یک کلیک به پیشنهاد اول.
 *
 * سفارش‌ها مثل `notes.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت با همان قاعدهٔ خالص سرور (`assignAtPayment` در `helpers.ts` با `rankPartners`)؛ کار
 * فایل چاپ و برگه در دست «کارگر دیگری». «امروز» تعطیلی تا نیمه‌شب تهران است (`awayFromMidnight`). در پایان چاپخانهٔ پیش‌فرض دوباره «باز»،
 * چاپخانهٔ همین اجرا غیرفعال، تخصیص «خودکار»، و سفارش‌ها و سندها پاک.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` نوار سایت سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SAHAR = `چاپ سحر ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const TEHRAN = { provinceId: 8, cityId: 394 };

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  docId: string;
}

/** سفارش پرداخت‌شدهٔ یک‌فایلی، همان ردیف‌های `notes.spec.ts`، با تخصیص پرداخت (یا بی چاپخانه در حالت دستی). */
async function order(name: string, phone: string, place: { provinceId: number; cityId: number }): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'آمار و احتمال.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = place.provinceId === 8 ? 'tehran' : 'other';
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
              ${place.provinceId}, ${place.cityId}, ${name}, ${phone}, 'خیابان فردوسی، کوچهٔ نهم، پلاک 3', '9187654321',
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
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, card_mask, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', '603799******1234', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    return { number: row!.order_number, id: row!.id, docId };
  });
}

const partnerOf = async (o: Seeded) =>
  (await sql<{ name: string | null; rule: string | null }[]>`
    SELECT p.name, (SELECT a.rule FROM order_assignments a WHERE a.order_id = o.id ORDER BY a.id DESC LIMIT 1) AS rule
      FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id = ${o.id}`)[0]!;
/**
 * صفحهٔ اصلی سایت در زبانهٔ تازهٔ همان مرورگر. نشان اینماد پاورقی از `trustseal.enamad.ir` است و از اجراگر CI گاهی جواب نمی‌دهد، پس `load`
 * صفحه دو دقیقه می‌ماند و یک `goto` کل مهلت `expect.poll` را می‌خورد، بی هیچ پاسخی (CI همین PR همین را دید)؛ جوابش این‌جا خالی است، مثل
 * `sms.spec.ts`.
 */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

const board = (page: Page) => page.locator('[data-board]');
const boardRow = (page: Page, name: string) => board(page).locator(`li[data-partner="${name}"]`);
const partnerCard = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'چاپخانه', exact: true }) });

test.describe.serial('در دسترس بودن چاپخانه و تخصیص (۱۰٫۱)', () => {
  const owner = `elham${RUN}`;
  let ownerSecret = '';
  let first = '';
  const who = {} as Record<'owner' | 'operator' | 'partner', { context: BrowserContext; page: Page; problems: string[] }>;
  const seeded: Seeded[] = [];

  test.beforeAll(async ({ browser }) => {
    // «امروز» تعطیلی و روز آخرش تا نیمه‌شب تهران است.
    await awayFromMidnight(240_000, 8 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    first = (await sql<{ name: string }[]>`SELECT name FROM print_partners WHERE is_default`)[0]!.name;
    await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL, availability_note = NULL WHERE is_default`;
    await sql`DELETE FROM settings WHERE key = 'assignment.mode'`;
    await sql`INSERT INTO print_partners (name, province_id, city_id, created_at)
              VALUES (${SAHAR}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${new Date(Date.now() - 24 * 60 * MINUTE)})`;
    for (const [key, args] of [
      ['owner', ['--name', 'الهام فرجی']],
      ['operator', ['--operator', '--name', 'بهرام سلیمی']],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      const secret = await enroll(page, serverInvite(key === 'owner' ? owner : `bahram${RUN}`, ...args));
      if (key === 'owner') ownerSecret = secret;
      who[key] = { context, page, problems };
    }
    // کاربر چاپخانه را فقط مالک از «ادمین‌ها» می‌سازد، با کد تازه.
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/admins/new'));
    await ownerPage.getByLabel('نام', { exact: true }).fill('سحر کامرانی');
    await ownerPage.getByLabel('نام کاربری').fill(`sahar${RUN}`);
    await ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / }).check();
    await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: SAHAR }).getByRole('radio').check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await enroll(page, link);
    await expect(page.locator('.ad-user')).toContainText(`سحر کامرانی · ${SAHAR}`);
    who.partner = { context, page, problems };
  });

  test.afterAll(async () => {
    // همان پیش از تست: پیش‌فرض «باز»، تخصیص «خودکار»، سفارش‌ها و سندها پاک، و چاپخانهٔ همین اجرا غیرفعال.
    if (sql) {
      await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL, availability_note = NULL WHERE is_default`;
      await sql`DELETE FROM settings WHERE key = 'assignment.mode'`;
      for (const o of seeded) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        await sql`DELETE FROM documents WHERE id = ${o.docId}`;
      }
      await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL, availability_note = NULL, deactivated_at = now()
                 WHERE name = ${SAHAR} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('کارت «چاپخانه‌ها»: مالک و متصدی همه با «باز»؛ متصدی «شلوغ» را با یادداشت می‌گذارد؛ سفارش مشهد به شلوغ همان شهر، چون بازی در استان نیست', async () => {
    const ownerPage = who.owner.page;
    await ownerPage.goto(at());
    await expect(board(ownerPage).getByRole('heading', { name: 'چاپخانه‌ها' })).toBeVisible();
    await expect(boardRow(ownerPage, first).locator('[data-availability]')).toHaveText('باز');
    await expect(boardRow(ownerPage, SAHAR).locator('[data-availability]')).toHaveText('باز');
    await expect(boardRow(ownerPage, SAHAR).locator('.ad-meta')).toHaveText('مشهد · 0 سفارش باز');
    await expect(board(ownerPage).getByRole('link', { name: 'همهٔ چاپخانه‌ها' })).toBeVisible();

    const operatorPage = who.operator.page;
    await operatorPage.goto(at());
    // متصدی «چاپخانه‌ها» ندارد، پس پیوند «همهٔ چاپخانه‌ها» هم نه؛ ولی «عوض کن».
    await expect(board(operatorPage).getByRole('link', { name: 'همهٔ چاپخانه‌ها' })).toHaveCount(0);
    await boardRow(operatorPage, SAHAR).getByRole('link', { name: 'عوض کن' }).click();
    await expect(operatorPage.getByRole('heading', { name: `در دسترس بودن ${SAHAR}` })).toBeVisible();
    await expect(operatorPage.locator('.ad-lead')).toContainText('امروز: باز.');
    // روز و یادداشت فقط با حالی که لازمشان دارد (`:has()`، بی JS).
    await expect(operatorPage.getByLabel('روز اول تعطیل')).toBeHidden();
    await expect(operatorPage.getByLabel('یادداشت (اختیاری)')).toBeHidden();
    await operatorPage.getByRole('radio', { name: /^شلوغ/ }).check();
    await expect(operatorPage.getByLabel('یادداشت (اختیاری)')).toBeVisible();
    await expect(operatorPage.getByLabel('روز اول تعطیل')).toBeHidden();
    await operatorPage.getByLabel('یادداشت (اختیاری)').fill('  دستگاه   کند است ');
    await operatorPage.getByRole('button', { name: 'ذخیره' }).click();
    await expect(operatorPage).toHaveURL(/\?done=availability&p=/);
    await expect(operatorPage.locator('.jy-note--success')).toHaveText(`${SAHAR} حالا شلوغ است؛ از سفارش بعدی اثر دارد.`);
    await expect(boardRow(operatorPage, SAHAR).locator('[data-availability="busy"]')).toHaveText('شلوغ');
    await expect(boardRow(operatorPage, SAHAR).locator('.ad-meta')).toHaveText('مشهد · 0 سفارش باز · دستگاه کند است');

    // شلوغ همان شهر پیش از باز تهران، چون بازی در خراسان رضوی نیست (سؤال ۲۰۰).
    const a = await order('نیلوفر رحیمی', `0915${String(RUN).slice(1)}7101`, MASHHAD);
    seeded.push(a);
    expect(await partnerOf(a)).toEqual({ name: SAHAR, rule: 'city' });
    expect(who.owner.problems.concat(who.operator.problems)).toEqual([]);
  });

  test('کاربر چاپخانه فقط خودش: «تعطیل از … تا …»؛ چاپخانهٔ دیگر «پیدا نشد»؛ هشدار متصدی با سفارش صفش؛ سفارش تازهٔ مشهد به نزدیک‌ترین باز', async () => {
    const partnerPage = who.partner.page;
    await partnerPage.goto(at());
    await expect(board(partnerPage).getByRole('heading', { name: 'چاپخانهٔ تو' })).toBeVisible();
    await expect(board(partnerPage).locator('li')).toHaveCount(1);
    await expect(boardRow(partnerPage, SAHAR).locator('[data-availability]')).toHaveText('شلوغ');
    await boardRow(partnerPage, SAHAR).getByRole('link', { name: 'عوض کن' }).click();
    await partnerPage.getByRole('radio', { name: /^تعطیل/ }).check();
    const today = formatJalaliNumeric(new Date());
    const tomorrow = formatJalaliNumeric(tehranDayStart(new Date(), 1));
    await expect(partnerPage.getByLabel('روز اول تعطیل')).toHaveValue(today);
    // روز آخر پیش از روز اول: زیر همان فیلد، و هیچ نوشته نمی‌شود.
    await partnerPage.getByLabel('روز آخر تعطیل').fill(formatJalaliNumeric(tehranDayStart(new Date(), -1)));
    await partnerPage.getByRole('button', { name: 'ذخیره' }).click();
    await expect(partnerPage.locator('#av-until-error')).toHaveText('روز آخر پیش از روز اول است.');
    await partnerPage.getByLabel('روز آخر تعطیل').fill(tomorrow);
    await partnerPage.getByLabel('یادداشت (اختیاری)').fill('تعمیر دستگاه');
    await partnerPage.getByRole('button', { name: 'ذخیره' }).click();
    const until = formatDeadlineDay(tehranDayStart(new Date(), 2));
    await expect(partnerPage.locator('.jy-note--success')).toHaveText(`${SAHAR} حالا تعطیل تا ${until} است؛ از سفارش بعدی اثر دارد.`);
    await expect(boardRow(partnerPage, SAHAR).locator('[data-availability="closed"]')).toHaveText(`تعطیل تا ${until}`);
    // چاپخانهٔ دیگر برای کاربر چاپخانه همان «پیدا نشد» است.
    const firstId = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE is_default`)[0]!.id;
    await partnerPage.goto(at(`/partners/${firstId}/availability`));
    await expect(partnerPage.getByRole('heading', { name: 'این چاپخانه پیدا نشد' })).toBeVisible();

    // متصدی: «تعطیل است» با سفارش صفش، یکراست به فرم جابه‌جایی.
    const operatorPage = who.operator.page;
    await operatorPage.goto(at());
    const alert = operatorPage.locator(`[data-alert="closed"][data-partner="${SAHAR}"]`);
    await expect(alert).toHaveText(
      `${SAHAR} تعطیل تا ${until} است (تعمیر دستگاه)، و سفارش ${seeded[0]!.number} هنوز در صفش است؛ اگر مهلتش پیش از باز شدن است، جابه‌جایش کن.`,
    );
    await expect(alert.getByRole('link', { name: String(seeded[0]!.number) })).toHaveAttribute('href', new RegExp(`/orders/${seeded[0]!.number}\\?do=assign$`));
    // کاربر چاپخانه هشدار جابه‌جایی را نمی‌بیند (`orders.assign` ندارد).
    await partnerPage.goto(at());
    await expect(partnerPage.locator('[data-alert="closed"]')).toHaveCount(0);

    // سفارش تازهٔ مشهد: چاپخانهٔ تعطیل نه؛ نزدیک‌ترین باز (تهران)، با قاعده‌اش در کارت سفارش.
    const b = await order('کامران طاهری', `0915${String(RUN).slice(1)}7102`, MASHHAD);
    seeded.push(b);
    expect(await partnerOf(b)).toEqual({ name: first, rule: 'nearest' });
    await operatorPage.goto(at(`/orders/${b.number}`));
    await expect(partnerCard(operatorPage).locator('p.ad-meta').first()).toHaveText('خودکار، هنگام پرداخت: نزدیک‌ترین چاپخانه به شهر مشتری.');
    // رویداد زیر «چاپخانه‌ها»، با از و به.
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/events?kind=partners'));
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: `چاپخانهٔ «${SAHAR}»: باز ← شلوغ (دستگاه کند است)` })).toContainText('بهرام سلیمی');
    await expect(
      ownerPage.locator('.ad-log li').filter({ hasText: `چاپخانهٔ «${SAHAR}»: شلوغ (دستگاه کند است) ← تعطیل از ${formatJalaliWeekday(new Date())} تا ${formatDeadlineDay(tehranDayStart(new Date(), 2))} (تعمیر دستگاه)` }),
    ).toContainText('سحر کامرانی');
    expect(who.partner.problems.concat(who.operator.problems, who.owner.problems)).toEqual([]);
  });

  test('تخصیص دستی از «تنظیمات»: سفارش بی چاپخانه با خبر پیشخوان؛ فرم با پیشنهاد اول انتخاب‌شده و بی دلیل؛ «بسپار» با یک کلیک', async () => {
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/settings'));
    const card = ownerPage.locator('#assignment');
    await expect(card.getByRole('radio', { name: /^خودکار/ })).toBeChecked();
    await card.getByRole('radio', { name: /^دستی/ }).check();
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage.locator('.jy-note--success')).toHaveText(
      'تخصیص چاپخانه دستی شد: سفارش‌های پرداخت‌شدهٔ بعدی بی چاپخانه می‌مانند تا از پیشخوان بسپاری‌شان.',
    );
    await expect(ownerPage.locator('#assignment').getByRole('radio', { name: /^دستی/ })).toBeChecked();

    const c = await order('سارا یگانه', `0912${String(RUN).slice(1)}7103`, TEHRAN);
    seeded.push(c);
    expect(await partnerOf(c)).toEqual({ name: null, rule: null });
    const operatorPage = who.operator.page;
    await operatorPage.goto(at());
    const waiting = operatorPage.locator('[data-alert="partner"][data-mode="manual"]');
    await expect(waiting).toHaveText(`سفارش ${c.number} منتظر سپردن به چاپخانه است (تخصیص دستی): چاپخانهٔ پیشنهادی در فرمش از پیش انتخاب شده.`);
    await expect(waiting.locator('.jy-icon-info')).toHaveCount(1);
    await waiting.getByRole('link', { name: String(c.number) }).click();
    const form = operatorPage.locator('[data-assign]');
    await expect(form.getByRole('heading', { name: 'انتخاب چاپخانه' })).toBeVisible();
    // تهران: هم‌شهر اول و انتخاب‌شده؛ چاپ سحر تعطیل، آخر با روزش.
    const tiles = form.locator('.jy-tile');
    await expect(tiles.locator('.jy-tile__title')).toHaveText([first, SAHAR]);
    await expect(tiles.nth(0).getByRole('radio')).toBeChecked();
    await expect(tiles.nth(0).locator('.jy-tile__note')).toContainText('هم‌شهر مشتری');
    await expect(tiles.nth(1).locator('.jy-tile__note')).toContainText(`تعطیل تا ${formatDeadlineDay(tehranDayStart(new Date(), 2))}`);
    await expect(form.getByLabel('دلیل')).toHaveCount(0);
    await form.getByRole('button', { name: 'بسپار' }).click();
    await expect(partnerCard(operatorPage).locator('.ad-partner b')).toHaveText(first);
    await expect(partnerCard(operatorPage).locator('p.ad-meta').first()).toHaveText('دستی سپرده شد، بهرام سلیمی.');
    expect(await partnerOf(c)).toEqual({ name: first, rule: null });

    // برگشت به خودکار.
    await ownerPage.goto(at('/settings'));
    await ownerPage.locator('#assignment').getByRole('radio', { name: /^خودکار/ }).check();
    await ownerPage.locator('#assignment').getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage.locator('.jy-note--success')).toHaveText('تخصیص چاپخانه خودکار شد: سفارش‌های پرداخت‌شدهٔ بعدی همان لحظه سپرده می‌شوند.');
    await ownerPage.goto(at('/events?kind=settings'));
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'تخصیص چاپخانه: خودکار ← دستی' })).toContainText('الهام فرجی');
    expect(who.owner.problems.concat(who.operator.problems)).toEqual([]);
  });

  test('همه تعطیل: هشدار پیشخوان، سفارش تازه پیش اولی که باز می‌شود، و نوار صفحهٔ اصلی سایت تا باز شدن', async () => {
    test.setTimeout(240_000);
    const ownerPage = who.owner.page;
    // پیش‌فرض تا پس‌فردا تعطیل (از پنل مالک)، چاپ سحر تا فردا؛ پس اشتراک امروز و فردا است.
    const firstId = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE is_default`)[0]!.id;
    await ownerPage.goto(at(`/partners/${firstId}/availability?back=partners`));
    await ownerPage.getByRole('radio', { name: /^تعطیل/ }).check();
    await ownerPage.getByLabel('روز آخر تعطیل').fill(formatJalaliNumeric(tehranDayStart(new Date(), 2)));
    await ownerPage.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage).toHaveURL(/\/partners\?done=availability&p=/);
    await expect(ownerPage.locator('.jy-note--success')).toHaveText(
      `«${first}» حالا تعطیل تا ${formatDeadlineDay(tehranDayStart(new Date(), 3))} است؛ از سفارش بعدی اثر دارد.`,
    );
    await expect(ownerPage.locator(`li[data-partner="${first}"] [data-availability="closed"]`)).toBeVisible();

    await ownerPage.goto(at());
    const lastDay = formatDeadlineDay(tehranDayStart(new Date(), 2));
    await expect(ownerPage.locator('[data-alert="all-closed"]')).toHaveText(
      `همهٔ چاپخانه‌ها تا ${lastDay} تعطیل‌اند. سفارش تازه پیش اولین چاپخانه‌ای می‌رود که باز می‌شود، مهلت تحویل به پستش از روز باز شدن شمرده می‌شود، و سایت همین را در نواری بالای همهٔ صفحه‌ها، جای نوار اعلان، می‌گوید.`,
    );
    const d = await order('پریسا شریفی', `0912${String(RUN).slice(1)}7104`, TEHRAN);
    seeded.push(d);
    expect(await partnerOf(d)).toEqual({ name: SAHAR, rule: 'reopening' });

    if (WEB) {
      // صفحهٔ اصلی با ISR یک دقیقه‌ای: نوار تا یک دقیقه می‌آید؛ از ۱۱٫۳ بالای سربرگ همهٔ صفحه‌ها (layout).
      const site = await sitePage(ownerPage.context());
      await expect
        .poll(
          async () => {
            await site.goto(`${WEB}/`);
            return (await site.locator('[data-closure]').count()) > 0 ? await site.locator('[data-closure]').innerText() : '';
          },
          { timeout: 100_000, intervals: [5_000] },
        )
        .toContain(`چاپخانه‌ها تا ${lastDay} تعطیل‌اند.`);
      await site.close();
    }
    expect(who.owner.problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: کارت «چاپخانه‌ها»، صفحهٔ «در دسترس بودن» و هشدارها بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({ browser }) => {
    const sahar = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE name = ${SAHAR}`)[0]!.id;
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await who.operator.context.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [at(), at(`/partners/${sahar}/availability`), at(`/orders/${seeded[0]!.number}?do=assign`)]) {
        await page.goto(path);
        const found = await layoutProblems(page);
        expect([found.overflow, found.small, found.blank], `${path} @ ${width}`).toEqual([0, [], []]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }
  });

  test('نوار سایت پس از باز شدن می‌رود', async () => {
    test.skip(!WEB, 'بی E2E_WEB_BASE_URL');
    test.setTimeout(150_000);
    await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL, availability_note = NULL WHERE is_default`;
    const site = await sitePage(who.owner.context);
    await expect
      .poll(
        async () => {
          await site.goto(`${WEB}/`);
          return site.locator('[data-closure]').count();
        },
        { timeout: 100_000, intervals: [5_000] },
      )
      .toBe(0);
    await site.close();
  });
});
