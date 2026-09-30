import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { barcodeOf, parcel } from '@jozveyar/db/postfile.fixtures';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

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
 * صف تأیید و فایل چاپخانه، سرتاسری (برش ۶٫۲؛ طرح `docs/ui/mockups/admin.html`: `m-ship-review`، `m-ship-done` از چشم چاپخانه،
 * `m-dash` و `m-order-shipped`؛ ADR-046 و ADR-047): فایل پستی که سطرهای قطعی‌نشده دارد، خوانده با **کارگر واقعی**؛ صف تأیید مالک و
 * متصدی با نامزدها و انتخاب از پیش؛ «همین است» برای «تحویل پست شد» و «در صف چاپ» (با «شروع چاپ»)؛ «سفارش دیگر» با شماره؛ «هیچ‌کدام»
 * برای لغوشده؛ دادن دستی از «پیدا نشد»؛ کنار گذاشتن یک کد با برگشت یک قدم (مالک)؛ هشدارهای پیشخوان؛ فایل پست دو چاپخانه و دو کاربر
 * چاپخانه که مالک از «ادمین‌ها» می‌سازد (هر کدام فقط سفارش‌های خودش، بی کرایه، و سفارش دیگری «پیدا نشد» بی نشت)؛ برگرداندن ورود با
 * سطرهای صف؛ و گوشی و دسکتاپ.
 *
 * همان پنل، پایگاه داده و کارگر `shipments.spec.ts` (طرز اجرا بالای همان). سفارش‌ها را خود تست با SQL می‌نشاند، با تخصیص پرداخت
 * (`assignAtPayment`)؛ فایل چاپ سفارش «در صف چاپ» را هم (استوریج نمی‌خواهد: «همین است» فقط بودنش را می‌سنجد). چاپخانه پاک نمی‌شود،
 * پس نام چاپخانه‌های این تست شمارهٔ اجرا را دارد و در پایان غیرفعال می‌شوند، با سفارش‌هایشان پاک.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل، پایگاه داده و کارگر لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOOR = `چاپ نور ${RUN}`;
const AFTAB = `چاپ آفتاب ${RUN}`;
const TEHRAN = { provinceId: 8, cityId: 394 };
const KARAJ = { provinceId: 5, cityId: 1094 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const ISFAHAN = { provinceId: 4, cityId: 122 };
const QUEUE_EMPTY = 'صف تأیید خالی است';
const NO_ACCESS = 'این بخش برای چاپخانه باز نیست';

let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  /** برآورد وزن سفارش؛ بستهٔ فایل با همین وزن «وزن می‌خواند». */
  grams: number;
}

type State = 'paid' | 'printing' | 'handed' | 'cancelled';

/**
 * سفارش پرداخت‌شده همان‌طور که سرور می‌نویسد (سفارش، پرداخت، و چاپخانه در پرداخت)، و بعد وضعیت `state`: «در حال چاپ»، «تحویل پست
 * شد» دستی (بی کد رهگیری، `handedAt`)، یا «لغو شد». `printFiles`: فایل چاپ یک‌جلدی، مثل کارگر (دروازهٔ «شروع چاپ»).
 */
async function order(
  name: string,
  phone: string,
  place: { provinceId: number; cityId: number },
  state: State,
  { paidAt = new Date(Date.now() - 60 * MINUTE), handedAt = new Date(), printFiles = false } = {},
): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '2')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = place.provinceId === TEHRAN.provinceId ? 'tehran' : 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
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
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(paidAt, 3)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    if (printFiles) {
      await tx`INSERT INTO order_print_files (order_item_id, volume, first_page, last_page, storage_key, size_bytes, sha256)
               VALUES (${item!.id}, 1, 1, 10, ${`orders/${row!.order_number}/print-1-1.pdf`}, 1000, ${'c'.repeat(64)})`;
    }
    if (state !== 'paid') {
      const to = state === 'cancelled' ? 'cancelled' : 'printing';
      await tx`UPDATE orders SET status = ${to}::order_status WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'paid', ${to}::order_status, ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    }
    if (state === 'handed') {
      await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = ${handedAt} WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'printing', 'handed_to_post', ${handedAt}, 'system')`;
    }
    return { id: row!.id, number: row!.order_number, grams: breakdown.estWeightGrams };
  });
}

/**
 * بسته‌ای که پست امروز گرفت، با کد رهگیری یکتای همین اجرا و وزنی که با برآورد سفارش می‌خواند. `n` ستون «ردیف» و کد است؛ شمارهٔ سطر
 * در پنل جای سطر در فایل است (اولین سطر زیر سرستون 1).
 */
const today = () => formatJalaliNumeric(new Date());
const code = (n: number) => barcodeOf(RUN * 1000 + n);
const row = (n: number, nameG: string, destination: string, grams: number) =>
  parcel(n, code(n), nameG, destination, grams, 1_295_000, { date: today() });

const statusOf = async (o: Seeded) => (await sql<{ status: string }[]>`SELECT status::text FROM orders WHERE id = ${o.id}`)[0]!.status;
const liveCodes = async (o: Seeded) =>
  (await sql<{ id: string; matched_by: string }[]>`SELECT id, matched_by FROM shipments WHERE order_id = ${o.id} AND voided_at IS NULL`).map(
    (s) => [s.id, s.matched_by] as const,
  );
const reviewCard = (page: Page, importId: string, rowNo: number) => page.locator(`[data-review="${importId}.${rowNo}"]`);

test.describe.serial('صف تأیید و فایل چاپخانه', () => {
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const partner = {} as Record<'hasan' | 'mina', { context: BrowserContext; page: Page; problems: string[] }>;
  const o = {} as Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'N1' | 'N2' | 'N3' | 'T' | 'X', Seeded>;
  let staffFile = '';
  let staffName = '';
  let partnerFile = '';
  const phone = (n: number) => `0913${String(RUN).slice(1)}2${String(n).padStart(3, '0')}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // «امروز» فایل تا نیمه‌شب تهران است؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 5 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    // پایگاه دادهٔ دورریختنی، مثل `orders.spec.ts` و `partners.spec.ts`: نامزدها، صف و هشدارهای پیشخوان فقط سفارش‌های همین اجرا.
    await sql`DELETE FROM payments`;
    await sql`DELETE FROM orders`;
    const yesterday = new Date(Date.now() - DAY);
    for (const [name, place] of [
      [NOOR, MASHHAD],
      [AFTAB, ISFAHAN],
    ] as const) {
      await sql`INSERT INTO print_partners (name, province_id, city_id, created_at) VALUES (${name}, ${place.provinceId}, ${place.cityId}, ${yesterday})`;
    }
    // فایل جزوه‌یار (تهران): A «تحویل پست شد» دستی امروز، B کرج، C «تحویل پست شد» دستی، D و G «در حال چاپ»، E «در صف چاپ» با فایل
    // چاپ، F لغوشده. H ده روز پیش «تحویل پست شد» و هنوز بی کد رهگیری.
    o.A = await order('رضا احمدی', phone(1), TEHRAN, 'handed');
    o.B = await order('نرگس احمدی', phone(2), KARAJ, 'printing', { paidAt: new Date(Date.now() - 120 * MINUTE) });
    o.C = await order('سارا رضایی', phone(3), TEHRAN, 'handed');
    o.D = await order('علی کریمی', phone(4), TEHRAN, 'printing');
    o.E = await order('زهرا محمدی', phone(5), TEHRAN, 'paid', { printFiles: true });
    o.F = await order('امین قاسمی', phone(6), TEHRAN, 'cancelled');
    o.G = await order('کیوان یوسفی', phone(7), TEHRAN, 'printing');
    o.H = await order('مهدی نوری', phone(8), TEHRAN, 'handed', { paidAt: new Date(Date.now() - 11 * DAY), handedAt: new Date(Date.now() - 10 * DAY) });
    // فایل چاپ نور (مشهد): N1 و N2 «در حال چاپ»، N3 ده روز پیش «تحویل پست شد» بی کد؛ T سفارش جزوه‌یار و X سفارش آفتاب.
    o.N1 = await order('فرزانه کاظمی', phone(11), MASHHAD, 'printing');
    o.N2 = await order('حسین اکبری', phone(12), MASHHAD, 'printing');
    o.N3 = await order('پریسا جلالی', phone(13), MASHHAD, 'handed', { paidAt: new Date(Date.now() - 11 * DAY), handedAt: new Date(Date.now() - 10 * DAY) });
    o.T = await order('مریم کاظمی', phone(14), TEHRAN, 'printing');
    o.X = await order('مینا یوسفی', phone(15), ISFAHAN, 'printing');

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
    // کاربر هر چاپخانه از «ادمین‌ها»، با پیوند یک‌باره و کد تازه (دستور سرور نقش چاپخانه نمی‌سازد، ۵٫۳).
    for (const [who, name, partnerName] of [
      ['hasan', 'حسن نوری', NOOR],
      ['mina', 'مینا کریمی', AFTAB],
    ] as const) {
      await ownerPage.goto(at('/admins/new'));
      await ownerPage.getByLabel('نام', { exact: true }).fill(name);
      await ownerPage.getByLabel('نام کاربری').fill(`${who}${RUN}`);
      await ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / }).check();
      await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: partnerName }).getByRole('radio').check();
      await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
      await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
      await expect(ownerPage.getByRole('heading', { name: `پیوند ثبت ${name} آماده است` })).toBeVisible();
      const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      await enroll(page, link);
      partner[who] = { context, page, problems };
    }
  });

  test.afterAll(async () => {
    if (sql) {
      // سفارش‌های این اجرا پاک (چاپخانه با سفارش باز غیرفعال نمی‌شود)، و چاپخانه‌های این اجرا غیرفعال.
      const ids = Object.values(o).map((one) => one.id);
      if (ids.length > 0) {
        await sql`DELETE FROM payments WHERE order_id = ANY(${ids})`;
        await sql`DELETE FROM orders WHERE id = ANY(${ids})`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name LIKE ${`% ${RUN}`} AND deactivated_at IS NULL`;
    }
    await ownerContext?.close();
    await operatorContext?.close();
    for (const one of Object.values(partner)) await one.context.close();
    await sql?.end();
  });

  test('متصدی: فایل با سطرهای قطعی‌نشده؛ پیش‌نمایش با نامزدها؛ صف قدیمی‌ترین اول، «همین است»، «سفارش دیگر»، «در صف چاپ» و «هیچ‌کدام»', async () => {
    const page = operatorPage;
    staffName = `FileName-${RUN}1.xls`;
    staffFile = await upload(
      page,
      staffName,
      postFile([
        row(1, 'احمدی', 'تهران', o.A.grams),
        row(2, `رضایی ${o.D.number}`, 'تهران', o.C.grams),
        row(3, `محمدی ${o.E.number}`, 'تهران', o.E.grams),
        row(4, `قاسمی ${o.F.number}`, 'تهران', o.F.grams),
        row(5, 'نیک‌نام', 'تهران', 900),
        row(6, 'طهماسبی 6103', 'کرج', o.B.grams),
      ]),
    );
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    const count = (id: string) => page.locator(`[data-count="${id}"] .ad-tile__n`);
    await expect(count('review')).toHaveText('4');
    await expect(count('nf')).toHaveText('2');
    await expect(count('ok')).toHaveText('0');
    // پیش‌نمایش نامزدها را هم می‌گوید (طرح `m-ship-preview`): بی شماره با دو نامزد، و «پیدا نشد» بی نامزد.
    const review = page.locator('[data-group="review"]');
    await expect(review.locator('[data-row="1"]')).toContainText(`«نام گ» شماره ندارد. نامزدها: ${o.A.number}، رضا احمدی، تهران؛ ${o.B.number}، نرگس احمدی، کرج.`);
    await expect(review.locator('[data-row="3"]')).toContainText(`تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند.`);
    await expect(page.locator('[data-group="nf"] [data-row="5"]')).toContainText('«نام گ» شماره ندارد.');
    await page.locator('.ad-commit').getByRole('button', { name: 'ثبت، بی کد رهگیری' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    await expect(page.locator('main')).toContainText('ثبت شد: 0 کد رهگیری نشست. 4 سطر در صف تأیید است.');
    // شمار کاشی حکم «ثبت» است و متنش حال امروز؛ درست پس از «ثبت» همان طرح.
    await expect(page.locator('[data-count="review"] .ad-tile__t')).toHaveText('تا تأیید مالک یا متصدی، بی کد و بی پیامک');

    // صف: همین چهار سطر، به ترتیب سطر.
    await page.getByRole('link', { name: '4 سطر در صف تأیید' }).click();
    await expect(page.getByRole('heading', { name: 'صف تأیید', level: 1 })).toBeVisible();
    await expect(page.locator('[data-review]')).toHaveCount(4);
    expect(await page.locator('[data-review]').evaluateAll((els) => els.map((el) => el.getAttribute('data-review')))).toEqual(
      [1, 2, 3, 4].map((n) => `${staffFile}.${n}`),
    );

    // سطر ۱: رضا احمدی «قوی» و از پیش انتخاب‌شده (نام خانوادگی، شهر، وزن و روز)؛ نرگس احمدی کرج نه.
    const first = reviewCard(page, staffFile, 1);
    await expect(first.locator('.jy-card__meta')).toContainText(`${staffName}، سطر 1 · علی محمدی، امروز`);
    await expect(first).toContainText('«نام گ» شماره ندارد.');
    const tileA = first.locator(`[data-candidate="${o.A.number}"]`);
    await expect(tileA.getByRole('radio')).toBeChecked();
    await expect(tileA).toContainText('می‌خواند: نام خانوادگی، شهر، وزن');
    await expect(tileA).toContainText('روز (تحویل پست');
    await expect(first.locator(`[data-candidate="${o.B.number}"]`)).toContainText('نمی‌خواند: شهر');
    await expect(first.locator(`[data-candidate="${o.B.number}"]`).getByRole('radio')).not.toBeChecked();
    await first.getByRole('button', { name: 'همین است' }).click();
    await expect(page.locator('main')).toContainText(`کد رهگیری به سفارش ${o.A.number} نشست.`);
    await expect(page.locator('[data-review]')).toHaveCount(3);
    expect(await liveCodes(o.A)).toEqual([[expect.any(String), 'review']]);
    expect(await statusOf(o.A)).toBe('handed_to_post');

    // سطر ۲: شمارهٔ علی کریمی با نام رضایی؛ سارا رضایی از پیش انتخاب‌شده، ولی بسته مال کیوان یوسفی است: «سفارش دیگر».
    const second = reviewCard(page, staffFile, 2);
    await expect(second).toContainText(`سفارش ${o.D.number} مال «علی کریمی» است؛ نام نمی‌خواند.`);
    await expect(second.locator(`[data-candidate="${o.C.number}"]`).getByRole('radio')).toBeChecked();
    await expect(second.locator(`[data-candidate="${o.C.number}"]`)).toContainText('نمی‌خواند: شماره؛ شاید اشتباه تایپی');
    await second.getByLabel('شمارهٔ سفارش دیگر').fill(String(o.G.number));
    await second.getByRole('button', { name: 'ببین' }).click();
    await expect(page.getByRole('heading', { name: `به سفارش ${o.G.number} بدهم؟` })).toBeVisible();
    await expect(page.locator(`[data-manual="${o.G.number}"]`)).toContainText('نمی‌خواند: شماره، نام خانوادگی');
    await expect(page.locator(`[data-manual="${o.G.number}"]`)).toContainText('«در حال چاپ» است؛ با «همین است» «تحویل پست شد» هم می‌شود');
    await page.locator(`[data-manual="${o.G.number}"]`).getByRole('button', { name: 'همین است' }).click();
    await expect(page.getByRole('heading', { name: 'صف تأیید', level: 1 })).toBeVisible();
    await expect(page.locator('main')).toContainText(`کد رهگیری دستی به سفارش ${o.G.number} نشست و سفارش «تحویل پست شد».`);
    expect(await statusOf(o.G)).toBe('handed_to_post');
    expect(await liveCodes(o.G)).toEqual([[expect.any(String), 'manual']]);

    // سطر ۳: «در صف چاپ» با فایل چاپ و چاپخانه: «شروع چاپ» و «تحویل پست شد» با هم.
    const third = reviewCard(page, staffFile, 3);
    await expect(third).toContainText(`سفارش ${o.E.number} هنوز «در صف چاپ» است.`);
    await expect(third).toContainText('تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند، با روز فایل');
    await expect(third.locator(`[data-candidate="${o.E.number}"]`).getByRole('radio')).toBeChecked();
    await third.getByRole('button', { name: 'همین است' }).click();
    await expect(page.locator('main')).toContainText(`کد رهگیری به سفارش ${o.E.number} نشست و سفارش «تحویل پست شد».`);
    expect(await statusOf(o.E)).toBe('handed_to_post');
    const steps = await sql<{ from_status: string; to_status: string }[]>`
      SELECT from_status::text, to_status::text FROM order_status_events WHERE order_id = ${o.E.id} ORDER BY at, id`;
    expect(steps.slice(-2).map((s) => `${s.from_status}>${s.to_status}`)).toEqual(['paid>printing', 'printing>handed_to_post']);

    // سطر ۴: لغوشده؛ «همین است» بسته («اول لغو برگردد») و «هیچ‌کدام» باز.
    const fourth = reviewCard(page, staffFile, 4);
    await expect(fourth).toContainText('اول مالک لغو را برگرداند؛ وگرنه «هیچ‌کدام».');
    await expect(fourth.locator(`[data-candidate="${o.F.number}"]`).getByRole('radio')).toBeDisabled();
    await expect(fourth.locator(`[data-candidate="${o.F.number}"]`)).toContainText('لغو شده');
    await expect(fourth.getByRole('button', { name: 'اول لغو برگردد' })).toHaveAttribute('aria-disabled', 'true');
    await expect(fourth.getByRole('button', { name: 'همین است' })).toHaveCount(0);
    await fourth.getByRole('button', { name: 'هیچ‌کدام' }).click();
    await expect(page.locator('main')).toContainText('سطر کنار گذاشته شد («هیچ‌کدام»)');
    await expect(page.getByRole('heading', { name: QUEUE_EMPTY })).toBeVisible();
    expect(await statusOf(o.F)).toBe('cancelled');
    expect(operatorProblems).toEqual([]);
  });

  test('صفحهٔ ورود: حال امروز هر سطر؛ دادن دستی از «پیدا نشد» با شماره، و شمارهٔ بدشکل؛ فهرست ورودها و رویدادها', async () => {
    const page = operatorPage;
    await page.goto(at(`/shipments/${staffFile}`));
    const rowOf = (n: number) => page.locator(`.ad-prow[data-row="${n}"]`);
    const tileText = (id: string) => page.locator(`[data-count="${id}"] .ad-tile__t`);
    await expect(page.locator('[data-count="review"] .ad-tile__n')).toHaveText('4');
    await expect(tileText('review')).toHaveText('همه بررسی شد');
    await expect(tileText('nf')).toHaveText('سفارش ما نیست؛ ثبت نمی‌شود');
    await expect(rowOf(1)).toHaveAttribute('data-state', 'code-review');
    await expect(rowOf(1)).toContainText(`سفارش ${o.A.number} · رضا احمدی، تهران · با تأیید، علی محمدی`);
    await expect(rowOf(2)).toContainText(`سفارش ${o.G.number} · کیوان یوسفی، تهران · دستی، علی محمدی`);
    await expect(rowOf(4)).toHaveAttribute('data-state', 'dismissed');
    await expect(rowOf(4)).toContainText('«هیچ‌کدام»، علی محمدی');
    await expect(rowOf(4).getByRole('link', { name: 'به سفارشی بده' })).toBeVisible();
    await expect(rowOf(5).getByRole('link', { name: 'به سفارشی بده' })).toBeVisible();

    await rowOf(6).getByRole('link', { name: 'به سفارشی بده' }).click();
    await expect(page.locator('main')).toContainText('6103 شمارهٔ سفارش سایت نیست؛ اگر بسته مال سفارشی از ماست، به همان بده.');
    await page.getByLabel('به کدام سفارش بدهم؟').fill('6103');
    await page.getByRole('button', { name: 'ببین' }).click();
    await expect(alertOf(page)).toContainText('شمارهٔ سفارش را درست بنویس: عددی از 10001 به بعد.');
    await page.getByLabel('به کدام سفارش بدهم؟').fill(String(o.B.number).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!));
    await page.getByRole('button', { name: 'ببین' }).click();
    const manual = page.locator(`[data-manual="${o.B.number}"]`);
    await expect(manual).toContainText(`سفارش ${o.B.number} · نرگس احمدی، کرج`);
    await expect(manual).toContainText('می‌خواند: شهر، وزن');
    await manual.getByRole('button', { name: 'همین است' }).click();
    await expect(page.getByRole('heading', { name: staffName })).toBeVisible();
    await expect(page.locator('main')).toContainText(`کد رهگیری دستی به سفارش ${o.B.number} نشست و سفارش «تحویل پست شد».`);
    await expect(tileText('nf')).toHaveText('1 دستی به سفارشی داده شد');
    expect(await statusOf(o.B)).toBe('handed_to_post');

    await page.goto(at('/shipments'));
    await expect(page.locator('[data-imports] li', { hasText: staffName })).toContainText('6 بسته: 4 کد رهگیری · 1 کنار گذاشته · 1 پیدا نشد');

    // رویدادها با چیپ «ارسال»، و سطر کد رهگیری سفارش با «با تأیید».
    await ownerPage.goto(at('/events?kind=shipments'));
    const events = ownerPage.locator('main');
    await expect(events).toContainText(`سطر 1 فایل پست ${staffName} با تأیید به سفارش ${o.A.number} نشست`);
    await expect(events).toContainText(`سطر 2 فایل پست ${staffName} دستی به سفارش ${o.G.number} نشست؛ در حال چاپ ← تحویل پست شد`);
    await expect(events).toContainText(`سطر 3 فایل پست ${staffName} با تأیید به سفارش ${o.E.number} نشست؛ در صف چاپ ← تحویل پست شد`);
    await expect(events).toContainText(`سطر 4 فایل پست ${staffName} کنار گذاشته شد («هیچ‌کدام»)`);
    await ownerPage.goto(at(`/orders/${o.A.number}`));
    await expect(ownerPage.locator('.ad-log li', { hasText: 'کد رهگیری' })).toContainText(`از ${staffName}، با تأیید`);
    expect(operatorProblems).toEqual([]);
    expect(ownerProblems).toEqual([]);
  });

  test('کنار گذاشتن یک کد، فقط مالک با دلیل: سفارشی که همین کد «تحویل پست شد» کرد یک قدم برمی‌گردد و سطر به صف، بی انتخاب از پیش', async () => {
    const eCode = (await liveCodes(o.E))[0]![0];
    // متصدی: نه پیوند، نه فرم.
    await operatorPage.goto(at(`/orders/${o.E.number}`));
    await expect(operatorPage.getByRole('link', { name: 'کنار گذاشتن این کد…' })).toHaveCount(0);
    await operatorPage.goto(at(`/orders/${o.E.number}?do=void&code=${eCode}`));
    await expect(operatorPage.locator('[data-void]')).toHaveCount(0);

    const page = ownerPage;
    await page.goto(at(`/orders/${o.E.number}`));
    await page.getByRole('link', { name: 'کنار گذاشتن این کد…' }).click();
    const form = page.locator(`[data-void="${eCode}"]`);
    await expect(form).toContainText('سفارش یک قدم به «در حال چاپ» برمی‌گردد');
    await form.getByRole('button', { name: 'این کد را کنار بگذار' }).click();
    expect(await page.locator('#void-why').evaluate((el) => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
    await page.getByLabel('دلیل').fill('کد مال سفارش دیگری بود.');
    await form.getByRole('button', { name: 'این کد را کنار بگذار' }).click();
    await expect(page.locator('main')).toContainText('کد رهگیری کنار رفت و سطرش به صف تأیید برگشت؛ سفارش به «در حال چاپ» برگشت.');
    expect(await statusOf(o.E)).toBe('printing');
    await expect(page.locator('section[aria-labelledby="t-parcel"] [data-voided]')).toContainText('کد مال سفارش دیگری بود');

    // A پیش از کد دستی به پست رسیده بود: کنار رفتن کدش وضعیت را همان می‌گذارد.
    const aCode = (await liveCodes(o.A))[0]![0];
    await page.goto(at(`/orders/${o.A.number}?do=void&code=${aCode}`));
    await expect(page.locator(`[data-void="${aCode}"]`)).toContainText('سفارش «تحویل پست شد» می‌ماند: پیش از این کد به پست رسیده بود.');
    await page.getByLabel('دلیل').fill('بسته مال رضا احمدی نبود.');
    await page.getByRole('button', { name: 'این کد را کنار بگذار' }).click();
    await expect(page.locator('main')).toContainText('کد رهگیری کنار رفت و سطرش به صف تأیید برگشت.');
    expect(await statusOf(o.A)).toBe('handed_to_post');

    // دو سطر به صف برگشتند؛ همان سفارش دیگر از پیش انتخاب نمی‌شود (تصمیم ۷۸).
    await operatorPage.goto(at('/shipments/review'));
    await expect(operatorPage.locator('[data-review]')).toHaveCount(2);
    const back = reviewCard(operatorPage, staffFile, 3);
    await expect(back).toContainText(`کد این سطر برای سفارش ${o.E.number} کنار رفت`);
    await expect(back).toContainText('«کد مال سفارش دیگری بود.»؛ دوباره تصمیم می‌خواهد.');
    await expect(back.locator(`[data-candidate="${o.E.number}"]`)).toContainText('کد همین سطر پیش‌تر از این سفارش کنار رفت');
    await expect(back.locator(`[data-candidate="${o.E.number}"]`).getByRole('radio')).not.toBeChecked();
    await operatorPage.goto(at(`/shipments/${staffFile}`));
    await expect(operatorPage.locator('[data-count="review"] .ad-tile__t')).toHaveText('2 تا هنوز منتظر تأیید');
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('پیشخوان: صف تأیید برای مالک و متصدی؛ «کد رهگیری ندارد» دو روز کاری پس از تحویل', async () => {
    for (const page of [operatorPage, ownerPage]) {
      await page.goto(at());
      await expect(page.locator('[data-alert="review"]')).toContainText('2 سطر فایل پست منتظر تأیید است؛ تا تأیید نشده، مشتری پیامک رهگیری نمی‌گیرد.');
      const untracked = page.locator('[data-alert="untracked"]');
      // H ده روز پیش؛ A و C امروز «تحویل پست شد» (دو روز کاری‌شان نگذشته)؛ N3 هم، چون مالک همه را می‌بیند.
      await expect(untracked.filter({ hasText: String(o.H.number) })).toContainText('نرسیده، با اینکه دو روز کاری از تحویل');
      await expect(untracked.filter({ hasText: String(o.H.number) }).getByRole('link', { name: 'وارد کن' })).toBeVisible();
      await expect(untracked.filter({ hasText: String(o.N3.number) })).toHaveCount(1);
      await expect(untracked.filter({ hasText: String(o.C.number) })).toHaveCount(0);
      await expect(page.locator('[data-alert="review"]').getByRole('link')).toHaveAttribute('href', at('/shipments/review'));
    }
    // چاپخانه: فقط سفارش خودش، با «بده»؛ صف تأیید نه.
    const { page } = partner.hasan;
    await page.goto(at());
    await expect(page.locator('[data-alert="review"]')).toHaveCount(0);
    const mine = page.locator('[data-alert="untracked"]');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText(`کد رهگیری سفارش ${o.N3.number} نرسیده`);
    await expect(mine.getByRole('link', { name: 'بده' })).toBeVisible();
    expect(await page.content()).not.toContain(String(o.H.number));
  });

  test('فایل چاپخانه: فقط سفارش‌های خودش، بی کرایه؛ سفارش دیگری «پیدا نشد» بی نشت؛ صف «در انتظار بررسی جزوه‌یار» و تأیید مالک', async () => {
    const { page, problems } = partner.hasan;
    await page.goto(at());
    await page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link', { name: 'ارسال' }).click();
    await expect(page.locator('.ad-sub').first()).toContainText(`فایل پست بسته‌هایت را بده؛ کد رهگیری سفارش‌های ${NOOR} ثبت و به مشتری پیامک می‌شود.`);
    const name = `FileName-${RUN}2.xls`;
    partnerFile = await upload(
      page,
      name,
      postFile([
        row(11, `کاظمی ${o.N1.number}`, 'مشهد', o.N1.grams),
        row(12, `یوسفی ${o.X.number}`, 'مشهد', o.X.grams),
        row(13, `کاظمی ${o.T.number}`, 'مشهد', o.T.grams),
        row(14, 'اکبری', 'مشهد', o.N2.grams),
      ]),
    );
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نمایش', { timeout: 30_000 });
    const main = page.locator('main');
    await expect(page.locator('[data-count="review"]')).toContainText('بررسی جزوه‌یار');
    await expect(page.locator('[data-count="review"] .ad-tile__n')).toHaveText('1');
    await expect(page.locator('[data-count="nf"] .ad-tile__n')).toHaveText('2');
    await expect(page.locator('[data-count="ok"] .ad-tile__n')).toHaveText('1');
    await expect(main).toContainText(`با «ثبت»، 1 کد رهگیری به سفارش‌های ${NOOR} می‌نشیند`);
    // بی کرایه و مالیات (تصمیم ۸۱): جمع فقط بسته و وزن.
    await expect(main).toContainText(/جمع کل فایل با جمع سطرها می‌خواند: 4 بسته، [\d.,]+ (گرم|کیلوگرم)\./);
    await expect(main).not.toContainText('کرایه');
    await expect(page.locator('[data-group="review"] .jy-card__title')).toContainText('در انتظار بررسی جزوه‌یار');
    // سفارش جزوه‌یار و آفتاب: «پیدا نشد»، بی نام و شهرشان.
    await expect(page.locator('[data-group="nf"]')).toContainText(`سفارش ${o.T.number} پیدا نشد.`);
    await expect(page.locator('[data-group="nf"]')).toContainText(`سفارش ${o.X.number} پیدا نشد.`);
    for (const hidden of ['مریم کاظمی', 'مینا یوسفی', 'حسین اکبری']) expect(await page.content(), hidden).not.toContain(hidden);
    await page.locator('.ad-commit').getByRole('button', { name: 'ثبت: 1 کد رهگیری' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('ثبت شد');
    await expect(main).toContainText(`سفارش ${o.N1.number} «تحویل پست شد» شد. 1 سطر در انتظار بررسی جزوه‌یار است.`);
    await expect(page.locator('[data-count="review"] .ad-tile__t')).toHaveText('جزوه‌یار تأیید یا کنار می‌گذارد');
    expect(await statusOf(o.N1)).toBe('handed_to_post');
    expect(await statusOf(o.T)).toBe('printing');
    await page.goto(at('/shipments'));
    await expect(page.locator('[data-imports] li', { hasText: name })).toContainText('4 بسته: 1 کد رهگیری · 1 در انتظار بررسی جزوه‌یار · 2 پیدا نشد');
    await expect(page.locator('[data-alert="review"]')).toHaveCount(0);
    await expect(page.locator('[data-imports] li', { hasText: staffName })).toHaveCount(0);
    // صف و صفحهٔ سطر برای چاپخانه باز نیست.
    for (const path of ['/shipments/review', `/shipments/${partnerFile}/rows/4`]) {
      await page.goto(at(path));
      await expect(page.getByRole('heading', { name: NO_ACCESS, level: 1 }), path).toBeVisible();
    }
    // چاپخانهٔ دیگر: نه در فهرست، نه با نشانی (همان ۴۰۴ ورودی که نیست).
    const mina = partner.mina.page;
    await mina.goto(at('/shipments'));
    await expect(mina.locator('[data-imports] li', { hasText: name })).toHaveCount(0);
    const response = await mina.goto(at(`/shipments/${partnerFile}`));
    expect(response?.status()).toBe(404);
    await expect(mina.getByRole('heading', { name: 'این ورود فایل پست پیدا نشد' })).toBeVisible();
    await mina.goto(at(`/shipments/${staffFile}`));
    await expect(mina.getByRole('heading', { name: 'این ورود فایل پست پیدا نشد' })).toBeVisible();

    // مالک: همان سطر در صف، با «حسن نوری، چاپ نور» و نامزدهای فقط همان چاپخانه؛ سفارش جزوه‌یار با شماره «پیدا نشد».
    await ownerPage.goto(at('/shipments/review'));
    const theirs = reviewCard(ownerPage, partnerFile, 4);
    await expect(theirs.locator('.jy-card__meta')).toContainText(`${name}، سطر 4 · حسن نوری، ${NOOR}`);
    await expect(theirs.locator('[data-candidate]')).toHaveCount(1);
    await expect(theirs.locator(`[data-candidate="${o.N2.number}"]`)).toContainText(`حسین اکبری، مشهد`);
    await theirs.getByLabel('شمارهٔ سفارش دیگر').fill(String(o.T.number));
    await theirs.getByRole('button', { name: 'ببین' }).click();
    await expect(ownerPage.getByRole('heading', { name: `سفارش ${o.T.number} پیدا نشد` })).toBeVisible();
    await expect(ownerPage.locator('main')).toContainText(`این فایل از ${NOOR} است و فقط به سفارش‌هایی داده می‌شود که به ${NOOR} سپرده شده‌اند.`);
    await ownerPage.goto(at('/shipments/review'));
    await reviewCard(ownerPage, partnerFile, 4).locator(`[data-candidate="${o.N2.number}"]`).getByRole('radio').check();
    await reviewCard(ownerPage, partnerFile, 4).getByRole('button', { name: 'همین است' }).click();
    await expect(ownerPage.locator('main')).toContainText(`کد رهگیری به سفارش ${o.N2.number} نشست و سفارش «تحویل پست شد».`);
    expect(await statusOf(o.N2)).toBe('handed_to_post');
    // چاپخانه همان را می‌بیند: «با تأیید جزوه‌یار»، بی نام ادمین.
    await page.goto(at(`/shipments/${partnerFile}`));
    await expect(page.locator('.ad-prow[data-row="4"]')).toContainText(`سفارش ${o.N2.number} · حسین اکبری، مشهد · با تأیید جزوه‌یار`);
    await expect(page.locator('[data-count="review"] .ad-tile__t')).toHaveText('جزوه‌یار بررسی کرد');
    expect(await page.content()).not.toContain('سارا رضایی');
    expect(problems).toEqual([]);
    expect(partner.mina.problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: صف، صفحهٔ سطر با کارت سفارش، ورود ثبت‌شده، کنار گذاشتن کد، پیشخوان و فایل چاپخانه بی سرریز', async ({ browser }) => {
    test.setTimeout(240_000);
    const gCode = (await liveCodes(o.G))[0]![0];
    const paths = [
      '/shipments/review',
      `/shipments/${staffFile}/rows/1?order=${o.D.number}`,
      `/shipments/${staffFile}/rows/5?from=import`,
      `/shipments/${staffFile}`,
      `/orders/${o.G.number}?do=void&code=${gCode}`,
      '',
    ];
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      const page = await context.newPage();
      const problems = watch(page);
      await enroll(page, serverInvite(`rview${RUN}${width}`, '--name', 'بیننده'));
      for (const path of paths) {
        await page.goto(at(path));
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
      // فایل چاپخانه از چشم خود چاپخانه، در همان پهنا.
      const { page: hasan } = partner.hasan;
      await hasan.setViewportSize({ width, height: 800 });
      await hasan.goto(at(`/shipments/${partnerFile}`));
      const own = await layoutProblems(hasan);
      expect(own.overflow, `${width} چاپخانه`).toBeLessThanOrEqual(0);
      expect(own.small, `${width} چاپخانه`).toEqual([]);
    }
  });

  test('برگرداندن ورود: کدهای تأیید و دستی هم کنار می‌روند، سفارش‌هایشان به «در حال چاپ»، و سطرهای صف بیرون', async () => {
    const page = ownerPage;
    await page.goto(at(`/shipments/${staffFile}/revert`));
    await expect(page.locator('.ad-changes')).toContainText('2 کد کنار می‌رود، پاک نمی‌شود');
    await expect(page.locator('.ad-changes')).toContainText('2 سطر این فایل از صف بیرون می‌رود');
    await page.getByLabel('دلیل').fill('فایل روز اشتباه بود.');
    await page.getByRole('button', { name: 'این ورود را برگردان' }).click();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('برگشت');
    await expect(page.locator('[data-count="review"] .ad-tile__t')).toHaveText('ورود برگشت؛ بی کد');
    // G و B را کدهای دستی همین ورود «تحویل پست شد» کرده بودند؛ A و C پیش‌تر دستی به پست رسیده بودند.
    expect(await Promise.all([o.G, o.B, o.A, o.C].map(statusOf))).toEqual(['printing', 'printing', 'handed_to_post', 'handed_to_post']);
    await page.goto(at('/shipments/review'));
    // سطر چاپخانه تأیید شد؛ از فایل جزوه‌یار چیزی در صف نمی‌ماند.
    await expect(page.getByRole('heading', { name: QUEUE_EMPTY })).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });
});
