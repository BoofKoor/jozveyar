import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatJalaliNumeric, formatJalaliWeekday, tehranDayStart } from '@jozveyar/text';

import { assignAtPayment, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch, WRONG } from './helpers';

/**
 * کدهای تخفیف، سرتاسری (برش ۱۱٫۴؛ ADR-062، سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۴): زبانهٔ «تخفیف‌ها» برای مالک (پس از «تعرفه» در بخش‌های مالک) و حسابدار
 * (در ردیف، فقط دیدن)، متصدی نه. مالک «کد تازه» را با کد تازهٔ برنامهٔ تأیید می‌سازد: کد نادرست و خطای فرم زیر فیلد خودشان، فرم با
 * نوشته‌ها، و متن تکراری پیش از کد؛ ویرایش با کد تازه، «خاموش کن» فهرست بی کد، و روشن کردن دوباره با کد. سفارشی که با کد پرداخت شده شرط
 * کد را منجمد می‌کند (فقط متنش دیده می‌شود)، در صفحهٔ کد با شماره و مبلغ است، و کارت مبلغ صفحهٔ سفارش «تخفیف کد …» دارد. رویدادها زیر چیپ
 * «تخفیف‌ها».
 *
 * سفارش مثل `roles.spec.ts` با SQL، و کد سفارش همان کدی که مالک ساخت (محافظ ساختن سفارش کد روشن و جا می‌خواهد). کد پاک نمی‌شود
 * (`discount_codes_append_only`)، پس در پایان خاموش؛ سفارش و سندش پاک.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرای محلی بالای `admin.spec.ts`.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const CODE = `MEHR${RUN}`;
/** روز آخر کد: سی روز بعد، به تقویم تهران. */
const LAST_DAY = tehranDayStart(new Date(), 30);

let sql: postgres.Sql;

interface Seeded {
  number: number;
  id: string;
  docId: string;
}

/** سفارش پرداخت‌شدهٔ ده‌صفحه‌ای با کد تخفیف، به همان شکل مسیر خرید: ریز قیمت با کد از همان موتور، و `discount_code_id`. */
async function orderWithCode(code: { id: string; code: string }, phone: string): Promise<Seeded> {
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'آمار مهندسی.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '9')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * 24 * 60 * MINUTE)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const zoneId = 'other';
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
    SEED_PRICE_LIST,
    { code: { id: code.id, code: code.code, minOrderRials: 500_000, kind: 'percent', percent: 20, maxRials: 50_000 } },
  );
  expect([breakdown.discountRials, breakdown.code?.status]).toEqual([50_000, 'applied']);
  const createdAt = new Date(Date.now() - 2 * 60 * MINUTE);
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  return sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (mobile) VALUES (${phone}) ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id`;
    const [row] = await tx<{ id: string; order_number: number }[]>`
      INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, discount_rials,
                          shipping_rials, vat_rials, rounding_rials, total_rials, est_weight_grams, sla_days,
                          shipping_method_id, shipping_zone_id, province_id, city_id, recipient_name, recipient_phone,
                          address_text, postal_code, created_at, discount_code_id)
      VALUES (${randomUUID()}, ${user!.id}, ${breakdown.priceListVersion}, ${tx.json(breakdown as never)},
              ${breakdown.subtotalRials}, ${breakdown.discountRials}, ${breakdown.shippingRials!}, ${breakdown.vatRials},
              ${breakdown.roundingRials}, ${breakdown.totalRials}, ${breakdown.estWeightGrams}, 2, 'post', ${zoneId},
              11, 1326, 'پریسا نادری', ${phone}, 'بلوار سجاد، سجاد 9، پلاک 14', '9187654321', ${createdAt}, ${code.id})
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
      INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, card_mask, verified_at, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`},
              '803114', '603799******1234', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(new Date(), 2)}
              WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    await tx`INSERT INTO jobs (kind, order_id, status, attempts, locked_by, locked_until)
             VALUES ('prepare_order', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour'),
                    ('prepare_ticket', ${row!.id}, 'running', 1, 'e2e', now() + interval '1 hour')`;
    return { number: row!.order_number, id: row!.id, docId };
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
const row = (page: Page, code: string) => page.locator(`[data-discount="${code}"]`);
const fieldError = (page: Page, field: string) => page.locator(`#d-${field}-error`);

test.describe.serial('کدهای تخفیف (۱۱٫۴)', () => {
  const owner = `negar${RUN}`;
  const accountant = `babak${RUN}`;
  const operator = `soheil${RUN}`;
  const who = {} as Record<'owner' | 'accountant' | 'operator', { context: BrowserContext; page: Page; problems: string[] }>;
  let ownerSecret = '';
  let codeId = '';
  let order: Seeded | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    for (const [key, username, name] of [
      ['owner', owner, 'نگار امینی'],
      ['accountant', accountant, 'بابک رحمانی'],
      ['operator', operator, 'سهیل'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      const secret = await enroll(page, serverInvite(username, key === 'owner' ? '--owner' : '--operator', '--name', name));
      if (key === 'owner') ownerSecret = secret;
    }
    // نقش حسابدار با SQL، مثل `production.spec.ts`؛ مجوز با هر درخواست خوانده می‌شود.
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${accountant})`;
  });

  test.afterAll(async () => {
    if (sql) {
      if (order) {
        await sql`DELETE FROM payments WHERE order_id = ${order.id}`;
        await sql`DELETE FROM orders WHERE id = ${order.id}`;
        await sql`DELETE FROM documents WHERE id = ${order.docId}`;
      }
      // کد پاک نمی‌شود؛ خاموش می‌ماند، مثل چاپخانه‌ای که غیرفعال می‌شود.
      await sql`UPDATE discount_codes SET enabled = false WHERE code = ${CODE}`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: «کد تازه» با کد تازه؛ کد نادرست، خطای فرم و متن تکراری زیر فیلد خودشان، با نوشته‌ها', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/'));
    const wide = page.getByRole('navigation', { name: 'بخش‌های پنل' }).locator('.ad-nav__wide');
    await expect(wide).toHaveText(['تعرفه', 'تخفیف‌ها', 'گزارش‌ها', 'تنظیمات', 'چاپخانه‌ها', 'ادمین‌ها', 'رویدادها']);
    await wide.filter({ hasText: 'تخفیف‌ها' }).click();
    await expect(page.getByRole('heading', { name: 'تخفیف‌ها', level: 1 })).toBeVisible();
    await expect(wide.filter({ hasText: 'تخفیف‌ها' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'کد تازه' }).click();
    await expect(page.getByRole('heading', { name: 'کد تخفیف تازه', level: 1 })).toBeVisible();

    // درصد پیش‌فرض است: مبلغ ثابت پنهان، و با «مبلغ ثابت» برعکس (بی JS).
    await expect(page.getByLabel('درصد', { exact: true })).toBeVisible();
    await expect(page.getByLabel('مبلغ تخفیف')).toBeHidden();
    await page.getByRole('radio', { name: /مبلغ ثابت/ }).check();
    await expect(page.getByLabel('مبلغ تخفیف')).toBeVisible();
    await expect(page.getByLabel('درصد', { exact: true })).toBeHidden();
    await page.getByRole('radio', { name: /^درصد/ }).check();

    const until = formatJalaliNumeric(LAST_DAY);
    await page.getByLabel('کد', { exact: true }).fill(`mehr-${RUN}`);
    await page.getByLabel('درصد', { exact: true }).fill('0');
    await page.getByLabel(/سقف تخفیف هر سفارش/).fill('5,000');
    await page.getByLabel(/حداقل سفارش/).fill('۵۰٬۰۰۰');
    await page.getByLabel(/روز آخر/).fill(until);
    await page.getByLabel(/سقف کل استفاده/).fill('100');
    await page.getByLabel(/یادداشت/).fill('کانال تلگرام  دانشجویان');
    // خطای فرم پیش از کد: کد ساختگی مصرف نمی‌شود.
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'ساختن کد' }).click();
    await expect(fieldError(page, 'percent')).toHaveText('درصد تخفیف از 1 تا 100 است.');
    await expect(page.getByLabel('درصد', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel(/روز آخر/)).toHaveValue(until);
    await expect(page.getByLabel('کد', { exact: true })).toHaveValue(`mehr-${RUN}`);

    // کد نادرست زیر فیلد کد، بی کدی که ساخته شود.
    await page.getByLabel('درصد', { exact: true }).fill('20');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'ساختن کد' }).click();
    await expect(page.locator('#step-code-error')).toBeVisible();
    expect(await sql`SELECT id FROM discount_codes WHERE code = ${CODE}`).toEqual([]);

    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'ساختن کد' }).click();
    await expect(page.getByRole('heading', { name: 'تخفیف‌ها', level: 1 })).toBeVisible();
    await expect(page.locator('.jy-note--success')).toContainText(
      `کد ${CODE} ساخته شد و از همین حالا در «مرور و پرداخت» پذیرفته است.`,
    );
    const created = row(page, CODE);
    await expect(created.locator('[data-discount-state]')).toHaveText('روشن');
    await expect(created.locator('.ad-partners__meta').first()).toHaveText(
      `20٪ تا 5,000 تومان، از سفارش 50,000 تومان · تا ${formatJalaliWeekday(LAST_DAY)}`,
    );
    await expect(created.locator('[data-discount-uses]')).toHaveText('استفاده: 0 از 100 · کانال تلگرام دانشجویان');
    const [saved] = await sql<{ id: string; percent: number; max: string; min: string; until: Date; total: number; note: string }[]>`
      SELECT id, percent, max_discount_rials::text AS max, min_order_rials::text AS min, valid_until AS until, total_limit AS total, note
        FROM discount_codes WHERE code = ${CODE}`;
    expect(saved).toEqual({
      id: saved!.id,
      percent: 20,
      max: '50000',
      min: '500000',
      until: tehranDayStart(LAST_DAY, 1),
      total: 100,
      note: 'کانال تلگرام دانشجویان',
    });
    codeId = saved!.id;

    // متن تکراری (با صفحه‌کلید فارسی هم همان است) پیش از کد: کد ساختگی کافی است.
    await page.getByRole('link', { name: 'کد تازه' }).click();
    await page.getByLabel('کد', { exact: true }).fill(`ئثاق ${RUN}`);
    await page.getByLabel('درصد', { exact: true }).fill('10');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'ساختن کد' }).click();
    await expect(fieldError(page, 'discount')).toHaveText('کدی با همین متن هست؛ متن دیگری بنویس.');
    expect(problems).toEqual([]);
  });

  test('مالک: ویرایش با کد تازه (خالی «لازم است»)، «خاموش کن» فهرست بی کد، و روشن کردن دوباره با کد', async () => {
    const { page, problems } = who.owner;
    await page.goto(at('/discounts'));
    await row(page, CODE).getByRole('link', { name: 'ویرایش' }).click();
    await expect(page.getByRole('heading', { name: `کد ${CODE}`, level: 1 })).toBeVisible();
    await expect(page.getByLabel('درصد', { exact: true })).toHaveValue('20');
    await expect(page.getByLabel(/روز آخر/)).toHaveValue(formatJalaliNumeric(LAST_DAY));

    await page.getByLabel(/سقف کل استفاده/).fill('200');
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('این تغییر کد تازهٔ برنامهٔ تأیید می‌خواهد؛ فقط خاموش کردن بی کد است.');
    await expect(page.getByLabel(/سقف کل استفاده/)).toHaveValue('200');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('heading', { name: 'تخفیف‌ها', level: 1 })).toBeVisible();
    await expect(page.locator('.jy-note--success')).toHaveText(`کد ${CODE} ذخیره شد.`);
    await expect(row(page, CODE).locator('[data-discount-uses]')).toContainText('استفاده: 0 از 200');

    await row(page, CODE).getByRole('button', { name: 'خاموش کن' }).click();
    await expect(page.locator('.jy-note--success')).toContainText(`کد ${CODE} خاموش شد؛ سفارش تازه با آن ساخته نمی‌شود.`);
    await expect(row(page, CODE).locator('[data-discount-state]')).toHaveText('خاموش');
    await expect(row(page, CODE).getByRole('button', { name: 'خاموش کن' })).toHaveCount(0);

    // روشن کردن دوباره کد تازه می‌خواهد.
    await row(page, CODE).getByRole('link', { name: 'ویرایش' }).click();
    await page.getByLabel(/^روشن/).check();
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText(`کد ${CODE} ذخیره شد.`);
    await expect(row(page, CODE).locator('[data-discount-state]')).toHaveText('روشن');
    expect(problems).toEqual([]);
  });

  test('سفارشی با کد: شرط‌ها منجمد، سفارش در صفحهٔ کد، «تخفیف کد …» در کارت مبلغ؛ روز آخر هنوز عوض می‌شود', async () => {
    const { page, problems } = who.owner;
    order = await orderWithCode({ id: codeId, code: CODE }, `0915${RUN}321`);
    await page.goto(at(`/discounts/${codeId}`));
    await expect(page.locator('[data-discount-terms="frozen"]')).toContainText('20٪ تا 5,000 تومان، از سفارش 50,000 تومان');
    await expect(page.getByLabel('درصد', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-discount-uses]')).toHaveText('روشن · استفاده: 1 از 200');
    const listed = page.locator(`[data-discount-orders] [data-order="${order.number}"]`);
    await expect(listed.locator('td')).toHaveText(['در صف چاپ', '5,000', '193,750']);
    await listed.getByRole('link', { name: String(order.number) }).click();
    await expect(page.locator('.ad-sum')).toContainText(`تخفیف کد ${CODE} (20٪)`);
    await expect(page.locator('.ad-sum')).toContainText('-5,000');

    // روز آخر، با کد تازه، پس از اولین سفارش هم.
    await page.goto(at(`/discounts/${codeId}`));
    const later = tehranDayStart(new Date(), 60);
    await page.getByLabel(/روز آخر/).fill(formatJalaliNumeric(later));
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.locator('.jy-note--success')).toHaveText(`کد ${CODE} ذخیره شد.`);
    await expect(row(page, CODE).locator('.ad-partners__meta').first()).toContainText(`تا ${formatJalaliWeekday(later)}`);
    expect(problems).toEqual([]);
  });

  test('حسابدار: «تخفیف‌ها» در ردیف و فقط دیدن؛ «کد تازه» برایش باز نیست؛ ۳۲۰ پیکسل بی سرریز', async ({ browser }) => {
    const { page, problems } = who.accountant;
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'گزارش‌ها', 'تخفیف‌ها']);
    await nav(page).filter({ hasText: 'تخفیف‌ها' }).click();
    await expect(page.getByRole('heading', { name: 'تخفیف‌ها', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'کد تازه' })).toHaveCount(0);
    await expect(row(page, CODE).getByRole('button', { name: 'خاموش کن' })).toHaveCount(0);
    await row(page, CODE).getByRole('link', { name: 'جزئیات' }).click();
    await expect(page.locator('[data-discount-facts]')).toContainText('20٪ تا 5,000 تومان، از سفارش 50,000 تومان');
    await expect(page.locator('[data-discount-facts]')).toContainText('1 از 200');
    await expect(page.getByLabel('کد برنامهٔ تأیید تو')).toHaveCount(0);
    await expect(page.locator(`[data-discount-orders] [data-order="${order!.number}"]`)).toBeVisible();
    await page.goto(at('/discounts/new'));
    await expect(page.getByRole('heading', { name: 'این بخش برای حسابدار باز نیست' })).toBeVisible();
    expect(problems).toEqual([]);

    // زبانه‌های حسابدار در گوشی ۳۲۰ پیکسلی جا می‌شوند.
    const small = await newContext(browser, { width: 320, height: 800 });
    await small.addCookies(await who.accountant.context.cookies());
    const phone = await small.newPage();
    for (const path of [at('/discounts'), at(`/discounts/${codeId}`)]) {
      await phone.goto(path);
      const { overflow, small: tiny, blank } = await layoutProblems(phone);
      expect(overflow, path).toBeLessThanOrEqual(0);
      expect(tiny, path).toEqual([]);
      expect(blank, path).toEqual([]);
    }
    await small.close();
  });

  test('متصدی: بی زبانه، و «تخفیف‌ها» فقط برای مالک است', async () => {
    const { page, problems } = who.operator;
    await page.goto(at('/'));
    await expect(nav(page)).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'تعرفه']);
    await page.goto(at('/discounts'));
    await expect(page.getByRole('heading', { name: 'این بخش فقط برای مالک است' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('رویدادها زیر چیپ «تخفیف‌ها»؛ صفحه‌های مالک در گوشی و دسکتاپ بی سرریز', async ({ browser }) => {
    const { page, problems } = who.owner;
    await page.goto(at('/events?kind=discounts'));
    const lines = page.locator('.ad-log li').filter({ hasText: CODE });
    await expect(lines).toHaveText([
      new RegExp(`کد تخفیف ${CODE} ویرایش شد: روز آخر`),
      new RegExp(`کد تخفیف ${CODE} روشن شد`),
      new RegExp(`کد تخفیف ${CODE} خاموش شد`),
      new RegExp(`کد تخفیف ${CODE} ویرایش شد: سقف کل استفاده`),
      new RegExp(`کد تخفیف ${CODE} ساخته شد`),
    ]);
    expect(problems).toEqual([]);

    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await who.owner.context.cookies());
      const view = await context.newPage();
      const viewProblems = watch(view);
      for (const path of [at('/discounts'), at('/discounts/new'), at(`/discounts/${codeId}`)]) {
        await view.goto(path);
        const { overflow, small, blank } = await layoutProblems(view);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(viewProblems).toEqual([]);
      await context.close();
    }
  });
});
