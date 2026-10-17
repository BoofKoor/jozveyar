import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * نظر مشتری‌ها، سرتاسری (برش ۱۲٫۳؛ ADR-064، سؤال ۲۱۳): خبر پیشخوان، «نظر مشتری‌ها» از سربرگ «سفارش‌ها»، و تصمیم مالک: «روی سایت بگذار» (دو
 * کلیک یکی) که نظر را با نام کوچک و شهر به صفحهٔ اصلی همان وب ۳۱۰۱ می‌برد (`E2E_WEB_BASE_URL`، ISR یک دقیقه‌ای)، نظر بی متن بی آن دکمه، تصمیم
 * کهنه رد، «پنهان کن» که از صفحهٔ اصلی می‌بردش، و «پاک کن» با تأیید که نمره و متن را برای همیشه برمی‌دارد؛ رویدادها زیر «نظرها» بی متن؛ و
 * متصدی، حسابدار و چاپخانه نه خبر دارند، نه دکمه و نه صفحه. نوشتن نظر از صفحهٔ سفارش مشتری در `apps/web/tests/checkout.spec.ts` است.
 *
 * سفارش‌ها مثل `blocks.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت به چاپخانهٔ همین اجرا، کار فایل چاپ و برگه در دست «کارگر دیگری»، و بعد «در
 * حال چاپ» و «تحویل پست شد»؛ نظرها هم با SQL، همان که سایت می‌نویسد. ادمین‌ها با دستور سرور، و نقش حسابدار و چاپخانه با SQL. نظر جز با
 * سفارشش پاک نمی‌شود (`order_reviews_append_only`)، پس در پایان سفارش‌ها و سندشان پاک و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` صفحهٔ اصلی سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SOHA = `چاپ سها ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const GOOD = `صحافی محکم بود و دو روز زودتر رسید ${RUN}.`;
const BAD = `دیر رسید و جلدش کج بود ${RUN}.`;

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
}

/** سفارش یک‌فایلی «تحویل پست شد»، همان ردیف‌های `blocks.spec.ts`، با کارهای فایل چاپ و برگه در دست «کارگر دیگری». */
async function delivered(docId: string, name: string, phone: string): Promise<Seeded> {
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
    SEED_PRICE_LIST,
  );
  const createdAt = new Date(Date.now() - 3 * 60 * MINUTE);
  const paidAt = new Date(Date.now() - 2 * 60 * MINUTE);
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
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'a4', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
             VALUES (${row!.id}, NULL, 'awaiting_payment', ${createdAt}, 'user')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803115', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    await tx`UPDATE orders SET status = 'printing' WHERE id = ${row!.id}`;
    await tx`UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() WHERE id = ${row!.id}`;
    return { number: row!.order_number, id: row!.id };
  });
}

/** نظر صاحب سفارش، همان ردیفی که سایت با «بفرست» می‌نویسد؛ زمان‌ها چند ثانیه پشت‌سرهم، تا ترتیب «تازه‌ترین اول» قطعی باشد. */
async function review(order: Seeded, rating: number, body: string | null, publicName: string, secondsAgo: number): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO order_reviews (order_id, rating, body, public_name, public_place, created_at)
    VALUES (${order.id}, ${rating}, ${body}, ${publicName}, 'مشهد', now() - make_interval(secs => ${secondsAgo}))
    RETURNING id`;
  return row!.id;
}

const statusOf = async (id: string) =>
  (await sql<{ status: string; rating: number | null; body: string | null }[]>`SELECT status, rating, body FROM order_reviews WHERE id = ${id}`)[0]!;
const reviewEvents = (ids: string[]) =>
  sql<{ action: string; detail: unknown }[]>`
    SELECT action, detail FROM admin_events WHERE target_type = 'order_review' AND target_id IN ${sql(ids)} ORDER BY id`;
const pendingCount = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM order_reviews WHERE status = 'pending'`)[0]!.n;

/** صفحهٔ اصلی سایت در زبانهٔ تازه؛ نشان اینماد پاورقی جواب خالی می‌گیرد، مثل `availability.spec.ts` (از اجراگر CI گاهی جواب نمی‌آید). */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

/** متن بخش «نظر مشتری‌ها» صفحهٔ اصلی، یا خالی اگر بخش نیست؛ ISR یک دقیقه‌ای، پس تا ۱۰۰ ثانیه پاییده می‌شود. */
async function homeReviews(site: Page): Promise<string> {
  await site.goto(`${WEB}/`);
  const section = site.locator('#reviews');
  return (await section.count()) > 0 ? await section.innerText() : '';
}

test.describe.serial('نظر مشتری‌ها (۱۲٫۳)', () => {
  const users = { owner: `parvin${RUN}`, operator: `kaveh${RUN}`, accountant: `nima${RUN}`, partner: `yaser${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[] }>;
  const seeded: Seeded[] = [];
  const ids = { good: '', bare: '', bad: '' };
  let docId = '';

  test.beforeAll(async ({ browser }) => {
    // «امروز» زیر هر تصمیم تا نیمه‌شب تهران است، و کل این فایل با دو صبر ISR چند دقیقه است.
    await awayFromMidnight(240_000, 8 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    const [partner] = await sql<{ id: string }[]>`
      INSERT INTO print_partners (name, province_id, city_id, created_at)
      VALUES (${SOHA}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday}) RETURNING id`;
    docId = randomUUID();
    await sql`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docId}, 'زیست - جلسه ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
              ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
    const phone = (n: number) => `0915${String(RUN).slice(1)}81${n}0`;
    const [good, bare, bad] = [
      await delivered(docId, 'مینا کاظمی', phone(1)),
      await delivered(docId, 'سید علی رضایی', phone(2)),
      await delivered(docId, 'نرگس امیری', phone(3)),
    ];
    seeded.push(good!, bare!, bad!);
    ids.good = await review(good!, 5, GOOD, 'مینا', 3);
    ids.bare = await review(bare!, 2, null, 'سید علی', 2);
    ids.bad = await review(bad!, 1, BAD, 'نرگس', 1);

    for (const [key, name] of [
      ['owner', 'پروین شاکری'],
      ['operator', 'کاوه نادری'],
      ['accountant', 'نیما رستمی'],
      ['partner', 'یاسر نوری'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      await enroll(page, serverInvite(users[key], key === 'owner' ? '--owner' : '--operator', '--name', name));
    }
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.accountant})`;
    await sql`UPDATE admin_user_roles SET role_id = 'print_partner', print_partner_id = ${partner!.id}
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.partner})`;
  });

  test.afterAll(async () => {
    if (sql) {
      // نظر جز با سفارشش پاک نمی‌شود: پاک شدن سفارش نظرش را هم می‌برد (cascade).
      for (const o of seeded) {
        await sql`DELETE FROM payments WHERE order_id = ${o.id}`;
        await sql`DELETE FROM orders WHERE id = ${o.id}`;
      }
      if (docId) await sql`DELETE FROM documents WHERE id = ${docId}`;
      await sql`UPDATE print_partners SET deactivated_at = now() WHERE name = ${SOHA} AND deactivated_at IS NULL`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: خبر پیشخوان، «نظر مشتری‌ها» از سربرگ «سفارش‌ها»، نظر بی متن بی «روی سایت بگذار»، روی سایت با دو کلیک یکی، و صفحهٔ اصلی با نام کوچک و شهر', async () => {
    test.setTimeout(180_000);
    const [good] = seeded;
    const { page, problems } = who.owner;
    await page.goto(at());
    const pending = await pendingCount();
    await expect(page.locator('[data-alert="reviews"]')).toHaveText(`${pending} نظر تازهٔ مشتری منتظر توست؛ تا روی سایت نگذاری، کسی نمی‌بیندش.`);
    await page.locator('[data-alert="reviews"]').getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'نظر مشتری‌ها' })).toBeVisible();

    await page.goto(at('/orders'));
    await page.getByRole('link', { name: 'نظر مشتری‌ها' }).click();
    await expect(page).toHaveURL(/\/orders\/reviews$/);
    await expect(page.getByRole('link', { name: `منتظر ${pending}` })).toHaveAttribute('aria-current', 'page');
    const list = page.getByTestId('reviews');
    // تازه‌ترین اول.
    const order = await list.locator('li[data-review]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-review') ?? ''));
    expect(order.filter((id) => Object.values(ids).includes(id))).toEqual([ids.bad, ids.bare, ids.good]);
    const row = (id: string) => list.locator(`li[data-review="${id}"]`);
    await expect(row(ids.good)).toContainText('5 از 5');
    await expect(row(ids.good)).toContainText(GOOD);
    await expect(row(ids.good)).toContainText(new RegExp(`مینا، مشهد · سفارش ${good!.number} · (امروز|دیروز) \\d{2}:\\d{2}`));
    await expect(row(ids.good).locator('.jy-badge')).toHaveText('منتظر');
    // نظر بی متن روی سایت نمی‌رود: دکمه‌اش نیست، پنهان و پاک هست.
    await expect(row(ids.bare)).toContainText('بی متن، فقط نمره؛ روی سایت نمی‌رود.');
    await expect(row(ids.bare).getByRole('button', { name: 'روی سایت بگذار' })).toHaveCount(0);
    await expect(row(ids.bare).getByRole('button', { name: 'پنهان کن' })).toBeVisible();
    await expect(row(ids.bare).getByRole('link', { name: 'پاک کن' })).toBeVisible();
    await expect(page.locator('main')).toContainText('روی صفحهٔ اصلی تازه‌ترین 6 نظرِ «روی سایت» می‌آید');

    // دو کلیک پشت‌سرهم یک تصمیم و یک رویداد است.
    await row(ids.good).getByRole('button', { name: 'روی سایت بگذار' }).dblclick();
    await expect(page.locator('.jy-note--success')).toHaveText('نظر روی سایت رفت؛ تا یک دقیقهٔ دیگر روی صفحهٔ اصلی دیده می‌شود.');
    await expect(row(ids.good)).toHaveCount(0);
    expect(await statusOf(ids.good)).toEqual({ status: 'approved', rating: 5, body: GOOD });
    expect((await reviewEvents([ids.good])).map((e) => [e.action, e.detail])).toEqual([['reviews.approve', { orderNumber: good!.number, rating: 5 }]]);

    await page.getByRole('link', { name: /^روی سایت \d+$/ }).click();
    await expect(page).toHaveURL(/\?f=approved$/);
    await expect(row(ids.good).locator('.jy-badge')).toHaveText('روی سایت');
    await expect(row(ids.good)).toContainText(/روی سایت از امروز \d{2}:\d{2}، پروین شاکری/);
    await expect(row(ids.good).getByRole('button', { name: 'روی سایت بگذار' })).toHaveCount(0);
    expect(problems).toEqual([]);

    if (WEB) {
      // صفحهٔ اصلی با ISR یک دقیقه‌ای: نظر تا یک دقیقه می‌آید، با نام کوچک و شهر؛ نام خانوادگی و نظر منتظر هرگز.
      const site = await sitePage(page.context());
      await expect.poll(() => homeReviews(site), { timeout: 100_000, intervals: [5_000] }).toContain(GOOD);
      const text = await homeReviews(site);
      expect(text).toContain('نظر مشتری‌ها');
      expect(text).toContain('مینا، مشهد');
      expect(text).not.toContain('کاظمی');
      expect(text).not.toContain(BAD);
      await site.close();
    }
  });

  test('مالک: تصمیم کهنه رد، پنهان از صفحهٔ اصلی می‌برد، پاک با تأیید و انصراف، و رویدادها زیر «نظرها» بی متن', async () => {
    test.setTimeout(180_000);
    const [good, , bad] = seeded;
    const { page, problems } = who.owner;
    await page.goto(at('/orders/reviews?f=pending'));
    const list = page.getByTestId('reviews');
    const row = (id: string) => list.locator(`li[data-review="${id}"]`);
    await expect(row(ids.bad)).toBeVisible();
    // کس دیگری همین حالا پنهانش کرد (پشت سر همین صفحه): «روی سایت بگذار» این صفحه کهنه است.
    await sql`UPDATE order_reviews SET status = 'hidden', decided_at = now(),
                     decided_by = (SELECT id FROM admin_users WHERE username = ${users.owner})
               WHERE id = ${ids.bad}`;
    await row(ids.bad).getByRole('button', { name: 'روی سایت بگذار' }).click();
    await expect(page.locator('main .jy-note--error')).toHaveText('این نظر همین حالا عوض شد؛ وضعیت تازه‌اش را ببین و دوباره تصمیم بگیر.');
    expect((await statusOf(ids.bad)).status).toBe('hidden');

    await page.goto(at('/orders/reviews?f=approved'));
    await row(ids.good).getByRole('button', { name: 'پنهان کن' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText('نظر پنهان شد؛ تا یک دقیقهٔ دیگر از صفحهٔ اصلی می‌رود.');
    await expect(row(ids.good)).toHaveCount(0);
    expect((await statusOf(ids.good)).status).toBe('hidden');

    // پاک کردن: اول تأیید، «انصراف» بی هیچ تغییری، و بعد پاک برای همیشه.
    await page.goto(at('/orders/reviews?f=hidden'));
    await row(ids.bad).getByRole('link', { name: 'پاک کن' }).click();
    await expect(page).toHaveURL(new RegExp(`\\?f=hidden&delete=${ids.bad}$`));
    const confirm = row(ids.bad).getByTestId('review-delete');
    await expect(confirm).toContainText('نمره و متن این نظر برای همیشه پاک می‌شود و برنمی‌گردد، و این سفارش دیگر نظر تازه نمی‌گیرد.');
    await confirm.getByRole('link', { name: 'انصراف' }).click();
    await expect(page).toHaveURL(/\?f=hidden$/);
    await expect(row(ids.bad).getByTestId('review-delete')).toHaveCount(0);
    expect((await statusOf(ids.bad)).status).toBe('hidden');
    await row(ids.bad).getByRole('link', { name: 'پاک کن' }).click();
    await row(ids.bad).getByTestId('review-delete').getByRole('button', { name: 'پاک کن' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText('نظر پاک شد.');
    expect(await statusOf(ids.bad)).toEqual({ status: 'deleted', rating: null, body: null });
    await page.goto(at('/orders/reviews?f=all'));
    await expect(row(ids.bad)).toHaveCount(0);
    await expect(row(ids.good)).toBeVisible();

    expect((await reviewEvents([ids.good, ids.bad])).map((e) => [e.action, e.detail])).toEqual([
      ['reviews.approve', { orderNumber: good!.number, rating: 5 }],
      ['reviews.hide', { orderNumber: good!.number, rating: 5 }],
      ['reviews.delete', { orderNumber: bad!.number, rating: 1 }],
    ]);
    await page.goto(at('/events?kind=reviews'));
    await expect(page.getByRole('link', { name: 'نظرها' })).toHaveAttribute('aria-current', /.+/);
    const log = page.locator('.ad-log');
    await expect(log).toContainText(`نظر سفارش ${good!.number} (5 از 5) روی سایت رفت`);
    await expect(log).toContainText(`نظر سفارش ${good!.number} (5 از 5) پنهان شد`);
    await expect(log).toContainText(`نظر سفارش ${bad!.number} (1 از 5) پاک شد`);
    await expect(page.locator('main')).not.toContainText(GOOD);
    await expect(page.locator('main')).not.toContainText(BAD);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => homeReviews(site), { timeout: 100_000, intervals: [5_000] }).not.toContain(GOOD);
      await site.close();
    }
  });

  test('متصدی، حسابدار و چاپخانه: نه خبر پیشخوان، نه دکمه، نه صفحه', async () => {
    const operator = who.operator.page;
    await operator.goto(at());
    await expect(operator.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(operator.locator('[data-alert="reviews"]')).toHaveCount(0);
    await operator.goto(at('/orders'));
    await expect(operator.getByRole('link', { name: 'شماره‌های مسدود' })).toBeVisible();
    await expect(operator.getByRole('link', { name: 'نظر مشتری‌ها' })).toHaveCount(0);
    await operator.goto(at('/orders/reviews'));
    await expect(operator.locator('main')).toContainText('این بخش فقط برای مالک است');
    await expect(operator.getByTestId('reviews')).toHaveCount(0);

    const accountant = who.accountant.page;
    await accountant.goto(at('/orders/reviews'));
    await expect(accountant.locator('main')).toContainText('این بخش برای حسابدار باز نیست');
    const partner = who.partner.page;
    await partner.goto(at('/orders/reviews?f=all'));
    await expect(partner.locator('main')).toContainText('این بخش برای چاپخانه باز نیست');
    await expect(partner.locator('main')).not.toContainText(GOOD);
    expect([who.operator.problems, who.accountant.problems, who.partner.problems]).toEqual([[], [], []]);
  });

  test('گوشی و دسکتاپ: فهرست، چیپ‌ها و تأیید «پاک کن»، بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    for (const path of ['/orders/reviews?f=all', '/orders/reviews?f=pending', `/orders/reviews?f=all&delete=${ids.bare}`]) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who.owner.context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(at(path));
        await expect(page.getByRole('heading', { level: 1, name: 'نظر مشتری‌ها' })).toBeVisible();
        const { overflow, small, blank } = await layoutProblems(page);
        expect([overflow <= 0, small, blank], `${path} @ ${width}`).toEqual([true, [], []]);
        expect(problems, `${path} @ ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
