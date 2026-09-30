import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { barcodeOf, parcel } from '@jozveyar/db/postfile.fixtures';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, parseJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import {
  alertOf,
  assignAtPayment,
  at,
  BASE,
  codeFor,
  enroll,
  GATE,
  layoutProblems,
  newContext,
  postFile,
  serverInvite,
  uploadPostFile as upload,
  watch,
} from './helpers';

/**
 * گزارش ارسال، سرتاسری (برش ۶٫۴؛ طرح `docs/ui/mockups/admin.html`: `m-ship-report`؛ ADR-048، تصمیم‌های ۹۹ تا ۱۱۱): سفارش‌ها با SQL
 * و تخصیص پرداخت (`assignAtPayment`)، و کد رهگیری از فایل پست ساختگی که **کارگر واقعی** می‌خواند و مالک «ثبت» می‌زند؛ پس هر عدد
 * گزارش از همان راهی است که روی سایت زنده می‌آید. مالک عددهای ماه جاری و ماه قبل را می‌بیند (سفارش چندبسته‌ای یکی، کنارگذاشته،
 * بی کد رهگیری جدا با پیوند به «سفارش‌ها»، لغوشده نه)، بازه‌های وزن را همان‌جا عوض می‌کند و برمی‌گرداند؛ متصدی و چاپخانه نه دکمه
 * دارند و نه صفحه؛ و ۳۲۰، ۳۹۰ و ۱۲۸۰ بی سرریز.
 *
 * همان پنل، پایگاه داده و کارگر `shipments.spec.ts` (طرز اجرا بالای همان). پایگاه دادهٔ دورریختنی، مثل `review.spec.ts`: همهٔ سفارش‌ها
 * در آغاز پاک می‌شوند، چون گزارش همهٔ سفارش‌های «تحویل پست شد» را می‌شمارد. بازه‌های وزن در پایان همان پیش از تست می‌شوند، و
 * چاپخانهٔ همین اجرا غیرفعال (چاپخانه پاک نمی‌شود).
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل، پایگاه داده و کارگر لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOOR = `چاپ نور ${RUN}`;
const TEHRAN = { provinceId: 8, cityId: 394 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const OWNER_ONLY = 'این بخش فقط برای مالک است';
const NO_ACCESS = 'این بخش برای چاپخانه باز نیست';
const BANDS = 'report.weight_bands';
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  /** کرایهٔ منجمد مشتری، ریال. */
  shipping: number;
}

/** ماه شمسی تهران: امروز، و ماه قبل با روزهای ۵ (پرداخت) و ۱۰ (پست). */
const [thisYear, thisMonth] = formatJalaliNumeric(new Date()).split('/').map(Number) as [number, number];
const prev = thisMonth === 1 ? { year: thisYear - 1, month: 12 } : { year: thisYear, month: thisMonth - 1 };
const pad = (n: number) => String(n).padStart(2, '0');
const key = (m: { year: number; month: number }) => `${m.year}-${pad(m.month)}`;
const THIS_KEY = key({ year: thisYear, month: thisMonth });
const PREV_KEY = key(prev);
const PREV_PAID = new Date(parseJalaliNumeric(`${prev.year}/${pad(prev.month)}/05`)!.getTime() + 10 * 60 * MINUTE);
const PREV_POST = `${prev.year}/${pad(prev.month)}/10`;

/** «−149,650»، «+7,550»: همان نشانه و گرد کردن طرح، برای عددهای انتظار. */
const tomans = (rials: number) => Math.round(Math.abs(rials) / 10).toLocaleString('en-US');
const signed = (rials: number) => (Math.round(rials / 10) === 0 ? '0' : `${rials < 0 ? '−' : '+'}${tomans(rials)}`);
const tax = (fare: number) => Math.floor((fare + 5) / 10);

/**
 * سفارش پرداخت‌شده همان‌طور که سرور می‌نویسد (سفارش، پرداخت، و چاپخانه در پرداخت)، با `pages` صفحه (برآورد وزن از همان `quote()`)،
 * و بعد «در حال چاپ»، «تحویل پست شد» دستی (بی کد رهگیری) یا «لغو شد».
 */
async function order(
  name: string,
  phone: string,
  place: { provinceId: number; cityId: number },
  pages: number,
  state: 'printing' | 'handed' | 'cancelled',
  { paidAt = new Date(Date.now() - 60 * MINUTE) } = {},
): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', ${pages},
            ${'e2e'.padEnd(64, '4')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
  const zoneId = place.provinceId === TEHRAN.provinceId ? 'tehran' : 'other';
  const breakdown = quote(
    {
      items: [
        {
          sections: [{ documentId: docId, pageCount: pages }],
          rules: [{ pageRanges: [[1, pages]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
          copies: 1,
          sidesMode: 'double',
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: { methodId: 'post', zoneId },
    },
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
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', ${zoneId},
              ${place.provinceId}, ${place.cityId}, ${name}, ${phone}, 'خیابان ولیعصر، پلاک 12', ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, ${pages}, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, ${pages})`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json([[1, pages]])}, 'bw', 'tahrir80')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(paidAt, 3)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    const to = state === 'cancelled' ? 'cancelled' : 'printing';
    await tx`UPDATE orders SET status = ${to}::order_status WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, 'paid', ${to}::order_status, ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    if (state === 'handed') {
      await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'printing', 'handed_to_post', now(), 'system')`;
    }
    return { id: row!.id, number: row!.order_number, shipping: breakdown.shippingRials! };
  });
}

const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const row = (page: Page, table: string, group: string) => page.locator(`[data-report="${table}"] tr[data-group="${group}"]`);
const cells = async (locator: ReturnType<Page['locator']>) =>
  (await locator.locator('th, td').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());

test.describe.serial('گزارش ارسال', () => {
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  let partnerContext: BrowserContext;
  let partnerPage: Page;
  let partnerProblems: string[] = [];
  let bandsBefore: unknown = 'tariff';
  const o = {} as Record<'A' | 'B' | 'C' | 'D' | 'E' | 'P', Seeded>;
  const phone = (n: number) => `0914${String(RUN).slice(1)}3${String(n).padStart(3, '0')}`;
  /** کرایه و وزن هر بسته، ریال و گرم؛ مالیات ده درصد، مثل فایل واقعی. */
  const FARE = { a1: 1_295_000, a2: 1_295_000, b: 1_900_000, e: 1_295_000, p: 1_295_000 };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // «امروز» فایل تا نیمه‌شب تهران است، و ماه جاری با همان روز؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 5 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    // پایگاه دادهٔ دورریختنی، مثل `review.spec.ts`: گزارش فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;
    const [saved] = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${BANDS}`;
    bandsBefore = saved?.value ?? 'tariff';
    await sql`UPDATE settings SET value = ${sql.json('tariff')} WHERE key = ${BANDS}`;
    await sql`INSERT INTO print_partners (name, province_id, city_id, created_at)
              VALUES (${NOOR}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${new Date(Date.now() - DAY)})`;

    // ماه جاری: A دو بسته (تهران، 200 صفحه)، B یک بسته (مشهد و چاپ نور، 1200 صفحه)، E یک بسته (تهران، 400 صفحه)، C «تحویل پست شد»
    // دستی و بی کد، D لغوشده. ماه قبل: P یک بسته (تهران، 10 صفحه).
    o.A = await order('مهسا طاهری', phone(1), TEHRAN, 200, 'printing');
    o.B = await order('مریم کاظمی', phone(2), MASHHAD, 1200, 'printing');
    o.C = await order('علی کریمی', phone(3), TEHRAN, 10, 'handed');
    o.D = await order('زهرا محمدی', phone(4), TEHRAN, 400, 'cancelled');
    o.E = await order('کیوان یوسفی', phone(5), TEHRAN, 400, 'printing');
    o.P = await order('سارا رضایی', phone(6), TEHRAN, 10, 'printing', { paidAt: PREV_PAID });

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    // کاربر چاپخانه از «ادمین‌ها»، با پیوند یک‌باره و کد تازه (دستور سرور نقش چاپخانه نمی‌سازد، ۵٫۳).
    await ownerPage.goto(at('/admins/new'));
    await ownerPage.getByLabel('نام', { exact: true }).fill('حسن نوری');
    await ownerPage.getByLabel('نام کاربری').fill(`hasan${RUN}`);
    await ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / }).check();
    await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: NOOR }).getByRole('radio').check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'پیوند ثبت حسن نوری آماده است' })).toBeVisible();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    partnerContext = await newContext(browser);
    partnerPage = await partnerContext.newPage();
    partnerProblems = watch(partnerPage);
    await enroll(partnerPage, link);

    // کد رهگیری از فایل پست، با کارگر واقعی و «ثبت» مالک؛ روز پست P دهم ماه قبل.
    const today = formatJalaliNumeric(new Date());
    const id = await upload(
      ownerPage,
      `FileName-${RUN}4.xls`,
      postFile([
        parcel(1, barcodeOf(RUN * 1000 + 1), `طاهری ${o.A.number}`, 'تهران', 400, FARE.a1, { date: today }),
        parcel(2, barcodeOf(RUN * 1000 + 2), `طاهری ${o.A.number}`, 'تهران', 350, FARE.a2, { date: today }),
        parcel(3, barcodeOf(RUN * 1000 + 3), `کاظمی ${o.B.number}`, 'مشهد', 3_300, FARE.b, { date: today }),
        parcel(4, barcodeOf(RUN * 1000 + 4), `یوسفی ${o.E.number}`, 'تهران', 1_200, FARE.e, { date: today }),
        parcel(5, barcodeOf(RUN * 1000 + 5), `رضایی ${o.P.number}`, 'تهران', 200, FARE.p, { date: PREV_POST }),
      ]),
    );
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    await ownerPage.locator('.ad-commit').getByRole('button', { name: 'ثبت: 5 کد رهگیری' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test.afterAll(async () => {
    if (sql) {
      await sql`UPDATE settings SET value = ${sql.json(bandsBefore as never)} WHERE key = ${BANDS}`;
      const ids = Object.values(o).map((one) => one.id);
      if (ids.length > 0) {
        await sql`DELETE FROM payments WHERE order_id = ANY(${ids})`;
        await sql`DELETE FROM orders WHERE id = ANY(${ids})`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${NOOR} AND deactivated_at IS NULL`;
    }
    await ownerContext?.close();
    await operatorContext?.close();
    await partnerContext?.close();
    await sql?.end();
  });

  test('مالک: ماه جاری «تا امروز» و ماه قبل؛ سفارش چندبسته‌ای یکی؛ بی کد رهگیری جدا با پیوند؛ لغوشده نه', async () => {
    const page = ownerPage;
    await page.goto(at('/shipments'));
    await page.locator('.ad-pagehead').getByRole('link', { name: 'گزارش ارسال' }).click();
    await expect(page.getByRole('heading', { name: 'گزارش ارسال', level: 1 })).toBeVisible();
    const chips = page.getByRole('navigation', { name: 'ماه' }).getByRole('link');
    await expect(chips).toHaveText([`${MONTHS[thisMonth - 1]} ${thisYear}، تا امروز`, `${MONTHS[prev.month - 1]} ${prev.year}`]);
    await expect(chips.first()).toHaveAttribute('aria-current', 'page');

    // A، B و E با کد رهگیری؛ C بی کد؛ D لغوشده.
    const paid = o.A.shipping + o.B.shipping + o.E.shipping;
    const fares = FARE.a1 + FARE.a2 + FARE.b + FARE.e;
    const taxes = tax(FARE.a1) + tax(FARE.a2) + tax(FARE.b) + tax(FARE.e);
    const margin = paid - fares - taxes;
    expect([o.A.shipping, o.B.shipping, o.E.shipping]).toEqual([1_295_000, 2_072_000, 1_500_000]);
    await expect(tile(page, 'orders').locator('.ad-tile__n')).toHaveText('3');
    await expect(tile(page, 'orders').locator('.ad-tile__t')).toHaveText('4 بسته، با کد رهگیری');
    await expect(tile(page, 'paid').locator('.ad-tile__n')).toHaveText(tomans(paid));
    await expect(tile(page, 'took').locator('.ad-tile__n')).toHaveText(tomans(fares + taxes));
    await expect(tile(page, 'took').locator('.ad-tile__t')).toHaveText(`کرایه ${tomans(fares)} + مالیات ${tomans(taxes)}`);
    await expect(tile(page, 'margin').locator('.ad-tile__n')).toHaveText(signed(margin));
    // −1,496,500 از 4,867,000 = −30.7٪ کرایهٔ مشتری.
    await expect(tile(page, 'margin').locator('.ad-tile__t')).toHaveText('−30.7٪ کرایهٔ مشتری');

    // منطقه‌ها با «همه»، و چاپخانه‌ها بی ردیف خالی؛ سفارش چندبسته‌ای یک سفارش با دو بسته.
    expect(await cells(row(page, 't-mz', 'tehran'))).toEqual(['استان تهران', '2 · 3 بسته', '279,500', '427,350', '−147,850 −52.9٪']);
    expect(await cells(row(page, 't-mz', 'other'))).toEqual(['بقیهٔ کشور', '1 · 1 بسته', '207,200', '209,000', '−1,800 −0.9٪']);
    expect(await cells(row(page, 't-mz', 'all'))).toEqual(['همه', '3 · 4 بسته', tomans(paid), tomans(fares + taxes), `${signed(margin)} −30.7٪`]);
    const partners = page.locator('[data-report="t-mp"] tbody tr');
    await expect(partners).toHaveCount(2);
    await expect(partners.filter({ hasText: 'چاپخانهٔ جزوه‌یار · تهران' })).toContainText('2 · 3 بسته');
    await expect(partners.filter({ hasText: `${NOOR} · مشهد` })).toContainText('1 · 1 بسته');
    // وزن واقعی در برابر برآورد، با بازه‌های کرایهٔ تعرفهٔ فعال (1 و 3 کیلو).
    const weights = page.locator('[data-report="t-mw"] tbody tr');
    expect(await cells(weights.nth(0))).toEqual(['زیر 1 کیلو', '1', '659 گرم', '750 گرم', '1.14']);
    expect(await cells(weights.nth(1))).toEqual(['1 تا 3 کیلو', '1', '1,158 گرم', '1,200 گرم', '1.04']);
    expect(await cells(weights.nth(2))).toEqual(['بالای 3 کیلو', '1', '3,154 گرم', '3,300 گرم', '1.05']);
    await expect(page.locator('[data-bands="tariff"]')).toContainText('بازه‌ها همان بازه‌های کرایهٔ تعرفهٔ فعال‌اند (نسخهٔ 1: 1 و 3 کیلو).');

    // «بی کد رهگیری»: C، با پیوند به همان سفارش‌ها در «سفارش‌ها» (تصمیم ۱۰۸).
    const untracked = page.locator('[data-report="untracked"]');
    await expect(untracked).toHaveText('«بی کد رهگیری»: 1 سفارش تحویل پست‌شدهٔ این ماه هنوز کد ندارند و در این جمع نیستند. لغوشده‌ها نه.');
    await untracked.getByRole('link', { name: '1 سفارش' }).click();
    await expect(page).toHaveURL(new RegExp(`/orders\\?untracked=${THIS_KEY}$`));
    await expect(page.locator('[data-filter="untracked"]')).toContainText(`فقط سفارش‌های «تحویل پست شد» ${MONTHS[thisMonth - 1]} ${thisYear} که کد رهگیری ندارند: 1 سفارش`);
    await expect(page.locator('.ad-rows > li')).toHaveCount(1);
    await expect(page.locator('.ad-rows > li')).toContainText(String(o.C.number));
    await expect(page.getByRole('navigation', { name: 'وضعیت سفارش' })).toHaveCount(0);
    await page.locator('[data-filter="untracked"]').getByRole('link', { name: 'همهٔ سفارش‌ها' }).click();
    await expect(page.getByRole('navigation', { name: 'وضعیت سفارش' })).toBeVisible();

    // ماه قبل: فقط P، بی «بی کد رهگیری».
    await page.goto(at('/shipments/report'));
    await page.getByRole('navigation', { name: 'ماه' }).getByRole('link', { name: `${MONTHS[prev.month - 1]} ${prev.year}` }).click();
    await expect(page).toHaveURL(new RegExp(`/shipments/report\\?month=${PREV_KEY}$`));
    await expect(page.getByRole('navigation', { name: 'ماه' }).getByRole('link', { name: `${MONTHS[prev.month - 1]} ${prev.year}` })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(tile(page, 'orders').locator('.ad-tile__n')).toHaveText('1');
    await expect(tile(page, 'margin').locator('.ad-tile__n')).toHaveText(signed(o.P.shipping - FARE.p - tax(FARE.p)));
    await expect(tile(page, 'margin').locator('.ad-tile__t')).toHaveText('−10.0٪ کرایهٔ مشتری');
    await expect(page.locator('[data-report="untracked"]')).toHaveText('همهٔ سفارش‌های تحویل پست‌شدهٔ این ماه کد رهگیری دارند. لغوشده‌ها نه.');
    // ماهی که نیست یا بدشکل: تازه‌ترین ماه.
    await page.goto(at('/shipments/report?month=1399-01'));
    await expect(page.getByRole('navigation', { name: 'ماه' }).getByRole('link').first()).toHaveAttribute('aria-current', 'page');
    await expect(tile(page, 'orders').locator('.ad-tile__n')).toHaveText('3');
    expect(ownerProblems).toEqual([]);
  });

  test('بازه‌ها را عوض کن: خطا سر جای خودش، ذخیره، «همان که دیده شد»، برگرداندن به بازه‌های تعرفه، و رویداد', async () => {
    const page = ownerPage;
    await page.goto(at('/shipments/report'));
    await page.getByRole('link', { name: 'بازه‌ها را عوض کن' }).click();
    const form = page.getByRole('form', { name: 'بازه‌های وزن گزارش' });
    const field = (n: number) => form.getByLabel(`مرز ${n}`, { exact: true });
    // مرزهای امروز (کرایهٔ تعرفه) و دو فیلد خالی.
    await expect(form.getByRole('textbox')).toHaveCount(4);
    await expect(field(1)).toHaveValue('1000');
    await expect(field(2)).toHaveValue('3000');
    await field(2).fill('۵۰۰');
    await form.getByRole('button', { name: 'ذخیرهٔ بازه‌ها' }).click();
    await expect(field(2)).toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('#rb-1-error')).toHaveText('باید از 1,000 گرم بیشتر باشد؛ مرزها از کم به زیاد.');
    await expect(field(1)).not.toHaveAttribute('aria-invalid', 'true');
    // نوشته‌ها ماندند؛ هیچ ذخیره نشد.
    await expect(field(2)).toHaveValue('۵۰۰');
    expect((await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${BANDS}`)[0]!.value).toBe('tariff');

    await field(1).fill('300');
    await field(2).fill('1000');
    await form.getByRole('button', { name: 'ذخیرهٔ بازه‌ها' }).click();
    await expect(page.locator('main .jy-note--success')).toHaveText('بازه‌های وزن گزارش ذخیره شد: 300 و 1,000 گرم. قیمت و تعرفه عوض نشد.');
    expect((await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${BANDS}`)[0]!.value).toEqual([300, 1_000]);
    const weights = page.locator('[data-report="t-mw"] tbody tr');
    expect(await cells(weights.nth(0))).toEqual(['زیر 300 گرم', '0', '—', '—', '—']);
    expect(await cells(weights.nth(1))).toEqual(['300 تا 1,000 گرم', '1', '659 گرم', '750 گرم', '1.14']);
    expect(await cells(weights.nth(2))).toEqual(['بالای 1,000 گرم', '2', '2,156 گرم', '2,250 گرم', '1.04']);
    await expect(page.locator('[data-bands="custom"]')).toContainText('بازه‌ها را از همین گزارش گذاشته‌ای (300 و 1,000 گرم)؛ کرایهٔ تعرفهٔ فعال: 1 و 3 کیلو.');

    // همان که دیده شد: فرمی که 300 و 1,000 را دید، پس از تغییر جای دیگر رونویسی نمی‌کند.
    await page.getByRole('link', { name: 'بازه‌ها را عوض کن' }).click();
    // فرم پیش از تغییر دیده شد (همان 300 و 1,000)، بعد جای دیگری عوض شد.
    await expect(field(1)).toHaveValue('300');
    await sql`UPDATE settings SET value = ${sql.json([2_000])} WHERE key = ${BANDS}`;
    await field(3).fill('5000');
    await form.getByRole('button', { name: 'ذخیرهٔ بازه‌ها' }).click();
    await expect(alertOf(page)).toHaveText('این تنظیم همین حالا جای دیگری عوض شد؛ مقدار تازه را ببین و اگر هنوز لازم است، دوباره ذخیره کن.');
    await expect(page.locator('[data-bands="custom"]')).toContainText('بازه‌ها را از همین گزارش گذاشته‌ای (2 کیلو)');
    expect((await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${BANDS}`)[0]!.value).toEqual([2_000]);

    // برگرداندن به بازه‌های تعرفه (تصمیم ۱۰۹).
    await page.getByRole('link', { name: 'بازه‌ها را عوض کن' }).click();
    await expect(field(1)).toHaveValue('2000');
    await page.getByRole('button', { name: 'برگرداندن به بازه‌های تعرفه' }).click();
    await expect(page.locator('main .jy-note--success')).toHaveText(
      'بازه‌های وزن گزارش به بازه‌های کرایهٔ تعرفهٔ فعال برگشت؛ با هر نسخهٔ تازهٔ تعرفه همراه می‌شوند.',
    );
    await expect(page.locator('[data-bands="tariff"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'برگرداندن به بازه‌های تعرفه' })).toHaveCount(0);
    expect((await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${BANDS}`)[0]!.value).toBe('tariff');

    // رویدادها با چیپ «تنظیمات و کلیدها»، بی رویداد برای ذخیره‌ای که نشست.
    await page.goto(at('/events?kind=settings'));
    const log = page.locator('.ad-log li');
    await expect(log.nth(0)).toContainText('بازه‌های وزن گزارش ارسال: 2 کیلو ← بازه‌های کرایهٔ تعرفه');
    await expect(log.nth(1)).toContainText('بازه‌های وزن گزارش ارسال: بازه‌های کرایهٔ تعرفه ← 300 و 1,000 گرم');
    await expect(log.nth(1)).toContainText('سارا رضایی');
    expect(ownerProblems).toEqual([]);
  });

  test('فقط مالک: پیوند «کرایه‌ای که پست واقعاً گرفت» در «تعرفه»؛ متصدی و چاپخانه نه دکمه دارند و نه صفحه', async () => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.locator('[data-tariff="shipping"]').getByRole('link', { name: 'کرایه‌ای که پست واقعاً گرفت' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'گزارش ارسال', level: 1 })).toBeVisible();

    const operator = operatorPage;
    await operator.goto(at('/shipments'));
    await expect(operator.getByRole('heading', { name: 'ارسال', level: 1 })).toBeVisible();
    await expect(operator.getByRole('link', { name: 'گزارش ارسال' })).toHaveCount(0);
    await operator.goto(at('/tariff'));
    await expect(operator.locator('[data-tariff="shipping"]')).toBeVisible();
    await expect(operator.getByRole('link', { name: 'کرایه‌ای که پست واقعاً گرفت' })).toHaveCount(0);
    await operator.goto(at('/shipments/report'));
    await expect(operator.getByRole('heading', { name: OWNER_ONLY })).toBeVisible();
    await expect(operator.locator('main')).toContainText('برگرداندن ورود فایل پست و گزارش ارسال با مالک پنل است');
    await expect(operator.locator('[data-report]')).toHaveCount(0);
    await operator.goto(at(`/shipments/report?month=${THIS_KEY}&bands=edit`));
    await expect(operator.getByRole('heading', { name: OWNER_ONLY })).toBeVisible();
    await expect(operator.getByRole('form', { name: 'بازه‌های وزن گزارش' })).toHaveCount(0);

    const partner = partnerPage;
    await partner.goto(at('/shipments'));
    await expect(partner.getByRole('heading', { name: 'ارسال', level: 1 })).toBeVisible();
    await expect(partner.getByRole('link', { name: 'گزارش ارسال' })).toHaveCount(0);
    await partner.goto(at('/shipments/report'));
    await expect(partner.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    await expect(partner.locator('[data-report]')).toHaveCount(0);
    // نه عددی از سفارش‌های دیگران، نه نام چاپخانهٔ دیگر.
    expect(await partner.content()).not.toContain('چاپخانهٔ جزوه‌یار');
    expect(operatorProblems).toEqual([]);
    expect(partnerProblems).toEqual([]);
    expect(ownerProblems).toEqual([]);
  });

  test('۳۲۰، ۳۹۰ و ۱۲۸۰: گزارش، فرم بازه‌ها و «بی کد رهگیری» بی سرریز، با هدف لمسی ۴۴', async ({ browser }) => {
    test.setTimeout(240_000);
    const paths = ['/shipments/report', `/shipments/report?month=${THIS_KEY}&bands=edit`, `/shipments/report?month=${PREV_KEY}`, `/orders?untracked=${THIS_KEY}`];
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      const page = await context.newPage();
      const problems = watch(page);
      await enroll(page, serverInvite(`rrep${RUN}${width}`, '--name', 'بیننده'));
      for (const path of paths) {
        await page.goto(at(path));
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      // در گوشی هر ردیف جدول یک کارت با برچسب کنار هر عدد (طرح): سرستون پنهان.
      await page.goto(at('/shipments/report'));
      const head = page.locator('[data-report="t-mz"] thead');
      if (width <= 520) await expect(head).toBeHidden();
      else await expect(head).toBeVisible();
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
