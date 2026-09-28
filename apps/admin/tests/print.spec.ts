import { createHash, randomInt, randomUUID } from 'node:crypto';
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
 * خروجی چاپ در پنل، سرتاسری (برش ۵٫۱؛ طرح `docs/ui/mockups/admin.html`، ADR-043 و ADR-044): «در حال ساختن» و «شروع چاپ» بسته
 * تا فایل چاپ نیست؛ فایل چاپ هر جلد با «چه عوض شد» و PDF اصلی جزوه، هر دانلود با همان sha256 که کارگر نوشت؛ برگهٔ سفارش
 * (دیدن با پیش‌نمایش، دانلود)، و «در حال به‌روز شدن» پس از ویرایش نشانی تا کارگر برگهٔ تازه را بسازد؛ سفارش دوجزوه‌ای با کارت
 * برگهٔ جدا؛ و «فایل‌ها پاک شد» پس از روزهای نگهداری، بی دانلود و بی برگرداندن.
 *
 * همان پنل، پایگاه داده، استوریج و کارگر `orders.spec.ts` (طرز اجرا بالای همان)، و کارگر با `DOCWORKER_RETENTION_SECONDS=2`
 * تا دور پاک کردن فایل‌ها در چند ثانیه سر برسد (پیش‌فرض کارگر ده دقیقه). سفارش‌ها را خود تست با SQL می‌نشاند. حالت‌های میانی
 * («در حال ساختن»، «در حال به‌روز شدن») قطعی دیده می‌شوند: کار را اجارهٔ «کارگر دیگری گرفته» نگه می‌دارد، و با تمام شدن اجاره،
 * مثل کارگری که وسط کار مرد، کارگر واقعی برش می‌دارد.
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
const FILES_DELETED = 'فایل‌های این سفارش پس از روزهای نگهداری پاک شده‌اند؛ نه دانلود می‌شوند، نه سفارش به صف چاپ برمی‌گردد.';

/**
 * تعرفهٔ پایه با سقف ۲ برگ در هر جلد طلق و سیم: جزوهٔ ۸ صفحه‌ای دورو دو جلد می‌شود، بی فایل ۱۶۰۰ صفحه‌ای. کارگر و محافظ
 * پایگاه داده جلدها را فقط از ریز قیمت منجمد سفارش می‌خوانند (`sheetsPerVolume`، ADR-043).
 */
const SMALL_VOLUMES = {
  ...SEED_PRICE_LIST,
  bindingTypes: {
    ...SEED_PRICE_LIST.bindingTypes,
    spiral_clear: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!, maxSheetsPerVolume: 2 },
  },
};

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

interface Doc {
  id: string;
  pages: number;
}

/** سند آماده با شمارش سرور و فایلش در استوریج، دو روز روی سرور. */
async function document(name: string, pages: number, body: Buffer): Promise<Doc> {
  const id = randomUUID();
  const key = `uploads/${id}.pdf`;
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${id}, ${name}, 'pdf', 'application/pdf', ${body.length}, ${key}, 'ready', ${pages},
            ${'e2e'.padEnd(64, '2')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  await upload(key, body);
  return { id, pages };
}

interface Seeded {
  number: number;
  id: string;
}

/**
 * سفارش پرداخت‌شده، همان ردیف‌هایی که سرور می‌نویسد: قیمت `quote()` با یک قاعدهٔ سیاه‌سفید برای کل هر جزوه، و برگشت موفق
 * درگاه (`settlePayment`) با رویداد و کارهای `prepare_order` و `prepare_ticket`. `hold` کار آن نوع را از اول در دست «کارگر
 * دیگری» می‌گذارد (`hold()`).
 */
async function paidOrder(
  items: Doc[][],
  who: { name: string; phone: string },
  { list = SEED_PRICE_LIST, hold }: { list?: typeof SEED_PRICE_LIST; hold?: 'prepare_order' } = {},
): Promise<Seeded> {
  const specs = items.map((docs) => {
    const sections = docs.map((d) => ({ documentId: d.id, pageCount: d.pages }));
    const pageCount = sections.reduce((sum, s) => sum + s.pageCount, 0);
    const rules = [{ pageRanges: [[1, pageCount]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
    return { sections, pageCount, rules };
  });
  const breakdown = quote(
    {
      items: specs.map(({ sections, rules }) => ({ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' })),
      shipping: { methodId: 'post', zoneId: 'other' },
    },
    list,
  );
  const createdAt = new Date(Date.now() - 2 * 60 * MINUTE);
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${who.phone}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'other',
              11, 1326, ${who.name}, ${who.phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321', ${createdAt})
      RETURNING id, order_number`;
    for (const [i, spec] of specs.entries()) {
      const [item] = await tx<{ id: string }[]>`
        INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
        VALUES (${row!.id}, ${i + 1}, ${spec.pageCount}, 1, 'double', 'spiral_clear') RETURNING id`;
      for (const [j, s] of spec.sections.entries()) {
        await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count)
                 VALUES (${item!.id}, ${j + 1}, ${s.documentId}, ${s.pageCount})`;
      }
      await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
               VALUES (${item!.id}, 1, ${tx.json(spec.rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    }
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 4)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id) VALUES ('prepare_order', ${row!.id}), ('prepare_ticket', ${row!.id})`;
    if (hold) await holdIn(tx, row!.id, hold);
    return { number: row!.order_number, id: row!.id };
  });
}

type Kind = 'prepare_order' | 'prepare_ticket';

/** کار در دست «کارگر دیگری» با اجارهٔ یک‌ساعته: کارگر واقعی برش نمی‌دارد و ویرایش نشانی هم دوباره در صفش نمی‌گذارد. */
const holdIn = (tx: postgres.Sql | postgres.TransactionSql, orderId: string, kind: Kind) =>
  tx`UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_by = 'e2e', locked_until = now() + interval '1 hour'
      WHERE order_id = ${orderId} AND kind = ${kind}`;
const hold = (o: Seeded, kind: Kind) => holdIn(sql, o.id, kind);
/** اجاره تمام شد، مثل کارگری که وسط کار مرد: کارگر واقعی کار را برمی‌دارد (`queue.claim`). */
const release = (o: Seeded, kind: Kind) =>
  sql`UPDATE jobs SET locked_until = now() - interval '1 second' WHERE order_id = ${o.id} AND kind = ${kind}`;
const jobStatus = async (o: Seeded, kind: Kind) =>
  (await sql<{ status: string }[]>`SELECT status FROM jobs WHERE order_id = ${o.id} AND kind = ${kind}`)[0]?.status;
/** برگهٔ سفارش در پایگاه داده، و اینکه با دادهٔ امروز سفارش ساخته شده یا نه (`order_ticket_stamp`، مهاجرت 0016). */
const ticketRow = async (o: Seeded) =>
  (
    await sql<{ key: string; preview: string; sha: string; bytes: string; fresh: boolean }[]>`
      SELECT t.storage_key AS key, t.preview_key AS preview, t.sha256 AS sha, t.size_bytes::text AS bytes,
             t.stamp = order_ticket_stamp(o) AS fresh
        FROM order_tickets t JOIN orders o ON o.id = t.order_id WHERE t.order_id = ${o.id}`
  )[0];
const printFiles = async (o: Seeded) =>
  sql<{ seq: number; volume: number; first: number; last: number; key: string; sha: string; bytes: string }[]>`
    SELECT i.seq, f.volume, f.first_page AS first, f.last_page AS last, f.storage_key AS key, f.sha256 AS sha,
           f.size_bytes::text AS bytes
      FROM order_print_files f JOIN order_items i ON i.id = f.order_item_id
     WHERE i.order_id = ${o.id} ORDER BY i.seq, f.volume`;
const side = (page: Page) => page.locator('.ad-status');

async function downloaded(page: Page, link: ReturnType<Page['locator']>) {
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const bytes = readFileSync((await download.path())!);
  return { name: download.suggestedFilename(), bytes };
}

test.describe.serial('خروجی چاپ در پنل', () => {
  const owner = `sara${RUN}`;
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  // P: دو فایل، ۸ صفحه با اندازه‌های مختلف و حاشیه‌نویسی، دو جلد؛ فایل چاپش اول در دست «کارگر دیگری». Q: برگه و ویرایش
  // نشانی. M: دو جزوه. R: به پست رسیده و فایل‌هایش پس از روزهای نگهداری پاک می‌شوند.
  const o = {} as Record<'P' | 'Q' | 'M' | 'R', Seeded>;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // «امروز 14:05» و روز پاک شدن به روز تهران؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند.
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

    const phone = (n: number) => `0915${String(RUN).slice(1)}2${String(n).repeat(3)}`;
    const bw10 = fixture('plain-bw-10.pdf');
    o.P = await paidOrder(
      [[await document('فیزیک - اندازه‌های مختلف.pdf', 7, fixture('sizes-7.pdf')), await document('فرم امضاشده.pdf', 1, fixture('stamp-scan-1.pdf'))]],
      { name: 'مریم کاظمی', phone: phone(1) },
      { list: SMALL_VOLUMES, hold: 'prepare_order' },
    );
    o.Q = await paidOrder([[await document('آمار - فصل ۳.pdf', 10, bw10)]], { name: 'زهرا محمدی', phone: phone(2) });
    o.M = await paidOrder(
      [[await document('ریاضی ۲ - جلسه ۱.pdf', 10, bw10)], [await document('نقشه - پیوست.pdf', 2, fixture('odd-size-2.pdf'))]],
      { name: 'پارسا امینی', phone: phone(3) },
    );
    o.R = await paidOrder([[await document('زیست - جلسه ۱.pdf', 10, bw10)]], { name: 'فاطمه نوری', phone: phone(4) });

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    // کارگر واقعی: همه جز فایل چاپ P، که در دست «کارگر دیگری» است.
    for (const key of ['Q', 'M', 'R'] as const) {
      await expect.poll(() => jobStatus(o[key], 'prepare_order'), { timeout: 60_000 }).toBe('done');
    }
    for (const key of ['P', 'Q', 'M', 'R'] as const) {
      await expect.poll(() => jobStatus(o[key], 'prepare_ticket'), { timeout: 60_000 }).toBe('done');
    }
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await sql?.end();
  });

  test('در حال ساختن: «شروع چاپ» بسته؛ بعد هر جلد یک فایل با «چه عوض شد»، و هر دانلود با همان sha256 کارگر', async () => {
    const n = o.P.number;
    await ownerPage.goto(at(`/orders/${n}`));
    await expect(ownerPage.locator('[data-print="building"] .ad-print__meta')).toHaveText('در حال ساختن فایل چاپ…');
    await expect(side(ownerPage).getByRole('button', { name: 'اول فایل چاپ ساخته شود' })).toHaveAttribute('aria-disabled', 'true');
    await expect(side(ownerPage).getByRole('button', { name: 'شروع چاپ' })).toHaveCount(0);

    await release(o.P, 'prepare_order');
    await expect.poll(() => jobStatus(o.P, 'prepare_order'), { timeout: 60_000 }).toBe('done');
    await ownerPage.reload();
    await expect(side(ownerPage).getByRole('button', { name: 'شروع چاپ' })).toBeVisible();
    await expect(ownerPage.locator('section[aria-labelledby="t-jozve-1"] .jy-card__meta')).toHaveText('دو جلد، هر جلد یک فایل');
    await expect(ownerPage.locator('.ad-spec dd')).toHaveText(['سیاه‌سفید، دورو · تحریر ۸۰ گرم', 'طلق و سیم · 8 صفحه، 4 برگ، دو جلد (2 و 2 برگ)', '1 نسخه']);

    // جلدها دقیقاً با برگ‌های ریز قیمت منجمد ([2, 2])؛ مرز جلد بعد از صفحهٔ زوج.
    const files = await printFiles(o.P);
    expect(files.map((f) => [f.volume, f.first, f.last])).toEqual([
      [1, 1, 4],
      [2, 5, 8],
    ]);
    const rows = ownerPage.locator('[data-print="ready"]');
    await expect(rows.locator('.ad-pdf__name')).toHaveText([`jozve-${n}-1-jeld-1.pdf`, `jozve-${n}-1-jeld-2.pdf`]);
    // جلدها با هم ساخته می‌شوند: زمان فقط در ردیف یک‌جلدی (طرح).
    await expect(rows.nth(0).locator('.ad-print__meta')).toHaveText(/^جلد 1 · صفحهٔ 1 تا 4 · 2 برگ · [\d.,]+ \S+$/);
    await expect(rows.nth(1).locator('.ad-print__meta')).toHaveText(/^جلد 2 · صفحهٔ 5 تا 8 · 2 برگ · [\d.,]+ \S+$/);
    // «چه عوض شد» زیر جلد آخر، به صفحهٔ جزوه و نام فایل مشتری؛ و پیوند PDF اصلی.
    await expect(rows.nth(1).locator('.ad-print__orig')).toHaveText(
      'صفحهٔ 2 (فایل فیزیک - اندازه‌های مختلف.pdf) اندازهٔ A3 داشت و روی A4 نشست؛ ' +
        'صفحهٔ 4 (فایل فیزیک - اندازه‌های مختلف.pdf) اندازهٔ Letter داشت و روی A4 نشست؛ ' +
        'صفحهٔ 6 (فایل فیزیک - اندازه‌های مختلف.pdf) اندازهٔ A3 داشت و روی A4 نشست؛ ' +
        'صفحهٔ 8 (فایل فرم امضاشده.pdf) حاشیه‌نویسی داشت و جزو صفحه شد؛ بقیه بی تغییر؛ ' +
        'به دو جلد تقسیم شد، همان‌طور که صحافی‌اش حساب شده. PDF اصلی جزوه، بی تغییر.',
    );
    await expect(rows.nth(0).locator('.ad-print__orig')).toHaveCount(0);

    for (const [i, file] of files.entries()) {
      const { name, bytes } = await downloaded(ownerPage, rows.nth(i).getByRole('link', { name: 'دانلود' }));
      expect(name).toBe(`jozve-${n}-1-jeld-${file.volume}.pdf`);
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(sha256(bytes)).toBe(file.sha);
      expect(String(bytes.length)).toBe(file.bytes);
    }
    const [item] = await sql<{ sha: string }[]>`SELECT print_pdf_sha256 AS sha FROM order_items WHERE order_id = ${o.P.id}`;
    const original = await downloaded(ownerPage, rows.nth(1).getByRole('link', { name: 'PDF اصلی جزوه' }));
    expect(original.name).toBe(`jozve-${n}-1-asli.pdf`);
    expect(sha256(original.bytes)).toBe(item!.sha);
    expect(files.map((f) => f.sha)).not.toContain(item!.sha);

    await ownerPage.reload();
    const log = ownerPage.locator('.ad-log li');
    await expect(log.filter({ hasText: 'PDF جزوه و فایل چاپ ساخته شد' })).toContainText('· سیستم');
    await expect(log.filter({ hasText: 'فایل چاپ جلد 1 دانلود شد' })).toContainText('· سارا رضایی');
    await expect(log.filter({ hasText: 'فایل چاپ جلد 2 دانلود شد' })).toContainText('· سارا رضایی');
    await expect(log.filter({ hasText: 'PDF اصلی جزوه دانلود شد' })).toContainText('· سارا رضایی');
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('.ad-log').getByText(`فایل چاپ سفارش ${n} جلد 2 دانلود شد`).first()).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('برگهٔ سفارش: دیدن با پیش‌نمایش همان PDF، و دانلود با همان sha256 کارگر و رویدادش', async () => {
    const n = o.P.number;
    const row = await ticketRow(o.P);
    expect(row!.fresh).toBe(true);
    await ownerPage.goto(at(`/orders/${n}`));
    const ticket = ownerPage.locator('li[data-ticket="ready"]');
    await expect(ticket.locator('.ad-print__meta')).toHaveText('شماره، مهلت، مشخصات چاپ و برچسب پست · یک برگ A4، جدا از جزوه');
    await ticket.getByRole('link', { name: 'دیدن' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${n}/ticket$`));
    await expect(ownerPage.getByRole('heading', { level: 1, name: `برگهٔ سفارش ${n}` })).toBeVisible();
    const preview = ownerPage.getByRole('img', { name: `برگهٔ سفارش ${n}: شماره، مهلت، مشخصات چاپ و برچسب پست` });
    // PNG همان صفحهٔ A4 با ۱۵۰ DPI، از راه خود پنل.
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBe(1240);
    const direct = await ownerContext.request.get(at(`/orders/${n}/ticket/preview`));
    expect(direct.headers()).toMatchObject({ 'content-type': 'image/png', 'x-accel-buffering': 'no' });
    expect(direct.headers()['cache-control']).toContain('no-store');
    expect(direct.headers()['content-disposition']).toMatch(new RegExp(`^inline; filename="barge-sefaresh-${n}\\.png"`));

    const { name, bytes } = await downloaded(ownerPage, ownerPage.getByRole('link', { name: 'دانلود PDF' }));
    expect(name).toBe(`barge-sefaresh-${n}.pdf`);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(sha256(bytes)).toBe(row!.sha);
    expect(String(bytes.length)).toBe(row!.bytes);

    await ownerPage.getByRole('link', { name: `سفارش ${n}` }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${n}$`));
    const log = ownerPage.locator('.ad-log li').filter({ hasText: 'برگهٔ سفارش دانلود شد' });
    // پیش‌نمایش رویداد ندارد: فقط همان یک دانلود.
    await expect(log).toHaveCount(1);
    await expect(log).toContainText('· سارا رضایی');
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('.ad-log').getByText(`برگهٔ سفارش ${n} دانلود شد`).first()).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('نشانی عوض شد: برگهٔ کهنه دیگر داده نمی‌شود («در حال به‌روز شدن») تا کارگر برگهٔ تازه را بسازد', async () => {
    const n = o.Q.number;
    const before = await ticketRow(o.Q);
    expect(before!.fresh).toBe(true);
    // کارگری همین حالا برگه را می‌سازد (اجاره)؛ ویرایش کار زنده را دوباره در صف نمی‌گذارد.
    await hold(o.Q, 'prepare_ticket');
    await ownerPage.goto(at(`/orders/${n}?do=edit`));
    const card = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'ویرایش نشانی' }) });
    await card.getByLabel('نشانی').fill('بلوار سجاد، سجاد 20، پلاک 7');
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${n}$`));
    const ticket = ownerPage.locator('li[data-ticket]');
    await expect(ticket).toHaveAttribute('data-ticket', 'updating');
    await expect(ticket.locator('.ad-print__meta')).toHaveText('در حال به‌روز شدن با نام و نشانی تازه…');
    await expect(ticket.getByRole('link')).toHaveCount(0);
    expect(await jobStatus(o.Q, 'prepare_ticket')).toBe('running');
    expect((await ticketRow(o.Q))!.fresh).toBe(false);

    // هیچ راهی برگهٔ کهنه را نمی‌دهد: نه دانلود، نه پیش‌نمایش، نه صفحهٔ برگه.
    await ownerPage.goto(at(`/orders/${n}/ticket/pdf`));
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${n}\\?e=ticket_not_ready$`));
    await expect(alertOf(ownerPage)).toHaveText(
      'برگهٔ سفارش هنوز ساخته نشده، یا با دادهٔ تازهٔ سفارش در حال به‌روز شدن است. چند ثانیهٔ دیگر دوباره باز کن.',
    );
    expect((await ownerContext.request.get(at(`/orders/${n}/ticket/preview`))).status()).toBe(409);
    await ownerPage.goto(at(`/orders/${n}/ticket`));
    await expect(ownerPage.locator('[data-ticket="updating"] .ad-lead')).toHaveText(
      'برگه با نام و نشانی تازه در حال به‌روز شدن است؛ چند ثانیهٔ دیگر دوباره باز کن.',
    );
    await expect(ownerPage.locator('.ad-sheet')).toHaveCount(0);

    // کارگر برگهٔ تازه را می‌سازد، زیر کلید تازه‌اش (اثر انگشت داده).
    await release(o.Q, 'prepare_ticket');
    await expect.poll(async () => (await ticketRow(o.Q))?.fresh, { timeout: 60_000 }).toBe(true);
    const after = await ticketRow(o.Q);
    expect(after!.key).not.toBe(before!.key);
    await ownerPage.goto(at(`/orders/${n}/ticket`));
    await expect(ownerPage.getByRole('link', { name: 'دانلود PDF' })).toBeVisible();

    // ویرایش بعدی، بی کار زنده: همان تراکنش ویرایش کار تمام‌شده را دوباره در صف می‌گذارد.
    await ownerPage.goto(at(`/orders/${n}?do=edit`));
    await card.getByLabel('نام گیرنده').fill('زهرا محمدی‌نیا');
    await card.getByRole('button', { name: 'ذخیره' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/orders/${n}$`));
    await expect.poll(async () => (await ticketRow(o.Q))?.fresh, { timeout: 60_000 }).toBe(true);
    expect((await ticketRow(o.Q))!.key).not.toBe(after!.key);
    await ownerPage.reload();
    await expect(ownerPage.locator('li[data-ticket]')).toHaveAttribute('data-ticket', 'ready');
    expect(ownerProblems).toEqual([]);
  });

  test('دو جزوه: فایل چاپ هر جزوه در کارت خودش، و برگهٔ سفارش در کارت جدا', async () => {
    const n = o.M.number;
    await ownerPage.goto(at(`/orders/${n}`));
    const jozve = (seq: number) => ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: `جزوهٔ ${seq}` }) });
    await expect(jozve(1).locator('[data-print="ready"] .ad-pdf__name')).toHaveText(`jozve-${n}-1.pdf`);
    await expect(jozve(1).locator('.ad-print__orig')).toHaveText('همهٔ صفحه‌ها A4 عمودی بود؛ فایل چاپ همان PDF جزوه است.');
    await expect(jozve(2).locator('[data-print="ready"] .ad-pdf__name')).toHaveText(`jozve-${n}-2.pdf`);
    // ۱۷۰×۲۴۰ میلی‌متر (۴۸۲×۶۸۰ پوینت) نام ندارد؛ هر دو صفحه، پس «بقیه» ندارد.
    await expect(jozve(2).locator('.ad-print__orig')).toHaveText(
      'صفحهٔ 1 تا 2 اندازهٔ 170×240 میلی‌متر داشت و روی A4 نشست. PDF اصلی جزوه، بی تغییر.',
    );
    await expect(jozve(1).locator('[data-ticket]')).toHaveCount(0);
    await expect(jozve(2).locator('[data-ticket]')).toHaveCount(0);
    const ticket = ownerPage.locator('section', { has: ownerPage.getByRole('heading', { name: 'برگهٔ سفارش', exact: true }) });
    await expect(ticket.locator('li[data-ticket="ready"]')).toHaveCount(1);

    const files = await printFiles(o.M);
    expect(files.map((f) => [f.seq, f.volume, f.first, f.last])).toEqual([
      [1, 1, 1, 10],
      [2, 1, 1, 2],
    ]);
    const second = await downloaded(ownerPage, jozve(2).locator('[data-print="ready"]').getByRole('link', { name: 'دانلود' }));
    expect(second.name).toBe(`jozve-${n}-2.pdf`);
    expect(sha256(second.bytes)).toBe(files[1]!.sha);
    await ownerPage.reload();
    const log = ownerPage.locator('.ad-log li');
    await expect(log.filter({ hasText: 'PDF جزوهٔ 1 و فایل چاپ ساخته شد' })).toContainText('· سیستم');
    await expect(log.filter({ hasText: 'PDF جزوهٔ 2 و فایل چاپ ساخته شد' })).toContainText('· سیستم');
    await expect(log.filter({ hasText: 'فایل چاپ جزوهٔ 2 دانلود شد' })).toContainText('· سارا رضایی');
    expect(ownerProblems).toEqual([]);
  });

  test('فایل‌ها پاک شد: ۳۰ روز پس از تحویل پست کارگر فایل‌ها را می‌برد؛ نه دانلود، نه برگرداندن، و یادداشت روشن', async () => {
    const n = o.R.number;
    const [item] = await sql<{ key: string }[]>`SELECT print_pdf_key AS key FROM order_items WHERE order_id = ${o.R.id}`;
    const ticket = await ticketRow(o.R);
    // جزوهٔ یک‌جلدی A4: فایل چاپ همان PDF جزوه است (یک کلید).
    const keys = [...new Set([item!.key, ...(await printFiles(o.R)).map((f) => f.key), ticket!.key, ticket!.preview])];
    expect(keys).toHaveLength(3);
    for (const key of keys) expect(await s3.headObject(key), key).not.toBeNull();

    // به پست رسید، ۳۱ روز پیش (نگهداری پیش‌فرض ۳۰ روز)؛ گذارها همان که تریگر `orders_status_flow` می‌پذیرد.
    await sql.begin(async (tx) => {
      await tx`UPDATE orders SET status = 'printing' WHERE id = ${o.R.id}`;
      await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() - interval '31 days' WHERE id = ${o.R.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${o.R.id}, 'paid', 'printing', now() - interval '31 days 1 hour', 'system'),
                      (${o.R.id}, 'printing', 'handed_to_post', now() - interval '31 days', 'system')`;
    });
    await expect
      .poll(async () => (await sql<{ gone: boolean }[]>`SELECT files_deleted_at IS NOT NULL AS gone FROM orders WHERE id = ${o.R.id}`)[0]!.gone, {
        timeout: 60_000,
      })
      .toBe(true);
    for (const key of keys) expect(await s3.headObject(key), key).toBeNull();

    await ownerPage.goto(at(`/orders/${n}`));
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('تحویل پست شد');
    await expect(ownerPage.locator('.ad-main .jy-note').filter({ hasText: 'فایل‌های این سفارش' })).toHaveText(
      /^فایل‌های این سفارش \(PDF جزوه، فایل چاپ و برگه\) \S+ \d+ \S+ پاک شد: 31 روز پس از تحویل پست\. مشخصات، مبلغ و رویدادها می‌مانند\.$/,
    );
    await expect(ownerPage.locator('[data-print], [data-ticket]')).toHaveCount(0);
    await expect(ownerPage.locator('.ad-log li').filter({ hasText: 'فایل‌های سفارش پاک شد' })).toContainText('· سیستم');
    // مالک هم برنمی‌گرداند: نه پیوند، نه فرم؛ و پایگاه داده هم نمی‌پذیرد.
    await expect(side(ownerPage).getByRole('link', { name: /برگرداندن/ })).toHaveCount(0);
    await ownerPage.goto(at(`/orders/${n}?do=revert`));
    await expect(side(ownerPage).locator('form')).toHaveCount(0);
    const blocked = await sql`UPDATE orders SET status = 'printing', handed_to_post_at = NULL WHERE id = ${o.R.id}`.catch((error: unknown) => error);
    expect((blocked as { constraint_name?: string }).constraint_name).toBe('orders_files_deleted');

    for (const path of [`/orders/${n}/print/1/1`, `/orders/${n}/pdf/1`, `/orders/${n}/ticket/pdf`]) {
      await ownerPage.goto(at(path));
      await expect(ownerPage, path).toHaveURL(new RegExp(`/orders/${n}\\?e=files_deleted$`));
      await expect(alertOf(ownerPage)).toHaveText(FILES_DELETED);
    }
    expect((await ownerContext.request.get(at(`/orders/${n}/ticket/preview`))).status()).toBe(410);
    await ownerPage.goto(at(`/orders/${n}/ticket`));
    await expect(ownerPage.locator('[data-ticket="purged"] .ad-lead')).toHaveText('فایل‌های این سفارش، برگه هم، پس از روزهای نگهداری پاک شده‌اند.');
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: فایل چاپ، برگه و فایل‌های پاک‌شده بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [
        at(`/orders/${o.P.number}`),
        at(`/orders/${o.P.number}/ticket`),
        at(`/orders/${o.M.number}`),
        at(`/orders/${o.R.number}`),
        at(`/orders/${o.R.number}/ticket`),
        at(`/orders/${o.R.number}?e=files_deleted`),
      ]) {
        await page.goto(path);
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      // برگه در گوشی هم کل پهنا را می‌گیرد و بیرون نمی‌زند.
      await page.goto(at(`/orders/${o.P.number}/ticket`));
      const sheet = await page.locator('.ad-sheet img').boundingBox();
      expect(sheet!.width).toBeLessThanOrEqual(width);
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
