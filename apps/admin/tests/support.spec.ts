import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { supportParams, supportReplyText } from '@jozveyar/sms';
import { tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, awayFromMidnight, BASE, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * پشتیبانی، سرتاسری (برش ۱۲٫۱؛ ADR-068؛ طرح «پشتیبانی (برش ۱۲)» در `admin.html`، سؤال‌های ۳۱۱ تا ۳۱۶): زبانهٔ «پشتیبانی» با شمار گفت‌وگوهای
 * باز و هشدار پیشخوان؛ صندوق با چیپ‌ها، قدیمی‌ترین انتظار اول و جست‌وجو؛ گفت‌وگو با مشتری و سفارش در ستون کنار؛ پاسخ (خطای متن همان‌جا، نام
 * ادمین فقط برای پنل، پیامک پاسخ «رفت»، و پاسخ پشت‌سرهم بی پیامک تازه)؛ «بستن گفت‌وگو» از همان که دیده شد، و کهنه رد؛ پیامک پاسخی که نرفت با
 * هشدار پیشخوان و «دوباره بفرست»؛ کارت «پیام‌های مشتری» صفحهٔ سفارش؛ رویدادها زیر «پشتیبانی» بی متن؛ «بیشتر» گوشی مالک با همان شمار؛ و
 * حسابدار و چاپخانه نه زبانه دارند، نه صفحه و نه کارت. پیام مشتری از «سفارش‌های من» در `apps/web/tests/account.spec.ts` است.
 *
 * سفارش‌ها مثل `blocks.spec.ts`: ردیف‌ها با SQL و تخصیص پرداخت به چاپخانهٔ همین اجرا، و کار فایل چاپ و برگه در دست «کارگر دیگری»؛ گفت‌وگو و
 * پیام مشتری هم با SQL، همان که سایت می‌نویسد. پیامک پنل در این مرحله کنسولی است، پس پاسخ «رفت». ادمین‌ها با دستور سرور، و نقش حسابدار و چاپخانه
 * با SQL. پیام پاک‌نشدنی است (`support_messages_append_only`)، ولی تریگر ردیفی TRUNCATE را نمی‌گیرد: گفت‌وگوها در آغاز و پایان پاک می‌شوند، و
 * بعد سفارش‌ها و سندشان، و چاپخانه غیرفعال.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const SOHA = `چاپ سها ${RUN}`;
const MASHHAD = { provinceId: 11, cityId: 1326 };
const phone = (n: number) => `0915${String(RUN).slice(1)}82${n}0`;
const spaced = (mobile: string) => `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`;
const masked = (mobile: string) => `${mobile.slice(0, 4)} ••• ${mobile.slice(7)}`;
const ANSWER = 'سلام. جزوه‌ات امروز چاپ و تحویل پست می‌شود.\nکد رهگیری را همان موقع پیامک می‌کنیم.';

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  userId: string;
}

/** سفارش پرداخت‌شدهٔ یک‌فایلی، همان ردیف‌های `blocks.spec.ts`، با کارهای فایل چاپ و برگه در دست «کارگر دیگری». */
async function order(docId: string, name: string, mobile: string): Promise<Seeded> {
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
    SEED_PRICE_LIST,
  );
  const createdAt = new Date(Date.now() - 4 * 60 * MINUTE);
  const paidAt = new Date(Date.now() - 3 * 60 * MINUTE);
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${mobile}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', ${zoneId},
              ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${name}, ${mobile}, 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', '9187654321',
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
              '803116', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    return { number: row!.order_number, id: row!.id, userId: user!.id };
  });
}

/** گفت‌وگو با اولین پیام مشتری، همان دو ردیفی که سایت با «فرستادن» می‌نویسد؛ `orderId` null یعنی «سؤال کلی». */
async function thread(userId: string, orderId: string | null, body: string, minutesAgo: number): Promise<number> {
  return sql.begin(async (tx) => {
    const at = new Date(Date.now() - minutesAgo * MINUTE);
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO support_threads (user_id, order_id, status, created_at, last_message_at, waiting_since, customer_seen_at)
      VALUES (${userId}, ${orderId}, 'open', ${at}, ${at}, ${at}, ${at}) RETURNING id`;
    await tx`INSERT INTO support_messages (thread_id, kind, body, request_id, created_at)
             VALUES (${row!.id}, 'customer', ${body}, ${randomUUID()}, ${at})`;
    return Number(row!.id);
  });
}

/** پیام تازهٔ مشتری در همان گفت‌وگو، پس از آخرین پیامش. */
const customerMessage = (threadId: number, body: string) =>
  sql`INSERT INTO support_messages (thread_id, kind, body, request_id, created_at)
      VALUES (${threadId}, 'customer', ${body}, ${randomUUID()},
              greatest(now(), (SELECT last_message_at FROM support_threads WHERE id = ${threadId}) + interval '1 millisecond'))`;

/**
 * پاسخ پنل با پیامکی که نرفت: ردیف منتظر و پاسخ، همان که «فرستادن پاسخ» می‌نویسد، و بعد تلاشی که «نرفت» شد؛ مشتری پاسخ را ندیده، پس
 * «دوباره بفرست» دارد.
 */
async function failedReply(threadId: number, adminId: string, mobile: string, orderNumber: number, minutesAgo: number) {
  await sql.begin(async (tx) => {
    const at = new Date(Date.now() - minutesAgo * MINUTE);
    const [sms] = await tx<{ id: number }[]>`
      INSERT INTO sms_messages (provider, to_mobile, purpose, body, params, status, created_at)
      VALUES ('queued', ${mobile}, 'support_reply', ${supportReplyText(orderNumber)}, ${tx.json(supportParams(orderNumber))}, 'pending', ${at})
      RETURNING id`;
    await tx`INSERT INTO support_messages (thread_id, kind, admin_user_id, body, request_id, sms_message_id, created_at)
             VALUES (${threadId}, 'staff', ${adminId}, 'سلام. نشانی را درست کردیم.', ${randomUUID()}, ${sms!.id}, ${at})`;
    await tx`UPDATE sms_messages SET status = 'sending', attempts = 1, attempted_at = ${at} WHERE id = ${sms!.id}`;
    await tx`UPDATE sms_messages SET status = 'failed', error = 'unavailable' WHERE id = ${sms!.id}`;
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' });
const openCount = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM support_threads WHERE status = 'open'`)[0]!.n;
const statusOf = async (id: number) => (await sql<{ status: string }[]>`SELECT status FROM support_threads WHERE id = ${id}`)[0]!.status;
const supportEvents = (ids: number[]) =>
  sql<{ action: string; detail: Record<string, unknown> }[]>`
    SELECT action, detail FROM admin_events WHERE target_type = 'support_thread' AND target_id IN ${sql(ids.map(String))} ORDER BY id`;

test.describe.serial('پشتیبانی (۱۲٫۱)', () => {
  const users = { owner: `parvin${RUN}`, operator: `kaveh${RUN}`, accountant: `nima${RUN}`, partner: `yaser${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[] }>;
  const seeded: Seeded[] = [];
  const t = { order: 0, general: 0, failed: 0 };
  let docId = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    // «امروز» زیر هر پیامی که همین اجرا می‌نویسد تا نیمه‌شب تهران است.
    await awayFromMidnight(240_000, 6 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`TRUNCATE support_messages, support_threads`;
    const yesterday = new Date(Date.now() - 24 * 60 * MINUTE);
    const [partner] = await sql<{ id: string }[]>`
      INSERT INTO print_partners (name, province_id, city_id, created_at)
      VALUES (${SOHA}, ${MASHHAD.provinceId}, ${MASHHAD.cityId}, ${yesterday}) RETURNING id`;
    docId = randomUUID();
    await sql`
      INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                             session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
      VALUES (${docId}, 'شیمی - جلسه ۵.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
              ${'e2e'.padEnd(64, '6')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
    const maryam = await order(docId, 'مریم کاظمی', phone(1));
    const hossein = await order(docId, 'حسین رحیمی', phone(2));
    const zahra = await order(docId, 'زهرا محمدی', phone(3));
    seeded.push(maryam, hossein, zahra);

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

    // قدیمی‌ترین انتظار اول (سؤال ۳۱۳): سفارش مریم، بعد «سؤال کلی» حسین؛ و گفت‌وگوی زهرا پاسخ گرفته ولی پیامکش نرفته.
    t.order = await thread(maryam.userId, maryam.id, 'سلام. پنجشنبه امتحان دارم؛ تا چهارشنبه به مشهد می‌رسد؟ jozveyar.com/orders', 90);
    t.general = await thread(hossein.userId, null, 'برای 20 نسخه از یک جزوه تخفیف دارید؟', 30);
    t.failed = await thread(zahra.userId, zahra.id, 'کد پستی را اشتباه زدم؛ درستش 1613763141 است.', 120);
    const [operator] = await sql<{ id: string }[]>`SELECT id FROM admin_users WHERE username = ${users.operator}`;
    await failedReply(t.failed, operator!.id, phone(3), zahra.number, 100);
  });

  test.afterAll(async () => {
    if (sql) {
      await sql`TRUNCATE support_messages, support_threads`;
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

  test('متصدی: زبانه با شمار، هشدار پیشخوان، صندوق با چیپ‌ها و قدیمی‌ترین انتظار اول، و جست‌وجو', async () => {
    const { page, problems } = who.operator;
    await page.goto(at());
    const open = await openCount();
    expect(open).toBe(2);
    const tab = nav(page).getByRole('link', { name: /^پشتیبانی/ });
    await expect(tab.locator('.ad-count')).toHaveText('2');
    await expect(tab.locator('.sr-only')).toHaveText('، 2 بی پاسخ');
    await expect(page.locator('[data-alert="support"]')).toHaveText(/^2 پیام پشتیبانی بی پاسخ است؛ قدیمی‌ترین از (ساعت \d{2}:\d{2}|دیروز \d{2}:\d{2})\.$/);
    await page.locator('[data-alert="support"]').getByRole('link').click();

    await expect(page.getByRole('heading', { level: 1, name: 'پشتیبانی' })).toBeVisible();
    await expect(tab).toHaveAttribute('aria-current', 'page');
    const chips = page.getByRole('navigation', { name: 'حال گفت‌وگو' }).getByRole('link');
    await expect(chips).toHaveText(['باز 2', 'پاسخ داده شد 1', 'بسته 0', 'همه 3']);
    const rows = page.getByTestId('threads').locator('li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('data-thread', String(t.order));
    await expect(rows.nth(0)).toContainText('مریم کاظمی');
    await expect(rows.nth(0)).toContainText('مشهد');
    await expect(rows.nth(0)).toContainText(`سفارش ${seeded[0]!.number} · در صف چاپ`);
    await expect(rows.nth(0)).toContainText('پنجشنبه امتحان دارم');
    // ۹۰ دقیقه پیش: در یک ساعت و نیم اول روز تهران «دیروز» است (اجرای پس از نیمه‌شب همین را انداخت).
    await expect(rows.nth(0)).toContainText(/منتظر از (دیروز )?\d{2}:\d{2}/);
    await expect(rows.nth(1)).toHaveAttribute('data-thread', String(t.general));
    await expect(rows.nth(1)).toContainText('حسین رحیمی');
    await expect(rows.nth(1)).toContainText('سؤال کلی');

    // جست‌وجو همان کادر «سفارش‌ها»: موبایل، شمارهٔ سفارش، نام؛ در «همه» با شمار هر چیپ از همان جست‌وجو.
    await page.getByRole('searchbox', { name: 'جست‌وجوی گفت‌وگو' }).fill(spaced(phone(3)));
    await page.getByRole('searchbox', { name: 'جست‌وجوی گفت‌وگو' }).press('Enter');
    await expect(page.getByTestId('threads')).toHaveCount(0);
    await expect(page.locator('.ad-empty')).toContainText('در «باز» پیدا نشد.');
    await page.locator('.ad-empty').getByRole('link', { name: 'در همه ببین' }).click();
    await expect(page.getByTestId('threads').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('threads').locator('li')).toHaveAttribute('data-thread', String(t.failed));
    await expect(page.getByTestId('threads').locator('li')).toContainText('پاسخ داده شد، ');
    await expect(chips).toHaveText(['باز 0', 'پاسخ داده شد 1', 'بسته 0', 'همه 1']);
    // شمارهٔ سفارش گفت‌وگوی همان سفارش است، نه «سؤال کلی» صاحبش؛ «سؤال کلی» با نام تازه‌ترین سفارش مشتری پیدا می‌شود، «ي» عربی هم.
    await page.goto(at(`/support?q=${seeded[0]!.number}`));
    await expect(page.getByTestId('threads').locator('li')).toHaveAttribute('data-thread', String(t.order));
    await page.goto(at(`/support?q=${seeded[1]!.number}`));
    await expect(page.getByTestId('threads')).toHaveCount(0);
    await page.goto(at(`/support?q=${encodeURIComponent('حسين')}`));
    await expect(page.getByTestId('threads').locator('li')).toHaveAttribute('data-thread', String(t.general));
    expect(problems).toEqual([]);
  });

  test('متصدی: گفت‌وگو با مشتری و سفارش، پاسخ با خطای متن همان‌جا، «پاسخ رفت» با پیامک، و پاسخ پشت‌سرهم بی پیامک تازه', async () => {
    const [maryam] = seeded;
    const { page, problems } = who.operator;
    await page.goto(at('/support'));
    await page.getByTestId('threads').locator(`li[data-thread="${t.order}"] a`).click();
    await expect(page).toHaveURL(new RegExp(`/support/${t.order}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`مریم کاظمی · سفارش ${maryam!.number}`);
    await expect(page.locator('[data-thread-status="open"]')).toHaveText('باز');

    const customer = page.getByRole('region', { name: 'مشتری' });
    await expect(customer).toContainText(spaced(phone(1)));
    await expect(customer).toContainText('1 سفارش، 1 پرداخت‌شده');
    await expect(customer).toContainText('فقط همین');
    await expect(customer.getByRole('link', { name: 'سفارش‌های این مشتری' })).toHaveAttribute('href', new RegExp(`/orders\\?status=all&q=${phone(1)}$`));
    const orderCard = page.locator(`[data-thread-order="${maryam!.number}"]`);
    await expect(orderCard).toContainText('در صف چاپ');
    await expect(orderCard).toContainText(`${SOHA}، مشهد`);
    await expect(orderCard).toContainText('تحویل به پست');
    await expect(orderCard.getByRole('link', { name: 'صفحهٔ سفارش' })).toHaveAttribute('href', new RegExp(`/orders/${maryam!.number}$`));

    // پیوند درون پیام مشتری فقط متن است (سؤال ۳۱۰).
    const messages = page.getByTestId('messages');
    await expect(messages.locator('[data-kind="customer"]')).toContainText('jozveyar.com/orders');
    await expect(messages.getByRole('link')).toHaveCount(0);
    await expect(page.locator('#s-reply-hint')).toHaveText(
      `مشتری «پشتیبانی جزوه‌یار» می‌بیند، نه نامت. با فرستادن، پیامک «پاسخ پیامت دربارهٔ سفارش ${maryam!.number} آمد» به ${spaced(phone(1))} می‌رود.`,
    );

    // متن فقط‌فاصله از `required` مرورگر می‌گذرد و سرور نمی‌پذیرد: خطا زیر فیلد، و هیچ پاسخی نوشته نشد.
    await page.getByLabel('پاسخ', { exact: true }).fill('   ');
    await page.getByRole('button', { name: 'فرستادن پاسخ' }).click();
    await expect(page.locator('#s-reply-error')).toHaveText('پاسخ خالی است؛ چیزی بنویس و دوباره بفرست.');
    expect(await statusOf(t.order)).toBe('open');

    await page.getByLabel('پاسخ', { exact: true }).fill(ANSWER);
    await page.getByRole('button', { name: 'فرستادن پاسخ' }).click();
    await expect(page.locator('[data-replied]')).toHaveText('پاسخ رفت. مریم کاظمی آن را در «سفارش‌های من» می‌بیند، با نام «پشتیبانی جزوه‌یار».');
    await expect(page.locator('[data-thread-status="answered"]')).toHaveText('پاسخ داده شد');
    const reply = messages.locator('[data-kind="staff"]');
    await expect(reply).toHaveCount(1);
    await expect(reply.locator('.ad-msg__who')).toContainText('کاوه نادری');
    await expect(reply.locator('.ad-msg__who')).toContainText(/پاسخ پشتیبانی · امروز \d{2}:\d{2}/);
    await expect(reply.locator('.ad-msg__body')).toHaveText(ANSWER);
    await expect(reply.locator('[data-reply-sms="sent"]')).toContainText(new RegExp(`پیامک پاسخ.*به ${spaced(phone(1))} رفت، امروز \\d{2}:\\d{2}`));
    // شمار زبانه با هدایت کار تازه است.
    await expect(nav(page).getByRole('link', { name: /^پشتیبانی/ }).locator('.ad-count')).toHaveText('1');
    const [sms] = await sql<{ purpose: string; to_mobile: string; params: string[] }[]>`
      SELECT purpose, to_mobile, params FROM sms_messages WHERE purpose = 'support_reply' AND to_mobile = ${phone(1)}`;
    expect(sms).toEqual({ purpose: 'support_reply', to_mobile: phone(1), params: [`سفارش ${maryam!.number}`] });

    // پاسخ دوم پیش از آنکه مشتری ببیند: همان خبر کافی است، و راهنما همین را پیش از فرستادن می‌گوید.
    await expect(page.locator('#s-reply-hint')).toContainText('پیامک تازه نمی‌رود: خبر پاسخ قبلی هنوز دیده نشده؛ همان بس است.');
    await page.getByLabel('پاسخ دیگر').fill('اگر چیز دیگری لازم بود، همین‌جا بنویس.');
    await page.getByRole('button', { name: 'فرستادن پاسخ' }).click();
    await expect(page.locator('[data-replied="none"]')).toContainText('پیامک تازه نرفت: خبر پاسخ قبلی هنوز دیده نشده.');
    await expect(messages.locator('[data-kind="staff"]')).toHaveCount(2);
    await expect(messages.locator('[data-reply-sms="none"]')).toContainText('لازم نبود؛ خبر پاسخ قبلی هنوز دیده نشده بود.');

    const events = await supportEvents([t.order]);
    expect(events.map((e) => [e.action, e.detail.sms, e.detail.customer, e.detail.orderNumber])).toEqual([
      ['support.reply', 'queued', 'مریم کاظمی', maryam!.number],
      ['support.reply', 'skipped', 'مریم کاظمی', maryam!.number],
    ]);
    expect(JSON.stringify(events)).not.toContain('تحویل پست');
    expect(problems).toEqual([]);
  });

  test('متصدی: «بستن گفت‌وگو» از همان که دیده شد؛ پیام تازه‌ای که پشت سر صفحه رسید بستن را رد می‌کند', async () => {
    const { page, problems } = who.operator;
    await page.goto(at(`/support/${t.general}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('حسین رحیمی · سؤال کلی');
    await expect(page.locator('[data-thread-order]')).toHaveCount(0);

    // مشتری همین حالا دوباره نوشت: «بستن» از صفحهٔ کهنه رد می‌شود و پیام تازه دیده می‌شود.
    await customerMessage(t.general, 'یا برای 30 نسخه؟');
    await page.getByRole('button', { name: 'بستن گفت‌وگو' }).click();
    await expect(page.locator('main').getByRole('alert')).toHaveText('پس از باز کردن این صفحه پیام تازه‌ای رسید؛ اول آن را بخوان، و اگر هنوز لازم است دوباره ببند.');
    await expect(page.getByTestId('messages').locator('[data-kind="customer"]')).toHaveCount(2);
    expect(await statusOf(t.general)).toBe('open');

    await page.getByRole('button', { name: 'بستن گفت‌وگو' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText('گفت‌وگو بسته شد؛ مشتری «بسته» می‌بیند و با پیام تازه دوباره بازش می‌کند.');
    await expect(page.locator('[data-thread-status="closed"]')).toHaveText('بسته');
    await expect(page.getByTestId('messages').locator('[data-kind="closed"]')).toContainText(/کاوه نادری گفت‌وگو را بست · امروز \d{2}:\d{2}/);
    await expect(page.getByRole('button', { name: 'بستن گفت‌وگو' })).toHaveCount(0);
    expect(await statusOf(t.general)).toBe('closed');
    await expect(nav(page).getByRole('link', { name: /^پشتیبانی/ }).locator('.ad-count')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('مالک: پیامک پاسخی که نرفت با هشدار پیشخوان و «دوباره بفرست»، کارت «پیام‌های مشتری» سفارش، رویدادها زیر «پشتیبانی»، و «بیشتر» گوشی', async ({ browser }) => {
    const [maryam, , zahra] = seeded;
    const { page, problems } = who.owner;
    await page.goto(at());
    await expect(page.locator('[data-alert="reply-sms"]')).toHaveText(`پیامک پاسخ گفت‌وگوی سفارش ${zahra!.number} نرفت؛ از همان گفت‌وگو دوباره بفرست.`);
    await page.locator('[data-alert="reply-sms"]').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/support/${t.failed}$`));
    const row = page.locator('[data-reply-sms="failed"]');
    await expect(row).toContainText('نرفت: پنل پیامک جواب نداد، ');
    await row.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText('پیامک پاسخ دوباره رفت.');
    await expect(page.locator('[data-reply-sms="sent"]')).toContainText(`به ${spaced(phone(3))} رفت`);
    await page.goto(at());
    await expect(page.locator('[data-alert="reply-sms"]')).toHaveCount(0);

    // کارت «پیام‌های مشتری» در ستون کنار صفحهٔ سفارش (سؤال ۳۱۵).
    await page.goto(at(`/orders/${maryam!.number}`));
    const card = page.locator(`[data-order-thread="${t.order}"]`);
    await expect(card).toContainText('پیام‌های مشتری');
    await expect(card).toContainText('پاسخ داده شد');
    await expect(card).toContainText(/3 پیام · آخرین پیام: کاوه نادری، امروز \d{2}:\d{2}/);
    await card.getByRole('link', { name: 'دیدن گفت‌وگو' }).click();
    await expect(page).toHaveURL(new RegExp(`/support/${t.order}$`));

    // رویدادها زیر «پشتیبانی»، بی متن پیام.
    await page.goto(at('/events?kind=support'));
    await expect(page.getByRole('navigation', { name: 'نوع رویداد' }).getByRole('link', { name: 'پشتیبانی' })).toHaveAttribute('aria-current', /.+/);
    const log = page.locator('.ad-log');
    await expect(log).toContainText(`پاسخ به گفت‌وگوی سفارش ${maryam!.number} (مریم کاظمی)؛ با پیامک پاسخ`);
    await expect(log).toContainText(`پاسخ به گفت‌وگوی سفارش ${maryam!.number} (مریم کاظمی)؛ بی پیامک تازه، خبر پاسخ قبلی هنوز دیده نشده بود`);
    await expect(log).toContainText('گفت‌وگوی «سؤال کلی» حسین رحیمی بسته شد');
    await expect(log).toContainText(`پیامک پاسخ گفت‌وگوی سفارش ${zahra!.number} دوباره به ${masked(phone(3))} فرستاده شد و رفت`);
    await expect(page.locator('main')).not.toContainText('تحویل پست می‌شود');

    // گوشی مالک: «پشتیبانی» زیر «بیشتر»، و شمارش روی خود «بیشتر» (سؤال ۳۱۳).
    await customerMessage(t.order, 'ممنون؛ یک سؤال دیگر هم دارم.');
    const phoneContext = await newContext(browser, { width: 390, height: 800 });
    await phoneContext.addCookies(await who.owner.context.cookies());
    const mobile = await phoneContext.newPage();
    await mobile.goto(at());
    const summary = nav(mobile).locator('summary');
    await expect(summary.locator('.ad-count')).toHaveText('1');
    await expect(summary.locator('.sr-only')).toHaveText('، 1 پیام بی پاسخ');
    await summary.click();
    await expect(nav(mobile).locator('.ad-more__list').getByRole('link', { name: /^پشتیبانی/ }).locator('.ad-count')).toHaveText('1');
    await phoneContext.close();
    expect(problems).toEqual([]);
  });

  test('حسابدار و چاپخانه: نه زبانه، نه صفحه، نه کارت سفارش و نه هشدار', async () => {
    const [maryam] = seeded;
    for (const key of ['accountant', 'partner'] as const) {
      const { page, problems } = who[key];
      await page.goto(at());
      await expect(nav(page).getByRole('link', { name: /^پشتیبانی/ })).toHaveCount(0);
      await expect(page.locator('[data-alert="support"], [data-alert="reply-sms"]')).toHaveCount(0);
      for (const path of ['/support', `/support/${t.order}`]) {
        await page.goto(at(path));
        await expect(page.locator('.ad-noaccess h1')).toHaveText(key === 'accountant' ? 'این بخش برای حسابدار باز نیست' : 'این بخش برای چاپخانه باز نیست');
      }
      await page.goto(at(`/orders/${maryam!.number}`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(String(maryam!.number));
      await expect(page.locator('[data-order-thread]')).toHaveCount(0);
      expect(problems).toEqual([]);
    }
  });

  test('گوشی و دسکتاپ: صندوق و گفت‌وگو بی سرریز افقی، هدف لمسی دست‌کم ۴۴ پیکسل و آیکون با شکل', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await who.operator.context.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [at('/support'), at('/support?status=all'), at(`/support/${t.order}`), at(`/support/${t.general}`)]) {
        await page.goto(path);
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      // گفت‌وگو در گوشی: پیام‌ها و پاسخ پیش از ستون کنار (`ad-grid--main-first`).
      await page.goto(at(`/support/${t.order}`));
      const [main, side] = await Promise.all([page.locator('.ad-main').boundingBox(), page.locator('.ad-side').boundingBox()]);
      if (width <= 860) expect(main!.y).toBeLessThan(side!.y);
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
