import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { S3Driver } from '@jozveyar/storage';
import { tehranDayStart } from '@jozveyar/text';

import { alertOf, assignAtPayment, at, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * چاپخانه‌ها و تخصیص در پنل، سرتاسری (برش ۵٫۲؛ طرح `docs/ui/mockups/admin.html`، حالت‌های `m-partners`، `m-partner-edit`، `m-order`،
 * `m-order-assign` و هشدار پیشخوان؛ ADR-042): زبانهٔ «چاپخانه‌ها» فقط برای مالک (فهرست، افزودن و ویرایش نام و شهر، پیش‌فرض،
 * غیرفعال و فعال)، کارت چاپخانهٔ سفارش با «جابه‌جایی» و دلیل، برگه‌ای که با چاپخانهٔ تازه به‌روز می‌شود، سفارش بی چاپخانه (هشدار،
 * «اول چاپخانه انتخاب شود» و انتخاب)، و جابه‌جایی و «شروع چاپ» هم‌زمان در دو زبانه، که فقط یکی می‌شود.
 *
 * سفارش‌ها را مثل `status.spec.ts` خود تست با SQL می‌نشاند، با همان تخصیصی که برگشت درگاه در تراکنش پرداخت می‌نویسد
 * (`assignAtPayment` در `helpers.ts`)، و فایل چاپ را کارگر واقعی می‌سازد؛ همان متغیرها و همان کارگر لازم است (طرز اجرا بالای
 * `orders.spec.ts`). چاپخانه پاک نمی‌شود، پس نام چاپخانه‌های این تست شمارهٔ اجرا را دارد، و در پایان همان پیش از تست برمی‌گردد:
 * «چاپخانهٔ جزوه‌یار» پیش‌فرض با همان نام، و چاپخانه‌های این اجرا غیرفعال.
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
const FIRST = 'چاپخانهٔ جزوه‌یار';
const NOOR = `چاپ نور ${RUN}`;
const AFTAB = `چاپ آفتاب ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };

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
}

/**
 * سفارش پرداخت‌شده به مشهد، همان ردیف‌هایی که سرور می‌نویسد: سفارش در یک تراکنش، و برگشت موفق درگاه با رویداد، چاپخانه
 * (`assignAtPayment`، یا بی چاپخانه با `assign: false`، مثل وقتی هیچ چاپخانهٔ فعالی نبود) و کارهای `prepare_order` و
 * `prepare_ticket`. ۱۰ صفحهٔ سیاه‌سفید؛ فایلش در استوریج تا کارگر فایل چاپ را بسازد.
 */
async function paidOrder(name: string, phone: string, { assign = true } = {}): Promise<Seeded> {
  const docId = randomUUID();
  const key = `uploads/${docId}.pdf`;
  const body = readFileSync(join(FIXTURES, 'plain-bw-10.pdf'));
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲ - جلسه ۱.pdf', 'pdf', 'application/pdf', ${body.length}, ${key}, 'ready', 10,
            ${'e2e'.padEnd(64, '2')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  await upload(key, body);
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'other' } },
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
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'other',
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
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
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    if (assign) await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id) VALUES ('prepare_order', ${row!.id}), ('prepare_ticket', ${row!.id})`;
    return { number: row!.order_number, id: row!.id };
  });
}

const partnerOf = async (o: Seeded) =>
  (
    await sql<{ name: string | null }[]>`
      SELECT p.name FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id = ${o.id}`
  )[0]!.name;
const statusOf = async (o: Seeded) => (await sql<{ status: string }[]>`SELECT status::text FROM orders WHERE id = ${o.id}`)[0]!.status;
const jobStatus = async (o: Seeded, kind = 'prepare_order') =>
  (await sql<{ status: string }[]>`SELECT status FROM jobs WHERE order_id = ${o.id} AND kind = ${kind}`)[0]?.status;
const side = (page: Page) => page.locator('.ad-side');
const partnerCard = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'چاپخانه', exact: true }) });
const row = (page: Page, name: string) => page.locator(`.ad-partners li[data-partner="${name}"]`);

test.describe.serial('چاپخانه‌ها و تخصیص در پنل', () => {
  const owner = `sara${RUN}`;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  // A: جابه‌جایی مالک، و برگه. B: دو زبانه، «شروع چاپ» و جابه‌جایی. C: بی چاپخانه.
  const o = {} as Record<'A' | 'B' | 'C', Seeded>;
  const phone = (n: number) => `0915${String(RUN).slice(1)}2${String(n).repeat(3)}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    s3 = new S3Driver({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'jozveyar',
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    });
    // پایگاه دادهٔ دور‌ریختنی: شمارش «سفارش باز» هر چاپخانه فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    // همان پیش از تست: سفارش‌های این اجرا پاک (چاپخانه با سفارش باز غیرفعال نمی‌شود)، اولین چاپخانه پیش‌فرض با نام خودش، و
    // چاپخانه‌های این اجرا غیرفعال.
    if (sql) {
      await sql`DELETE FROM payments`;
      await sql`DELETE FROM orders`;
      await sql.begin(async (tx) => {
        await tx`UPDATE print_partners SET is_default = false WHERE is_default AND name <> ${FIRST}`;
        await tx`UPDATE print_partners SET is_default = true, deactivated_at = NULL
                 WHERE created_by IS NULL AND name IN (${FIRST}, ${`${FIRST} ${RUN}`})`;
        await tx`UPDATE print_partners SET name = ${FIRST} WHERE name = ${`${FIRST} ${RUN}`}`;
        await tx`UPDATE print_partners SET deactivated_at = now() WHERE name LIKE ${`% ${RUN}`} AND deactivated_at IS NULL`;
      });
    }
    await ownerContext?.close();
    await operatorContext?.close();
    await sql?.end();
  });

  test('زبانهٔ «چاپخانه‌ها» فقط برای مالک: فهرست با شهر، سفارش‌های باز و کاربرها؛ متصدی «فقط مالک»', async () => {
    await operatorPage.goto(at());
    const operatorNav = operatorPage.getByRole('navigation', { name: 'بخش‌های پنل' });
    await expect(operatorNav.getByRole('link', { name: 'چاپخانه‌ها' })).toHaveCount(0);
    await operatorPage.goto(at('/partners'));
    await expect(operatorPage.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();
    await expect(operatorPage.locator('.ad-noaccess .ad-lead')).toHaveText(
      'تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، تنظیمات، کلیدها، چاپخانه‌ها، ادمین‌ها، رویدادها، برگرداندن ورود فایل پست و گزارش ارسال با مالک پنل است.',
    );
    await operatorPage.goto(at('/partners/new'));
    await expect(operatorPage.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();

    await ownerPage.goto(at());
    const nav = ownerPage.getByRole('navigation', { name: 'بخش‌های پنل' });
    await expect(nav.locator('.ad-nav__wide')).toHaveText(['تعرفه', 'تنظیمات', 'چاپخانه‌ها', 'ادمین‌ها', 'رویدادها']);
    await nav.locator('.ad-nav__wide', { hasText: 'چاپخانه‌ها' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'چاپخانه‌ها', level: 1 })).toBeVisible();
    await expect(nav.locator('.ad-nav__wide', { hasText: 'چاپخانه‌ها' })).toHaveAttribute('aria-current', 'page');
    await expect(ownerPage.locator('.ad-sub')).toHaveText('هر سفارش هنگام پرداخت به چاپخانهٔ همان شهر می‌رود، وگرنه همان استان، وگرنه پیش‌فرض.');
    // اولین چاپخانه، از دادهٔ پایه: تهران، پیش‌فرض، و بی «غیرفعال کن» (پیش‌فرض غیرفعال نمی‌شود).
    const first = row(ownerPage, FIRST);
    await expect(first.locator('.jy-badge')).toHaveText('پیش‌فرض');
    await expect(first.locator('.ad-partners__meta')).toHaveText('تهران · 0 سفارش باز · کاربرها: همان مالک و متصدی');
    await expect(first.getByRole('link', { name: 'ویرایش' })).toBeVisible();
    await expect(first.getByRole('button')).toHaveCount(0);
    // از ۵٫۳ کاربر چاپخانه هم هست، و راهش پایین فهرست، همان طرح.
    await expect(ownerPage.locator('.ad-hint')).toHaveText(
      'چاپخانه پاک نمی‌شود، غیرفعال می‌شود: سفارش‌های قبلی به آن اشاره می‌کنند. غیرفعال کردن فقط وقتی سفارش باز ندارد. کاربر چاپخانه را از «ادمین‌ها» بساز.',
    );
    expect(ownerProblems).toEqual([]);
  });

  test('افزودن و ویرایش: نام و شهر از فهرست شهرهای سایت؛ خطا زیر همان فیلد با نوشته‌ها؛ ویرایش کهنه «همین حالا عوض شد»', async () => {
    await ownerPage.goto(at('/partners'));
    await ownerPage.getByRole('link', { name: 'افزودن چاپخانه' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'افزودن چاپخانه' })).toBeVisible();
    await expect(ownerPage.getByText('چاپخانه به‌تنهایی به کسی دسترسی نمی‌دهد؛ کاربرش را بعد از «ادمین‌ها» می‌سازی.')).toBeVisible();
    // فیلد شهر پیشنهادهای همان فهرست سایت را دارد.
    const city = ownerPage.getByLabel('شهر');
    await expect(city).toHaveAttribute('list', 'partner-cities');
    expect(await ownerPage.locator('#partner-cities option[value="مشهد، خراسان رضوی"]').count()).toBe(1);
    expect(await ownerPage.locator('#partner-cities option').count()).toBeGreaterThan(1000);

    // شهری که در فهرست نیست: خطا زیر فیلد با پیشنهادها، و نوشته‌ها می‌مانند.
    await ownerPage.getByLabel('نام').fill(`  چاپ   نور ${RUN} `);
    await city.fill('مشهدناموجود');
    await ownerPage.getByRole('button', { name: 'افزودن' }).click();
    await expect(ownerPage.locator('#p-city-error')).toContainText('این شهر در فهرست شهرهای سایت نیست؛ یکی از پیشنهادها را انتخاب کن.');
    await expect(city).toHaveAttribute('aria-invalid', 'true');
    await expect(city).toHaveValue('مشهدناموجود');
    // نام خالی (فقط فاصله؛ مرورگر `required` را با فاصله می‌پذیرد) و نام تکراری.
    await ownerPage.getByLabel('نام').fill('   ');
    await city.fill('مشهد');
    await ownerPage.getByRole('button', { name: 'افزودن' }).click();
    await expect(ownerPage.locator('#p-name-error')).toHaveText('نام چاپخانه را بنویس (حداکثر 100 نویسه).');
    await ownerPage.getByLabel('نام').fill(FIRST);
    await ownerPage.getByRole('button', { name: 'افزودن' }).click();
    await expect(ownerPage.locator('#p-name-error')).toHaveText('این نام را چاپخانهٔ دیگری دارد.');
    // نام تنهای شهری که فقط یکی است، و فاصله‌های اضافه: فارسی‌نرمال.
    await ownerPage.getByLabel('نام').fill(`  چاپ   نور ${RUN} `);
    await city.fill('مشهد');
    await ownerPage.getByRole('button', { name: 'افزودن' }).click();
    await expect(ownerPage).toHaveURL(/\/partners\?done=create/);
    await expect(ownerPage.locator('main .jy-note--success')).toHaveText(
      `چاپخانهٔ «${NOOR}» در مشهد افزوده شد؛ سفارش‌های تازهٔ همین شهر، و بعد همین استان، به آن می‌روند.`,
    );
    const noor = row(ownerPage, NOOR);
    await expect(noor.locator('.ad-partners__meta')).toHaveText('مشهد · 0 سفارش باز · کاربرها: همان مالک و متصدی');
    await expect(noor.getByRole('button')).toHaveText(['پیش‌فرض کن', 'غیرفعال کن']);

    // دومی، با گزینهٔ کامل فهرست؛ بعد ویرایش: شهر به اصفهان.
    await ownerPage.getByRole('link', { name: 'افزودن چاپخانه' }).click();
    await ownerPage.getByLabel('نام').fill(AFTAB);
    await ownerPage.getByLabel('شهر').fill('شیراز، فارس');
    await ownerPage.getByRole('button', { name: 'افزودن' }).click();
    await expect(row(ownerPage, AFTAB).locator('.ad-partners__meta')).toContainText('شیراز');
    await row(ownerPage, AFTAB).getByRole('link', { name: 'ویرایش' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'ویرایش چاپخانه' })).toBeVisible();
    await expect(ownerPage.getByLabel('نام')).toHaveValue(AFTAB);
    await expect(ownerPage.getByLabel('شهر')).toHaveValue('شیراز، فارس');
    // زبانهٔ دوم همان فرم را باز کرده و کهنه می‌ماند.
    const stale = await ownerContext.newPage();
    await stale.goto(ownerPage.url());
    await ownerPage.getByLabel('شهر').fill('اصفهان، اصفهان');
    await ownerPage.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage.locator('main .jy-note--success')).toHaveText(`«${AFTAB}» ذخیره شد.`);
    await expect(row(ownerPage, AFTAB).locator('.ad-partners__meta')).toContainText('اصفهان');
    await stale.getByLabel('نام').fill(`${AFTAB} شیراز`);
    await stale.getByRole('button', { name: 'ذخیره' }).click();
    await expect(alertOf(stale)).toHaveText(
      'این چاپخانه همین حالا جای دیگری عوض شد؛ نام و شهر تازه را ببین و اگر هنوز لازم است، دوباره ذخیره کن.',
    );
    await expect(stale.getByLabel('شهر')).toHaveValue('اصفهان، اصفهان');
    await expect(stale.getByLabel('نام')).toHaveValue(AFTAB);
    await stale.close();
    const [rows] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM print_partners WHERE name = ${`${AFTAB} شیراز`}`;
    expect(rows!.n).toBe(0);

    // رویدادها با چیپ «چاپخانه‌ها».
    await ownerPage.goto(at('/events?kind=partners'));
    await expect(ownerPage.getByRole('navigation', { name: 'نوع رویداد' }).getByRole('link', { name: 'چاپخانه‌ها' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const log = ownerPage.locator('.ad-log');
    await expect(log.getByText(`چاپخانهٔ «${NOOR}» در مشهد افزوده شد`)).toBeVisible();
    await expect(log.getByText(`چاپخانهٔ «${AFTAB}» ویرایش شد: شهر شیراز ← اصفهان`)).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('تخصیص در پرداخت و جابه‌جایی با دلیل: کارت چاپخانه، برگهٔ در حال به‌روز شدن، رویدادها؛ متصدی هم', async () => {
    o.A = await paidOrder('مریم کاظمی', phone(1));
    expect(await partnerOf(o.A)).toBe(NOOR);
    // کار برگه در دست «کارگر دیگری»، تا «در حال به‌روز شدن» قطعی دیده شود (مثل `print.spec.ts`)؛ و فایل چاپ را کارگر واقعی می‌سازد.
    await expect.poll(() => jobStatus(o.A), { timeout: 60_000 }).toBe('done');
    await expect.poll(() => jobStatus(o.A, 'prepare_ticket'), { timeout: 60_000 }).toBe('done');

    await ownerPage.goto(at(`/orders/${o.A.number}`));
    const card = partnerCard(ownerPage);
    await expect(card.locator('.ad-partner b')).toHaveText(NOOR);
    await expect(card.locator('.ad-partner .ad-meta')).toHaveText('مشهد');
    await expect(card.locator('p.ad-meta')).toHaveText('خودکار، هنگام پرداخت: هم‌شهر مشتری.');
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: `به ${NOOR} سپرده شد، هم‌شهر مشتری` })).toContainText('· سیستم');
    await expect(ownerPage.locator('[data-ticket="ready"]')).toBeVisible();

    await card.getByRole('link', { name: 'جابه‌جایی' }).click();
    await expect(ownerPage).toHaveURL(/\?do=assign$/);
    const form = ownerPage.locator('[data-assign]');
    await expect(form.getByRole('heading', { name: 'جابه‌جایی چاپخانه' })).toBeVisible();
    await expect(form.locator('.ad-meta').first()).toHaveText(`امروز: ${NOOR}، مشهد`);
    await expect(form.locator('.jy-note--info')).toHaveText(
      `فقط پیش از «شروع چاپ». از همین لحظه ${NOOR} این سفارش را نمی‌بیند و چاپخانهٔ تازه آن را در صفش می‌بیند. کرایهٔ مشتری عوض نمی‌شود.`,
    );
    // گزینه‌ها: فقط فعال‌ها جز همین، پیش‌فرض اول و انتخاب‌شده، با شهر و سفارش باز.
    const tiles = form.locator('.jy-tile');
    await expect(tiles.locator('.jy-tile__title')).toHaveText([FIRST, AFTAB]);
    await expect(tiles.first().locator('.jy-tile__note')).toHaveText('تهران · پیش‌فرض · 0 سفارش باز');
    await expect(tiles.first().locator('input')).toBeChecked();
    // کارهای وضعیت پشت فرم پنهان‌اند، مثل طرح.
    await expect(ownerPage.locator('.ad-status').getByRole('button', { name: 'شروع چاپ' })).toHaveCount(0);
    // دلیل فقط فاصله: همان‌جا.
    await form.getByLabel('دلیل').fill('   ');
    await form.getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(form.locator('.jy-error')).toHaveText('دلیل را بنویس.');
    expect(await partnerOf(o.A)).toBe(NOOR);
    // برگه در دست «کارگر دیگری»: جابه‌جایی آن را دوباره در صف نمی‌گذارد و «در حال به‌روز شدن» قطعی است.
    await sql`UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_by = 'e2e', locked_until = now() + interval '1 hour'
              WHERE order_id = ${o.A.id} AND kind = 'prepare_ticket'`;
    await form.getByLabel('دلیل').fill('دستگاه چاپ نور تا فردا خراب است.');
    await form.getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${o.A.number}$`));
    await expect(card.locator('.ad-partner b')).toHaveText(FIRST);
    await expect(card.locator('p.ad-meta')).toHaveText('جابه‌جا شد، سارا رضایی: دستگاه چاپ نور تا فردا خراب است.');
    expect(await partnerOf(o.A)).toBe(FIRST);
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: `از «${NOOR}» به «${FIRST}» رفت؛ دستگاه چاپ نور تا فردا خراب است.` })).toContainText(
      '· سارا رضایی',
    );
    // برگه: نام و شهر چاپخانه روی آن است، پس کهنه شد و از هیچ راهی داده نمی‌شود تا کارگر برگهٔ تازه را بسازد.
    const ticket = ownerPage.locator('[data-ticket]');
    await expect(ticket).toHaveAttribute('data-ticket', 'updating');
    await expect(ticket.locator('.ad-print__meta')).toHaveText('در حال به‌روز شدن با چاپخانهٔ تازه…');
    await ownerPage.goto(at(`/orders/${o.A.number}/ticket`));
    await expect(ownerPage.locator('[data-ticket="updating"] .ad-lead')).toHaveText(
      'برگه با چاپخانهٔ تازه در حال به‌روز شدن است؛ چند ثانیهٔ دیگر دوباره باز کن.',
    );
    // اجاره تمام شد: کارگر واقعی برگه را با چاپخانهٔ تازه می‌سازد.
    await sql`UPDATE jobs SET status = 'queued', locked_by = NULL, locked_until = NULL WHERE order_id = ${o.A.id} AND kind = 'prepare_ticket'`;
    await expect
      .poll(async () => (await sql<{ fresh: boolean }[]>`
          SELECT t.stamp = order_ticket_stamp(o) AS fresh FROM order_tickets t JOIN orders o ON o.id = t.order_id WHERE t.order_id = ${o.A.id}`)[0]
          ?.fresh, { timeout: 60_000 })
      .toBe(true);
    await ownerPage.goto(at(`/orders/${o.A.number}`));
    await expect(ownerPage.locator('[data-ticket="ready"]')).toBeVisible();

    // متصدی هم جابه‌جا می‌کند (`orders.assign`)؛ رویداد با نام او.
    await operatorPage.goto(at(`/orders/${o.A.number}`));
    await partnerCard(operatorPage).getByRole('link', { name: 'جابه‌جایی' }).click();
    const operatorForm = operatorPage.locator('[data-assign]');
    await operatorForm.getByLabel(AFTAB).check();
    await operatorForm.getByLabel('دلیل').fill('برگشت به چاپخانهٔ نزدیک‌تر.');
    await operatorForm.getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(partnerCard(operatorPage).locator('.ad-partner b')).toHaveText(AFTAB);
    const [assignments] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM order_assignments WHERE order_id = ${o.A.id}`;
    expect(assignments!.n).toBe(3);
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(
      ownerPage.locator('.ad-log li').filter({ hasText: `سفارش ${o.A.number} از «${FIRST}» به «${AFTAB}» رفت؛ برگشت به چاپخانهٔ نزدیک‌تر.` }),
    ).toContainText('علی محمدی');
    expect(ownerProblems).toEqual([]);
  });

  test('جابه‌جایی و «شروع چاپ» هم‌زمان در دو زبانه فقط یکی می‌شوند، هر کدام با پیام روشن', async () => {
    o.B = await paidOrder('زهرا محمدی', phone(2));
    await expect.poll(() => jobStatus(o.B), { timeout: 60_000 }).toBe('done');
    // زبانهٔ اول «شروع چاپ» را می‌بیند؛ زبانهٔ دوم فرم جابه‌جایی را.
    await ownerPage.goto(at(`/orders/${o.B.number}`));
    const second = await ownerContext.newPage();
    await second.goto(at(`/orders/${o.B.number}?do=assign`));
    await second.locator('[data-assign]').getByLabel('دلیل').fill('آزمون هم‌زمانی');
    await second.locator('[data-assign]').getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(partnerCard(second).locator('.ad-partner b')).toHaveText(FIRST);
    // «شروع چاپ» از چاپخانه‌ای که صفحه نشان داد، که دیگر نیست: انجام نمی‌شود.
    await ownerPage.locator('.ad-status').getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(ownerPage).toHaveURL(/\?e=order_partner_changed$/);
    await expect(alertOf(ownerPage)).toHaveText('چاپخانهٔ این سفارش همین حالا عوض شد؛ چاپخانهٔ تازه را ببین و اگر هنوز لازم است، دوباره بزن.');
    expect(await statusOf(o.B)).toBe('paid');
    await expect(partnerCard(ownerPage).locator('.ad-partner b')).toHaveText(FIRST);

    // وارونه: زبانهٔ دوم فرم جابه‌جایی را باز کرده، و زبانهٔ اول چاپ را شروع می‌کند.
    await second.goto(at(`/orders/${o.B.number}?do=assign`));
    await second.locator('[data-assign]').getByLabel('دلیل').fill('دیر شد');
    await ownerPage.locator('.ad-status').getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    await second.locator('[data-assign]').getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(second).toHaveURL(/\?e=assign_closed$/);
    await expect(alertOf(second)).toHaveText('چاپخانه فقط پیش از «شروع چاپ» عوض می‌شود؛ این سفارش دیگر در صف چاپ نیست.');
    // «در حال چاپ»: دیگر «جابه‌جایی» ندارد؛ چاپخانه همان.
    await expect(partnerCard(second).getByRole('link', { name: 'جابه‌جایی' })).toHaveCount(0);
    expect(await partnerOf(o.B)).toBe(FIRST);
    const [moves] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM order_assignments WHERE order_id = ${o.B.id}`;
    expect(moves!.n).toBe(2);
    await second.close();
    expect(ownerProblems).toEqual([]);
  });

  test('بی چاپخانه: هشدار پیشخوان و ردیف، «اول چاپخانه انتخاب شود»، و انتخاب با دلیل', async () => {
    o.C = await paidOrder('امیر حسینی', phone(3), { assign: false });
    await expect.poll(() => jobStatus(o.C), { timeout: 60_000 }).toBe('done');
    await ownerPage.goto(at());
    const alert = ownerPage.locator('[data-alert="partner"]');
    await expect(alert).toHaveText(`سفارش ${o.C.number} چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود. یکی را برایش انتخاب کن.`);
    await expect(alert.locator('.jy-icon-warning')).toHaveCount(1);
    await ownerPage.goto(at('/orders'));
    await expect(ownerPage.locator(`.ad-row[data-order="${o.C.number}"] .ad-row__state`)).toHaveText('بی چاپخانه');
    await expect(ownerPage.locator(`.ad-row[data-order="${o.C.number}"] .ad-row__state .jy-icon-warning`)).toHaveCount(1);

    await ownerPage.goto(at());
    await alert.getByRole('link', { name: String(o.C.number) }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${o.C.number}\\?do=assign$`));
    const form = ownerPage.locator('[data-assign]');
    await expect(form.getByRole('heading', { name: 'انتخاب چاپخانه' })).toBeVisible();
    await expect(form.locator('.ad-meta').first()).toHaveText('این سفارش چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود.');
    await ownerPage.goto(at(`/orders/${o.C.number}`));
    await expect(partnerCard(ownerPage).locator('.jy-note--warning')).toHaveText(
      'این سفارش چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود. یکی را برایش انتخاب کن.',
    );
    const blocked = ownerPage.locator('.ad-status').getByRole('button', { name: 'اول چاپخانه انتخاب شود' });
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(ownerPage.locator('.ad-status').getByRole('button', { name: 'شروع چاپ' })).toHaveCount(0);

    await partnerCard(ownerPage).getByRole('link', { name: 'انتخاب' }).click();
    await form.getByLabel('دلیل').fill('چاپخانهٔ تازه اضافه شد.');
    await form.getByRole('button', { name: 'بسپار' }).click();
    await expect(partnerCard(ownerPage).locator('.ad-partner b')).toHaveText(FIRST);
    await expect(partnerCard(ownerPage).locator('p.ad-meta')).toHaveText('دستی سپرده شد، سارا رضایی: چاپخانهٔ تازه اضافه شد.');
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: `به ${FIRST} سپرده شد؛ چاپخانهٔ تازه اضافه شد.` })).toContainText('· سارا رضایی');
    await expect(ownerPage.locator('.ad-status').getByRole('button', { name: 'شروع چاپ' })).toBeVisible();
    await ownerPage.goto(at());
    await expect(ownerPage.locator('[data-alert="partner"]')).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });

  test('پیش‌فرض کن در خود فهرست؛ غیرفعال فقط بی سفارش باز، حتی از فهرست کهنه؛ فعال کن؛ و نام تازهٔ چاپخانه برگه را به‌روز می‌کند', async () => {
    await ownerPage.goto(at('/partners'));
    // A پیش چاپ آفتاب است (باز)، B و C پیش اولین چاپخانه؛ چاپ نور سفارش باز ندارد.
    await expect(row(ownerPage, AFTAB).locator('.ad-partners__meta')).toHaveText('اصفهان · 1 سفارش باز · کاربرها: همان مالک و متصدی');
    await expect(row(ownerPage, AFTAB).getByRole('button')).toHaveText(['پیش‌فرض کن']);
    await row(ownerPage, NOOR).getByRole('button', { name: 'پیش‌فرض کن' }).click();
    await expect(ownerPage.locator('main .jy-note--success')).toHaveText(
      `«${NOOR}» حالا پیش‌فرض است: سفارشی که در شهر و استانش چاپخانه‌ای نیست، به آن می‌رود.`,
    );
    await expect(row(ownerPage, NOOR).locator('.jy-badge')).toHaveText('پیش‌فرض');
    await expect(row(ownerPage, FIRST).locator('.jy-badge')).toHaveCount(0);
    await expect(row(ownerPage, NOOR).getByRole('button')).toHaveCount(0);
    // اولی دیگر پیش‌فرض نیست ولی سفارش باز دارد: «غیرفعال کن» ندارد.
    await expect(row(ownerPage, FIRST).getByRole('button')).toHaveText(['پیش‌فرض کن']);
    await row(ownerPage, FIRST).getByRole('button', { name: 'پیش‌فرض کن' }).click();
    await expect(row(ownerPage, FIRST).locator('.jy-badge')).toHaveText('پیش‌فرض');

    // فهرست کهنه: «غیرفعال کن» برای چاپ نور دیده می‌شود، ولی همین حالا سفارشی به آن رفت.
    await expect(row(ownerPage, NOOR).getByRole('button', { name: 'غیرفعال کن' })).toBeVisible();
    const D = await paidOrder('نگار صادقی', phone(4));
    expect(await partnerOf(D)).toBe(NOOR);
    await row(ownerPage, NOOR).getByRole('button', { name: 'غیرفعال کن' }).click();
    await expect(alertOf(ownerPage)).toHaveText(
      'این چاپخانه سفارش باز دارد و غیرفعال نمی‌شود؛ اول سفارش‌هایش را جابه‌جا کن یا به پست برسان.',
    );
    await expect(row(ownerPage, NOOR).locator('.jy-badge')).toHaveCount(0);
    // شاهد: پس از جابه‌جایی سفارشش، غیرفعال می‌شود؛ و «فعال کن» برمی‌گرداندش.
    await ownerPage.goto(at(`/orders/${D.number}?do=assign`));
    await ownerPage.locator('[data-assign]').getByLabel('دلیل').fill('چاپ نور تعطیل است.');
    await ownerPage.locator('[data-assign]').getByRole('button', { name: 'جابه‌جا کن' }).click();
    await expect(partnerCard(ownerPage).locator('.ad-partner b')).toHaveText(FIRST);
    await ownerPage.goto(at('/partners'));
    await row(ownerPage, NOOR).getByRole('button', { name: 'غیرفعال کن' }).click();
    await expect(ownerPage.locator('main .jy-note--success')).toHaveText(`«${NOOR}» غیرفعال شد؛ از این لحظه سفارش تازه نمی‌گیرد.`);
    await expect(row(ownerPage, NOOR).locator('.jy-badge')).toHaveText('غیرفعال');
    await expect(row(ownerPage, NOOR).locator('.ad-partners__meta')).toHaveText(/^مشهد · از \d{4}\/\d\d\/\d\d سفارش تازه نمی‌گیرد$/);
    await expect(row(ownerPage, NOOR).getByRole('button')).toHaveText(['فعال کن']);
    // غیرفعال سفارش تازه نمی‌گیرد: سفارش مشهد به پیش‌فرض می‌رود.
    const E = await paidOrder('کیوان احمدی', phone(5));
    expect(await partnerOf(E)).toBe(FIRST);
    await row(ownerPage, NOOR).getByRole('button', { name: 'فعال کن' }).click();
    await expect(ownerPage.locator('main .jy-note--success')).toHaveText(`«${NOOR}» دوباره فعال شد.`);
    await expect(row(ownerPage, NOOR).locator('.jy-badge')).toHaveCount(0);

    // نام تازهٔ اولین چاپخانه روی برگهٔ سفارش‌های بازش: برگه دوباره ساخته می‌شود.
    await expect.poll(() => jobStatus(E, 'prepare_ticket'), { timeout: 60_000 }).toBe('done');
    await row(ownerPage, FIRST).getByRole('link', { name: 'ویرایش' }).click();
    await ownerPage.getByLabel('نام').fill(`${FIRST} ${RUN}`);
    await ownerPage.getByRole('button', { name: 'ذخیره' }).click();
    await expect(row(ownerPage, `${FIRST} ${RUN}`).locator('.jy-badge')).toHaveText('پیش‌فرض');
    await expect
      .poll(async () => (await sql<{ fresh: boolean }[]>`
          SELECT t.stamp = order_ticket_stamp(o) AS fresh FROM order_tickets t JOIN orders o ON o.id = t.order_id WHERE t.order_id = ${E.id}`)[0]
          ?.fresh, { timeout: 60_000 })
      .toBe(true);
    const [built] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM admin_events WHERE action = 'partners.update' AND detail ->> 'name' = ${`${FIRST} ${RUN}`}`;
    expect(built!.n).toBe(1);

    await ownerPage.goto(at('/events?kind=partners'));
    const log = ownerPage.locator('.ad-log');
    await expect(log.getByText(`چاپخانهٔ «${NOOR}» پیش‌فرض شد، به جای «${FIRST}»`)).toBeVisible();
    await expect(log.getByText(`چاپخانهٔ «${NOOR}» غیرفعال شد`)).toBeVisible();
    await expect(log.getByText(`چاپخانهٔ «${NOOR}» دوباره فعال شد`)).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: فهرست، فرم، کارت چاپخانه، جابه‌جایی و هشدار بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({ browser }) => {
    const F = await paidOrder('الهام یزدانی', phone(6), { assign: false });
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      const edit = await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE name = ${AFTAB}`;
      for (const path of [
        at('/partners'),
        at('/partners/new'),
        at(`/partners/${edit[0]!.id}`),
        at(`/orders/${o.A.number}`),
        at(`/orders/${o.A.number}?do=assign`),
        at(`/orders/${F.number}`),
        at(`/orders/${F.number}?do=assign`),
        at('/orders'),
        at(),
      ]) {
        await page.goto(path);
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
