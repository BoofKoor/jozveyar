import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { S3Driver } from '@jozveyar/storage';
import { formatTomans, tehranDayStart } from '@jozveyar/text';

import { alertOf, assignAtPayment, at, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * وضعیت سفارش در پنل، سرتاسری (برش ۴٫۳؛ طرح `docs/ui/mockups/admin.html`، ADR-039): «شروع چاپ» (بسته تا فایل چاپ ساخته
 * نشده، برش ۵٫۱)، «تحویل پست شد»، لغو با دلیل و هشدار پول، برگرداندن یک قدم فقط با مالک، ویرایش نام و نشانی و کد پستی، چیپ‌های
 * «تحویل پست شد» و «لغو شد»، و سطر آمار پیشخوان. هر کار از همان راه مرورگر؛ پایگاه داده گذار را خودش هم می‌سنجد
 * (`orders_status_flow`).
 *
 * سفارش‌ها را مثل `orders.spec.ts` خود تست با SQL می‌نشاند و فایل چاپ را کارگر واقعی می‌سازد؛ همان متغیرها و همان
 * کارگر لازم است (طرز اجرا بالای `orders.spec.ts`). پایگاه داده دور‌ریختنی است: تست اول سفارش‌های قبلی را پاک می‌کند.
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
 * سفارش پرداخت‌شده، همان ردیف‌هایی که سرور می‌نویسد (سفارش در یک تراکنش، و برگشت موفق درگاه با رویداد، چاپخانه و کارهای
 * `prepare_order` و `prepare_ticket`)؛ ۱۰ صفحهٔ سیاه‌سفید، فایلش در Garage تا کارگر فایل چاپ را بسازد، یا بی فایل تا نسازد.
 */
async function paidOrder(name: string, phone: string, due: Date, withFile = true): Promise<Seeded> {
  const docId = randomUUID();
  const key = `uploads/${docId}.pdf`;
  const body = readFileSync(join(FIXTURES, 'plain-bw-10.pdf'));
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲ - جلسه ۱.pdf', 'pdf', 'application/pdf', ${body.length}, ${key}, 'ready', 10,
            ${'e2e'.padEnd(64, '1')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  if (withFile) await upload(key, body);
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
    const [row] = await tx<{ id: string; order_number: number; total_rials: string }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'other',
              11, 1326, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321', ${createdAt})
      RETURNING id, order_number, total_rials`;
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
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${due} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id) VALUES ('prepare_order', ${row!.id}), ('prepare_ticket', ${row!.id})`;
    return { number: row!.order_number, id: row!.id, totalRials: Number(row!.total_rials) };
  });
}

const statusOf = async (o: Seeded) => (await sql<{ status: string }[]>`SELECT status::text FROM orders WHERE id = ${o.id}`)[0]!.status;
const jobStatus = async (o: Seeded) =>
  (await sql<{ status: string }[]>`SELECT status FROM jobs WHERE order_id = ${o.id} AND kind = 'prepare_order'`)[0]?.status;
const side = (page: Page) => page.locator('.ad-status');

test.describe.serial('وضعیت سفارش در پنل', () => {
  const owner = `sara${RUN}`;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  // A: کل مسیر تا پست و برگرداندن. B: لغو و برگرداندن لغو. C: بی فایل، پس بی فایل چاپ: «شروع چاپ» بسته. D: ویرایش گیرنده.
  const o = {} as Record<'A' | 'B' | 'C' | 'D', Seeded>;

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
    // پایگاه دادهٔ دور‌ریختنی: شمارش چیپ‌ها و آمار فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;

    const phone = (n: number) => `0915${String(RUN).slice(1)}1${String(n).repeat(3)}`;
    const tomorrowEnd = tehranDayStart(new Date(), 2);
    o.A = await paidOrder('مریم کاظمی', phone(1), tomorrowEnd);
    o.B = await paidOrder('زهرا محمدی', phone(2), tomorrowEnd);
    o.C = await paidOrder('امیر حسینی', phone(3), tomorrowEnd, false);
    o.D = await paidOrder('نگار صادقی', phone(4), tomorrowEnd);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    // کارگر واقعی: A، B و D ساخته می‌شوند؛ C با «فایل پیدا نشد» می‌افتد.
    for (const key of ['A', 'B', 'D'] as const) await expect.poll(() => jobStatus(o[key]), { timeout: 60_000 }).toBe('done');
    await expect.poll(() => jobStatus(o.C), { timeout: 60_000 }).toBe('failed');
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await sql?.end();
  });

  test('«شروع چاپ» بسته تا فایل چاپ ساخته نشده؛ بعد «در حال چاپ» با کننده، و «تحویل پست شد» به‌موقع', async () => {
    // C: بی فایل چاپ، دکمهٔ اصلی فقط وضعیت را می‌گوید.
    await ownerPage.goto(at(`/orders/${o.C.number}`));
    const blocked = side(ownerPage).getByRole('button', { name: 'اول فایل چاپ ساخته شود' });
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(side(ownerPage).getByRole('button', { name: 'شروع چاپ' })).toHaveCount(0);

    await ownerPage.goto(at(`/orders/${o.A.number}`));
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    await expect(side(ownerPage)).toContainText('وقتی چاپ را شروع کردی بزن؛ مشتری در صفحهٔ سفارشش «در حال چاپ» می‌بیند.');
    await side(ownerPage).getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    await expect(side(ownerPage)).toHaveAttribute('data-status', 'printing');
    await expect(side(ownerPage).locator('.ad-meta').nth(1)).toHaveText(/^در حال چاپ از امروز \d\d:\d\d، سارا رضایی$/);
    expect(await statusOf(o.A)).toBe('printing');
    const log = ownerPage.locator('.ad-log li');
    await expect(log.filter({ hasText: 'در صف چاپ ← در حال چاپ' })).toContainText('· سارا رضایی');

    await side(ownerPage).getByRole('button', { name: 'تحویل پست شد' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('تحویل پست شد');
    await expect(side(ownerPage).getByRole('heading', { name: 'به پست رسید' })).toBeVisible();
    await expect(side(ownerPage).locator('.jy-badge')).toHaveText('به‌موقع');
    await expect(side(ownerPage)).toContainText('کد رهگیری را فایل پست می‌آورد و به موبایل مشتری پیامک می‌شود.');
    // به پست رسیده: دیگر ویرایش نشانی و لغو نیست.
    await expect(ownerPage.getByRole('link', { name: 'ویرایش' })).toHaveCount(0);
    await expect(side(ownerPage).getByRole('link', { name: 'لغو سفارش' })).toHaveCount(0);
    const [row] = await sql<{ handed: Date | null }[]>`SELECT handed_to_post_at AS handed FROM orders WHERE id = ${o.A.id}`;
    expect(row!.handed).not.toBeNull();
    expect(ownerProblems).toEqual([]);
  });

  test('برگرداندن یک قدم فقط با مالک، با دلیل؛ دو بار «برگرداندن» هم‌زمان یک قدم', async ({ browser }) => {
    await ownerPage.goto(at(`/orders/${o.A.number}`));
    await side(ownerPage).getByRole('link', { name: 'برگرداندن به «در حال چاپ»' }).click();
    await expect(ownerPage).toHaveURL(/\?do=revert$/);
    const form = side(ownerPage).locator('form');
    await expect(form).toContainText('برای وضعیتی که اشتباه زده شد: سفارش از «تحویل پست شد» یک قدم به «در حال چاپ» برمی‌گردد');
    await form.getByLabel('دلیل برگرداندن').fill('اشتباه زدم؛ بسته هنوز در چاپخانه است');
    // دو زبانه، یک برگرداندن: دومی از «تحویل پست شد» است و سفارش دیگر آنجا نیست.
    const second = await ownerContext.newPage();
    await second.goto(at(`/orders/${o.A.number}?do=revert`));
    await second.locator('.ad-status form').getByLabel('دلیل برگرداندن').fill('بار دوم');
    await form.getByRole('button', { name: 'به «در حال چاپ» برگردان' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    await second.locator('.ad-status form').getByRole('button', { name: 'به «در حال چاپ» برگردان' }).click();
    await expect(second).toHaveURL(new RegExp(`/orders/${o.A.number}$`));
    await expect(second.locator('.ad-title-row .jy-badge')).toHaveText('در حال چاپ');
    await second.close();
    expect(await statusOf(o.A)).toBe('printing');
    const [reverts] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM order_status_events WHERE order_id = ${o.A.id} AND from_status = 'handed_to_post'`;
    expect(reverts!.n).toBe(1);
    await ownerPage.reload();
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'برگرداندن: تحویل پست شد ← در حال چاپ؛ اشتباه زدم؛ بسته هنوز در چاپخانه است' })).toContainText(
      '· سارا رضایی',
    );
    const [handed] = await sql<{ handed: Date | null }[]>`SELECT handed_to_post_at AS handed FROM orders WHERE id = ${o.A.id}`;
    expect(handed!.handed).toBeNull();

    // متصدی: کار بعدی بله، برگرداندن نه؛ نه پیوندش، نه صفحه‌اش.
    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await enroll(page, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    await page.goto(at(`/orders/${o.A.number}`));
    await expect(side(page).getByRole('button', { name: 'تحویل پست شد' })).toBeVisible();
    await expect(side(page).getByRole('link', { name: /برگرداندن/ })).toHaveCount(0);
    await page.goto(at(`/orders/${o.A.number}?do=revert`));
    await expect(side(page).locator('form.ad-step')).toHaveCount(0);
    // سرور هم برگرداندن متصدی را نمی‌پذیرد (`orders.revert`؛ تست واحد سرویس). کار بعدی را می‌کند: A دوباره به پست.
    await page.goto(at(`/orders/${o.A.number}`));
    await side(page).getByRole('button', { name: 'تحویل پست شد' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('تحویل پست شد');
    expect(problems).toEqual([]);
    await context.close();
    expect(ownerProblems).toEqual([]);
  });

  test('لغو با دلیل و هشدار پول؛ دلیل در پنل؛ برگرداندن لغو به همان وضعیت قبل؛ دلیل خالی همان‌جا', async () => {
    await ownerPage.goto(at(`/orders/${o.B.number}`));
    await side(ownerPage).getByRole('link', { name: 'لغو سفارش' }).click();
    const form = side(ownerPage).locator('form');
    await expect(form.locator('.jy-note--warning')).toHaveText(
      // درگاه نمونه در این پنل نیست (`CHECKOUT_MODE` خاموش)، پس فقط ثبت دستی (۷٫۳)؛ با درگاه، `refunds.spec.ts`.
      `مشتری در صفحهٔ سفارشش «لغو شد» را می‌بیند. پول خودکار برنمی‌گردد: بعد از لغو، مالک ${formatTomans(o.B.totalRials, false)} تومان را برمی‌گرداند و در همین صفحه با «ثبت بازپرداخت دستی» ثبتش می‌کند.`,
    );
    await expect(form.getByText('فقط در پنل دیده می‌شود، نه برای مشتری.')).toBeVisible();
    // دلیل فقط فاصله: مرورگر می‌فرستد (required فقط خالی را می‌گیرد) و سرور همان‌جا می‌گوید.
    await form.getByLabel('دلیل لغو').fill('   ');
    await form.getByRole('button', { name: 'سفارش را لغو کن' }).click();
    await expect(form.locator('.jy-error')).toHaveText('دلیل را بنویس.');
    expect(await statusOf(o.B)).toBe('paid');
    await form.getByLabel('دلیل لغو').fill('مشتری خواست. 374,750 تومان کارت‌به‌کارت برگشت، پیگیری 552190.');
    await form.getByRole('button', { name: 'سفارش را لغو کن' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('لغو شد');
    await expect(side(ownerPage).getByRole('heading', { name: 'لغو شد' })).toBeVisible();
    await expect(side(ownerPage).locator('.ad-facts dd')).toHaveText('مشتری خواست. 374,750 تومان کارت‌به‌کارت برگشت، پیگیری 552190.');
    await expect(side(ownerPage).locator('.ad-meta')).toHaveText(/^امروز \d\d:\d\d، سارا رضایی$/);
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'لغو شد' })).toContainText('· سارا رضایی');

    // برگرداندن لغو: به «در صف چاپ»، همان که پیش از لغو بود.
    await side(ownerPage).getByRole('link', { name: 'برگرداندن به «در صف چاپ»' }).click();
    await side(ownerPage).locator('form').getByLabel('دلیل برگرداندن').fill('مشتری پشیمان شد؛ پول هنوز برنگشته بود');
    await side(ownerPage).locator('form').getByRole('button', { name: 'به «در صف چاپ» برگردان' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('در صف چاپ');
    expect(await statusOf(o.B)).toBe('paid');
    expect(ownerProblems).toEqual([]);
  });

  test('ویرایش گیرنده: همان قاعدهٔ مسیر خرید، خطای فیلد همان‌جا؛ موبایل و شهر عوض نمی‌شوند؛ رویداد با فیلدها', async () => {
    await ownerPage.goto(at(`/orders/${o.D.number}`));
    await ownerPage.getByRole('link', { name: 'ویرایش' }).click();
    await expect(ownerPage).toHaveURL(/\?do=edit$/);
    const card = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'ویرایش نشانی' }) });
    await expect(card.getByText('عوض نمی‌شود: کرایهٔ سفارش با استانش منجمد شده.')).toBeVisible();
    await expect(card.getByText('موبایل تأییدشدهٔ پرداخت است و عوض نمی‌شود.')).toBeVisible();
    await expect(card.locator('.ad-facts dd').first()).toContainText('خراسان رضوی، مشهد');
    await card.getByLabel('نشانی').fill('کوتاه');
    await card.getByLabel('کد پستی (اختیاری)').fill('12345');
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(card.locator('.jy-error')).toHaveText([
      'نشانی را کامل‌تر بنویس: خیابان، کوچه، پلاک و واحد.',
      'کد پستی 10 رقم است. اگر نمی‌دانی، خالی بگذار.',
    ]);
    // مقدارهای نوشته‌شده می‌مانند.
    await expect(card.getByLabel('نشانی')).toHaveValue('کوتاه');
    await card.getByLabel('نام گیرنده').fill('نگار  صادقي‌نيا');
    await card.getByLabel('نشانی').fill('بلوار سجاد، سجاد ۲۰، پلاک ۷');
    await card.getByLabel('کد پستی (اختیاری)').fill('۹۱۸۷۶ ۵۴۳۲۲');
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${o.D.number}$`));
    const to = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'ارسال به' }) });
    await expect(to.locator('dd').nth(0)).toHaveText('نگار صادقی‌نیا');
    await expect(to.locator('dd').nth(2)).toHaveText('خراسان رضوی، مشهد، بلوار سجاد، سجاد 20، پلاک 7');
    await expect(to.locator('dd').nth(3)).toHaveText('9187654322');
    const [row] = await sql<{ phone: string; province: number; total: string }[]>`
      SELECT recipient_phone AS phone, province_id AS province, total_rials::text AS total FROM orders WHERE id = ${o.D.id}`;
    expect(row).toEqual({ phone: `0915${String(RUN).slice(1)}1444`, province: 11, total: String(o.D.totalRials) });
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'ویرایش گیرنده: نام گیرنده، نشانی، کد پستی' })).toContainText('· سارا رضایی');
    expect(ownerProblems).toEqual([]);
  });

  test('فهرست و پیشخوان: چیپ‌های تحویل پست شد و لغو شد، «باز» یعنی در صف و در حال چاپ، و سطر آمار', async () => {
    // A دوباره به پست رفت (متصدی)؛ B در صف است؛ C در صف (بی فایل چاپ)؛ D در صف. یکی را لغو کن تا چیپش شمار داشته باشد.
    await ownerPage.goto(at(`/orders/${o.C.number}?do=cancel`));
    await side(ownerPage).locator('form').getByLabel('دلیل لغو').fill('فایل مشتری نرسید؛ مبلغ برگشت');
    await side(ownerPage).locator('form').getByRole('button', { name: 'سفارش را لغو کن' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('لغو شد');
    // فایل چاپ ساخته‌نشدهٔ سفارش لغوشده دیگر لازم نیست: نه «دوباره بساز»، نه هشدار پیشخوان.
    await expect(ownerPage.getByText('فایل چاپ ساخته نشد؛ این سفارش دیگر چاپ نمی‌شود.')).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'دوباره بساز' })).toHaveCount(0);

    await ownerPage.goto(at('/orders'));
    const chips = ownerPage.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link');
    await expect(chips).toHaveText(['باز 2', 'تحویل پست شد 1', 'لغو شد 1', 'در انتظار پرداخت 0', 'رهاشده 0', 'همه 4']);
    await chips.filter({ hasText: 'تحویل پست شد' }).click();
    await expect(ownerPage).toHaveURL(/status=handed/);
    await expect(ownerPage.locator('.ad-cols span').last()).toHaveText('به پست رسید');
    const handed = ownerPage.locator(`.ad-row[data-order="${o.A.number}"]`);
    await expect(handed.locator('.ad-row__state')).toHaveText('تحویل پست شد');
    await expect(handed.locator('.ad-row__due')).toHaveText(/^امروز \d\d:\d\d$/);
    await ownerPage.getByRole('navigation', { name: 'وضعیت سفارش' }).getByRole('link', { name: /^لغو شد/ }).click();
    await expect(ownerPage).toHaveURL(/status=cancelled/);
    await expect(ownerPage.locator(`.ad-row[data-order="${o.C.number}"] .ad-row__state`)).toHaveText('لغو شد');

    await ownerPage.goto(at());
    // باز: B و D در صف چاپ؛ هیچ‌کدام در حال چاپ نیست. هفتهٔ گذشته: A یک بار به‌موقع به پست رسید.
    await expect(ownerPage.locator('[data-stats]')).toHaveText(
      'از این 2 سفارش، هنوز هیچ‌کدام در حال چاپ نیست. هفتهٔ گذشته 1 از 1 سفارش به‌موقع به پست رسید.',
    );
    await expect(ownerPage.locator('.ad-tile[data-due="tomorrow"] .ad-tile__n')).toHaveText('2');
    await expect(ownerPage.locator('[data-alert="pdf"]')).toHaveCount(0);

    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('.ad-log').getByText(`سفارش ${o.C.number} لغو شد`).first()).toBeVisible();
    await expect(ownerPage.locator('.ad-log').getByText(`سفارش ${o.A.number}: در صف چاپ ← در حال چاپ`).first()).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('وضعیت همین حالا عوض شد: کار از وضعیتی که صفحه نشان داد انجام نمی‌شود، با پیام روشن', async () => {
    await ownerPage.goto(at(`/orders/${o.D.number}`));
    // زبانهٔ دیگری (یا ادمین دیگری) همین حالا چاپ را شروع کرد و بعد لغو کرد.
    await sql`UPDATE orders SET status = 'printing' WHERE id = ${o.D.id}`;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${o.D.id}`;
    await side(ownerPage).getByRole('button', { name: 'شروع چاپ' }).click();
    await expect(ownerPage).toHaveURL(/\?e=status_changed$/);
    await expect(alertOf(ownerPage)).toHaveText('وضعیت این سفارش همین حالا عوض شد؛ وضعیت تازه را ببین و اگر هنوز لازم است، دوباره بزن.');
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('لغو شد');
    expect(await statusOf(o.D)).toBe('cancelled');
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: هر وضعیت و هر فرم بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [
        at(`/orders/${o.A.number}`),
        at(`/orders/${o.A.number}?do=revert`),
        at(`/orders/${o.B.number}`),
        at(`/orders/${o.B.number}?do=cancel`),
        at(`/orders/${o.B.number}?do=edit`),
        at(`/orders/${o.C.number}`),
        at('/orders?status=handed'),
        at('/orders?status=cancelled'),
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
