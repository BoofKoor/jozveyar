import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { S3Driver } from '@jozveyar/storage';
import { formatTomans, tehranDayStart } from '@jozveyar/text';

import { at, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * سفارش‌ها در پنل، سرتاسری (برش ۴٫۲؛ طرح `docs/ui/mockups/admin.html`، ADR-039): پیشخوان با کاشی‌های مهلت و
 * هشدارها، فهرست با چیپ و جست‌وجو، جزئیات، دانلود فایل چاپ (از ۵٫۱) و PDF اصلی جزوه از استوریج داخلی، و «دوباره بساز» وقتی
 * کارگر نتوانست. خود فایل چاپ چندجلدی، برگهٔ سفارش و فایل‌های پاک‌شده در `print.spec.ts`.
 *
 * سفارش‌ها را خود تست می‌نشاند، با همان ردیف‌هایی که سرور می‌نویسد (سفارش در یک تراکنش، و برگشت موفق درگاه با
 * رویداد و کار `prepare_order`)، با SQL مثل تست‌های مسیر خرید سایت: Playwright ماژول ESM `@jozveyar/db` را بار
 * نمی‌کند. محافظ‌های پایگاه داده (پوشش صفحه، قیمت منجمد) همان‌ها را می‌سنجند. فایل‌ها با همان پروتکل آپلود مرورگر به
 * Garage می‌روند، و PDF جزوه را **کارگر واقعی** می‌سازد. پس علاوه بر `admin.spec.ts`، استوریج و کارگر هم لازم است:
 *
 *   (متغیرهای `admin.spec.ts`) S3_ENDPOINT=… S3_BUCKET=… S3_ACCESS_KEY=… S3_SECRET_KEY=…
 *   کارگر روی همان پایگاه داده و استوریج: (از services/docworker) DOCWORKER_POLL_SECONDS=0.5 python -m docworker
 *   PDFهای نمونه: pnpm fixtures
 *
 * پایگاه داده دور‌ریختنی است (در CI `jy_admin`): تست اول سفارش‌های قبلی را پاک می‌کند تا شمارش‌ها صریح باشند.
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
const fixture = (name: string) => readFileSync(join(FIXTURES, name));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

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

/** سند آماده با شمارش سرور، فایلش دو روز روی سرور؛ خود فایل فقط اگر `body` هست به استوریج می‌رود. */
async function document(name: string, pages: number, body: Buffer | null) {
  const id = randomUUID();
  const key = `uploads/${id}.pdf`;
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${id}, ${name}, 'pdf', 'application/pdf', ${body?.length ?? 1_000}, ${key}, 'ready', ${pages},
            ${'e2e'.padEnd(64, '0')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  if (body) await upload(key, body);
  return { id, key, pages };
}

interface Seeded {
  number: number;
  id: string;
  totalRials: number;
  phone: string;
}

/** سفارش همان‌طور که سرور می‌سازد: قیمت `quote()` با تعرفهٔ پایه و یک قاعده برای کل جزوه، در یک تراکنش. */
async function order(
  docs: { id: string; pages: number }[],
  who: { name: string; phone: string; provinceId: number; cityId: number | null; zoneId: 'tehran' | 'other' },
): Promise<Seeded> {
  const sections = docs.map((d) => ({ documentId: d.id, pageCount: d.pages }));
  const pageCount = sections.reduce((sum, s) => sum + s.pageCount, 0);
  const rules = [{ pageRanges: [[1, pageCount]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    {
      items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }],
      shipping: { methodId: 'post', zoneId: who.zoneId },
    },
    SEED_PRICE_LIST,
  );
  // دو ساعت پیش، پیش از پرداخت (`pay`) و تلاش درگاه (`attempt`)، تا رویدادهای سفارش به ترتیب واقعی باشند.
  const createdAt = new Date(Date.now() - 2 * 60 * MINUTE);
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${who.phone})
      ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number; total_rials: string }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', ${who.zoneId},
              ${who.provinceId}, ${who.cityId}, ${who.name}, ${who.phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
              ${createdAt})
      RETURNING id, order_number, total_rials`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, ${pageCount}, 1, 'double', 'spiral_clear') RETURNING id`;
    for (const [i, s] of sections.entries()) {
      await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count)
               VALUES (${item!.id}, ${i + 1}, ${s.documentId}, ${s.pageCount})`;
    }
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    return { number: row!.order_number, id: row!.id, totalRials: Number(row!.total_rials), phone: who.phone };
  });
}

/** تلاش پرداخت درگاه نمونه که هنوز در انتظار است، با زمان ساختن دلخواه. */
async function attempt(o: Seeded, createdAt: Date) {
  await sql`INSERT INTO payments (order_id, provider, amount_rials, authority, created_at)
            VALUES (${o.id}, 'mock', ${o.totalRials}, ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`}, ${createdAt})`;
}

/** پرداخت موفق، مثل برگشت درگاه (`settlePayment`): در یک تراکنش پرداخت، سفارش با مهلت، رویداد، و کارهای `prepare_order` و `prepare_ticket`. */
async function pay(o: Seeded, due: Date) {
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  await sql.begin(async (tx) => {
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${o.id}, 'mock', ${o.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${due} WHERE id = ${o.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${o.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await tx`INSERT INTO jobs (kind, order_id) VALUES ('prepare_order', ${o.id}), ('prepare_ticket', ${o.id})`;
  });
}

/** سفارش در انتظاری که فایلش رفت، مثل `expireOrder`. */
async function expire(o: Seeded) {
  await sql.begin(async (tx) => {
    await tx`UPDATE orders SET status = 'expired' WHERE id = ${o.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, actor, note)
             VALUES (${o.id}, 'awaiting_payment', 'expired', 'system', ${tx.json({ reason: 'files_expiring' })})`;
  });
}

const jobStatus = async (o: Seeded) =>
  (await sql<{ status: string }[]>`SELECT status FROM jobs WHERE order_id = ${o.id} AND kind = 'prepare_order'`)[0]?.status;

const rowNumbers = (page: Page) =>
  page.locator('.ad-row').evaluateAll((rows) => rows.map((row) => Number((row as HTMLElement).dataset.order)));

test.describe.serial('سفارش‌ها در پنل', () => {
  const owner = `sara${RUN}`;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  // A: دو فایل، مهلت امروز. B: فایلش هنوز به استوریج نرسیده، دیر شده. E: بعدتر. C: در انتظار با تلاش بی برگشت. D: رهاشده.
  const o = {} as Record<'A' | 'B' | 'C' | 'D' | 'E', Seeded>;
  let missing: { key: string; body: Buffer };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // مهلت «امروز» تا نیمه‌شب تهران است؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند تا کاشی‌ها وسط تست جابه‌جا نشوند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 3 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));

    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    s3 = new S3Driver({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'jozveyar',
      accessKeyId: env.S3_ACCESS_KEY!,
      secretAccessKey: env.S3_SECRET_KEY!,
    });
    // پایگاه دادهٔ دور‌ریختنی: شمارش کاشی‌ها و چیپ‌ها فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;

    const bw10 = fixture('plain-bw-10.pdf');
    const color10 = fixture('mixed-color-10.pdf');
    const dpi4 = fixture('dpi-mix-4.pdf');
    // ته هر موبایل یکتاست و رقم پنجم از آخر صفر: جست‌وجوی شمارهٔ پنج‌رقمی سفارش به موبایل سفارش دیگری نمی‌خورد.
    const phone = (n: number) => `0915${String(RUN).slice(1)}0${String(n).repeat(3)}`;
    const tehran = { provinceId: 8, cityId: 394, zoneId: 'tehran' as const };
    o.A = await order(
      [await document('ریاضی ۲ - جلسه ۱.pdf', 10, bw10), await document('ریاضی ۲ - جلسه ۲.pdf', 10, color10)],
      { name: 'مریم کاظمی', phone: phone(1), provinceId: 11, cityId: 1326, zoneId: 'other' },
    );
    const late = await document('فیزیک پایه - فصل ۱.pdf', 4, null);
    missing = { key: late.key, body: dpi4 };
    o.B = await order([late], { name: 'زهرا محمدی', phone: phone(2), ...tehran });
    o.E = await order([await document('آمار - فصل ۳.pdf', 10, bw10)], { name: 'پارسا امینی', phone: phone(3), ...tehran });
    o.C = await order([await document('شیمی - جلسه ۵.pdf', 10, bw10)], {
      name: 'کیان رستمی',
      phone: phone(4),
      provinceId: 1,
      cityId: null,
      zoneId: 'other',
    });
    o.D = await order([await document('زیست - جلسه ۱.pdf', 10, bw10)], { name: 'فاطمه نوری', phone: phone(5), ...tehran });

    const now = new Date();
    await pay(o.B, tehranDayStart(now)); // پایان دیروز: دیر شده
    await pay(o.A, tehranDayStart(now, 1)); // پایان امروز
    await pay(o.E, tehranDayStart(now, 5)); // بعدتر
    await attempt(o.C, new Date(now.getTime() - 40 * MINUTE)); // بیش از نیم ساعت: بی برگشت
    await expire(o.D);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    // کارگر واقعی: A و E ساخته می‌شوند؛ B با «فایل پیدا نشد» می‌افتد (شکست قطعی، تلاش اول).
    await expect.poll(() => jobStatus(o.B), { timeout: 60_000 }).toBe('failed');
    await expect.poll(() => jobStatus(o.A), { timeout: 60_000 }).toBe('done');
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await sql?.end();
  });

  test('پیشخوان: چهار کاشی مهلت به روز تهران، هشدار PDF و پرداخت بی برگشت، صف تحویل به ترتیب مهلت', async () => {
    await ownerPage.goto(at());
    const tile = (kind: string) => ownerPage.locator(`.ad-tile[data-due="${kind}"]`);
    await expect(tile('overdue')).toContainText('دیر شده');
    await expect(tile('overdue').locator('.ad-tile__n')).toHaveText('1');
    await expect(tile('overdue').locator('.ad-tile__t')).toHaveText('مهلتش دیروز تمام شد');
    await expect(tile('today').locator('.ad-tile__n')).toHaveText('1');
    await expect(tile('today').locator('.ad-tile__t')).toContainText('تا پایان امروز، ');
    await expect(tile('tomorrow').locator('.ad-tile__n')).toHaveText('0');
    await expect(tile('later').locator('.ad-tile__n')).toHaveText('1');
    await expect(ownerPage.getByText('تعهد: 2 روز کاری بعد از پرداخت.')).toBeVisible();

    const pdfAlert = ownerPage.locator('[data-alert="pdf"]');
    await expect(pdfAlert).toHaveText(`PDF جزوهٔ سفارش ${o.B.number} ساخته نشد؛ پیش از چاپ دوباره بسازش.`);
    await expect(pdfAlert.getByRole('link')).toHaveAttribute('href', at(`/orders/${o.B.number}`));
    const payAlert = ownerPage.locator('[data-alert="unreturned"]');
    await expect(payAlert).toHaveText('1 تلاش پرداخت از درگاه برنگشت.');
    await expect(payAlert.getByRole('link')).toHaveAttribute('href', at(`/orders/${o.C.number}`));

    const queue = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'صف تحویل به پست' }) });
    expect(await rowNumbers(ownerPage)).toEqual([o.B.number, o.A.number, o.E.number]);
    const rowB = queue.locator(`.ad-row[data-order="${o.B.number}"]`);
    await expect(rowB.locator('.ad-row__state')).toHaveText('PDF ساخته نشد');
    await expect(rowB.locator('.ad-row__due')).toHaveText('دیر شده');
    const rowA = queue.locator(`.ad-row[data-order="${o.A.number}"]`);
    await expect(rowA.locator('.ad-row__what')).toHaveText('2 فایل · 20 صفحه · سیاه‌سفید');
    await expect(rowA.locator('.ad-row__who')).toHaveText('مریم کاظمی مشهد');
    await expect(rowA.locator('.ad-row__sum .num')).toHaveText(formatTomans(o.A.totalRials, false));
    await expect(rowA.locator('.ad-row__due')).toHaveText('امروز');
    expect(ownerProblems).toEqual([]);
  });

  test('سفارش‌ها: چیپ‌ها با شمار، «باز» به ترتیب مهلت، جست‌وجوی شماره و موبایل و نام در همه', async () => {
    await ownerPage.goto(at('/orders'));
    const chips = ownerPage.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link');
    await expect(chips).toHaveText(['باز 3', 'تحویل پست شد 0', 'لغو شد 0', 'در انتظار پرداخت 1', 'رهاشده 1', 'همه 5']);
    await expect(chips.first()).toHaveAttribute('aria-current', 'page');
    expect(await rowNumbers(ownerPage)).toEqual([o.B.number, o.A.number, o.E.number]);

    await chips.filter({ hasText: 'در انتظار پرداخت' }).click();
    await expect(ownerPage).toHaveURL(/status=awaiting/);
    expect(await rowNumbers(ownerPage)).toEqual([o.C.number]);
    const rowC = ownerPage.locator(`.ad-row[data-order="${o.C.number}"]`);
    await expect(rowC.locator('.ad-row__state')).toHaveText('پرداخت بی برگشت');
    await expect(rowC.locator('.ad-row__who')).toHaveText('کیان رستمی آذربایجان شرقی');
    await ownerPage.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link', { name: /^رهاشده/ }).click();
    await expect(ownerPage).toHaveURL(/status=abandoned/);
    expect(await rowNumbers(ownerPage)).toEqual([o.D.number]);

    // هر جست‌وجو صفحهٔ تازه است؛ `poll` تا رسیدنش صبر می‌کند، نه ردیف‌های صفحهٔ قبل را بخواند.
    const search = ownerPage.getByRole('searchbox', { name: 'جست‌وجوی سفارش' });
    await search.fill(String(o.A.number));
    await search.press('Enter');
    await expect(ownerPage).toHaveURL(new RegExp(`q=${o.A.number}`));
    expect(await rowNumbers(ownerPage)).toEqual([o.A.number]);
    await expect(chips).toHaveText(['باز 1', 'تحویل پست شد 0', 'لغو شد 0', 'در انتظار پرداخت 0', 'رهاشده 0', 'همه 1']);
    await expect(chips.last()).toHaveAttribute('aria-current', 'page');
    // ته موبایل با ارقام فارسی، و نام.
    const persian = o.C.phone.slice(-7).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    await search.fill(persian);
    await search.press('Enter');
    await expect.poll(() => rowNumbers(ownerPage)).toEqual([o.C.number]);
    await search.fill('محمدی');
    await search.press('Enter');
    await expect.poll(() => rowNumbers(ownerPage)).toEqual([o.B.number]);
    await search.fill('ناموجود');
    await search.press('Enter');
    await expect(ownerPage.locator('.ad-empty')).toHaveText('سفارشی با «ناموجود» پیدا نشد.');
    expect(ownerProblems).toEqual([]);
  });

  test('جزئیات و دانلود فایل چاپ و PDF اصلی جزوه از استوریج داخلی، با رویدادشان', async () => {
    await ownerPage.goto(at('/orders'));
    await ownerPage.locator(`.ad-row[data-order="${o.A.number}"]`).click();
    await expect(ownerPage.getByRole('heading', { name: `سفارش ${o.A.number}` })).toBeVisible();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    await expect(ownerPage.locator('.ad-status .jy-card__title')).toHaveText('تحویل به پست تا امروز');
    await expect(ownerPage.locator('.ad-files li')).toHaveText(['1ریاضی ۲ - جلسه ۱.pdf10 صفحه', '2ریاضی ۲ - جلسه ۲.pdf10 صفحه']);
    await expect(ownerPage.locator('.ad-spec dd')).toHaveText(['سیاه‌سفید، دورو · تحریر ۸۰ گرم', 'طلق و سیم · 20 صفحه، 10 برگ، یک جلد', '1 نسخه']);
    await expect(ownerPage.locator('.ad-sum__total')).toHaveText(`پرداخت شد${formatTomans(o.A.totalRials)}`);
    await expect(ownerPage.locator('.ad-facts dd').filter({ hasText: 'خراسان رضوی' })).toHaveText(
      'خراسان رضوی، مشهد، بلوار سجاد، سجاد 18، پلاک 42، واحد 6',
    );

    // دو PDF همه A4 عمودی، یک جلد: فایل چاپ خود PDF جزوه است (ADR-043)، بی «PDF اصلی» جدا.
    const print = ownerPage.locator('[data-print="ready"]');
    await expect(print.locator('.ad-pdf__name')).toHaveText(`jozve-${o.A.number}-1.pdf`);
    await expect(print.locator('.ad-print__meta')).toContainText('فایل چاپ · 20 صفحه، A4 عمودی، یک جلد');
    await expect(print.locator('.ad-print__orig')).toHaveText('همهٔ صفحه‌ها A4 عمودی بود؛ فایل چاپ همان PDF جزوه است.');
    const [download] = await Promise.all([ownerPage.waitForEvent('download'), print.getByRole('link', { name: 'دانلود' }).click()]);
    expect(download.suggestedFilename()).toBe(`jozve-${o.A.number}-1.pdf`);
    const bytes = readFileSync((await download.path())!);
    const [item] = await sql<{ sha: string; bytes: string; printSha: string }[]>`
      SELECT i.print_pdf_sha256 AS sha, i.print_pdf_bytes::text AS bytes, f.sha256 AS "printSha"
        FROM order_items i JOIN order_print_files f ON f.order_item_id = i.id WHERE i.order_id = ${o.A.id}`;
    // همان بایت‌هایی که کارگر ساخت و اثر انگشتش را نوشت؛ فایل چاپ و PDF جزوه یکی.
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(sha256(bytes)).toBe(item!.printSha);
    expect(item!.printSha).toBe(item!.sha);
    expect(String(bytes.length)).toBe(item!.bytes);

    // PDF اصلی جزوه از راه خودش، با نام خودش. سرآیندها: پیوست، بی کش، بی بافر Nginx؛ و بی نشست به صفحهٔ ورود، نه فایل.
    const direct = await ownerContext.request.get(at(`/orders/${o.A.number}/pdf/1`));
    expect(direct.headers()).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="jozve-${o.A.number}-1-asli.pdf"; filename*=UTF-8''jozve-${o.A.number}-1-asli.pdf`,
      'x-accel-buffering': 'no',
    });
    expect(direct.headers()['cache-control']).toContain('no-store');
    expect(sha256(await direct.body())).toBe(item!.sha);
    const anonymous = await (await newContext(ownerPage.context().browser()!)).request.get(at(`/orders/${o.A.number}/pdf/1`), {
      maxRedirects: 0,
    });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers().location).toContain(at('/login'));

    await ownerPage.reload();
    const log = ownerPage.locator('.ad-log');
    await expect(log.locator('li').filter({ hasText: 'فایل چاپ دانلود شد' })).toContainText('· سارا رضایی');
    await expect(log.locator('li').filter({ hasText: 'PDF اصلی جزوه دانلود شد' })).toContainText('· سارا رضایی');
    await expect(log.locator('li').filter({ hasText: 'PDF جزوه و فایل چاپ ساخته شد' })).toContainText('· سیستم');
    await expect(log.locator('li').first()).toContainText('سفارش ساخته شد · مشتری');
    await expect(log.locator('li').nth(1)).toContainText('پرداخت شد · درگاه');

    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.getByRole('link', { name: 'سفارش', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(ownerPage.locator('.ad-log').getByText(`فایل چاپ سفارش ${o.A.number} دانلود شد`).first()).toBeVisible();
    await expect(ownerPage.locator('.ad-log').getByText(`PDF اصلی سفارش ${o.A.number} دانلود شد`).first()).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('فایل چاپ ساخته نشد: دلیل روشن، «دوباره بساز»، و بعد دانلود', async () => {
    await ownerPage.goto(at(`/orders/${o.B.number}`));
    await expect(ownerPage.locator('.ad-status .jy-card__title')).toHaveText('مهلت تحویل به پست گذشت');
    const failed = ownerPage.locator('[data-print="failed"]');
    await expect(failed.locator('.ad-print__meta')).toHaveText('فایل چاپ ساخته نشد');
    await expect(failed.locator('.jy-note')).toContainText('1 تلاش ناموفق: فایل مشتری روی استوریج پیدا نشد');
    await expect(failed.locator('.jy-note')).toContainText('روی سرورند؛ دوباره بساز.');
    // فایلی که نرسیده بود حالا به استوریج می‌رسد؛ کارگر دوباره می‌سازد.
    await upload(missing.key, missing.body);
    await failed.getByRole('button', { name: 'دوباره بساز' }).click();
    await expect(ownerPage.locator('[data-print="failed"]')).toHaveCount(0);
    await expect.poll(() => jobStatus(o.B), { timeout: 60_000 }).toBe('done');
    await ownerPage.reload();
    await expect(ownerPage.locator('[data-print="ready"] .ad-print__meta')).toContainText('4 صفحه');
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'ساختن دوبارهٔ فایل چاپ' })).toContainText('· سارا رضایی');
    await ownerPage.goto(at());
    await expect(ownerPage.locator('[data-alert="pdf"]')).toHaveCount(0);
    expect(ownerProblems).toEqual([]);
  });

  test('در انتظار پرداخت، رهاشده، سفارشی که نیست، و دانلود پیش از پرداخت', async () => {
    await ownerPage.goto(at(`/orders/${o.C.number}`));
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در انتظار پرداخت');
    await expect(ownerPage.locator('.ad-status .jy-card__title')).toHaveText('هنوز پرداخت نشده');
    await expect(ownerPage.getByText('فایل چاپ و برگهٔ سفارش بعد از پرداخت ساخته می‌شوند.')).toBeVisible();
    const payment = ownerPage.locator('[data-payment="unreturned"]');
    await expect(payment.locator('.jy-badge')).toHaveText('بی برگشت');
    await expect(payment.locator('.ad-pay__meta')).toHaveText(
      'درگاه نمونه · مشتری به درگاه رفت و برنگشت. بعد از 30 دقیقه، برگشت دیرش هم پذیرفته نمی‌شود.',
    );
    await expect(ownerPage.locator('.ad-sum__total')).toHaveText(`مبلغ سفارش${formatTomans(o.C.totalRials)}`);

    await ownerPage.goto(at(`/orders/${o.C.number}/pdf/1`));
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${o.C.number}\\?e=pdf_not_ready$`));
    await expect(ownerPage.locator('main').getByRole('alert')).toHaveText('این فایل هنوز ساخته نشده است.');

    await ownerPage.goto(at(`/orders/${o.D.number}`));
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('رهاشده');
    await expect(ownerPage.locator('.ad-status .jy-card__title')).toHaveText('رها شد');
    await expect(ownerPage.locator('.ad-log li').last()).toContainText('رها شد: فایل‌ها دیگر روی سرور نبود · سیستم');

    await ownerPage.goto(at('/orders/999999999'));
    await expect(ownerPage.getByRole('heading', { name: 'این سفارش پیدا نشد' })).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('متصدی: زبانهٔ سفارش‌ها و دانلود فایل چاپ، با مجوز خودش', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await enroll(page, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' });
    await nav.getByRole('link', { name: 'سفارش‌ها' }).click();
    await expect(nav.getByRole('link', { name: 'سفارش‌ها' })).toHaveAttribute('aria-current', 'page');
    await page.locator(`.ad-row[data-order="${o.E.number}"]`).click();
    await expect(page.getByRole('heading', { name: `سفارش ${o.E.number}` })).toBeVisible();
    await expect.poll(() => jobStatus(o.E), { timeout: 60_000 }).toBe('done');
    await page.reload();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-print="ready"]').getByRole('link', { name: 'دانلود' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`jozve-${o.E.number}-1.pdf`);
    await page.reload();
    await expect(page.locator('.ad-log li').filter({ hasText: 'فایل چاپ دانلود شد' })).toContainText('· علی محمدی');
    expect(problems).toEqual([]);
    await context.close();
  });

  test('گوشی و دسکتاپ: پیشخوان، سفارش‌ها و جزئیات بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [
        at(),
        at('/orders'),
        at('/orders?status=awaiting'),
        at(`/orders/${o.A.number}`),
        at(`/orders/${o.C.number}`),
        at(`/orders/${o.D.number}`),
      ]) {
        await page.goto(path);
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      // جدول در دسکتاپ با سرستون؛ کارت فشرده در گوشی بی سرستون و با «تومان» کنار مبلغ.
      await page.goto(at('/orders'));
      if (width <= 860) {
        await expect(page.locator('.ad-cols')).toBeHidden();
        await expect(page.locator('.ad-row__unit').first()).toBeVisible();
      } else {
        await expect(page.locator('.ad-cols')).toBeVisible();
        await expect(page.locator('.ad-row__unit').first()).toBeHidden();
      }
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
