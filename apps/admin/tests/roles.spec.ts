import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * حسابدار و عوض کردن نقش، سرتاسری (برش ۹٫۴؛ ADR-059، سؤال ۱۹۷): مالک حسابدار را از «افزودن ادمین» با کد تازه می‌سازد؛ حسابدار پیشخوان،
 * سفارش‌ها با مبلغ و پرداخت‌ها، بازپرداخت دستی با کد تازه، یادداشت و گزارش‌ها (ارسال، و از ۱۰٫۲ تولید) را دارد، و هر بخش دیگر «برای حسابدار باز نیست». مالک
 * نقش ادمین موجود را از «ادمین‌ها» با کد تازه عوض می‌کند: نشست باز می‌ماند و کار بعدی همان ادمین نقش تازه را دارد؛ نقش یکسان و فرم
 * کهنه پیش از کد.
 *
 * سفارش‌ها مثل `notes.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت به چاپخانهٔ همین اجرا؛ کار فایل چاپ و برگه در دست «کارگر دیگری». بازپرداخت
 * پاک نمی‌شود (`refunds_append_only`)، پس در پایان با TRUNCATE، مثل `refunds.spec.ts`، و بعد سفارش‌ها و سندها پاک و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SAHAR = `چاپ سحر ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const ACCOUNTANT = 'مریم صادقی';
const NO_ACCESS = 'این بخش برای حسابدار باز نیست';

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  docId: string;
}

/**
 * سفارش پرداخت‌شدهٔ یک‌فایلی، همان ردیف‌های `notes.spec.ts`؛ `cancelled` همان سفارش پس از لغو با دلیل، که پولش هنوز برنگشته (همان
 * `refunds.spec.ts`)، و بی کار فایل.
 */
async function order(name: string, phone: string, cancelledBy: string | null): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'حسابداری صنعتی.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '8')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
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
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار وکیل‌آباد، وکیل‌آباد 12، پلاک 7', '9187654321',
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
    return { number: row!.order_number, id: row!.id, docId };
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
const side = (page: Page) => page.locator('.ad-side');
const roleGroup = (page: Page) => page.getByRole('group', { name: 'نقش' });

test.describe.serial('حسابدار و عوض کردن نقش (۹٫۴)', () => {
  const owner = `nasrin${RUN}`;
  const accountant = `maryam${RUN}`;
  let ownerSecret = '';
  let accountantSecret = '';
  let ownerId = '';
  let accountantId = '';
  const who = {} as Record<'owner' | 'accountant', { context: BrowserContext; page: Page; problems: string[] }>;
  const seeded: Seeded[] = [];
  let open: Seeded;
  let cancelled: Seeded;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    await sql`INSERT INTO print_partners (name, province_id, city_id, created_at)
              VALUES (${SAHAR}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday})`;

    const ownerContext = await newContext(browser);
    const ownerPage = await ownerContext.newPage();
    who.owner = { context: ownerContext, page: ownerPage, problems: watch(ownerPage) };
    ownerSecret = await enroll(ownerPage, serverInvite(owner, '--name', 'نسرین حیدری'));
    ownerId = (await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${owner}`)[0]!.id;

    open = await order('سپیده امینی', `0915${String(RUN).slice(1)}8111`, null);
    cancelled = await order('آرش کاظمی', `0915${String(RUN).slice(1)}8222`, ownerId);
    seeded.push(open, cancelled);
    const assigned = await sql<{ name: string | null }[]>`
      SELECT p.name FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id IN ${sql([open.id, cancelled.id])}`;
    expect(assigned.map((row) => row.name)).toEqual([SAHAR, SAHAR]);
  });

  test.afterAll(async () => {
    // همان پیش از تست: بازپرداخت با TRUNCATE (پاک‌نشدنی است)، سفارش‌ها و سندها پاک، و چاپخانه غیرفعال.
    if (sql) {
      await sql`TRUNCATE refunds`;
      for (const o of seeded) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        await sql`DELETE FROM documents WHERE id = ${o.docId}`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${SAHAR} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('حسابدار از «افزودن ادمین» با کد تازه: پیشخوان، سفارش‌ها و گزارش‌ها؛ هر بخش دیگر «برای حسابدار باز نیست»', async ({ browser }) => {
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/admins/new'));
    // چهار نقش، به ترتیب: متصدی، حسابدار، چاپخانه و مالک.
    await expect(roleGroup(ownerPage).locator('.jy-tile__title')).toHaveText(['متصدی', 'حسابدار', 'چاپخانه', 'مالک']);
    await ownerPage.getByLabel('نام', { exact: true }).fill(ACCOUNTANT);
    await ownerPage.getByLabel('نام کاربری').fill(accountant);
    await roleGroup(ownerPage).getByRole('radio', { name: /^حسابدار/ }).check();
    // «کدام چاپخانه» فقط با نقش چاپخانه.
    await expect(ownerPage.getByRole('group', { name: 'کدام چاپخانه' })).toBeHidden();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    await expect(ownerPage.getByRole('heading', { name: `پیوند ثبت ${ACCOUNTANT} آماده است` })).toBeVisible();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();

    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await page.goto(link);
    await expect(page.getByText('نسرین حیدری تو را حسابدار پنل جزوه‌یار کرده است.')).toBeVisible();
    accountantSecret = await enroll(page, link);
    who.accountant = { context, page, problems };
    accountantId = (await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${accountant}`)[0]!.id;
    await expect(page.locator('.ad-user')).toContainText(`${ACCOUNTANT} · حسابدار`);
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'گزارش‌ها', 'تخفیف‌ها']);
    await expect(page.locator('.ad-more')).toHaveCount(0);

    // پیشخوان: پول سفارش لغوشده (کار حسابدار)، و صف تحویل با مبلغ.
    await expect(page.locator('[data-alert="unrefunded"]')).toContainText(String(cancelled.number));

    for (const path of ['/tariff', '/shipments', '/shipments/review', '/settings', '/partners', '/admins', '/admins/new', '/events', `/orders/${open.number}/ticket`]) {
      await page.goto(at(path));
      await expect(page.getByRole('heading', { name: NO_ACCESS }), path).toBeVisible();
      await expect(page.locator('[data-noaccess="accountant"]').getByRole('link', { name: 'سفارش‌ها' }), path).toBeVisible();
    }

    // گزارش ارسال از زبانهٔ «گزارش‌ها» (از ۱۰٫۲ گزارش تولید، و گزارش ارسال با چیپ): بی پیوند «ارسال» و بی «بازه‌ها را عوض کن» (تنظیم است،
    // با مالک)؛ زبانه روی گزارش ارسال هم جاری است.
    await nav(page).filter({ hasText: 'گزارش‌ها' }).click();
    await expect(page.getByRole('heading', { name: 'گزارش تولید', level: 1 })).toBeVisible();
    await page.getByRole('navigation', { name: 'گزارش‌ها' }).getByRole('link', { name: 'گزارش ارسال' }).click();
    await expect(page.getByRole('heading', { name: 'گزارش ارسال', level: 1 })).toBeVisible();
    await expect(nav(page).filter({ hasText: 'گزارش‌ها' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.ad-back')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'بازه‌ها را عوض کن' })).toHaveCount(0);
    expect(problems).toEqual([]);
    expect(who.owner.problems).toEqual([]);
  });

  test('سفارش با مبلغ و پرداخت‌ها، بی چاپ، لغو، جابه‌جایی و دانلود؛ بازپرداخت دستی با کد تازه، و یادداشت', async () => {
    const { page, problems } = who.accountant;
    await page.goto(at(`/orders/${open.number}`));
    await expect(page.getByRole('heading', { name: 'پرداخت‌ها' })).toBeVisible();
    await expect(page.locator('main')).toContainText('803114');
    // وضعیت بی کار: نه «شروع چاپ»، نه «لغو سفارش»؛ چاپخانه بی «جابه‌جایی»؛ فایل‌ها بی دانلود و بی zip.
    await expect(side(page).locator('.ad-status')).toBeVisible();
    for (const name of ['لغو سفارش', 'جابه‌جایی', 'دانلود', 'همهٔ فایل‌ها (zip)', 'ویرایش نشانی']) {
      await expect(page.locator('main').getByRole('link', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(page.locator('main').getByRole('button', { name: 'شروع چاپ' })).toHaveCount(0);
    await expect(side(page).locator('[data-partner]')).toContainText(SAHAR);

    // یادداشت (۹٫۳): حسابدار هم می‌نویسد.
    const notes = page.getByRole('region', { name: 'یادداشت‌ها' });
    await notes.getByLabel('یادداشت تازه').fill('پرداخت با کارت مشتری خواند');
    await notes.getByRole('button', { name: 'افزودن یادداشت' }).click();
    await expect(notes.locator('.ad-notes > li')).toHaveCount(1);
    await expect(notes.locator('.ad-note__meta')).toContainText(ACCOUNTANT);

    // بازپرداخت دستی سفارش لغوشده، با کد تازه، مثل مالک.
    await page.goto(at(`/orders/${cancelled.number}`));
    const card = side(page).locator('.ad-refund');
    await expect(card).toHaveAttribute('data-refund', 'none');
    await card.getByRole('link', { name: 'ثبت بازپرداخت دستی…' }).click();
    const manual = page.locator('[data-refund-form="manual"]');
    await expect(manual.getByLabel('روز برگشت')).toHaveValue(formatJalaliNumeric(new Date()));
    await manual.getByLabel('کد پیگیری بانک').fill('774410');
    await manual.getByLabel('چطور برگشت').fill('کارت‌به‌کارت');
    await manual.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(accountantSecret));
    await manual.getByRole('button', { name: 'ثبت بازپرداخت' }).click();
    await expect(page).toHaveURL(/done=refund&r=refunded/);
    await expect(side(page).locator('.ad-refund .jy-badge')).toHaveText('برگشت داده شد');
    const rows = await sql<{ method: string; status: string; reference: string | null; admin_user_id: string | null }[]>`
      SELECT method, status, reference, admin_user_id FROM refunds WHERE order_id = ${cancelled.id}`;
    expect(rows).toEqual([{ method: 'manual', status: 'succeeded', reference: '774410', admin_user_id: accountantId }]);
    const events = await sql<{ admin_user_id: string }[]>`
      SELECT admin_user_id FROM admin_events WHERE action = 'orders.refund' AND target_id = ${cancelled.id}`;
    expect(events.map((e) => e.admin_user_id)).toEqual([accountantId]);
    expect(problems).toEqual([]);
  });

  test('مالک نقش را با کد تازه عوض می‌کند: حسابدار ← متصدی، نشست باز و کار بعدی با نقش تازه؛ فرم کهنه و نقش یکسان پیش از کد؛ رویداد', async () => {
    const ownerPage = who.owner.page;
    const row = ownerPage.locator(`li[data-username="${accountant}"]`);
    await ownerPage.goto(at('/admins'));
    await expect(row.locator('.jy-badge')).toHaveText('حسابدار');
    // خود مالک «عوض کردن نقش» ندارد.
    await expect(ownerPage.locator(`li[data-username="${owner}"]`).getByRole('link')).toHaveCount(0);
    await row.getByRole('link', { name: 'عوض کردن نقش' }).click();
    await expect(ownerPage.getByRole('heading', { name: `نقش ${ACCOUNTANT}`, level: 1 })).toBeVisible();
    await expect(ownerPage.locator('.ad-lead')).toHaveText(
      'نقش امروز: حسابدار. نقش تازه از کار بعدی‌اش در پنل اثر دارد و نشست‌های بازش می‌مانند.',
    );
    await expect(roleGroup(ownerPage).getByRole('radio', { name: /^حسابدار · امروز/ })).toBeChecked();
    // «کدام چاپخانه» فقط با نقش چاپخانه، مثل «افزودن ادمین» (`:has()`، بی JS).
    const which = ownerPage.getByRole('group', { name: 'کدام چاپخانه' });
    await expect(which).toBeHidden();
    await roleGroup(ownerPage).getByRole('radio', { name: /^چاپخانه/ }).check();
    await expect(which.locator('.jy-tile', { hasText: SAHAR })).toBeVisible();
    await roleGroup(ownerPage).getByRole('radio', { name: /^حسابدار/ }).check();
    await expect(which).toBeHidden();
    // نقش یکسان: خطا زیر نقش، پیش از کد.
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'نقش را عوض کن' }).click();
    await expect(ownerPage.locator('#v-role-error')).toHaveText('همین نقش را دارد؛ نقش دیگری انتخاب کن.');
    await roleGroup(ownerPage).getByRole('radio', { name: /^متصدی/ }).check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'نقش را عوض کن' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'ادمین‌ها', level: 1 })).toBeVisible();
    await expect(ownerPage.locator('main > .jy-note--success')).toHaveText(`نقش ${ACCOUNTANT} حالا متصدی است؛ از کار بعدی‌اش در پنل.`);
    await expect(row.locator('.jy-badge')).toHaveText('متصدی');
    expect(await sql`SELECT role_id, print_partner_id FROM admin_user_roles WHERE admin_user_id = ${accountantId}`).toEqual([
      { role_id: 'operator', print_partner_id: null },
    ]);

    // نشست مریم باز است؛ کار بعدی‌اش نقش تازه را دارد.
    const { page, problems } = who.accountant;
    await page.goto(at('/'));
    await expect(page.locator('.ad-user')).toContainText(`${ACCOUNTANT} · متصدی`);
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'پشتیبانی', 'ارسال', 'موجودی کاغذ', 'تعرفه', 'محتوای سایت']);
    await page.goto(at('/shipments/report'));
    await expect(page.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();

    // فرم کهنه: مالک دیگری همین حالا نقش را عوض کرد (اینجا با SQL)؛ صفحه با نقش تازه دوباره ساخته می‌شود و هیچ چیز عوض نمی‌شود.
    await ownerPage.goto(at(`/admins/${accountantId}/role`));
    await sql`UPDATE admin_user_roles SET role_id = 'accountant' WHERE admin_user_id = ${accountantId}`;
    await roleGroup(ownerPage).getByRole('radio', { name: /^مالک/ }).check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'نقش را عوض کن' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/admins/${accountantId}/role\\?e=role_stale$`));
    await expect(ownerPage.locator('main').getByRole('alert')).toHaveText(
      'نقش این ادمین همین حالا عوض شد؛ نقش تازه را ببین و اگر هنوز لازم است، دوباره انتخاب کن.',
    );
    await expect(roleGroup(ownerPage).getByRole('radio', { name: /^حسابدار · امروز/ })).toBeChecked();
    expect(await sql`SELECT role_id FROM admin_user_roles WHERE admin_user_id = ${accountantId}`).toEqual([{ role_id: 'accountant' }]);

    // رویدادها: یک «نقش … عوض شد» زیر «ادمین‌ها»، از مالک؛ فرم کهنه و نقش یکسان رویدادی ندارند.
    const lines = await sql<{ admin_user_id: string; detail: unknown }[]>`
      SELECT admin_user_id, detail FROM admin_events WHERE action = 'admins.role' AND target_id = ${accountantId}`;
    expect(lines).toEqual([{ admin_user_id: ownerId, detail: { username: accountant, from: ['accountant'], to: 'operator' } }]);
    await ownerPage.goto(at('/events?kind=admins'));
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: `نقش ${accountant} از حسابدار به متصدی عوض شد` })).toContainText(
      'نسرین حیدری',
    );
    expect(problems).toEqual([]);
    expect(who.owner.problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: «عوض کردن نقش»، «افزودن ادمین» با چهار نقش و پنل حسابدار بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({
    browser,
  }) => {
    const pages = {
      owner: ['/admins', `/admins/${accountantId}/role`, '/admins/new'],
      accountant: ['/', '/shipments/report', '/settings', `/orders/${cancelled.number}`],
    } as const;
    for (const key of ['owner', 'accountant'] as const) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[key].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        for (const path of pages[key]) {
          await page.goto(at(path));
          const { overflow, small, blank } = await layoutProblems(page);
          expect(overflow, `${key} ${width} ${path}`).toBeLessThanOrEqual(0);
          expect(small, `${key} ${width} ${path}`).toEqual([]);
          expect(blank, `${key} ${width} ${path}`).toEqual([]);
        }
        expect(problems, `${key} ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
