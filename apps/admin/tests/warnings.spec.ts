import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * هشدارهای فایل در پنل، سرتاسری (برش ۸٫۱؛ ADR-029، سؤال ۱۸۱): «کیفیت اسکن پایین» و «حاشیهٔ کم» از ۸٫۱ به مشتری نشان داده
 * نمی‌شوند (`apps/web/tests/flow.spec.ts` و `jozve.spec.ts`)، و پنل همه را برای هر فایل با شمارهٔ صفحه در صفحهٔ سفارش نشان
 * می‌دهد، به مالک، متصدی و چاپخانه: شمارهٔ صفحه سراسری جزوه (همان فایل چاپ)، نام فایل فقط در جزوهٔ چندفایلی، حاشیهٔ اسلاید
 * هرگز، و فقط تازه‌ترین تحلیل سرور (نه تحلیل قدیمی‌تر و نه تحلیل مرورگر).
 *
 * تحلیل را خود تست با SQL می‌نشاند، همان ردیف‌هایی که کارگر می‌نویسد (`document_analyses` و `document_pages`، و `conversion` سند)،
 * پس استوریج و کارگر لازم نیست: کار فایل چاپ و برگه در دست «کارگر دیگری» است (مثل `print.spec.ts`) تا کارگر CI برش ندارد.
 * سفارش‌ها مثل `orders.spec.ts`، با تخصیص پرداخت (`assignAtPayment`) به چاپخانهٔ همین اجرا، که کاربرش را مالک از «ادمین‌ها»
 * می‌سازد (مثل `scope.spec.ts`). در پایان سفارش‌ها و سندهای همین اجرا پاک و چاپخانه‌اش غیرفعال، مثل پیش از تست.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const MEHR = `چاپ مهر ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const A4: [number, number] = [595, 842];
/** پاورپوینت با اسلاید A4 افقی: شکل کاغذ دارد (`isSlidePage` نه)، پس فقط نوع سند حاشیه‌اش را از هشدار بیرون می‌گذارد. */
const A4_LANDSCAPE: [number, number] = [842, 595];

let sql: postgres.Sql;

/** سند آماده با شمارش سرور؛ خود فایل لازم نیست، چون صفحهٔ سفارش فقط ردیف‌ها را می‌خواند. */
async function document(name: string, kind: 'pdf' | 'pptx', pages: number, conversion: unknown = null) {
  const id = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at, pdf_storage_key, conversion)
    VALUES (${id}, ${name}, ${kind}, ${kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
            1000, ${`uploads/${id}.${kind}`}, 'ready', ${pages}, ${'e2e'.padEnd(64, '8')}, 'e2e', ${8 * 1024 * 1024}, now(),
            ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)}, ${kind === 'pdf' ? null : `uploads/${id}.pdf`},
            ${conversion === null ? null : sql.json(conversion as never)})`;
  return { id, pages };
}

/**
 * یک دور تحلیل، همان شکل ردیف‌های کارگر: هر صفحه با اندازه‌اش، و هشدار صفحه‌های `flagged` (`blank_page` یعنی صفحهٔ خالی، مثل
 * کارگر). `createdAt` ترتیب دورها را می‌گوید.
 */
async function analysis(
  docId: string,
  source: 'server' | 'browser',
  pages: number,
  size: [number, number],
  flagged: Record<number, string[]>,
  createdAt: Date,
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO document_analyses (document_id, source, engine, thresholds, page_count, elapsed_ms, created_at)
    VALUES (${docId}, ${source}, ${`${source}-e2e`}, ${sql.json({})}, ${pages}, 1000, ${createdAt})
    RETURNING id`;
  await sql`
    INSERT INTO document_pages (analysis_id, n, width_pt, height_pt, color, color_ratio, colored_ink_ratio, chroma_p95, ink_ratio, paper_cast)
    SELECT ${row!.id}, n, ${size[0]}, ${size[1]}, false, 0, 0, 0, 0.05, '[250, 250, 248]'::jsonb FROM generate_series(1, ${pages}) AS n`;
  for (const [n, warnings] of Object.entries(flagged)) {
    await sql`UPDATE document_pages SET warnings = ${sql.array(warnings)}, blank = ${warnings.includes('blank_page')}
               WHERE analysis_id = ${row!.id} AND n = ${Number(n)}`;
  }
}

interface Seeded {
  number: number;
  id: string;
}

/**
 * سفارش پرداخت‌شده همان‌طور که سرور می‌نویسد (`orders.spec.ts`): قیمت `quote()` با تعرفهٔ پایه، یک جزوه با همهٔ فایل‌ها پشت‌سرهم،
 * برگشت موفق درگاه با رویداد و چاپخانه (`assignAtPayment`)؛ کارهای `prepare_order` و `prepare_ticket` در دست «کارگر دیگری».
 */
async function order(docs: { id: string; pages: number }[], name: string, phone: string): Promise<Seeded> {
  const sections = docs.map((d) => ({ documentId: d.id, pageCount: d.pages }));
  const pageCount = sections.reduce((sum, s) => sum + s.pageCount, 0);
  const rules = [{ pageRanges: [[1, pageCount]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
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
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${phone}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
              ${createdAt})
      RETURNING id, order_number`;
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
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    return { number: row!.order_number, id: row!.id };
  });
}

const partnerOf = async (o: Seeded) =>
  (await sql<{ name: string | null }[]>`SELECT p.name FROM orders o LEFT JOIN print_partners p ON p.id = o.print_partner_id WHERE o.id = ${o.id}`)[0]!
    .name;
const warningsOf = (page: Page) => page.getByRole('list', { name: 'هشدارهای فایل' });

/** هشدارهای جزوهٔ سه‌فایلی W: صفحه‌های فایل دوم از 13 و فایل سوم از 17. */
const MULTI = [
  'کیفیت اسکن یا عکس پایین، کمی مات چاپ می‌شود: صفحه‌های 2 و 5 (فایل فیزیک - جلسه ۱.pdf)؛ صفحهٔ 13 (فایل ارائه - فصل ۲.pptx).',
  'حاشیهٔ کم، صحافی ممکن است لبهٔ متن را بگیرد: صفحهٔ 7 (فایل فیزیک - جلسه ۱.pdf).',
  'صفحهٔ خالی: صفحهٔ 9 (فایل فیزیک - جلسه ۱.pdf).',
  'فونت جایگزین، ظاهر و تعداد صفحه ممکن است با فایل مشتری فرق کند: B Nazanin و B Titr (فایل ارائه - فصل ۲.pptx).',
];

test.describe.serial('هشدارهای فایل در پنل (۸٫۱)', () => {
  // نام‌های کاربری با پیشوند خود همین فایل: `sara${RUN}` و `hasan${RUN}` specهای دیگر با شمارهٔ اجرای یکسان به هم نخورند.
  const owner = `nasrin${RUN}`;
  let ownerSecret = '';
  const who = {} as Record<'owner' | 'operator' | 'partner', { context: BrowserContext; page: Page; problems: string[] }>;
  // W: سه فایل با هشدار. S: یک فایل، یک هشدار. N: یک فایل بی هشدار.
  const o = {} as Record<'W' | 'S' | 'N', Seeded>;
  const docIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    await sql`INSERT INTO print_partners (name, province_id, city_id, created_at)
              VALUES (${MEHR}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday})`;

    const now = Date.now();
    const physics = await document('فیزیک - جلسه ۱.pdf', 'pdf', 12);
    const deck = await document('ارائه - فصل ۲.pptx', 'pptx', 4, {
      engine: 'libreoffice-25.2.3',
      format: 'pptx',
      fonts: { requested: ['B Nazanin', 'B Titr', 'Arial'], mismatched: ['B Nazanin', 'B Titr'] },
    });
    const stats = await document('آمار - فصل ۳.pdf', 'pdf', 6);
    const single = await document('زیست - جلسه ۱.pdf', 'pdf', 10);
    const clean = await document('شیمی - جلسه ۵.pdf', 'pdf', 10);
    docIds.push(...[physics, deck, stats, single, clean].map((d) => d.id));
    // تحلیل قدیمی‌تر سرور و تحلیل مرورگر (تازه‌ترین ردیف سند) هشدارهای دیگری دارند و نباید دیده شوند: فقط تازه‌ترین تحلیل سرور.
    await analysis(physics.id, 'server', 12, A4, { 1: ['low_dpi'], 3: ['tight_margin'] }, new Date(now - 90 * MINUTE));
    await analysis(physics.id, 'server', 12, A4, { 2: ['low_dpi'], 5: ['low_dpi'], 7: ['tight_margin'], 9: ['blank_page'] }, new Date(now - 70 * MINUTE));
    await analysis(physics.id, 'browser', 12, A4, { 4: ['low_dpi'], 6: ['blank_page'] }, new Date(now - 60 * MINUTE));
    // پاورپوینت: کیفیت اسکن هشدار است، حاشیه نه (ADR-029).
    await analysis(deck.id, 'server', 4, A4_LANDSCAPE, { 1: ['low_dpi'], 3: ['tight_margin'] }, new Date(now - 70 * MINUTE));
    await analysis(stats.id, 'server', 6, A4, {}, new Date(now - 70 * MINUTE));
    await analysis(single.id, 'server', 10, A4, { 10: ['tight_margin'] }, new Date(now - 70 * MINUTE));
    await analysis(clean.id, 'server', 10, A4, {}, new Date(now - 70 * MINUTE));

    const phone = (n: number) => `0915${String(RUN).slice(1)}8${String(n).repeat(3)}`;
    o.W = await order([physics, deck, stats], 'مریم کاظمی', phone(1));
    o.S = await order([single], 'زهرا محمدی', phone(2));
    o.N = await order([clean], 'پارسا امینی', phone(3));
    expect(await Promise.all([o.W, o.S, o.N].map(partnerOf))).toEqual([MEHR, MEHR, MEHR]);

    for (const [key, args] of [
      ['owner', ['--name', 'نسرین احمدی']],
      ['operator', ['--operator', '--name', 'رضا کریمی']],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      const secret = await enroll(page, serverInvite(key === 'owner' ? owner : `reza${RUN}`, ...args));
      if (key === 'owner') ownerSecret = secret;
      who[key] = { context, page, problems };
    }
    // کاربر چاپخانه را فقط مالک از «ادمین‌ها» می‌سازد، با کد تازه (دستور سرور نقش چاپخانه نمی‌سازد).
    const ownerPage = who.owner.page;
    await ownerPage.goto(at('/admins/new'));
    await ownerPage.getByLabel('نام', { exact: true }).fill('حسن نوری');
    await ownerPage.getByLabel('نام کاربری').fill(`mehr${RUN}`);
    await ownerPage.getByRole('group', { name: 'نقش' }).getByRole('radio', { name: /^چاپخانه / }).check();
    await ownerPage.getByRole('group', { name: 'کدام چاپخانه' }).locator('.jy-tile', { hasText: MEHR }).getByRole('radio').check();
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'ساختن پیوند' }).click();
    const link = await ownerPage.getByRole('textbox', { name: 'پیوند ثبت' }).inputValue();
    const context = await newContext(browser);
    const page = await context.newPage();
    const problems = watch(page);
    await enroll(page, link);
    await expect(page.locator('.ad-user')).toContainText(`حسن نوری · ${MEHR}`);
    who.partner = { context, page, problems };
  });

  test.afterAll(async () => {
    // همان پیش از تست: سفارش‌ها و سندهای همین اجرا پاک (چاپخانه با سفارش باز غیرفعال نمی‌شود)، و چاپخانه‌اش غیرفعال.
    if (sql) {
      const ids = Object.values(o).map((one) => one.id);
      if (ids.length > 0) {
        await sql`DELETE FROM payments WHERE order_id IN ${sql(ids)}`;
        await sql`DELETE FROM orders WHERE id IN ${sql(ids)}`;
      }
      if (docIds.length > 0) await sql`DELETE FROM documents WHERE id IN ${sql(docIds)}`;
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${MEHR} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: هر هشدار یک یادداشت، شمارهٔ صفحهٔ سراسری با نام فایل؛ پاورپوینت بی حاشیه؛ فقط تازه‌ترین تحلیل سرور', async () => {
    const { page, problems } = who.owner;
    await page.goto(at(`/orders/${o.W.number}`));
    await expect(page.getByRole('heading', { name: `سفارش ${o.W.number}` })).toBeVisible();
    // زیر فهرست فایل‌های همان جزوه، پیش از مشخصات چاپ.
    await expect(page.locator('.ad-files + .ad-warnings + .ad-spec')).toHaveCount(1);
    const list = warningsOf(page);
    await expect(list.getByRole('listitem')).toHaveText(MULTI);
    await expect(list.locator('[data-testid^="file-warning-"]')).toHaveText(MULTI);
    expect(await list.getByRole('listitem').evaluateAll((items) => items.map((li) => (li as HTMLElement).dataset.testid))).toEqual([
      'file-warning-low-dpi',
      'file-warning-tight-margin',
      'file-warning-blank',
      'file-warning-fonts',
    ]);
    // هر عدد در `.num` خودش (ارقام لاتین با فاصلهٔ برابر)، و نام فایل و فونت با جهت خودش (`bdi`): نام فارسی راست‌به‌چپ، که در
    // `ad-ltr` به هم می‌ریخت («فایل pdf.فیزیک - جلسه ۱»)، و نام لاتین چپ‌به‌راست.
    await expect(page.getByTestId('file-warning-low-dpi').locator('.num')).toHaveText(['2', '5', '13']);
    const names = page.getByTestId('file-warning-fonts').locator('bdi');
    await expect(names).toHaveText(['B Nazanin', 'B Titr', 'ارائه - فصل ۲.pptx']);
    await expect(names.first()).toHaveCSS('direction', 'ltr');
    await expect(names.last()).toHaveCSS('direction', 'rtl');
    await expect(page.getByTestId('file-warning-low-dpi').locator('bdi').first()).toHaveCSS('direction', 'rtl');
    await expect(page.getByTestId('file-warning-low-dpi').locator('.jy-icon-warning')).toHaveCount(1);

    // یک فایل: بی نام فایل. بی هشدار: بی فهرست.
    await page.goto(at(`/orders/${o.S.number}`));
    await expect(warningsOf(page).getByRole('listitem')).toHaveText(['حاشیهٔ کم، صحافی ممکن است لبهٔ متن را بگیرد: صفحهٔ 10.']);
    await page.goto(at(`/orders/${o.N.number}`));
    await expect(page.getByRole('heading', { name: `سفارش ${o.N.number}` })).toBeVisible();
    await expect(page.locator('.ad-warnings')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('متصدی و چاپخانه همان هشدارها را می‌بینند', async () => {
    for (const key of ['operator', 'partner'] as const) {
      const { page, problems } = who[key];
      await page.goto(at(`/orders/${o.W.number}`));
      await expect(page.getByRole('heading', { name: `سفارش ${o.W.number}` })).toBeVisible();
      await expect(warningsOf(page).getByRole('listitem'), key).toHaveText(MULTI);
      await page.goto(at(`/orders/${o.S.number}`));
      await expect(warningsOf(page).getByRole('listitem'), key).toHaveText(['حاشیهٔ کم، صحافی ممکن است لبهٔ متن را بگیرد: صفحهٔ 10.']);
      expect(problems, key).toEqual([]);
    }
  });

  test('گوشی و دسکتاپ: صفحهٔ سفارش با هشدارها بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const key of ['owner', 'partner'] as const) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who[key].context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        for (const path of [at(`/orders/${o.W.number}`), at(`/orders/${o.S.number}`)]) {
          await page.goto(path);
          await expect(warningsOf(page)).toBeVisible();
          const { overflow, small, blank } = await layoutProblems(page);
          expect(overflow, `${key} ${width} ${path}`).toBeLessThanOrEqual(0);
          expect(small, `${key} ${width} ${path}`).toEqual([]);
          expect(blank, `${key} ${width} ${path}`).toEqual([]);
        }
        expect(problems, `${key} ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
