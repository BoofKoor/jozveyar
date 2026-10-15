import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * قالب برگه‌ها در پنل، سرتاسری (برش ۹٫۲، ADR-057؛ سؤال‌های ۱۹۳ و ۱۹۴): کارت «قالب برگه‌ها» در «تنظیمات»، دانلود قالب پیش‌فرض، بارگذاری
 * نسخهٔ تازه با پیش‌نمایش نمونه که کارگر واقعی می‌سازد (WeasyPrint در قفس خودش)، قالب خراب با خط، نشانی بیرونی که بار نمی‌شود، پیش‌نمایش
 * با یک سفارش، فعال کردن با کد تازه که برگهٔ سفارش «در صف چاپ» را با قالب تازه از نو می‌سازد، صفحهٔ برگه با همهٔ صفحه‌ها، برگشت به پیش‌فرض،
 * رویدادها، و متصدی بی صفحه.
 *
 * همان پنل، پایگاه داده، استوریج و کارگر `print.spec.ts` (طرز اجرا بالای `orders.spec.ts`). سفارش را خود تست با SQL می‌نشاند؛ فایل چاپش
 * در دست «کارگر دیگری» است، چون برگه به فایل جزوه نیازی ندارد. در پایان هیچ قالبی فعال نیست و سفارش و سند همین اجرا پاک‌اند.
 */

const env = process.env;
test.skip(
  !BASE || !GATE || !env.DATABASE_URL || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY,
  'بدون متغیرهای پنل، DATABASE_URL و S3_* — پنل، پایگاه داده، استوریج و کارگر لازم است',
);
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const NO_ACCESS = 'این بخش فقط برای مالک است';

let sql: postgres.Sql;
let eventsBefore = 0;

interface Seeded {
  id: string;
  number: number;
  doc: string;
}

/** سفارش پرداخت‌شده با یک جزوهٔ دو فایلی و کار برگه‌اش؛ فایل چاپ در دست «کارگر دیگری» (برگه فایل جزوه نمی‌خواهد). */
async function paidOrder(name: string, phone: string): Promise<Seeded> {
  const doc = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${doc}, 'ریاضی ۲ - جلسه ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${doc}.pdf`}, 'ready', 12,
            ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const sections = [{ documentId: doc, pageCount: 12 }];
  const rules = [{ pageRanges: [[1, 12]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    { items: [{ sections, rules, copies: 2, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'other' } },
    SEED_PRICE_LIST,
  );
  const paidAt = new Date(Date.now() - 30 * MINUTE);
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
              11, 1326, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42', '9187654321', ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, 12, 2, 'double', 'a4', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${doc}, 12)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json([[1, 12]])}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${new Date(paidAt.getTime() - MINUTE)}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 4)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'), ('prepare_ticket', ${row!.id}, 'queued', 0, NULL, NULL)`;
    return { id: row!.id, number: row!.order_number, doc };
  });
}

const ticketOf = async (o: Seeded) =>
  (
    await sql<{ key: string; pages: number; bijak: number | null; first: number | null; status: string }[]>`
      SELECT t.storage_key AS key, t.page_count AS pages, b.version AS bijak, f.version AS first, j.status::text AS status
        FROM jobs j
        LEFT JOIN order_tickets t ON t.order_id = j.order_id
        LEFT JOIN ticket_templates b ON b.id = t.bijak_template_id
        LEFT JOIN ticket_templates f ON f.id = t.first_page_template_id
       WHERE j.order_id = ${o.id} AND j.kind = 'prepare_ticket'`
  )[0]!;
const templateRow = async (id: number) =>
  (
    await sql<{ active: boolean; pdf: string | null; order: number | null; pages: number | null; error: string | null }[]>`
      SELECT is_active AS active, preview_pdf_key AS pdf, preview_order_number AS order, preview_pages AS pages, preview_error AS error
        FROM ticket_templates WHERE id = ${id}`
  )[0]!;
const templateEvents = async () =>
  sql<{ action: string; detail: Record<string, unknown> }[]>`
    SELECT action, detail FROM admin_events WHERE target_type = 'ticket_template' AND id > ${eventsBefore} ORDER BY id`;

/** شناسهٔ نسخه از نشانی صفحهٔ نسخه (`/settings/templates/<id>`). */
const idIn = (page: Page) => Number(/\/settings\/templates\/(\d+)/.exec(new URL(page.url()).pathname)![1]);

/** بارگذاری یک فایل قالب از کارت همان نوع؛ با JS، انتخاب فایل خودش فرم را می‌فرستد. */
async function uploadTemplate(page: Page, kind: 'bijak' | 'first_page', name: string, html: string) {
  await page.goto(at('/settings/templates'));
  await page.locator(`section[data-kind="${kind}"] input[type="file"]`).setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(html, 'utf8') });
}

/** تصویر بار شد (نه تصویر شکسته)، با عرض PNG کارگر. */
const imageLoaded = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((images) => images.map((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth));

test.describe.serial('قالب برگه‌ها در پنل', () => {
  const owner = `sara${RUN}`;
  const operator = `ali${RUN}`;
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  let order: Seeded;
  let bijak = 0;

  test.beforeAll(async ({ browser }) => {
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    // اجرای قبلی که وسط کار افتاد: هیچ قالبی فعال نماند (نسخه پاک‌نشدنی است).
    await sql`UPDATE ticket_templates SET is_active = false WHERE is_active`;
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);
    order = await paidOrder('مریم کاظمی', `0915${String(RUN).slice(1)}3111`);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    await enroll(operatorPage, serverInvite(operator, '--operator', '--name', 'علی محمدی'));
    // برگهٔ سفارش با قالب‌های پیش‌فرض: بیجک و برگهٔ اول تنها جزوه.
    await expect.poll(async () => (await ticketOf(order)).status, { timeout: 90_000 }).toBe('done');
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await operatorContext?.close();
    if (sql) {
      await sql`UPDATE ticket_templates SET is_active = false WHERE is_active`;
      if (order) {
        await sql`DELETE FROM payments WHERE order_id = ${order.id}`;
        await sql`DELETE FROM orders WHERE id = ${order.id}`;
        await sql`DELETE FROM documents WHERE id = ${order.doc}`;
      }
      await sql.end();
    }
  });

  test('کارت «تنظیمات»، دو نوع با قالب پیش‌فرض، و دانلود قالب پیش‌فرض بی باز شدن در پنل', async () => {
    expect(await ticketOf(order)).toMatchObject({ pages: 2, bijak: null, first: null });
    await ownerPage.goto(at('/settings'));
    const card = ownerPage.locator('#ticket-templates');
    await expect(card.locator('[data-ticket-templates] li')).toHaveText(['بیجکقالب پیش‌فرض جزوه‌یار', 'برگهٔ اولقالب پیش‌فرض جزوه‌یار']);
    await card.getByRole('link', { name: 'قالب‌ها و نسخه‌ها' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'قالب برگه‌ها', level: 1 })).toBeVisible();
    for (const kind of ['bijak', 'first_page']) {
      const row = ownerPage.locator(`section[data-kind="${kind}"] li[data-template="default-${kind}"]`);
      await expect(row.locator('.jy-badge')).toHaveText('فعال');
      await expect(row.getByRole('link', { name: 'برگشت به پیش‌فرض…' })).toHaveCount(0);
    }
    const response = await ownerPage.request.get(at('/settings/templates/default-bijak/source'));
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/octet-stream');
    expect(response.headers()['content-disposition']).toBe('attachment; filename="ghaleb-bijak-pishfarz.html"');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    // CSP همهٔ پاسخ‌های پنل: اسکریپت فقط با nonce، پس حتی مرورگری که پیوست را باز کند، اسکریپت قالب را اجرا نمی‌کند.
    expect(response.headers()['content-security-policy']).toMatch(/^default-src 'none'; script-src 'self' 'nonce-[^']+' 'strict-dynamic';/);
    expect(await response.text()).toContain('{{ order.label_name }}');
    // فهرست متغیرها با نام همان که در قالب نوشته می‌شود.
    await ownerPage.locator('details[data-vars] > summary').click();
    await expect(ownerPage.locator('details[data-vars] dt').filter({ hasText: /^order\.label_name$/ })).toHaveCount(1);
    await expect(ownerPage.locator('details[data-vars] dt').filter({ hasText: /^print_info\.files_summary\.plastic$/ })).toHaveCount(1);
  });

  test('فایل نادرست همان‌جا؛ قالب خراب با خط و بی «فعال کردن»', async () => {
    await uploadTemplate(ownerPage, 'bijak', 'bijak.txt', '<p>x</p>');
    await expect(ownerPage.locator('section[data-kind="bijak"] .jy-error')).toHaveText('قالب فایل HTML است، با پسوند .html.');
    await uploadTemplate(ownerPage, 'bijak', 'broken.html', '<p>یک</p>\n<p>{% if %}</p>');
    await expect(ownerPage).toHaveURL(/\/settings\/templates\/\d+\?done=upload$/);
    await expect(ownerPage.locator('.ad-flash')).toContainText('بارگذاری شد');
    // تا کارگر بسازد «در حال ساختن» است و صفحه خودش تازه می‌شود.
    await expect(ownerPage.locator('[data-preview="error"]')).toBeVisible({ timeout: 60_000 });
    await expect(ownerPage.locator('[data-template-error]')).toContainText('قالب ساخته نشد، خط 2:');
    await expect(ownerPage.getByRole('link', { name: 'فعال کردن…' })).toHaveCount(0);
    await expect(ownerPage.locator('#t-use + p')).toHaveText('تا پیش‌نمایش درستی نیامده، این نسخه فعال‌شدنی نیست.');
    // نشانی ساختگی فعال کردن همان نسخه هم: «پیش‌نمایش درستی ندارد»، نه فرم کد.
    expect((await templateRow(idIn(ownerPage))).error).toMatch(/^bijak خط 2:/);
  });

  test('نسخهٔ درست: پیش‌نمایش نمونه با صفحه‌ها، نشانی بیرونی که بار نشد، PDF، و پیش‌نمایش با سفارش کنار فایل‌هایش', async () => {
    const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body>
<p>BIJAK-E2E {{ order.number }} {{ order.label_name }} {{ total_copies }}</p><img src="https://example.com/logo.png" alt=""></body></html>`;
    await uploadTemplate(ownerPage, 'bijak', `bijak-${RUN}.html`, html);
    await expect(ownerPage).toHaveURL(/\/settings\/templates\/\d+\?done=upload$/);
    bijak = idIn(ownerPage);
    const card = ownerPage.locator('[data-preview]');
    await expect(card).toHaveAttribute('data-preview', 'ready', { timeout: 60_000 });
    await expect(card.locator('.jy-card__meta')).toContainText('با دادهٔ نمونه');
    await expect(card.locator('.jy-card__meta')).toContainText('1 صفحه');
    await expect(card.locator('[data-blocked]')).toContainText('https://example.com/logo.png');
    expect(await imageLoaded(ownerPage, '.ad-sheet img')).toEqual([1241]);
    const [download] = await Promise.all([ownerPage.waitForEvent('download'), ownerPage.getByRole('link', { name: 'PDF پیش‌نمایش' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^pishnamayesh-bijak-\d+\.pdf$/);
    expect(readFileSync((await download.path())!).subarray(0, 5).toString()).toBe('%PDF-');

    // شمارهٔ نادرست و سفارش ناموجود همین‌جا؛ بعد با سفارش واقعی.
    await ownerPage.getByLabel('پیش‌نمایش با سفارش').fill('12a');
    await ownerPage.getByRole('button', { name: 'پیش‌نمایش دوباره' }).click();
    await expect(card.locator('[role="alert"]').first()).toContainText('شمارهٔ سفارش را درست بنویس');
    await ownerPage.getByLabel('پیش‌نمایش با سفارش').fill('99999');
    await ownerPage.getByRole('button', { name: 'پیش‌نمایش دوباره' }).click();
    await expect(card.locator('[role="alert"]').first()).toContainText('این سفارش پیدا نشد.');
    await ownerPage.getByLabel('پیش‌نمایش با سفارش').fill(String(order.number));
    await ownerPage.getByRole('button', { name: 'پیش‌نمایش دوباره' }).click();
    await expect(card.locator('.jy-card__meta')).toContainText(`با سفارش ${order.number}`, { timeout: 60_000 });
    expect(await templateRow(bijak)).toMatchObject({ order: order.number, pages: 1, pdf: `orders/${order.number}/template-${bijak}-preview.pdf` });
    expect(await imageLoaded(ownerPage, '.ad-sheet img')).toEqual([1241]);
  });

  test('فعال کردن با کد تازه: چه عوض می‌شود، برگهٔ سفارش «در صف چاپ» با قالب تازه، و صفحهٔ برگه با هر دو صفحه', async () => {
    const before = await ticketOf(order);
    const queued = Number((await sql<{ n: string }[]>`SELECT count(*) AS n FROM orders WHERE status = 'paid'`)[0]!.n);
    await ownerPage.goto(at(`/settings/templates/${bijak}`));
    await ownerPage.getByRole('link', { name: 'فعال کردن…' }).click();
    await expect(ownerPage.getByRole('heading', { level: 1 })).toHaveText(/^فعال کردن بیجک، نسخهٔ \d+$/);
    await expect(ownerPage.locator('[data-changes] li')).toHaveText([
      'امروزقالب پیش‌فرض جزوه‌یار',
      /^از این لحظهنسخهٔ \d+$/,
      new RegExp(`^پیش‌نمایشی که دیدیسفارش ${order.number}، .+ · 1 صفحه$`),
    ]);
    await expect(ownerPage.locator('.jy-note--info')).toContainText(`برگهٔ ${queued} سفارش «در صف چاپ» همین حالا از نو`);
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await ownerPage.getByRole('button', { name: 'فعال کن' }).click();
    await expect(ownerPage.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect((await templateRow(bijak)).active).toBe(false);
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن' }).click();
    await expect(ownerPage).toHaveURL(/\/settings\/templates\?done=activate&k=bijak/);
    await expect(ownerPage.locator('.ad-flash')).toContainText('بیجک فعال شد؛ برگهٔ سفارش‌های تازه با همین ساخته می‌شود.');
    await expect(ownerPage.locator(`li[data-template="${bijak}"] .jy-badge`)).toHaveText('فعال');
    await expect(ownerPage.locator('section[data-kind="bijak"] li[data-template="default-bijak"]').getByRole('link', { name: 'برگشت به پیش‌فرض…' })).toBeVisible();

    // کارگر برگه را با قالب تازه از نو می‌سازد؛ کلید از sha256 خود PDF است، پس برگهٔ پیشین زیر کلید خودش می‌ماند.
    await expect.poll(async () => (await ticketOf(order)).bijak, { timeout: 90_000 }).not.toBeNull();
    const after = await ticketOf(order);
    expect(after).toMatchObject({ pages: 2, first: null, status: 'done' });
    expect(after.key).not.toBe(before.key);

    await ownerPage.goto(at(`/orders/${order.number}/ticket`));
    await expect(ownerPage.locator('[data-ticket-templates]')).toHaveText(new RegExp(`^قالب‌ها: بیجک نسخهٔ ${after.bijak} · برگهٔ اول پیش‌فرض$`));
    await expect(ownerPage.locator('.ad-sheet img')).toHaveCount(2);
    await ownerPage.locator('.ad-sheet').nth(1).scrollIntoViewIfNeeded();
    await expect.poll(() => imageLoaded(ownerPage, '.ad-sheet img')).toEqual([1241, 1241]);
    expect((await ownerPage.request.get(at(`/orders/${order.number}/ticket/preview?page=3`))).status()).toBe(404);
  });

  test('برگشت به پیش‌فرض با کد تازه؛ رویدادها؛ متصدی بی صفحه و بی دانلود', async () => {
    await ownerPage.goto(at('/settings/templates'));
    await ownerPage.locator('section[data-kind="bijak"]').getByRole('link', { name: 'برگشت به پیش‌فرض…' }).click();
    await expect(ownerPage.getByRole('heading', { level: 1 })).toHaveText('برگشت بیجک به قالب پیش‌فرض');
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'به پیش‌فرض برگرد' }).click();
    await expect(ownerPage.locator('.ad-flash')).toContainText('بیجک به قالب پیش‌فرض جزوه‌یار برگشت.');
    expect((await templateRow(bijak)).active).toBe(false);
    await expect.poll(async () => (await ticketOf(order)).bijak, { timeout: 90_000 }).toBeNull();
    await expect.poll(async () => (await ticketOf(order)).status, { timeout: 90_000 }).toBe('done');

    const events = await templateEvents();
    expect(events.map((e) => e.action)).toEqual([
      'settings.template_upload',
      'settings.template_upload',
      'settings.template_preview',
      'settings.template_activate',
      'settings.template_default',
    ]);
    expect(events[2]!.detail).toMatchObject({ kind: 'bijak', orderNumber: order.number });
    expect(JSON.stringify(events)).not.toContain('BIJAK-E2E');
    await ownerPage.goto(at('/events?kind=settings'));
    await expect(ownerPage.locator('main')).toContainText('قالب بیجک به پیش‌فرض برگشت');

    for (const path of ['/settings/templates', `/settings/templates/${bijak}`, `/settings/templates/${bijak}/activate`]) {
      await operatorPage.goto(at(path));
      await expect(operatorPage.locator('main')).toContainText(NO_ACCESS);
    }
    expect((await operatorPage.request.get(at('/settings/templates/default-bijak/source'))).status()).toBe(403);
    expect((await operatorPage.request.get(at(`/settings/templates/${bijak}/preview?page=1`))).status()).toBe(403);
  });

  test('گوشی و دسکتاپ: بی سرریز، هدف لمسی ۴۴، آیکون‌ها با شکل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of ['/settings', '/settings/templates', `/settings/templates/${bijak}`, `/settings/templates/${bijak}/activate`, `/orders/${order.number}/ticket`]) {
        await page.goto(at(path));
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }
    expect(ownerProblems).toEqual([]);
  });
});
