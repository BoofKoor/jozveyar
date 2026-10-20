import { createHash, randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import {
  assignAtPayment,
  at,
  awayFromMidnight,
  BASE,
  codeFor,
  download,
  enroll,
  GATE,
  layoutProblems,
  newContext,
  serverInvite,
  watch,
  WRONG,
  xlsxParts,
} from './helpers';

/**
 * تسویهٔ چاپخانه‌ها، سرتاسری (برش ۱۰٫۳؛ ADR-069، سؤال‌های ۲۰۳ و ۳۹۰ تا ۴۰۳): درصد سهم فقط با مالک و کد تازه، از هشدار پیشخوان و ردیف
 * «چاپخانه‌ها»؛ سهم هر سفارش هنگام سپردن روی همان سفارش منجمد (سفارشی که پیش از درصد سپرده شد «بی سهم» می‌ماند)؛ «تسویه» زیر «گزارش‌ها»
 * برای مالک و حسابدار با نمای کلی و صورت‌حساب هر چاپخانه، و برای کاربر چاپخانه فقط صورت‌حساب خودش بی پایهٔ سهم (مبلغ مشتری) و بی فرم؛
 * پرداخت و اصلاح و باطل با کد تازه، خطای هر فیلد پیش از کد، دو کلیک یک ردیف و فرم کهنه پیش از کد؛ خروجی اکسل و PDF؛ ستون سهم گزارش
 * تولید؛ و رویدادهای «تسویه» بی کد پیگیری، یادداشت و دلیل.
 *
 * سفارش‌ها مثل `production.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت (`assignAtPayment`) به چاپخانهٔ همین اجرا در مشهد؛ تریگر
 * `order_assignments_share` سهم را خودش روی ردیف تخصیص می‌نشاند، و این تست همان را با حساب مستقل خودش می‌سنجد. حسابدار و کاربر چاپخانه
 * با دستور سرور (متصدی) ساخته و نقششان با SQL عوض می‌شود. دفتر تسویه پاک‌نشدنی است، پس در پایان `TRUNCATE partner_ledger` (مثل
 * `refunds` در `roles.spec.ts`)، و بعد خروجی‌ها، سفارش‌ها و سندها پاک و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل، پایگاه داده و کارگر؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const NAVID = `چاپ نوید ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
/** درصد سهمی که مالک می‌گذارد، به صدم درصد. */
const SHARE_BP = 6500n;

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  docId: string;
  subtotalRials: bigint;
}

/** سهم چاپخانه از جمع چاپ، کاغذ و صحافی: به تومان گرد، نیم رو به بالا، و دوباره ریال؛ حساب مستقل از تریگر `order_assignments_share`. */
const shareOf = (subtotalRials: bigint) => ((subtotalRials * SHARE_BP + 50_000n) / 100_000n) * 10n;
/** تومان گردشده (نیم از صفر دور) با جداکنندهٔ هزارگان، مثل صفحه. */
const tomans = (rials: bigint) => ((rials + 5n) / 10n).toLocaleString('en-US');
const persianDigits = (text: string) => text.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

/** سفارش پرداخت‌شدهٔ یک‌جزوه‌ای سیاه‌سفید دورو، سپرده به چاپخانهٔ همین اجرا، و بعد در حال چاپ، تحویل پست یا لغو پس از شروع چاپ. */
async function order(name: string, phone: string, pages: number, end: 'printing' | 'handed' | 'cancelled', cancelledBy = ''): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'آمار ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', ${pages},
            ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const breakdown = quote(
    {
      items: [
        {
          sections: [{ documentId: docId, pageCount: pages }],
          rules: [{ pageRanges: [[1, pages]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
          copies: 1,
          sidesMode: 'double',
          paperSize: 'a4',
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: { methodId: 'post', zoneId: 'other' },
    },
    SEED_PRICE_LIST,
  );
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
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار وکیل‌آباد، وکیل‌آباد 12، پلاک 3', '9189876543',
              ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, ${pages}, 1, 'double', 'a4', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, ${pages})`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json([[1, pages]])}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${new Date(paidAt.getTime() - 30 * MINUTE)}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`UPDATE orders SET status = 'printing' WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, 'paid', 'printing', ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    if (end === 'handed') {
      await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'printing', 'handed_to_post', now(), 'system')`;
    }
    if (end === 'cancelled') {
      await tx`UPDATE orders SET status = 'cancelled' WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, admin_user_id, note)
               VALUES (${row!.id}, 'printing', 'cancelled', ${new Date(Date.now() - 5 * MINUTE)}, 'admin', ${cancelledBy},
                       ${tx.json({ reason: 'مشتری پس از شروع چاپ پشیمان شد.' })})`;
    }
    return { number: row!.order_number, id: row!.id, docId, subtotalRials: BigInt(breakdown.subtotalRials) };
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
const reportsNav = (page: Page) => page.getByRole('navigation', { name: 'گزارش‌ها' }).getByRole('link');
const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const entries = (page: Page) => page.locator('[data-settlement="ledger"] li[data-entry]');
const success = (page: Page) => page.locator('main .jy-note--success');
const codeField = (page: Page) => page.getByLabel('کد برنامهٔ تأیید تو');

test.describe.serial('تسویهٔ چاپخانه‌ها (۱۰٫۳)', () => {
  const owner = `parisa${RUN}`;
  const accountant = `arash${RUN}`;
  const partnerUser = `farhad${RUN}`;
  const operator = `sina${RUN}`;
  const who = {} as Record<'owner' | 'accountant' | 'partner' | 'operator', { context: BrowserContext; page: Page; problems: string[] }>;
  const secrets = {} as Record<'owner' | 'accountant', string>;
  let ownerId = '';
  let navidId = '';
  let a: Seeded;
  let b: Seeded;
  let c: Seeded;
  let d: Seeded;
  /** روز امروز به شمسی، همان که صفحه‌ها نشان می‌دهند؛ و ماه برای نام فایل خروجی. */
  let today = '';
  let monthFile = '';
  /** پرداختی که حسابدار ثبت می‌کند، تومان، و ردیف‌های دفتر. */
  let payTomans = 0n;
  let paymentEntry = '';
  let adjustmentEntry = '';
  let pdfUrl = '';

  test.beforeAll(async ({ browser }) => {
    // «امروز»، «این ماه» و روز پرداخت تا نیمه‌شب تهران‌اند؛ کل فایل با PDF کارگر و کدهای تازه چند دقیقه است.
    await awayFromMidnight(240_000, 15 * MINUTE);
    today = formatJalaliNumeric(new Date());
    monthFile = today.slice(0, 7).replace('/', '-');
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    navidId = (
      await sql<{ id: string }[]>`INSERT INTO print_partners (name, province_id, city_id, created_at)
                                  VALUES (${NAVID}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday}) RETURNING id`
    )[0]!.id;

    for (const [key, username, name] of [
      ['owner', owner, 'پریسا محمدی'],
      ['accountant', accountant, 'آرش نیک‌نام'],
      ['partner', partnerUser, 'فرهاد'],
      ['operator', operator, 'سینا'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      const secret = await enroll(page, serverInvite(username, key === 'owner' ? '--owner' : '--operator', '--name', name));
      if (key === 'owner' || key === 'accountant') secrets[key] = secret;
    }
    ownerId = (await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${owner}`)[0]!.id;
    // نقش حسابدار و چاپخانه با SQL؛ مجوز و محدوده با هر درخواست خوانده می‌شود (۹٫۴)، پس نشست باز همان نقش تازه را دارد.
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${accountant})`;
    await sql`UPDATE admin_user_roles SET role_id = 'print_partner', print_partner_id = ${navidId}
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${partnerUser})`;

    // د پیش از درصد سهم سپرده شد، پس بی سهم می‌ماند، حتی پس از درصد؛ و تحویل پست شد.
    d = await order('سپیده امینی', `0915${String(RUN).slice(1)}8444`, 12, 'handed');
    const [assignment] = await sql<{ to_partner_id: string; share_bp: number | null; share_rials: string | null }[]>`
      SELECT to_partner_id, share_bp, share_rials::text FROM order_assignments WHERE order_id = ${d.id}`;
    expect(assignment).toEqual({ to_partner_id: navidId, share_bp: null, share_rials: null });
  });

  test.afterAll(async () => {
    if (sql) {
      // دفتر فقط افزودنی است و تریگر ردیفی TRUNCATE را نمی‌گیرد؛ ردیف اصلاح هم به سفارش ج اشاره می‌کند.
      await sql`TRUNCATE partner_ledger`;
      await sql`DELETE FROM report_exports WHERE requested_by IN (SELECT id FROM admin_users WHERE username IN ${sql([owner, accountant, partnerUser, operator])})`;
      for (const o of [a, b, c, d].filter(Boolean)) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
        await sql`DELETE FROM documents WHERE id = ${o.docId}`;
      }
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE id = ${navidId} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: هشدار پیشخوان و نشان «درصد سهم تعیین نشده»؛ درصد با خطا زیر فیلد، کد نادرست و کد تازه؛ سهم سفارش‌های بعدی منجمد', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/'));
    const alert = page.locator('[data-alert="share"]');
    await expect(alert).toContainText('تعیین نشده؛ سفارش‌هایی که حالا به');
    await expect(alert.getByRole('link', { name: NAVID })).toHaveAttribute('href', at(`/partners/${navidId}/share`));

    await page.goto(at('/partners'));
    const row = page.locator(`.ad-partners li[data-partner="${NAVID}"]`);
    await expect(row.locator('[data-share]')).toHaveText('درصد سهم تعیین نشده');
    await expect(row.getByRole('link', { name: 'درصد سهم' })).toHaveAttribute('href', at(`/partners/${navidId}/share`));

    await page.goto(at('/'));
    await alert.getByRole('link', { name: NAVID }).click();
    await expect(page.getByRole('heading', { name: `درصد سهم ${NAVID}`, level: 1 })).toBeVisible();
    const form = page.locator('[data-share-form]');
    await expect(form.locator('.ad-meta')).toHaveText('درصد سهم این چاپخانه هنوز تعیین نشده: سفارش‌هایی که حالا به آن سپرده شوند بی سهم‌اند.');
    // بخش هم با عنوانش «درصد سهم …» نام دارد.
    const percent = page.getByLabel('درصد سهم', { exact: true });
    const save = page.getByRole('button', { name: 'ذخیرهٔ درصد' });

    // بیش از ۱۰۰: خطا زیر همان فیلد، پیش از کد (کد نادرست خرج نمی‌شود؛ فیلد کد را مرورگر خالی نمی‌فرستد)؛ نوشته می‌ماند.
    await percent.fill('120');
    await codeField(page).fill(WRONG.code);
    await save.click();
    await expect(page.locator('#share-percent-error')).toHaveText('درصد را عددی از 0 تا 100 بنویس، با تا دو رقم اعشار؛ مثلاً 65 یا 62.5.');
    await expect(percent).toHaveValue('120');
    // ارقام فارسی با «٪» پذیرفته است؛ کد نادرست زیر کد.
    await percent.fill('۶۵٪');
    await codeField(page).fill(WRONG.code);
    await save.click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    await expect(page.locator('#share-percent-error')).toHaveCount(0);
    await expect(percent).toHaveValue('۶۵٪');
    await codeField(page).fill(await codeFor(secrets.owner));
    await save.click();
    await expect(success(page)).toHaveText(`درصد سهم «${NAVID}» حالا 65٪ است؛ از سفارش بعدی، و سهم سفارش‌های سپرده‌شده همان است که بود.`);
    await expect(row.locator('[data-share]')).toHaveText('سهم 65٪');
    expect((await sql<{ share_bp: number }[]>`SELECT share_bp FROM print_partners WHERE id = ${navidId}`)[0]!.share_bp).toBe(6500);
    const events = await sql<{ target_id: string; detail: unknown }[]>`
      SELECT target_id, detail FROM admin_events WHERE action = 'partners.share' AND admin_user_id = ${ownerId}`;
    expect(events).toEqual([{ target_id: navidId, detail: { name: NAVID, from: null, to: 6500 } }]);

    // پیشخوان: همین چاپخانه دیگر در هشدار نیست؛ صفحهٔ درصد نمونهٔ سهم را با درصد امروز دارد.
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="share"]').getByRole('link', { name: NAVID })).toHaveCount(0);
    await page.goto(at(`/partners/${navidId}/share`));
    await expect(form.locator('.ad-meta')).toHaveText('امروز 65٪: از سفارشی با جمع چاپ، کاغذ و صحافی 245,000 تومان، 159,250 تومان.');
    await expect(percent).toHaveValue('65');

    // سفارش‌های پس از درصد: الف تحویل پست، ب در حال چاپ، و ج لغو پس از شروع چاپ؛ هر سه با سهم ۶۵٪ روی ردیف تخصیص.
    const phone = (n: number) => `0915${String(RUN).slice(1)}${n}`;
    a = await order('سمانه رحیمی', phone(8111), 10, 'handed');
    b = await order('کاوه صدری', phone(8222), 21, 'printing');
    c = await order('هانیه نوری', phone(8333), 6, 'cancelled', ownerId);
    for (const o of [a, b, c]) {
      const [assignment] = await sql<{ to_partner_id: string; share_bp: number | null; share_rials: string | null }[]>`
        SELECT to_partner_id, share_bp, share_rials::text FROM order_assignments WHERE order_id = ${o.id}`;
      expect(assignment).toEqual({ to_partner_id: navidId, share_bp: 6500, share_rials: String(shareOf(o.subtotalRials)) });
    }
    expect(problems).toEqual([]);
  });

  test('حسابدار: «تسویه» زیر «گزارش‌ها»؛ نمای کلی، و صورت‌حساب با سهم منجمد، بی سهم، لغو پس از شروع چاپ و در راه', async () => {
    const { page, problems } = who.accountant;
    const shareA = shareOf(a.subtotalRials);
    const shareB = shareOf(b.subtotalRials);
    const shareC = shareOf(c.subtotalRials);
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'گزارش‌ها', 'تخفیف‌ها']);
    // درصد سهم کار مالک است: هشدار پیشخوان برای حسابدار نیست.
    await expect(page.locator('[data-alert="share"]')).toHaveCount(0);
    await nav(page).filter({ hasText: 'گزارش‌ها' }).click();
    await expect(reportsNav(page)).toHaveText(['گزارش تولید', 'گزارش ارسال', 'تسویه']);
    await reportsNav(page).filter({ hasText: 'تسویه' }).click();
    await expect(page.getByRole('heading', { name: 'تسویهٔ چاپخانه‌ها', level: 1 })).toBeVisible();
    await expect(nav(page).filter({ hasText: 'گزارش‌ها' })).toHaveAttribute('aria-current', 'page');
    await expect(reportsNav(page).filter({ hasText: 'تسویه' })).toHaveAttribute('aria-current', 'page');
    const row = page.locator(`[data-settlement="overview"] tr[data-partner="${NAVID}"]`);
    await expect(row.locator('th')).toHaveText(`${NAVID} · مشهد`);
    await expect(row.locator('td[data-k="درصد سهم"]')).toHaveText('65٪');
    await expect(row.locator('td[data-k="ماندهٔ امروز"]')).toHaveText(`${tomans(shareA)} تومان، بدهی جزوه‌یار به چاپخانه`);
    await expect(row.locator('td[data-k="ماندهٔ امروز"]')).toHaveAttribute('data-balance', 'owed');
    await expect(row.locator('td[data-k="در راه"]')).toHaveText(`1 سفارش، ${tomans(shareB)} تومان`);
    await expect(row.locator('td[data-k="آخرین پرداخت"]')).toHaveText('—');

    await row.getByRole('link', { name: NAVID }).click();
    await expect(page.getByRole('heading', { name: `تسویهٔ ${NAVID} · مشهد`, level: 1 })).toBeVisible();
    await expect(page.locator('[data-settlement="share"]')).toHaveText(
      'درصد سهم امروز 65٪ از جمع چاپ، کاغذ و صحافی هر سفارش؛ سهم هر سفارش همان است که هنگام سپردن بود.',
    );
    // درصد با مالک است.
    await expect(page.locator('[data-settlement="share"]').getByRole('link')).toHaveCount(0);
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA));
    await expect(tile(page, 'balance').locator('.ad-tile__t')).toHaveText('تومان، بدهی جزوه‌یار به چاپخانه');
    await expect(tile(page, 'in-flight').locator('.ad-tile__n')).toHaveText(tomans(shareB));
    await expect(tile(page, 'in-flight').locator('.ad-tile__t')).toHaveText('تومان، سهم 1 سفارش در صف و در حال چاپ');
    // پیش‌فرض «این ماه».
    await expect(page.getByRole('navigation', { name: 'ماه' }).getByRole('link', { name: 'این ماه' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-settlement="label"]')).toHaveText(/^\S+ \d{4}، تا امروز$/);
    await expect(tile(page, 'opening').locator('.ad-tile__n')).toHaveText('0');
    await expect(tile(page, 'handed').locator('.ad-tile__n')).toHaveText(tomans(shareA));
    await expect(tile(page, 'handed').locator('.ad-tile__t')).toHaveText('تومان، 2 سفارش تحویل‌شده');
    await expect(tile(page, 'payments').locator('.ad-tile__n')).toHaveText('0');
    await expect(tile(page, 'adjustments').locator('.ad-tile__n')).toHaveText('0');
    await expect(tile(page, 'closing').locator('.ad-tile__n')).toHaveText(`+${tomans(shareA)}`);
    await expect(page.locator('[data-settlement="unshared"]')).toContainText('1 سفارش تحویل‌شدهٔ این بازه بی سهم است و در هیچ جمعی نیست');

    const handed = page.locator('[data-settlement="handed"]');
    // سفارش، تحویل پست، پایهٔ سهم (جمع چاپ، کاغذ و صحافی)، درصد و سهم؛ بی سهم «—».
    await expect(handed.locator(`tr[data-order="${a.number}"] td`)).toHaveText([today, tomans(a.subtotalRials), '65٪', tomans(shareA)]);
    await expect(handed.locator(`tr[data-order="${d.number}"] td`)).toHaveText([today, tomans(d.subtotalRials), 'بی سهم', '—']);
    await expect(handed.locator('tr.ad-total td[data-k="سهم"]')).toHaveText(tomans(shareA));
    await expect(handed.locator(`tr[data-order="${a.number}"] th`).getByRole('link')).toHaveAttribute('href', at(`/orders/${a.number}`));
    await expect(page.locator(`[data-settlement="cancelled"] li[data-order="${c.number}"]`)).toContainText(
      `سفارش ${c.number}، لغو امروز، سهم ${tomans(shareC)} تومان`,
    );
    await expect(page.locator('[data-settlement="in-flight"] .ad-meta')).toHaveText(`${b.number} (در حال چاپ، ${tomans(shareB)})`);
    await expect(page.locator('[data-settlement="ledger"] .ad-lead')).toHaveText('در این بازه پرداخت یا اصلاحی ثبت نشده.');

    // گزارش تولید هم سهم چاپخانه را دارد: الف و ب (د بی سهم، ج لغو).
    await page.goto(at(`/reports?nfrom=${d.number}&nto=${c.number}&p=${navidId}`));
    await expect(tile(page, 'amount').locator('.ad-tile__t')).toHaveText(`جمع پرداخت مشتری، تومان؛ سهم چاپخانه ${tomans(shareA + shareB)}`);
    expect(problems).toEqual([]);
  });

  test('حسابدار: پرداخت با خطای هر فیلد پیش از کد، کد نادرست و کد تازه؛ دو کلیک یک ردیف؛ اصلاح از کنار سفارش لغوشده و باطلش', async () => {
    test.setTimeout(180_000);
    const { page, problems } = who.accountant;
    const shareA = shareOf(a.subtotalRials);
    const shareC = shareOf(c.subtotalRials);
    // نصف سهم الف، به تومان درست؛ مانده مثبت می‌ماند.
    payTomans = shareA / 20n;
    const pay = payTomans.toLocaleString('en-US');
    const statement = at(`/reports/settlement/${navidId}`);
    await page.goto(statement);
    await page.locator('[data-settlement="actions"]').getByRole('link', { name: 'ثبت پرداخت' }).click();
    await expect(page.getByRole('heading', { name: `ثبت پرداخت به ${NAVID}`, level: 1 })).toBeVisible();
    await expect(page.locator('[data-settlement-form="payment"] .ad-lead')).toContainText(
      `ماندهٔ امروز: ${tomans(shareA)} تومان، بدهی جزوه‌یار به چاپخانه.`,
    );
    await expect(page.getByLabel('روز پرداخت')).toHaveValue(today);
    const amount = page.getByLabel('مبلغ (تومان)');
    const submit = page.getByRole('button', { name: 'ثبت پرداخت' });

    // خطای هر فیلد زیر همان فیلد، پیش از کد: کد نادرست خرج نمی‌شود (فیلد کد را مرورگر خالی نمی‌فرستد)؛ نوشته‌ها می‌مانند.
    await amount.fill('0');
    await codeField(page).fill(WRONG.code);
    await submit.click();
    await expect(page.locator('#pay-amount-error')).toHaveText('مبلغ را به تومان و با رقم بنویس، از 1 تا 10,000,000,000 تومان؛ مثلاً 2,500,000.');
    await expect(page.locator('#step-code-error')).toHaveCount(0);
    await amount.fill(persianDigits(pay));
    await page.getByLabel('بابت، از').fill('1405/06/20');
    await page.locator('#pay-to').fill('1405/06/10');
    await codeField(page).fill(WRONG.code);
    await submit.click();
    await expect(page.locator('#pay-to-error')).toHaveText('روز آخر «بابت» پیش از روز اولش است.');
    await expect(page.locator('#pay-amount-error')).toHaveCount(0);
    await expect(amount).toHaveValue(persianDigits(pay));
    await page.getByLabel('بابت، از').fill(`${today.slice(0, 8)}01`);
    await page.locator('#pay-to').fill(today);
    await page.getByLabel('کد پیگیری بانک').fill('کد۱۲');
    await codeField(page).fill(WRONG.code);
    await submit.click();
    await expect(page.locator('#pay-tracking-error')).toHaveText('کد پیگیری فقط رقم، حرف لاتین و خط تیره است، تا 40 نویسه.');
    await page.getByLabel('کد پیگیری بانک').fill('1234-ABCD');
    await page.getByLabel('یادداشت').fill('کارت‌به‌کارت، پیش از تسویهٔ آخر ماه');
    // کد نادرست زیر کد.
    await codeField(page).fill(WRONG.code);
    await submit.click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect((await sql`SELECT 1 FROM partner_ledger WHERE print_partner_id = ${navidId}`).length).toBe(0);
    // کد تازه و دو کلیک پشت‌سرهم: یک ردیف (هر فرم شناسهٔ خودش را دارد).
    await codeField(page).fill(await codeFor(secrets.accountant));
    await submit.dblclick();
    await expect(success(page)).toHaveText('پرداخت ثبت شد؛ چاپخانه همین را در صورت‌حسابش می‌بیند.');
    await expect(entries(page)).toHaveCount(1);
    const ledger = await sql<{ id: string; kind: string; amount_rials: string; tracking: string; note: string }[]>`
      SELECT id::text, kind, amount_rials::text, tracking, note FROM partner_ledger WHERE print_partner_id = ${navidId}`;
    expect(ledger).toEqual([
      { id: expect.any(String), kind: 'payment', amount_rials: String(payTomans * 10n), tracking: '1234-ABCD', note: 'کارت‌به‌کارت، پیش از تسویهٔ آخر ماه' },
    ]);
    paymentEntry = ledger[0]!.id;
    const payment = entries(page).first();
    await expect(payment.locator('p').first()).toHaveText(`پرداخت به چاپخانه · −${pay} تومان · ${today}`);
    await expect(payment.locator('.ad-people__meta')).toHaveText(
      /^بابت .+ · کد پیگیری 1234-ABCD · کارت‌به‌کارت، پیش از تسویهٔ آخر ماه · ثبت آرش نیک‌نام$/,
    );
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA - payTomans * 10n));
    await expect(tile(page, 'payments').locator('.ad-tile__n')).toHaveText(pay);
    await expect(tile(page, 'closing').locator('.ad-tile__n')).toHaveText(`+${tomans(shareA - payTomans * 10n)}`);

    // اصلاح از کنار سفارش لغوشده: سفارش از پیش، و شماره‌ای که هرگز به این چاپخانه سپرده نشده پیش از کد.
    await page
      .locator(`[data-settlement="cancelled"] li[data-order="${c.number}"]`)
      .getByRole('link', { name: 'اصلاح برای این سفارش' })
      .click();
    await expect(page.getByRole('heading', { name: `ثبت اصلاح برای ${NAVID}`, level: 1 })).toBeVisible();
    await expect(page.locator('[data-settlement-form="adjustment"] .jy-note--info')).toHaveText(
      `سفارش ${c.number}، لغو شد؛ سهمش ${tomans(shareC)} تومان بود.`,
    );
    const orderField = page.locator('#adj-order');
    await expect(orderField).toHaveValue(String(c.number));
    await expect(page.getByLabel('به سود چاپخانه')).toBeChecked();
    await page.getByLabel('مبلغ (تومان)').fill('5,000');
    await page.getByLabel('دلیل').fill('نیمی از چاپ انجام شده بود');
    await orderField.fill('1');
    await codeField(page).fill(WRONG.code);
    await page.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(page.locator('#adj-order-error')).toHaveText('این سفارش هرگز به همین چاپخانه سپرده نشده؛ شماره را ببین، یا خالی بگذار.');
    await expect(page.locator('#step-code-error')).toHaveCount(0);
    await orderField.fill(String(c.number));
    await codeField(page).fill(await codeFor(secrets.accountant));
    await page.getByRole('button', { name: 'ثبت اصلاح' }).click();
    await expect(success(page)).toHaveText('اصلاح ثبت شد.');
    await expect(entries(page)).toHaveCount(2);
    const adjustment = entries(page).filter({ hasText: 'اصلاح به سود چاپخانه' });
    adjustmentEntry = (await adjustment.getAttribute('data-entry'))!;
    await expect(adjustment.locator('p').first()).toHaveText(`اصلاح به سود چاپخانه · +5,000 تومان · ${today}`);
    await expect(adjustment.locator('.ad-people__meta')).toHaveText(`سفارش ${c.number} · نیمی از چاپ انجام شده بود · ثبت آرش نیک‌نام`);
    await expect(tile(page, 'adjustments').locator('.ad-tile__n')).toHaveText('+5,000');
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA - payTomans * 10n + 50_000n));

    // باطل با دلیل و کد تازه: ردیف با دلیلش می‌ماند و در هیچ جمعی نیست.
    await adjustment.getByRole('link', { name: 'باطل کن' }).click();
    await expect(page.getByRole('heading', { name: `باطل کردن ردیف دفتر ${NAVID}`, level: 1 })).toBeVisible();
    await expect(page.locator('[data-settlement-form="void"] .ad-lead')).toHaveText(
      `اصلاح به سود چاپخانه، +5,000 تومان، روز ${today}: نیمی از چاپ انجام شده بود.`,
    );
    await page.getByLabel('دلیل').fill('چاپخانه کل مبلغ را پس داد');
    await codeField(page).fill(await codeFor(secrets.accountant));
    await page.getByRole('button', { name: 'باطل کن' }).click();
    await expect(success(page)).toHaveText('ردیف باطل شد؛ با دلیلش در صورت‌حساب می‌ماند و در هیچ جمعی نیست.');
    const voided = page.locator(`[data-settlement="ledger"] li[data-entry="${adjustmentEntry}"]`);
    await expect(voided).toHaveAttribute('data-voided', '');
    await expect(voided.locator('.jy-badge')).toHaveText('باطل');
    await expect(voided.locator('.ad-people__meta').nth(1)).toHaveText('باطل امروز، آرش نیک‌نام: چاپخانه کل مبلغ را پس داد');
    await expect(voided.getByRole('link', { name: 'باطل کن' })).toHaveCount(0);
    await expect(tile(page, 'adjustments').locator('.ad-tile__n')).toHaveText('0');
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA - payTomans * 10n));
    // باطل‌شده دوباره باطل نمی‌شود.
    await page.goto(at(`/reports/settlement/${navidId}/void/${adjustmentEntry}`));
    await expect(page.getByRole('heading', { name: 'این ردیف پیش‌تر باطل شده' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('حسابدار: فرم کهنه پیش از کد رد می‌شود؛ خروجی اکسل و PDF صورت‌حساب با رویداد', async () => {
    test.setTimeout(180_000);
    const { page, problems } = who.accountant;
    const shareA = shareOf(a.subtotalRials);
    // ردیفی که پس از باز شدن فرم ثبت شد (پشت سر صفحه): «همان که دیده شد» پیش از کد، پس کدی خرج نمی‌شود.
    await page.goto(at(`/reports/settlement/${navidId}/payment?d=month`));
    await sql`INSERT INTO partner_ledger (print_partner_id, kind, amount_rials, day, note, created_by, request_id)
              VALUES (${navidId}, 'adjustment', 100000, ${tehranDayStart(new Date())}, 'کرایهٔ پست این ماه', ${ownerId}, ${randomUUID()})`;
    await page.getByLabel('مبلغ (تومان)').fill('1,000');
    await codeField(page).fill(WRONG.code);
    await page.getByRole('button', { name: 'ثبت پرداخت' }).click();
    await expect(page.locator('main .jy-note--error')).toHaveText(
      'از وقتی این صفحه را باز کردی، پرداخت، اصلاح یا باطلی برای همین چاپخانه ثبت شده؛ صورت‌حساب تازه را ببین و اگر هنوز لازم است، دوباره ثبت کن.',
    );
    await expect(page).toHaveURL(new RegExp(`/reports/settlement/${navidId}\\?d=month&e=settlement_changed`));
    await expect(entries(page)).toHaveCount(3);
    expect((await sql`SELECT 1 FROM partner_ledger WHERE print_partner_id = ${navidId} AND kind = 'payment'`).length).toBe(1);
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA - payTomans * 10n + 100_000n));

    // اکسل همان صورت‌حساب، با پایهٔ سهم برای حسابدار؛ رویداد با بازه.
    const file = await download(page, () => page.locator('[data-export="xlsx"]').click());
    expect(file.name).toBe(`tasvie-${navidId.slice(0, 8)}-${monthFile}.xlsx`);
    const parts = xlsxParts(file.bytes);
    const summary = parts.get('xl/worksheets/sheet1.xml')!;
    expect(summary).toContain('rightToLeft="1"');
    expect(summary).toContain('صورت‌حساب تسویه');
    expect(summary).toContain(`${NAVID} · مشهد · `);
    const book = [...parts.entries()].filter(([name]) => name.startsWith('xl/worksheets/')).map(([, xml]) => xml).join('');
    expect(book).toContain('پایهٔ سهم (تومان)');
    expect(book).toContain(`<v>${a.number}</v>`);
    expect(book).toContain('1234-ABCD');
    const accountantId = (await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${accountant}`)[0]!.id;
    const exportsOf = () =>
      sql<{ detail: { report: string; format: string; range: string } }[]>`
        SELECT detail FROM admin_events WHERE action = 'reports.export' AND admin_user_id = ${accountantId} ORDER BY id`;
    const [xlsxEvent] = await exportsOf();
    expect(xlsxEvent!.detail).toMatchObject({ report: 'settlement', format: 'xlsx' });
    expect(xlsxEvent!.detail.range).toMatch(new RegExp(`^${NAVID} · مشهد · \\S+ \\d{4}، تا امروز$`));

    // PDF را همان کارگر می‌سازد، با پایهٔ سهم.
    await page.locator('[data-export="pdf"]').getByRole('button', { name: 'خروجی PDF' }).click();
    await expect(page).toHaveURL(/\/reports\/exports\/[0-9a-f-]{36}$/);
    pdfUrl = new URL(page.url()).pathname.slice(GATE!.length);
    await expect(page.getByRole('heading', { name: 'خروجی PDF صورت‌حساب تسویه', level: 1 })).toBeVisible();
    await expect(page.locator('.ad-back')).toHaveAttribute('href', at('/reports/settlement'));
    await expect(page.locator('[data-export-state]')).toHaveAttribute('data-export-state', 'ready', { timeout: 120_000 });
    const pdf = await download(page, () => page.locator('[data-export="download"]').click());
    expect(pdf.name).toBe(`tasvie-${navidId.slice(0, 8)}-${monthFile}.pdf`);
    expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const [row] = await sql<{ report: string; sha256: string; money: boolean; print_partner_id: string | null }[]>`
      SELECT report, sha256, money, print_partner_id FROM report_exports WHERE id = ${pdfUrl.split('/').at(-1)!}`;
    expect(row).toEqual({ report: 'settlement', sha256: createHash('sha256').update(pdf.bytes).digest('hex'), money: true, print_partner_id: null });
    expect((await exportsOf()).map((event) => event.detail.format)).toEqual(['xlsx', 'pdf']);
    expect(problems).toEqual([]);
  });

  test('کاربر چاپخانه: «تسویه» یکراست صورت‌حساب خودش، بی پایهٔ سهم و بی فرم؛ چاپخانهٔ دیگر «پیدا نشد» و فرم‌ها «باز نیست»', async () => {
    const { page, problems } = who.partner;
    const shareA = shareOf(a.subtotalRials);
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'موجودی کاغذ', 'گزارش‌ها']);
    await nav(page).filter({ hasText: 'گزارش‌ها' }).click();
    await expect(reportsNav(page)).toHaveText(['گزارش تولید', 'تسویه']);
    await reportsNav(page).filter({ hasText: 'تسویه' }).click();
    await expect(page).toHaveURL(new RegExp(`/reports/settlement/${navidId}$`));
    await expect(page.getByRole('heading', { name: `تسویهٔ ${NAVID} · مشهد`, level: 1 })).toBeVisible();
    await expect(reportsNav(page).filter({ hasText: 'تسویه' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'همهٔ چاپخانه‌ها' })).toHaveCount(0);
    await expect(page.locator('[data-settlement="actions"]')).toHaveCount(0);
    await expect(tile(page, 'balance').locator('.ad-tile__n')).toHaveText(tomans(shareA - payTomans * 10n + 100_000n));
    // سفارش، تحویل پست، درصد و سهم؛ پایهٔ سهم مبلغ مشتری است و برای چاپخانه نیست.
    await expect(page.locator(`[data-settlement="handed"] tr[data-order="${a.number}"] td`)).toHaveText([today, '65٪', tomans(shareA)]);
    await expect(page.locator('main')).not.toContainText('پایهٔ سهم');
    // دفتر همان است، با کد پیگیری و یادداشت؛ بی «باطل کن» و بی «اصلاح برای این سفارش».
    await expect(entries(page)).toHaveCount(3);
    await expect(page.locator(`[data-settlement="ledger"] li[data-entry="${paymentEntry}"] .ad-people__meta`)).toContainText('کد پیگیری 1234-ABCD');
    await expect(page.getByRole('link', { name: 'باطل کن' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'اصلاح برای این سفارش' })).toHaveCount(0);
    const file = await download(page, () => page.locator('[data-export="xlsx"]').click());
    const book = [...xlsxParts(file.bytes).values()].join('');
    expect(book).toContain('صورت‌حساب تسویه');
    expect(book).not.toContain('پایهٔ سهم');

    // نمای کلی برای چاپخانه همان صورت‌حساب خودش است؛ چاپخانهٔ دیگر «پیدا نشد».
    await page.goto(at('/reports/settlement'));
    await expect(page).toHaveURL(new RegExp(`/reports/settlement/${navidId}$`));
    const defaultId = (await sql<{ id: string }[]>`SELECT id FROM print_partners WHERE is_default`)[0]!.id;
    await page.goto(at(`/reports/settlement/${defaultId}`));
    await expect(page.getByRole('heading', { name: 'این چاپخانه پیدا نشد' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'همهٔ چاپخانه‌ها' })).toHaveCount(0);
    expect((await page.request.get(at(`/reports/settlement/${defaultId}/xlsx`), { maxRedirects: 0 })).headers()['content-type'] ?? '').not.toContain(
      'spreadsheet',
    );
    for (const path of [
      `/reports/settlement/${navidId}/payment`,
      `/reports/settlement/${navidId}/adjustment?order=${c.number}`,
      `/reports/settlement/${navidId}/void/${paymentEntry}`,
      `/partners/${navidId}/share`,
    ]) {
      await page.goto(at(path));
      await expect(page.getByRole('heading', { name: 'این بخش برای چاپخانه باز نیست' }), path).toBeVisible();
    }
    await expect(page.locator('.ad-noaccess .ad-lead')).toHaveText(
      `سفارش‌هایی که به ${NAVID} سپرده شده‌اند در «سفارش‌ها»ست، گزارش تولید و صورت‌حساب تسویه‌شان در «گزارش‌ها»، و موجودی کاغذت در «موجودی کاغذ». لغو، ویرایش نشانی، پیام مشتری‌ها، تعرفه و بقیه با جزوه‌یار است.`,
    );
    // خروجی PDF حسابدار فقط برای خودش است.
    expect((await page.goto(at(pdfUrl)))?.status()).toBe(404);
    expect(problems).toEqual([]);
  });

  test('متصدی: نه زبانه، نه صورت‌حساب، نه درصد سهم، نه خروجی', async () => {
    const { page, problems } = who.operator;
    await page.goto(at('/'));
    await expect(nav(page).filter({ hasText: 'گزارش‌ها' })).toHaveCount(0);
    await expect(page.locator('[data-alert="share"]')).toHaveCount(0);
    for (const path of ['/reports/settlement', `/reports/settlement/${navidId}`, `/reports/settlement/${navidId}/payment`, `/partners/${navidId}/share`]) {
      await page.goto(at(path));
      await expect(page.getByRole('heading', { name: 'این بخش فقط برای مالک است' }), path).toBeVisible();
    }
    const xlsx = await page.request.get(at(`/reports/settlement/${navidId}/xlsx?d=month`), { maxRedirects: 0 });
    expect(xlsx.status()).not.toBe(200);
    expect(xlsx.headers()['content-type'] ?? '').not.toContain('spreadsheet');
    expect(problems).toEqual([]);
  });

  test('مالک: رویدادهای «تسویه» بی کد پیگیری، یادداشت و دلیل؛ درصد زیر «چاپخانه‌ها» و خروجی زیر «گزارش‌ها»', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/events'));
    await page.getByRole('navigation', { name: 'نوع رویداد' }).getByRole('link', { name: 'تسویه' }).click();
    await expect(page).toHaveURL(/\/events\?kind=settlements$/);
    const lines = page.locator('.ad-log li').filter({ hasText: NAVID });
    const pay = payTomans.toLocaleString('en-US');
    await expect(lines).toHaveText([
      new RegExp(`اصلاح 5,000 تومان «${NAVID}»، روز ${today}، باطل شد`),
      new RegExp(`اصلاح 5,000 تومان به سود «${NAVID}» ثبت شد، روز ${today} برای سفارش ${c.number}`),
      new RegExp(`پرداخت ${pay} تومان به «${NAVID}» ثبت شد، روز ${today} بابت `),
    ]);
    await expect(lines.first()).toContainText('آرش نیک‌نام');
    for (const secret of ['1234-ABCD', 'کارت‌به‌کارت', 'نیمی از چاپ', 'پس داد']) await expect(page.locator('.ad-log')).not.toContainText(secret);

    await page.goto(at('/events?kind=partners'));
    await expect(page.locator('.ad-log li').filter({ hasText: `درصد سهم «${NAVID}»` })).toHaveText([new RegExp(`درصد سهم «${NAVID}» 65٪ شد`)]);
    // تازه‌ترین اول: اکسل چاپخانه، PDF و اکسل حسابدار؛ نام هر کس پیش از متن.
    await page.goto(at('/events?kind=reports'));
    await expect(page.locator('.ad-log li').filter({ hasText: NAVID })).toHaveText([
      new RegExp(`فرهاد.*خروجی اکسل صورت‌حساب تسویه دانلود شد: ${NAVID} · مشهد · `),
      new RegExp(`آرش نیک‌نام.*خروجی PDF صورت‌حساب تسویه خواسته شد: ${NAVID} · مشهد · `),
      new RegExp(`آرش نیک‌نام.*خروجی اکسل صورت‌حساب تسویه دانلود شد: ${NAVID} · مشهد · `),
    ]);
    expect(problems).toEqual([]);
  });

  test('گوشی و دسکتاپ: درصد سهم، تسویه و فرم‌های دفتر بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل', async ({ browser }) => {
    const pages = {
      owner: ['/reports/settlement', `/reports/settlement/${navidId}`, `/partners/${navidId}/share`, '/partners', '/'],
      accountant: [
        `/reports/settlement/${navidId}?d=last`,
        `/reports/settlement/${navidId}/payment?d=month`,
        `/reports/settlement/${navidId}/adjustment?d=month&order=${c.number}`,
        `/reports/settlement/${navidId}/void/${paymentEntry}`,
        `/reports/settlement/${navidId}?from=1405/06/10&to=1405/06/01`,
        pdfUrl,
      ],
      partner: [`/reports/settlement/${navidId}`],
    } as const;
    for (const key of ['owner', 'accountant', 'partner'] as const) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[key].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        for (const path of pages[key]) {
          await page.goto(at(path));
          const found = await layoutProblems(page);
          expect(found, `${key} ${path} در ${width}`).toEqual({ overflow: 0, small: [], blank: [] });
        }
        expect(problems).toEqual([]);
        await context.close();
      }
    }
  });
});
