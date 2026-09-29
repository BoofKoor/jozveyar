import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { S3Driver } from '@jozveyar/storage';
import { tehranDayStart } from '@jozveyar/text';

import { alertOf, assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * نقش «چاپخانه» و محدوده‌اش، سرتاسری (برش ۵٫۳؛ طرح `docs/ui/mockups/admin.html` با نقش «چاپخانه»: `m-dash`، `m-orders`، `m-order`،
 * `m-order-cancelled`، «این بخش برای چاپخانه باز نیست» و «این سفارش پیدا نشد»؛ و `m-admins`، `m-admin-invite`، `m-admin-link`؛ ADR-042):
 * دو چاپخانه و دو کاربر چاپخانه که مالک از «ادمین‌ها» با پیوند یک‌باره و کد تازه می‌سازد؛ هر کدام فقط سفارش‌های چاپخانهٔ خودش را
 * می‌بیند، بی مبلغ و بی لغو؛ سفارش دیگری در صفحه، دانلود و هر کار ۴۰۴ است، همان پاسخ شماره‌ای که نیست؛ و مالک و متصدی مثل امروز.
 *
 * سفارش‌ها را مثل `partners.spec.ts` خود تست با SQL می‌نشاند، با همان تخصیصی که برگشت درگاه در تراکنش پرداخت می‌نویسد
 * (`assignAtPayment`)، و فایل چاپ و برگه را کارگر واقعی می‌سازد؛ همان متغیرها و همان کارگر لازم است (طرز اجرا بالای
 * `orders.spec.ts`). چاپخانه پاک نمی‌شود، پس نام چاپخانه‌های این تست شمارهٔ اجرا را دارد و در پایان غیرفعال می‌شوند، با سفارش‌های
 * همین اجرا پاک، مثل پیش از تست.
 */

const env = process.env;
test.skip(
  !BASE || !GATE || !env.DATABASE_URL || !env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY,
  'بدون متغیرهای پنل، DATABASE_URL و S3_* — پنل، پایگاه داده، استوریج و کارگر لازم است',
);
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const FIXTURES = join(process.cwd(), '..', 'web', 'tests', 'fixtures');
const NOOR = `چاپ نور ${RUN}`;
const AFTAB = `چاپ آفتاب ${RUN}`;
const THIRD = `چاپ سوم ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const ISFAHAN = { provinceId: 4, cityId: 122 };
const SHIRAZ = { provinceId: 17, cityId: 911 };
/** همان پیام صفحه‌ای که نیست: شماره‌ای که نیست، و سفارش بیرون از محدوده. */
const NOT_FOUND = 'این سفارش پیدا نشد';
const NO_ACCESS = 'این بخش برای چاپخانه باز نیست';

let sql: postgres.Sql;
let s3: S3Driver;

/** یک فایل با همان پروتکل مرورگر: آپلود چندتکه و PUT روی URL امضاشده. */
async function upload(key: string, body: Buffer) {
  const uploadId = await s3.createMultipartUpload(key, { contentType: 'application/pdf' });
  const response = await fetch(await s3.presignUploadPart(key, uploadId, 1, body.length, 600), {
    method: 'PUT',
    body: new Blob([Uint8Array.from(body)]),
  });
  expect(response.status).toBe(200);
  await s3.completeMultipartUpload(key, uploadId, await s3.listUploadedParts(key, uploadId));
}

interface Seeded {
  number: number;
  id: string;
  totalRials: number;
}

/**
 * سفارش همان‌طور که سرور می‌نویسد، در `place`: سفارش در یک تراکنش، و اگر `paid`، برگشت موفق درگاه با رویداد، چاپخانهٔ همان شهر
 * (`assignAtPayment`) و کارهای `prepare_order` و `prepare_ticket`. ۱۰ صفحهٔ سیاه‌سفید؛ فایلش در استوریج تا کارگر فایل چاپ را بسازد.
 */
async function order(name: string, phone: string, place: { provinceId: number; cityId: number }, { paid = true } = {}): Promise<Seeded> {
  const docId = randomUUID();
  const key = `uploads/${docId}.pdf`;
  const body = readFileSync(join(FIXTURES, 'plain-bw-10.pdf'));
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲ - جلسه ۱.pdf', 'pdf', 'application/pdf', ${body.length}, ${key}, 'ready', 10,
            ${'e2e'.padEnd(64, '3')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  await upload(key, body);
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
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
              ${place.provinceId}, ${place.cityId}, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
              ${createdAt})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    if (paid) {
      const [payment] = await tx<{ id: string }[]>`
        INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
        VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
                '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
        RETURNING id`;
      await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
                WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
               VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
      await assignAtPayment(tx, row!.id, paidAt);
      await tx`INSERT INTO jobs (kind, order_id) VALUES ('prepare_order', ${row!.id}), ('prepare_ticket', ${row!.id})`;
    }
    return { number: row!.order_number, id: row!.id, totalRials: breakdown.totalRials };
  });
}

const partnerOf = async (o: Seeded) =>
  (await sql<{ name: string | null }[]>`SELECT p.name FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id = ${o.id}`)[0]!
    .name;
const statusOf = async (o: Seeded) => (await sql<{ status: string }[]>`SELECT status::text FROM orders WHERE id = ${o.id}`)[0]!.status;
const jobStatus = async (o: Seeded, kind = 'prepare_order') =>
  (await sql<{ status: string }[]>`SELECT status FROM jobs WHERE order_id = ${o.id} AND kind = ${kind}`)[0]?.status;
const eventsOf = async (o: Seeded) =>
  (await sql<{ action: string }[]>`SELECT action FROM admin_events WHERE target_type = 'order' AND target_id = ${o.id}::text ORDER BY id`).map(
    (e) => e.action,
  );
const side = (page: Page) => page.locator('.ad-side');
const heading = (page: Page, name: string) => page.getByRole('heading', { name, level: 1 });
/** کاشی نقش «چاپخانه» در «افزودن ادمین»؛ نه «چاپخانهٔ جزوه‌یار» در «کدام چاپخانه». */
const partnerRole = (page: Page) => page.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / });

test.describe.serial('نقش چاپخانه و محدوده در پنل', () => {
  const owner = `sara${RUN}`;
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  const partner = {} as Record<'hasan' | 'mina', { context: BrowserContext; page: Page; problems: string[] }>;
  // A: نور، «شروع چاپ» و «تحویل پست شد» با کاربر خودش. B: آفتاب. C: نور، لغو مالک. D: نور، جابه‌جا به آفتاب. U: پرداخت‌نشده، مشهد.
  const o = {} as Record<'A' | 'B' | 'C' | 'D' | 'U', Seeded>;
  const phone = (n: number) => `0915${String(RUN).slice(1)}3${String(n).repeat(3)}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    s3 = new S3Driver({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'jozveyar',
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    });
    // پایگاه دادهٔ دور‌ریختنی: شمارش چیپ‌ها و صف هر چاپخانه فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;
    // دو چاپخانهٔ طرف قرارداد، و سومی که همین حالا غیرفعال می‌شود؛ مثل فرم افزودن (جزو `partners.spec.ts`).
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    for (const [name, place] of [
      [NOOR, MASHHAD],
      [AFTAB, ISFAHAN],
      [THIRD, SHIRAZ],
    ] as const) {
      await sql`INSERT INTO print_partners (name, province_id, city_id, created_at) VALUES (${name}, ${place.provinceId}, ${place.cityId}, ${yesterday})`;
    }
    o.A = await order('مریم کاظمی', phone(1), MASHHAD);
    o.B = await order('زهرا محمدی', phone(2), ISFAHAN);
    o.C = await order('امیر حسینی', phone(3), MASHHAD);
    o.D = await order('نگار صادقی', phone(4), MASHHAD);
    o.U = await order('کیان رستمی', phone(5), MASHHAD, { paid: false });
    expect(await Promise.all([o.A, o.B, o.C, o.D, o.U].map(partnerOf))).toEqual([NOOR, AFTAB, NOOR, NOOR, null]);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    // کارگر واقعی فایل چاپ و برگهٔ هر سفارش پرداخت‌شده را می‌سازد.
    for (const key of ['A', 'B', 'C', 'D'] as const) {
      await expect.poll(() => jobStatus(o[key]), { timeout: 90_000 }).toBe('done');
      await expect.poll(() => jobStatus(o[key], 'prepare_ticket'), { timeout: 90_000 }).toBe('done');
    }
  });

  test.afterAll(async () => {
    // همان پیش از تست: سفارش‌های این اجرا پاک (چاپخانه با سفارش باز غیرفعال نمی‌شود)، و چاپخانه‌های این اجرا غیرفعال.
    if (sql) {
      await sql`DELETE FROM payments`;
      await sql`DELETE FROM orders`;
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name LIKE ${`% ${RUN}`} AND deactivated_at IS NULL`;
    }
    await ownerContext?.close();
    await operatorContext?.close();
    for (const one of Object.values(partner)) await one.context.close();
    await sql?.end();
  });

  test('«افزودن ادمین» با سه نقش؛ «کدام چاپخانه» فقط با نقش چاپخانه؛ پیوند یک‌باره و کد تازه، مثل متصدی؛ فهرست‌ها با کاربر', async ({ browser }) => {
    test.setTimeout(180_000);
    await ownerPage.goto(at('/admins'));
    await ownerPage.getByRole('link', { name: 'افزودن ادمین' }).click();
    await expect(heading(ownerPage, 'افزودن ادمین')).toBeVisible();
    const roles = ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio');
    await expect(roles).toHaveCount(3);
    await expect(ownerPage.locator('.ad-roles .jy-tile__title').first()).toHaveText('متصدی');
    const which = ownerPage.getByRole('group', { name: 'کدام چاپخانه' });
    // متصدی: «کدام چاپخانه» پنهان (بی JS، `:has()`).
    await expect(which).toBeHidden();
    await partnerRole(ownerPage).check();
    await expect(which).toBeVisible();
    // چاپخانه‌های فعال، طرف قرارداد اول و پیش‌فرض آخر؛ سومی هنوز فعال است.
    const tiles = which.locator('.jy-tile');
    await expect(tiles.filter({ hasText: NOOR })).toContainText('مشهد');
    await expect(tiles.last()).toContainText('چاپخانهٔ جزوه‌یار');
    await expect(tiles.last()).toContainText('تهران · پیش‌فرض');

    // چاپخانه‌ای که همین حالا غیرفعال شد: خطا زیر همان، نوشته‌ها می‌مانند، و کسی ساخته نمی‌شود.
    await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${THIRD}`;
    await ownerPage.getByLabel('نام', { exact: true }).fill('حسن نوری');
    await ownerPage.getByLabel('نام کاربری').fill(`hasan${RUN}`);
    await tiles.filter({ hasText: THIRD }).getByRole('radio').check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    await expect(ownerPage.locator('#v-partner-error')).toHaveText('این چاپخانه غیرفعال است؛ چاپخانهٔ فعال دیگری انتخاب کن.');
    await expect(ownerPage.getByLabel('نام کاربری')).toHaveValue(`hasan${RUN}`);
    await expect(partnerRole(ownerPage)).toBeChecked();
    expect((await sql`SELECT 1 FROM admin_users WHERE username = ${`hasan${RUN}`}`).length).toBe(0);

    const links = {} as Record<'hasan' | 'mina', string>;
    for (const [who, name, partnerName] of [
      ['hasan', 'حسن نوری', NOOR],
      ['mina', 'مینا کریمی', AFTAB],
    ] as const) {
      await ownerPage.goto(at('/admins/new'));
      await ownerPage.getByLabel('نام', { exact: true }).fill(name);
      await ownerPage.getByLabel('نام کاربری').fill(`${who}${RUN}`);
      await partnerRole(ownerPage).check();
      await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: partnerName }).getByRole('radio').check();
      await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
      await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
      await expect(ownerPage.getByRole('heading', { name: `پیوند ثبت ${name} آماده است` })).toBeVisible();
      links[who] = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    }

    for (const [who, name, partnerName] of [
      ['hasan', 'حسن نوری', NOOR],
      ['mina', 'مینا کریمی', AFTAB],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      await page.goto(links[who]);
      await expect(page.getByText(`سارا رضایی تو را کاربر ${partnerName} در پنل جزوه‌یار کرده است.`)).toBeVisible();
      await enroll(page, links[who]);
      // سربرگ، همان طرح: «حسن · چاپ نور»؛ و فقط پیشخوان، سفارش‌ها و از ۶٫۲ ارسال (فایل پست خودش).
      await expect(page.locator('.ad-user')).toContainText(`${name} · ${partnerName}`);
      const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' });
      await expect(nav.getByRole('link')).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال']);
      await expect(nav.locator('.ad-more')).toHaveCount(0);
      partner[who] = { context, page, problems };
    }

    // ادمین‌ها: نقش با نام چاپخانه، و «فقط سفارش‌های …»؛ کد ورود تازه و غیرفعال کردن مثل متصدی.
    await ownerPage.goto(at('/admins'));
    const hasanRow = ownerPage.locator(`li[data-username="hasan${RUN}"]`);
    await expect(hasanRow.locator('.jy-badge')).toHaveText(`چاپخانه · ${NOOR}`);
    await expect(hasanRow.locator('.ad-people__meta')).toContainText(`فقط سفارش‌های ${NOOR}`);
    await expect(hasanRow.getByRole('link')).toHaveText(['کد ورود تازه', 'غیرفعال کن']);
    // چاپخانه‌ها: کاربر هر چاپخانه؛ بی کاربر، همان مالک و متصدی.
    await ownerPage.goto(at('/partners'));
    await expect(ownerPage.locator(`.ad-partners li[data-partner="${NOOR}"] .ad-partners__meta`)).toHaveText(
      `مشهد · 3 سفارش باز · کاربر: حسن نوری`,
    );
    await expect(ownerPage.locator('.ad-partners li[data-partner="چاپخانهٔ جزوه‌یار"] .ad-partners__meta')).toContainText(
      'کاربرها: همان مالک و متصدی',
    );
    // رویدادها: پیوند با نام چاپخانه، همان طرح.
    await ownerPage.goto(at('/events?kind=admins'));
    await expect(ownerPage.locator('.ad-log').getByText(`پیوند ثبت برای hasan${RUN} (چاپخانه، ${NOOR}) ساخته شد`)).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('هر کاربر چاپخانه فقط سفارش‌های خودش: پیشخوان و فهرست بی مبلغ، چهار چیپ؛ پرداخت‌نشده و چاپخانهٔ دیگر هیچ‌جا', async () => {
    const { page, problems } = partner.hasan;
    await page.goto(at());
    await expect(page.locator('.ad-due .ad-meta').first()).toHaveText(
      `سفارش‌هایی که به ${NOOR} سپرده شده‌اند و هنوز به پست نرسیده‌اند، به ترتیب مهلت. تعهد: 2 روز کاری بعد از پرداخت.`,
    );
    const queue = page.locator('section.ad-list');
    await expect(queue).toHaveClass(/ad-list--nosum/);
    await expect(queue.locator('.ad-row')).toHaveCount(3);
    expect((await queue.locator('.ad-row__id').allInnerTexts()).map(Number).sort()).toEqual([o.A.number, o.C.number, o.D.number].sort());
    await expect(queue.locator('.ad-row__sum')).toHaveCount(0);
    await expect(queue.getByRole('link', { name: 'همهٔ سفارش‌ها' })).toHaveCount(0);
    await expect(page.locator('.ad-tile .ad-tile__n')).toHaveText(['0', '0', '3', '0']);
    expect(await page.locator('main').innerText()).not.toContain('تومان');

    await page.goto(at('/orders'));
    const chips = page.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link');
    await expect(chips).toHaveText(['باز 3', 'تحویل پست شد 0', 'لغو شد 0', 'همه 3']);
    const list = page.locator('section.ad-list');
    await expect(list.locator('.ad-cols span')).toHaveText(['سفارش', 'گیرنده', 'جزوه', 'وضعیت', 'تحویل به پست تا']);
    await expect(list.locator('.ad-row')).toHaveCount(3);
    await expect(page.getByText('«رهاشده»:')).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toContain('تومان');
    // چیپی که ندارد، «باز»؛ جست‌وجوی سفارش دیگری و پرداخت‌نشده هیچ.
    await page.goto(at('/orders?status=awaiting'));
    await expect(chips.first()).toHaveAttribute('aria-current', 'page');
    for (const q of [String(o.B.number), String(o.U.number), 'زهرا محمدی', 'کیان رستمی']) {
      await page.goto(at(`/orders?q=${encodeURIComponent(q)}`));
      await expect(page.locator('.ad-empty'), q).toHaveText(`سفارشی با «${q}» پیدا نشد.`);
      await expect(chips.last()).toHaveText('همه 0');
    }

    // آفتاب فقط B.
    const mina = partner.mina.page;
    await mina.goto(at('/orders?status=all'));
    await expect(mina.locator('.ad-row__id')).toHaveText([String(o.B.number)]);
    expect(problems).toEqual([]);
    expect(partner.mina.problems).toEqual([]);
  });

  test('جزئیات بی مبلغ، بی لغو و بی ویرایش؛ «شروع چاپ» و «تحویل پست شد» با نام خودش؛ دانلود فایل چاپ و برگه', async () => {
    const { page, problems } = partner.hasan;
    await page.goto(at(`/orders/${o.A.number}`));
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    await expect(side(page).getByRole('button', { name: 'شروع چاپ' })).toBeVisible();
    await expect(side(page).getByRole('link', { name: 'لغو سفارش' })).toHaveCount(0);
    // بی کارت چاپخانه، بی مبلغ و پرداخت‌ها، بی «ویرایش» نشانی؛ گیرنده کامل، برای برچسب پست.
    await expect(page.getByRole('heading', { name: 'چاپخانه', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'مبلغ' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'پرداخت‌ها' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ویرایش' })).toHaveCount(0);
    const to = page.locator('section', { has: page.getByRole('heading', { name: 'ارسال به' }) });
    await expect(to).toContainText('مریم کاظمی');
    await expect(to).toContainText(phone(1).replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'));
    await expect(to).toContainText('بلوار سجاد، سجاد 18، پلاک 42، واحد 6');
    await expect(to).toContainText('9187654321');
    expect(await page.locator('main').innerText()).not.toContain('تومان');
    expect(await page.content()).not.toContain(String(o.A.totalRials / 10));

    // فایل چاپ و برگه، با همان sha256 کارگر؛ رویداد با نام خودش.
    const [file] = await sql<{ sha256: string }[]>`
      SELECT f.sha256 FROM order_print_files f JOIN order_items i ON i.id = f.order_item_id WHERE i.order_id = ${o.A.id}`;
    const printFile = await page.request.get(at(`/orders/${o.A.number}/print/1/1`));
    expect(printFile.status()).toBe(200);
    expect(createHash('sha256').update(await printFile.body()).digest('hex')).toBe(file!.sha256);
    expect((await page.request.get(at(`/orders/${o.A.number}/ticket/pdf`))).status()).toBe(200);
    await page.goto(at(`/orders/${o.A.number}/ticket`));
    await expect(page.getByRole('img', { name: new RegExp(`برگهٔ سفارش ${o.A.number}`) })).toBeVisible();

    await page.goto(at(`/orders/${o.A.number}`));
    await side(page).getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    await expect(side(page).locator('.ad-meta').nth(1)).toHaveText(/^در حال چاپ از امروز \d\d:\d\d، حسن نوری$/);
    await side(page).getByRole('button', { name: 'تحویل پست شد' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('تحویل پست شد');
    await expect(side(page).getByRole('link', { name: /برگرداندن/ })).toHaveCount(0);
    expect(await statusOf(o.A)).toBe('handed_to_post');
    expect(await eventsOf(o.A)).toEqual(['orders.print_download', 'orders.ticket_download', 'orders.status', 'orders.status']);

    // مالک همان کارها را با نام حسن می‌بیند، در سفارش و در «رویدادها».
    await ownerPage.goto(at(`/orders/${o.A.number}`));
    const log = ownerPage.locator('.ad-log li');
    await expect(log.filter({ hasText: 'در صف چاپ ← در حال چاپ' })).toContainText('· حسن نوری');
    await expect(log.filter({ hasText: 'فایل چاپ دانلود شد' })).toContainText('· حسن نوری');
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('.ad-log li', { hasText: `سفارش ${o.A.number}: در صف چاپ ← در حال چاپ` })).toContainText('حسن نوری');

    // فرم‌هایی که چاپخانه ندارد: «این بخش برای چاپخانه باز نیست»، همان طرح.
    for (const mode of ['cancel', 'edit', 'assign', 'revert']) {
      await page.goto(at(`/orders/${o.C.number}?do=${mode}`));
      await expect(heading(page, NO_ACCESS), mode).toBeVisible();
      await expect(page.locator('.ad-noaccess .ad-lead')).toHaveText(
        `سفارش‌هایی که به ${NOOR} سپرده شده‌اند در «سفارش‌ها»ست. لغو، ویرایش نشانی، تعرفه و بقیه با جزوه‌یار است.`,
      );
    }

    // لغو مالک با دلیلی که برگشت پول را می‌گوید: چاپخانه «لغو شد» را با «چاپ نمی‌شود» می‌بیند، نه دلیل را.
    await ownerPage.goto(at(`/orders/${o.C.number}?do=cancel`));
    await side(ownerPage).getByLabel('دلیل لغو').fill('مشتری خواست؛ کارت‌به‌کارت برگشت، پیگیری 552190');
    await side(ownerPage).getByRole('button', { name: 'سفارش را لغو کن' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('لغو شد');
    await page.goto(at(`/orders/${o.C.number}`));
    await expect(side(page).getByRole('heading', { name: 'لغو شد' })).toBeVisible();
    await expect(side(page)).toContainText('این سفارش چاپ نمی‌شود؛ اگر چاپش کرده‌ای، کنار بگذار.');
    await expect(side(page)).toContainText('سارا رضایی');
    expect(await page.content()).not.toContain('552190');
    await page.goto(at('/orders'));
    await expect(page.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link')).toHaveText([
      'باز 1',
      'تحویل پست شد 1',
      'لغو شد 1',
      'همه 3',
    ]);
    expect(problems).toEqual([]);
  });

  test('سفارش چاپخانهٔ دیگر و پرداخت‌نشده ۴۰۴ است، همان شماره‌ای که نیست: در صفحه، برگه، هر دانلود و هر کار', async () => {
    const { page, problems } = partner.hasan;
    const shown = async (path: string) => {
      const response = await page.goto(at(path));
      await expect(heading(page, NOT_FOUND), path).toBeVisible();
      return response!.status();
    };
    for (const path of [
      `/orders/${o.B.number}`,
      `/orders/${o.U.number}`,
      '/orders/999999999',
      `/orders/${o.B.number}/ticket`,
      // دانلودها به صفحهٔ همان سفارش برمی‌گردند، که برای چاپخانه نیست.
      `/orders/${o.B.number}/pdf/1`,
      `/orders/${o.B.number}/print/1/1`,
      `/orders/${o.B.number}/ticket/pdf`,
    ]) {
      expect(await shown(path), path).toBe(404);
    }
    await expect(page.locator('.ad-noaccess .ad-lead')).toHaveText('شماره را درست زدی؟ از فهرست سفارش‌ها پیدایش کن.');
    await expect(page.locator('main').getByRole('link', { name: 'سفارش‌ها' })).toBeVisible();
    // صفحهٔ سفارش دیگری و شماره‌ای که نیست یک چیزند (جز خود شماره در نشانی).
    await page.goto(at(`/orders/${o.B.number}`));
    const other = await page.locator('main').innerHTML();
    await page.goto(at('/orders/999999999'));
    expect(await page.locator('main').innerHTML()).toBe(other);
    expect((await page.request.get(at(`/orders/${o.B.number}/ticket/preview`))).status()).toBe(404);

    // هر کار: فرم سفارش خودش، با شمارهٔ سفارش دیگری (درخواست دست‌ساز). سرور محدوده را خودش می‌سنجد: «پیدا نشد».
    const D = o.D;
    const forge = async (formButton: string, number: number, fields: Record<string, string> = {}) => {
      await page.goto(at(`/orders/${D.number}`));
      const form = side(page).locator('form', { has: page.getByRole('button', { name: formButton }) });
      await form.evaluate(
        (el, { number, fields }) => {
          (el.querySelector('input[name="number"]') as HTMLInputElement).value = String(number);
          for (const [name, value] of Object.entries(fields)) {
            let input = el.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
            if (!input) {
              input = document.createElement('input');
              input.type = 'hidden';
              input.name = name;
              el.appendChild(input);
            }
            input.value = value;
          }
        },
        { number, fields },
      );
      await form.getByRole('button', { name: formButton }).click();
    };
    const [aftab] = await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE name = ${AFTAB}`;
    await forge('شروع چاپ', o.B.number, { partner: aftab!.id });
    await expect(heading(page, NOT_FOUND)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/orders/${o.B.number}\\?e=order_not_found$`));
    // لغو با همان فرم: کاری که چاپخانه ندارد، ۴۰۳ پیش از هر خواندن؛ سفارش دیگری همان «پیدا نشد»، و سفارش خودش پیام مجوز.
    await forge('شروع چاپ', o.B.number, { action: 'cancel', from: 'paid', reason: 'چاپ نمی‌کنم' });
    await expect(heading(page, NOT_FOUND)).toBeVisible();
    await forge('شروع چاپ', D.number, { action: 'cancel', from: 'paid', reason: 'چاپ نمی‌کنم' });
    await expect(page).toHaveURL(new RegExp(`/orders/${D.number}\\?e=forbidden$`));
    await expect(alertOf(page)).toHaveText('این کار فقط با مالک پنل است.');
    // «دوباره بساز»: برگهٔ سفارش خودش ساخته نشد (بی برگه، کارش شکست‌خورده) تا فرمش باشد.
    await sql`DELETE FROM order_tickets WHERE order_id = ${D.id}`;
    await sql`UPDATE jobs SET status = 'failed', attempts = 3, last_error = 'font_missing: x', finished_at = now()
              WHERE order_id = ${D.id} AND kind = 'prepare_ticket'`;
    await page.goto(at(`/orders/${D.number}`));
    const rebuild = page.locator('form', { has: page.getByRole('button', { name: 'دوباره بساز' }) });
    await rebuild.evaluate((el, number) => {
      (el.querySelector('input[name="number"]') as HTMLInputElement).value = String(number);
    }, o.B.number);
    await rebuild.getByRole('button', { name: 'دوباره بساز' }).click();
    await expect(heading(page, NOT_FOUND)).toBeVisible();
    // هیچ‌کدام به B نرسید: همان وضعیت، همان کارها، بی رویداد؛ و D هم.
    expect(await statusOf(o.B)).toBe('paid');
    expect(await jobStatus(o.B, 'prepare_ticket')).toBe('done');
    expect(await eventsOf(o.B)).toEqual([]);
    expect(await statusOf(D)).toBe('paid');
    // شاهد: همان «دوباره بساز» روی سفارش خودش کار می‌کند.
    await page.goto(at(`/orders/${D.number}`));
    await page.getByRole('button', { name: 'دوباره بساز' }).click();
    await expect.poll(() => jobStatus(D, 'prepare_ticket'), { timeout: 60_000 }).toBe('done');
    expect(await eventsOf(D)).toEqual(['orders.ticket_rebuild']);

    // مالک و متصدی B و پرداخت‌نشده را می‌بینند، با مبلغ (مثل امروز).
    for (const staff of [ownerPage, operatorPage]) {
      for (const n of [o.B.number, o.U.number]) {
        const response = await staff.goto(at(`/orders/${n}`));
        expect(response!.status()).toBe(200);
        await expect(staff.getByRole('heading', { name: 'مبلغ' })).toBeVisible();
      }
    }
    expect(problems).toEqual([]);
  });

  test('جابه‌جایی: از همان لحظه چاپخانهٔ قبلی سفارش را ندارد و تازه دارد؛ فرم کهنهٔ «شروع چاپ» هم «پیدا نشد»', async () => {
    const { page, problems } = partner.hasan;
    // حسن سفارش D را باز کرده، با «شروع چاپ».
    await page.goto(at(`/orders/${o.D.number}`));
    await expect(side(page).getByRole('button', { name: 'شروع چاپ' })).toBeVisible();

    await ownerPage.goto(at(`/orders/${o.D.number}?do=assign`));
    const form = ownerPage.locator('form', { has: ownerPage.getByRole('button', { name: 'جابه‌جا کن' }) });
    await form.locator('.jy-tile', { hasText: AFTAB }).getByRole('radio').check();
    await form.getByLabel('دلیل').fill('دستگاه چاپ نور تا فردا خراب است.');
    await form.getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'چاپخانه', exact: true }) })).toContainText(AFTAB);
    expect(await partnerOf(o.D)).toBe(AFTAB);

    // صفحهٔ کهنه: «شروع چاپ» دیگر مال حسن نیست.
    await side(page).getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(heading(page, NOT_FOUND)).toBeVisible();
    expect(await statusOf(o.D)).toBe('paid');
    await page.goto(at('/orders?status=all'));
    await expect(page.locator('.ad-row__id')).not.toContainText([String(o.D.number)]);

    // مینا: حالا D را دارد؛ از تاریخچه فقط «به آفتاب سپرده شد»، بی دلیل و بی نام چاپ نور.
    const mina = partner.mina.page;
    await mina.goto(at(`/orders/${o.D.number}`));
    await expect(mina.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    const log = mina.locator('.ad-log');
    await expect(log.locator('li', { hasText: `به ${AFTAB} سپرده شد` })).toContainText('· سارا رضایی');
    expect(await log.innerText()).not.toContain(NOOR);
    expect(await mina.content()).not.toContain('دستگاه چاپ نور');
    await side(mina).getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(mina.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    expect(problems).toEqual([]);
    expect(partner.mina.problems).toEqual([]);
  });

  test('بخش‌های دیگر برای چاپخانه باز نیست: تعرفه، تنظیمات، چاپخانه‌ها، ادمین‌ها و رویدادها؛ مالک و متصدی مثل امروز', async () => {
    const { page, problems } = partner.hasan;
    for (const path of ['/tariff', '/tariff/1', '/settings', '/partners', '/partners/new', '/admins', '/admins/new', '/events', '/shipments/review']) {
      await page.goto(at(path));
      await expect(heading(page, NO_ACCESS), path).toBeVisible();
      await expect(page.locator('main').getByRole('link', { name: 'سفارش‌ها' })).toBeVisible();
    }
    expect(problems).toEqual([]);

    // متصدی: همهٔ سفارش‌ها و شش چیپ، با مبلغ و لغو.
    await operatorPage.goto(at('/orders?status=all'));
    await expect(operatorPage.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link')).toHaveText([
      /^باز \d+$/,
      /^تحویل پست شد \d+$/,
      /^لغو شد \d+$/,
      /^در انتظار پرداخت \d+$/,
      /^رهاشده \d+$/,
      /^همه 5$/,
    ]);
    await expect(operatorPage.locator('.ad-cols span')).toContainText(['مبلغ (تومان)']);
    await operatorPage.goto(at(`/orders/${o.B.number}`));
    await expect(side(operatorPage).getByRole('link', { name: 'لغو سفارش' })).toBeVisible();
    await expect(operatorPage.getByRole('heading', { name: 'پرداخت‌ها' })).toBeVisible();
    await operatorPage.goto(at('/admins'));
    await expect(heading(operatorPage, 'این بخش فقط برای مالک است')).toBeVisible();
  });

  test('گوشی و دسکتاپ: پنل چاپخانه، «پیدا نشد»، «باز نیست» و فرم «افزودن ادمین» بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({
    browser,
  }) => {
    for (const width of [320, 390, 1280]) {
      for (const [who, paths] of [
        [
          partner.hasan.context,
          [at(), at('/orders'), at(`/orders/${o.A.number}`), at(`/orders/${o.C.number}`), at(`/orders/${o.B.number}`), at('/settings')],
        ],
        [ownerContext, [at('/admins'), at('/admins/new'), at('/partners')]],
      ] as const) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        for (const path of paths) {
          await page.goto(path);
          if (path.endsWith('/admins/new')) await partnerRole(page).check();
          const { overflow, small, blank } = await layoutProblems(page);
          expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
          expect(small, `${width} ${path}`).toEqual([]);
          expect(blank, `${width} ${path}`).toEqual([]);
        }
        expect(problems).toEqual([]);
        await context.close();
      }
    }
  });
});
