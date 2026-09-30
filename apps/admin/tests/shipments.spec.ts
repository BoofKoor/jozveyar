import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { POST_HEADERS, barcodeOf, parcel } from '@jozveyar/db/postfile.fixtures';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, formatJalaliWeekday, tehranDayStart } from '@jozveyar/text';

import { alertOf, assignAtPayment, at, BASE, enroll, GATE, layoutProblems, newContext, postFile, serverInvite, uploadPostFile as upload, watch } from './helpers';

/**
 * ارسال در پنل، سرتاسری (برش ۶٫۱؛ طرح `docs/ui/mockups/admin.html`، ADR-045 و ADR-046): بارگذاری فایل پست (جدول HTML با پسوند
 * `.xls`، ساختگی به همان شکل فایل واقعی)، خواندنش با **کارگر واقعی** (`read_post_file`)، پیش‌نمایش با حکم هر سطر و جمع کل، «ثبت»
 * و «در حال چاپ» ← «تحویل پست شد» با کد رهگیری در صفحهٔ سفارش و جست‌وجو؛ همان فایل دوباره؛ فایل هم‌پوشان «تکراری»؛ `.xls` واقعی و
 * ستون کم «خوانده نشد»؛ «دور بینداز»؛ برگرداندن فقط با مالک؛ سفارش با کد رهگیری که برنمی‌گردد؛ رویدادها با چیپ «ارسال»؛ و گوشی و
 * دسکتاپ.
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، و کارگری روی همان پایگاه داده؛ خواندن فایل پست استوریج نمی‌خواهد:
 *
 *   (متغیرهای `admin.spec.ts`) و کارگر: (از services/docworker) DATABASE_URL=… DOCWORKER_POLL_SECONDS=0.5 python -m docworker
 *
 * سفارش‌ها را خود تست با SQL می‌نشاند (Playwright ماژول ESM `@jozveyar/db` را بار نمی‌کند؛ fixture فایل پست بی import است).
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل، پایگاه داده و کارگر لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
}

/**
 * سفارش پرداخت‌شده همان‌طور که سرور می‌نویسد (سفارش، پرداخت و چاپخانه در پرداخت)، در تهران؛ `printing`: و «شروع چاپ» خورده. بی
 * کارهای PDF: خواندن فایل پست به فایل چاپ کاری ندارد.
 */
async function paidOrder(name: string, phone: string, printing = true, paidAt = new Date(Date.now() - 60 * MINUTE)): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '6')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
    SEED_PRICE_LIST,
  );
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${phone}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', 'tehran',
              8, 394, ${name}, ${phone}, 'خیابان ولیعصر، پلاک 12', ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    if (printing) {
      await tx`UPDATE orders SET status = 'printing' WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'paid', 'printing', ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    }
    return { id: row!.id, number: row!.order_number };
  });
}

/** بسته‌ای که پست امروز گرفت. کد رهگیری یکتای همین اجرا. */
const today = () => formatJalaliNumeric(new Date());
const code = (n: number) => barcodeOf(RUN * 1000 + n);
const row = (n: number, barcode: string, nameG: string, grams = 820 + n * 10) =>
  parcel(n, barcode, nameG, 'تهران', grams, 1_295_000, { date: today() });

const statusOf = async (o: Seeded) => (await sql<{ status: string }[]>`SELECT status::text FROM orders WHERE id = ${o.id}`)[0]!.status;
const importStatus = async (id: string) => (await sql<{ status: string }[]>`SELECT status FROM shipment_imports WHERE id = ${id}`)[0]!.status;

test.describe.serial('ارسال در پنل', () => {
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const o = {} as Record<'A' | 'B' | 'C' | 'D', Seeded>;
  let firstId = '';
  let firstName = '';
  /** ورود هم‌پوشانی که ثبت شد و برنمی‌گردد (تست ۳)، برای گوشی و دسکتاپ. */
  let overlapId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // «امروز» فایل تا نیمه‌شب تهران است؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند تا روز فایل وسط تست کهنه نشود.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 3 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const phone = (n: number) => `0912${String(RUN).slice(1)}6${String(n).repeat(3)}`;
    o.A = await paidOrder('مهسا طاهری', phone(1));
    o.B = await paidOrder('امید شریفی', phone(2));
    o.C = await paidOrder('زهرا محمدی', phone(3), false);
    // پرداخت سه روز پیش: بسته‌ای که پست دیروز گرفت پیش از پرداخت نیست.
    o.D = await paidOrder('نرگس احمدی', phone(4), true, new Date(Date.now() - 3 * 24 * 60 * MINUTE));

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await operatorContext?.close();
    await sql?.end();
  });

  test('متصدی: بارگذاری، «در حال خواندن» تا کارگر بخواند، پیش‌نمایش با حکم هر سطر و جمع کل، و «ثبت» با «تحویل پست شد»', async () => {
    const page = operatorPage;
    await page.goto(at());
    const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' });
    await nav.getByRole('link', { name: 'ارسال' }).click();
    await expect(page.getByRole('heading', { name: 'ارسال', level: 1 })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'ارسال' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('فایل پست را اینجا بینداز')).toBeVisible();

    firstName = `FileName-${RUN}1.xls`;
    const id = await upload(
      page,
      firstName,
      postFile([
        row(1, code(1), `طاهری ${o.A.number}`),
        row(2, code(2), `شریفی ${o.B.number}`),
        row(3, code(3), `محمدی ${o.C.number}`),
        row(4, code(4), 'طهماسبی 6103'),
        // بی شماره و بی نامزد: «پیدا نشد» (از ۶٫۲ سطر بی شماره‌ای که نامزد دارد صف تأیید است؛ `review.spec.ts`).
        row(5, code(5), 'ناشناس'),
      ]),
    );
    firstId = id;
    // کارگر واقعی می‌خواند؛ صفحه خودش تازه می‌شود.
    await expect(page.getByRole('heading', { name: firstName })).toBeVisible({ timeout: 30_000 });
    expect(await importStatus(id)).toBe('read');
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش');
    await expect(page.locator('main')).toContainText('هنوز چیزی ثبت نشده. با «ثبت»، 2 کد رهگیری به سفارش‌ها می‌نشیند');
    const count = (id: string) => page.locator(`[data-count="${id}"] .ad-tile__n`);
    await expect(count('ok')).toHaveText('2');
    await expect(count('review')).toHaveText('1');
    await expect(count('nf')).toHaveText('2');
    await expect(count('dup')).toHaveText('0');
    await expect(page.locator('main')).toContainText('جمع کل فایل با جمع سطرها می‌خواند: 5 بسته');
    const review = page.locator('[data-group="review"] .ad-prow');
    await expect(review).toHaveCount(1);
    await expect(review).toContainText(`سفارش ${o.C.number} (زهرا محمدی، تهران) هنوز «در صف چاپ» است`);
    await expect(page.locator('[data-group="nf"]')).toContainText('6103 شمارهٔ سفارش سایت نیست');
    await expect(page.locator('[data-group="nf"]')).toContainText('«نام گ» شماره ندارد.');
    const ok = page.locator('[data-group="ok"] .ad-prow');
    await expect(ok).toHaveCount(2);
    await expect(ok.first()).toContainText(`سفارش ${o.A.number} · مهسا طاهری، تهران`);
    await expect(ok.first()).toContainText('«در حال چاپ» است؛ با «ثبت» «تحویل پست شد» می‌شود، با روز فایل.');
    // کد رهگیری در شش گروه، ولی کپی‌اش همان ۲۴ رقم.
    await expect(ok.first().locator('.jy-barcode > span')).toHaveCount(6);
    expect(await ok.first().locator('.jy-barcode').textContent()).toBe(code(1));
    // «ثبت» و «دور بینداز» ثابت زیر شمارها، نه چسبان (تصمیم طرح).
    const commit = page.locator('.ad-commit');
    expect(await commit.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    expect(await statusOf(o.A)).toBe('printing');

    await commit.getByRole('button', { name: 'ثبت: 2 کد رهگیری' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    await expect(page.locator('main')).toContainText('ثبت شد: 2 کد رهگیری نشست و 2 پیامک رفت.');
    await expect(page.locator('main')).toContainText('«تحویل پست شد» شدند');
    expect(await statusOf(o.A)).toBe('handed_to_post');
    expect(await statusOf(o.B)).toBe('handed_to_post');
    expect(await statusOf(o.C)).toBe('paid');
    await expect(page.getByRole('link', { name: 'برگرداندن این ورود' })).toHaveCount(0);

    // فهرست ورودها: همان ورود با شمارهایش.
    await page.goto(at('/shipments'));
    const line = page.locator('[data-imports] li', { hasText: firstName });
    await expect(line).toContainText('5 بسته: 2 کد رهگیری · 1 در صف تأیید · 2 پیدا نشد');
    expect(operatorProblems).toEqual([]);
  });

  test('صفحهٔ سفارش: «بستهٔ پستی» با کد و پیوند سایت پست، «فایل پست، کننده»، رویدادها، و جست‌وجو با کد رهگیری', async () => {
    const page = operatorPage;
    await page.goto(at(`/orders/${o.A.number}`));
    const side = page.locator('.ad-status');
    await expect(side.getByRole('heading', { name: 'به پست رسید' })).toBeVisible();
    // فایل پست فقط روز را دارد (سؤال ۷۰): روز، بی ساعت.
    await expect(side.locator('.ad-meta').first()).toHaveText(`امروز، ${formatJalaliWeekday(new Date())} · فایل پست، علی محمدی`);
    await expect(side).toContainText('به موبایل مشتری پیامک شد.');
    const card = page.locator('section[aria-labelledby="t-parcel"]');
    await expect(card.getByRole('heading', { name: 'بستهٔ پستی' })).toBeVisible();
    const track = card.getByRole('link', { name: 'رهگیری در سایت پست (زبانهٔ تازه)' });
    await expect(track).toHaveAttribute('href', `https://tracking.post.ir/search.aspx?id=${code(1)}`);
    await expect(track).toHaveAttribute('target', '_blank');
    await expect(track).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(card).toContainText('کرایهٔ پست');
    await expect(card).toContainText(`${firstName}، سطر 1`);
    const log = page.locator('.ad-log li');
    await expect(log.filter({ hasText: 'در حال چاپ ← تحویل پست شد' })).toContainText('علی محمدی، فایل پست');
    await expect(log.filter({ hasText: 'کد رهگیری' })).toContainText(firstName);

    await page.goto(at('/orders'));
    await page.getByRole('searchbox', { name: 'جست‌وجوی سفارش' }).fill(code(2).replace(/(\d{4})/g, '$1 ').trim());
    await page.getByRole('searchbox', { name: 'جست‌وجوی سفارش' }).press('Enter');
    await expect(page.locator('.ad-row')).toHaveCount(1);
    await expect(page.locator(`.ad-row[data-order="${o.B.number}"]`)).toBeVisible();

    // بسته‌ای که پست دیروز گرفت: «به پست رسید» و ستون «به پست رسید» فهرست فقط روز را می‌گویند؛ پایان روزِ ذخیره‌شده ساعت نیست.
    const yesterday = new Date(tehranDayStart(new Date()).getTime() - 12 * 60 * MINUTE);
    await upload(page, `FileName-${RUN}5.xls`, postFile([parcel(1, code(10), `احمدی ${o.D.number}`, 'تهران', 900, 1_295_000, { date: formatJalaliNumeric(yesterday) })]));
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    await page.locator('.ad-commit').getByRole('button', { name: 'ثبت: 1 کد رهگیری' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    await page.goto(at(`/orders/${o.D.number}`));
    await expect(page.locator('.ad-status .ad-meta').first()).toHaveText(`دیروز، ${formatJalaliWeekday(yesterday)} · فایل پست، علی محمدی`);
    await expect(page.locator('.ad-status')).toContainText('به‌موقع');
    await page.goto(at('/orders?status=handed'));
    await expect(page.locator(`.ad-row[data-order="${o.D.number}"] .ad-row__due`)).toHaveText('دیروز');
    await expect(page.locator(`.ad-row[data-order="${o.A.number}"] .ad-row__due`)).toHaveText('امروز');
    expect(operatorProblems).toEqual([]);
  });

  test('همان فایل دوباره همان ورود است؛ فایل هم‌پوشان «تکراری» و بستهٔ دوم همان سفارش؛ `.xls` واقعی و ستون کم «خوانده نشد»', async () => {
    const page = operatorPage;
    const again = await upload(
      page,
      'copy.xls',
      postFile([
        row(1, code(1), `طاهری ${o.A.number}`),
        row(2, code(2), `شریفی ${o.B.number}`),
        row(3, code(3), `محمدی ${o.C.number}`),
        row(4, code(4), 'طهماسبی 6103'),
        row(5, code(5), 'ناشناس'),
      ]),
    );
    expect(again).toBe(firstId);
    await expect(page.locator('main')).toContainText('همین فایل پیش‌تر وارد شده؛ این همان ورود است.');

    const overlap = await upload(page, `FileName-${RUN}2.xls`, postFile([row(1, code(1), `طاهری ${o.A.number}`), row(2, code(6), `شریفی ${o.B.number}`)]));
    overlapId = overlap;
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    await expect(page.locator('[data-count="dup"] .ad-tile__n')).toHaveText('1');
    await expect(page.locator('[data-group="dup"]')).toContainText(`برای همین سفارش (${o.A.number}، مهسا طاهری) آمد؛ دوباره ثبت نمی‌شود.`);
    await expect(page.locator('[data-group="ok"] .ad-prow')).toHaveCount(1);
    await page.locator('.ad-commit').getByRole('button', { name: 'ثبت: 1 کد رهگیری' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    expect(await importStatus(overlap)).toBe('committed');
    const [codes] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM shipments WHERE order_id = ${o.B.id} AND voided_at IS NULL`;
    expect(codes!.n).toBe(2);

    // Excel واقعی (OLE2): پیام روشن با راه جلو.
    await upload(page, 'FileName-excel.xls', Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(4096, RUN % 256)]));
    await expect(page.getByRole('heading', { name: 'این فایل خوانده نشد' })).toBeVisible({ timeout: 30_000 });
    await expect(alertOf(page)).toContainText('این فایل اکسل واقعی است، نه فایلی که پست می‌دهد');
    await expect(page.getByRole('link', { name: 'فایل دیگری بده' })).toBeVisible();

    // ستون «بارکد» نیست: «خوانده نشد» با ستون‌های لازم، و «دور بینداز».
    const headers = POST_HEADERS.map((h) => (h.trim() === 'بارکد' ? 'کد' : h));
    await upload(page, `FileName-${RUN}3.xls`, postFile([row(1, code(7), `طاهری ${o.A.number}`)], { headers }));
    await expect(page.getByRole('heading', { name: 'این فایل خوانده نشد' })).toBeVisible({ timeout: 30_000 });
    await expect(alertOf(page)).toContainText('ستون «بارکد» در این فایل نیست، پس کد رهگیری ندارد.');
    await expect(page.locator('.ad-need li')).toHaveCount(8);
    await page.getByRole('button', { name: 'دور بینداز' }).click();
    await expect(page.getByRole('heading', { name: 'ارسال', level: 1 })).toBeVisible();
    await expect(page.locator('main')).toContainText('فایل دور انداخته شد؛ چیزی ثبت نشد.');
    expect(operatorProblems).toEqual([]);
  });

  test('برگرداندن فقط با مالک، با دلیل: کدها کنار می‌روند و سفارشی که کد دیگری ندارد به «در حال چاپ» برمی‌گردد', async () => {
    // متصدی: نه دکمه، نه صفحه.
    await operatorPage.goto(at(`/shipments/${firstId}`));
    await expect(operatorPage.getByRole('link', { name: 'برگرداندن این ورود' })).toHaveCount(0);
    await operatorPage.goto(at(`/shipments/${firstId}/revert`));
    await expect(operatorPage.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();

    const page = ownerPage;
    await page.goto(at(`/shipments/${firstId}`));
    await page.getByRole('link', { name: 'برگرداندن این ورود' }).click();
    await expect(page.getByRole('heading', { name: `برگرداندن ${firstName}` })).toBeVisible();
    await expect(page.locator('.ad-changes')).toContainText('2 کد کنار می‌رود، پاک نمی‌شود');
    await page.getByRole('button', { name: 'این ورود را برگردان' }).click();
    // دلیل خالی: مرورگر خودش نمی‌فرستد (`required`)، و سرور هم «دلیل را بنویس».
    expect(await page.locator('#rv-why').evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
    await page.getByLabel('دلیل').fill('فایل روز اشتباه بود؛ فایل درست را جایش می‌آورم.');
    await page.getByRole('button', { name: 'این ورود را برگردان' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('برگشت');
    await expect(page.locator('main')).toContainText('«فایل روز اشتباه بود؛ فایل درست را جایش می‌آورم.»');
    await expect(page.locator('main')).toContainText(`سفارش ${o.A.number} به «در حال چاپ» برگشت`);
    // A کد دیگری ندارد: به «در حال چاپ». B کد دوم را از فایل دیگر دارد: «تحویل پست شد» می‌ماند.
    expect(await statusOf(o.A)).toBe('printing');
    expect(await statusOf(o.B)).toBe('handed_to_post');
    expect(await importStatus(firstId)).toBe('reverted');

    // سفارش B کد زنده دارد: برگرداندن وضعیتش نه، با راه جلو.
    await page.goto(at(`/orders/${o.B.number}`));
    const side = page.locator('.ad-status');
    await expect(side.getByRole('link', { name: 'برگرداندن به «در حال چاپ»' })).toHaveCount(0);
    await expect(side).toContainText('با کد رهگیری به «در حال چاپ» برنمی‌گردد؛ اگر کد اشتباه است، از کارت «بستهٔ پستی» کنارش بگذار');
    await expect(page.locator('section[aria-labelledby="t-parcel"] [data-voided]')).toContainText('کنار رفت');

    // فهرست ورودها: برگشته با شمار کدهایی که کنار رفت.
    await page.goto(at('/shipments'));
    await expect(page.locator('[data-imports] li[data-import="reverted"]', { hasText: firstName })).toContainText('2 کد رهگیری کنار رفت');

    // رویدادها با چیپ «ارسال».
    await page.goto(at('/events?kind=shipments'));
    await expect(page.getByRole('navigation', { name: 'نوع رویداد' }).getByRole('link', { name: 'ارسال' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('main')).toContainText(`ورود ${firstName} برگشت: 2 کد رهگیری کنار رفت`);
    await expect(page.locator('main')).toContainText(`فایل پست ${firstName} ثبت شد: 2 کد رهگیری`);
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: «ارسال»، پیش‌نمایش، ورود ثبت‌شده و «بستهٔ پستی» بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    const preview = await upload(operatorPage, `FileName-${RUN}4.xls`, postFile([row(1, code(8), `طاهری ${o.A.number}`), row(2, code(9), 'کریمی 10099')]));
    await expect(operatorPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      const page = await context.newPage();
      const problems = watch(page);
      await enroll(page, serverInvite(`view${RUN}${width}`, '--name', 'بیننده'));
      for (const path of ['/shipments', `/shipments/${preview}`, `/shipments/${overlapId}`, `/shipments/${firstId}`, `/orders/${o.B.number}`]) {
        await page.goto(at(path));
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
