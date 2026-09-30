import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { orderPaidParams, orderPaidText } from '@jozveyar/sms';
import { formatDeadlineDay, tehranDayStart } from '@jozveyar/text';

import {
  alertOf,
  assignAtPayment,
  at,
  BASE,
  codeFor,
  enroll,
  fakeMode,
  fakeSms,
  GATE,
  layoutProblems,
  newContext,
  requireSmsIr,
  serverInvite,
  SMSIR,
  watch,
} from './helpers';

/**
 * پیامک sms.ir در پنل، سرتاسری (برش ۷٫۱، ADR-049؛ طرح `docs/ui/mockups/admin.html`: `m-settings`، `m-key-test`، `m-dash7` و کارت
 * «پرداخت‌ها»ی سفارش): همه با **sms.ir ساختگی** (`packages/sms/fake/smsir.mjs`، `E2E_SMSIR_URL`) که پنل با `SMS_PROVIDER=smsir` و
 * `SMSIR_API_URL` می‌بیند؛ بی آن، این فایل پیش از هر کلیک می‌افتد تا هیچ درخواستی به sms.ir واقعی نرود.
 *
 * کارت «اعتبار پیامک» با عدد sms.ir و «هشدار پیشخوان زیر»؛ هشدارهای پیشخوان «سقف روزانهٔ کد پیامکی پر شد»، «سقف ساعتی …» و «اعتبار
 * پیامک کم است»؛ پیامک پرداختی که نرفت با «دوباره بفرست» در کارت «پرداخت‌ها» (sms.ir جواب نداد، بعد رفت، با قالب پرداخت و دو پارامترش)؛
 * «آزمایش» قالبی که sms.ir نمی‌شناسد («رد شد») و sms.ir خاموش («با این حال ذخیره کن»)؛ رویدادها؛ و گوشی و دسکتاپ.
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، و sms.ir ساختگی با کلید `.env` پنل و قالب‌های `SMS_*_TEMPLATE`:
 *
 *   FAKE_SMSIR_KEYS="$SMS_API_KEY" FAKE_SMSIR_TEMPLATES='{"100001":["CODE"],"100002":["ORDER","DAY"],"100003":["ORDER","BARCODE"]}' \
 *     node packages/sms/fake/smsir.mjs
 *   SMS_PROVIDER=smsir SMSIR_API_URL=http://127.0.0.1:3950 SMS_OTP_TEMPLATE=100001 SMS_PAID_TEMPLATE=100002 SMS_TRACKING_TEMPLATE=100003 \
 *     node apps/admin/scripts/serve-standalone.mjs 3200
 *   E2E_SMSIR_URL=http://127.0.0.1:3950 … pnpm exec playwright test tests/smsir.spec.ts
 *
 * در پایان تنظیم‌ها همان پیش از تست‌اند، کلیدهای پنل پاک، ردیف‌های کد همین اجرا پاک، و sms.ir ساختگی دوباره «ok».
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TEHRAN = { provinceId: 8, cityId: 394 };
const SETTING_KEYS = ['otp.site_hourly_limit', 'otp.site_daily_limit', 'sms.credit_alert'];
/** نشان ردیف‌های کد همین اجرا در `otp_requests`، تا در پایان فقط همان‌ها پاک شوند. */
const OTP_SESSION = `smsir-e2e-${RUN}`.padEnd(64, '0');
let sql: postgres.Sql;
let before: { key: string; value: unknown }[] = [];
let eventsBefore = 0;

interface Seeded {
  id: string;
  number: number;
  phone: string;
  day: string;
}

/**
 * سفارش «در صف چاپ» که پرداختش همان‌طور که سرور می‌نویسد موفق شد (۷٫۱): پرداخت «در انتظار»، بعد در یک UPDATE موفق با ردیف منتظر پیامک
 * پرداخت (تریگر `payments_sms` همین را می‌خواهد)، سفارش «در صف چاپ» و چاپخانه در پرداخت. پرداخت ده دقیقه پیش بود و پیامکش هیچ‌وقت
 * فرستاده نشد (پنل پیش از فرستادن افتاد): پس «نرفت».
 */
async function paidOrder(name: string, phone: string): Promise<Seeded> {
  const paidAt = new Date(Date.now() - 10 * MINUTE);
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'فیزیک ۱.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '7')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
  const sections = [{ documentId: docId, pageCount: 10 }];
  const rules = [{ pageRanges: [[1, 10]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
  const breakdown = quote(
    { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
    SEED_PRICE_LIST,
  );
  const due = tehranDayStart(paidAt, 3);
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
              ${TEHRAN.provinceId}, ${TEHRAN.cityId}, ${name}, ${phone}, 'خیابان انقلاب، پلاک 7', ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (order_id, provider, amount_rials, authority, created_at)
      VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${`MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`}, ${new Date(paidAt.getTime() - MINUTE)})
      RETURNING id`;
    const day = formatDeadlineDay(due);
    const [sms] = await tx<{ id: number }[]>`
      INSERT INTO sms_messages (provider, to_mobile, purpose, body, params, status, created_at)
      VALUES ('queued', ${phone}, 'order_paid', ${orderPaidText(row!.order_number, day)}, ${tx.json(orderPaidParams(row!.order_number, day))},
              'pending', ${paidAt})
      RETURNING id`;
    await tx`UPDATE payments SET status = 'succeeded', ref_id = '803114', verified_at = ${paidAt}, sms_message_id = ${sms!.id} WHERE id = ${payment!.id}`;
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${due} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId: payment!.id })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    return { id: row!.id, number: row!.order_number, phone, day };
  });
}

const settingOf = async (key: string) => (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${key}`)[0]?.value;
const card = (page: Page, key: string) => page.locator(`[data-setting="${key}"]`);
const successIn = (page: Page, where: string) => page.locator(`${where} .jy-note--success`);
const keyRow = (page: Page, name: string) => page.locator(`li[data-key="${name}"]`);

/** یک عدد در فرم تنظیم (بی شمارنده)، و پیام موفقش. */
async function saveNumber(page: Page, key: string, label: string, value: string, done: string) {
  await page.goto(at('/settings'));
  await page.getByLabel(label).fill(value);
  await card(page, key).getByRole('button', { name: 'ذخیره' }).click();
  await expect(successIn(page, '.ad-flash')).toHaveText(done);
}

test.describe.serial('پیامک sms.ir در پنل', () => {
  let ownerSecret = '';
  let owner: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  let paid: Seeded;
  const phone = `0935${String(RUN).padStart(4, '0')}${String(randomInt(1000)).padStart(3, '0')}`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    requireSmsIr();
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await fakeMode('ok');
    await sql`UPDATE settings SET value = '300' WHERE key = 'otp.site_hourly_limit'`;
    await sql`UPDATE settings SET value = '2000' WHERE key = 'otp.site_daily_limit'`;
    await sql`UPDATE settings SET value = '1000' WHERE key = 'sms.credit_alert'`;
    before = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM settings WHERE key IN ${sql(SETTING_KEYS)}`;
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);
    paid = await paidOrder('نرگس احمدی', phone);
    owner = await newContext(browser);
    ownerPage = await owner.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await owner?.close();
    await operator?.close();
    if (SMSIR) await fakeMode('ok');
    if (sql) {
      await sql`DELETE FROM otp_requests WHERE session_hash = ${OTP_SESSION}`;
      await sql`DELETE FROM service_secrets`;
      for (const row of before) await sql`UPDATE settings SET value = ${sql.json(row.value as postgres.JSONValue)} WHERE key = ${row.key}`;
      if (paid) {
        await sql`DELETE FROM payments WHERE order_id = ${paid.id}`;
        await sql`DELETE FROM orders WHERE id = ${paid.id}`;
      }
      await sql.end();
    }
  });

  test('کارت «اعتبار پیامک»: عدد sms.ir و ساعتش، آستانهٔ هشدار؛ زیر آستانه هشدار پیشخوان برای مالک و متصدی', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const credit = page.locator('[data-card="credit"]');
    await expect(credit.getByRole('heading')).toHaveText('اعتبار پیامک');
    const shown = Number(await credit.locator('.ad-credit__n').getAttribute('data-credit'));
    const real = (await fakeSms()).credit;
    // حافظهٔ ۱۵ دقیقه‌ای (سؤال ۱۴۰): عدد همین حالا یا خواندن کمی پیش‌تر، هرگز بیشتر از آنچه ساختگی از آغاز داشت.
    expect(shown).toBeGreaterThanOrEqual(Math.floor(real));
    await expect(credit.locator('.ad-credit__n')).toHaveText(`${shown.toLocaleString('en-US')}پیامک`);
    await expect(credit.locator('.ad-meta').first()).toContainText('از sms.ir، ساعت');
    await expect(page.getByLabel('هشدار پیشخوان زیر')).toHaveValue('1000');
    await expect(credit.getByRole('link', { name: /شارژ در پنل sms.ir/ })).toHaveAttribute('rel', 'noopener noreferrer');
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="credit"]')).toHaveCount(0);

    // آستانه بالای اعتبار: هشدار پیشخوان با همان عدد، برای مالک و متصدی.
    await saveNumber(page, 'sms.credit_alert', 'هشدار پیشخوان زیر', '۱۰۰٬۰۰۰', 'آستانهٔ هشدار اعتبار پیامک ذخیره شد: 100,000.');
    expect(await settingOf('sms.credit_alert')).toBe(100_000);
    for (const who of [page, operatorPage]) {
      await who.goto(at('/'));
      await expect(who.locator('[data-alert="credit"]')).toHaveText(
        `اعتبار پیامک کم است: ${shown.toLocaleString('en-US')} پیامک، زیر آستانهٔ 100,000. در پنل sms.ir شارژ کن؛ بی اعتبار نه کد تأیید می‌رود، نه پیامک پرداخت و رهگیری.`,
      );
    }
    // صفر یعنی هشدار نه.
    await saveNumber(page, 'sms.credit_alert', 'هشدار پیشخوان زیر', '0', 'آستانهٔ هشدار اعتبار پیامک ذخیره شد: 0؛ هشدار اعتبار خاموش است.');
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="credit"]')).toHaveCount(0);
    await saveNumber(page, 'sms.credit_alert', 'هشدار پیشخوان زیر', '1000', 'آستانهٔ هشدار اعتبار پیامک ذخیره شد: 1,000.');
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('سقف کد پیامکی: روزانه و ساعتی کل سایت از «تنظیمات»؛ سقف پرشدهٔ امروز در پیشخوان با لحظه‌اش، مالک با پیوند و متصدی بی آن', async () => {
    const page = ownerPage;
    await saveNumber(page, 'otp.site_daily_limit', 'کد در روز، برای کل سایت', '۲', 'سقف روزانهٔ کد پیامکی کل سایت ذخیره شد: 2 کد در روز.');
    await saveNumber(page, 'otp.site_hourly_limit', 'کد در ساعت، برای کل سایت', '2', 'سقف ساعتی کد پیامکی کل سایت ذخیره شد: 2 کد در ساعت.');
    // بیرون از بازه: خطا زیر همان فیلد.
    await page.goto(at('/settings'));
    await page.getByLabel('کد در روز، برای کل سایت').fill('0');
    await card(page, 'otp.site_daily_limit').getByRole('button', { name: 'ذخیره' }).click();
    await expect(card(page, 'otp.site_daily_limit').locator('.jy-error')).toHaveText('سقف عدد صحیح 1 تا 1,000,000 باشد.');
    expect(await settingOf('otp.site_daily_limit')).toBe(2);

    await page.goto(at('/'));
    await expect(page.locator('[data-alert="otp-day"]')).toHaveCount(0);
    // دو کد امروز، یک دقیقه از هم (یا درست پس از نیمه‌شب تهران، اگر روز تازه است): هر دو سقف با دومی پر شد.
    const second = new Date(Math.max(Date.now() - 2 * MINUTE, tehranDayStart(new Date()).getTime() + 2_000));
    const first = new Date(Math.max(second.getTime() - MINUTE, tehranDayStart(new Date()).getTime() + 1_000));
    for (const [i, createdAt] of [first, second].entries()) {
      await sql`INSERT INTO otp_requests (mobile, code_hash, session_hash, ip_hash, created_at, expires_at)
                VALUES (${`0936${RUN}00${i}`}, ${'c'.repeat(64)}, ${OTP_SESSION}, ${'i'.repeat(64)}, ${createdAt}, ${new Date(createdAt.getTime() + 2 * MINUTE)})`;
    }
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(second);
    await page.goto(at('/'));
    const daily = page.locator('[data-alert="otp-day"]');
    await expect(daily).toHaveText(
      `سقف روزانهٔ کد پیامکی پر شد (2 کد، ساعت ${time}). مشتری تازه تا پایان امروز کد نمی‌گیرد؛ گوشی‌ای که در 30 روز گذشته تأیید شده کد نمی‌خواهد. اگر ربات نیست، سقف را در تنظیمات بالا ببر.`,
    );
    await expect(daily.getByRole('link', { name: 'تنظیمات' })).toBeVisible();
    await expect(page.locator('[data-alert="otp-hour"]')).toContainText(`سقف ساعتی کد پیامکی امروز پر شد (2 کد در ساعت، ساعت ${time})`);
    // هشدارها به ترتیب شدت: خطاها پیش از هشدارها.
    await expect(page.locator('[data-alert]').first()).toHaveAttribute('data-alert', /^(pdf|otp-day)$/);
    // کارت «سقف کد پیامکی»: کدهای امروز و این ساعت.
    await page.goto(at('/settings'));
    await expect(page.locator('[data-otp-usage]')).toHaveText(/^امروز \d+ از 2 · این ساعت \d+ از 2$/);
    // متصدی هم می‌بیند، ولی «تنظیمات» مال مالک است.
    await operatorPage.goto(at('/'));
    await expect(operatorPage.locator('[data-alert="otp-day"]')).toContainText('سقف را در تنظیمات (مالک) بالا ببر.');
    await expect(operatorPage.locator('[data-alert="otp-day"]').getByRole('link', { name: 'تنظیمات' })).toHaveCount(0);

    // سقف بالاتر از کدهای امروز: هشدار می‌رود.
    await saveNumber(page, 'otp.site_daily_limit', 'کد در روز، برای کل سایت', '2000', 'سقف روزانهٔ کد پیامکی کل سایت ذخیره شد: 2,000 کد در روز.');
    await saveNumber(page, 'otp.site_hourly_limit', 'کد در ساعت، برای کل سایت', '300', 'سقف ساعتی کد پیامکی کل سایت ذخیره شد: 300 کد در ساعت.');
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="otp-day"]')).toHaveCount(0);
    await expect(page.locator('[data-alert="otp-hour"]')).toHaveCount(0);
    const events = await sql<{ detail: { key: string; from: number; to: number } }[]>`
      SELECT detail FROM admin_events WHERE id > ${eventsBefore} AND action = 'settings.update' AND target_id = 'otp.site_daily_limit' ORDER BY id`;
    expect(events.map((e) => e.detail)).toEqual([
      { key: 'otp.site_daily_limit', from: 2000, to: 2 },
      { key: 'otp.site_daily_limit', from: 2, to: 2000 },
    ]);
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('پیامک پرداختی که نرفت: هشدار پیشخوان، «نرفت» در کارت «پرداخت‌ها»؛ sms.ir جواب نداد و «باز نرفت»؛ بعد «رفت» با قالب پرداخت و دو پارامترش', async () => {
    const page = operatorPage;
    await page.goto(at('/'));
    const alert = page.locator('[data-alert="paid-sms"]');
    await expect(alert).toContainText(`پیامک پرداخت سفارش ${paid.number} نرفت؛ از کارت «پرداخت‌ها» دوباره بفرست.`);
    await alert.getByRole('link', { name: String(paid.number) }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${paid.number}`));
    const line = page.locator('[data-paid-sms]');
    await expect(line).toHaveAttribute('data-paid-sms', 'failed');
    await expect(line).toContainText('پیامک پرداخت نرفت: فرستادنش نیمه‌کاره ماند.');

    await fakeMode('down');
    try {
      await line.getByRole('button', { name: 'دوباره بفرست' }).click();
      await expect(alertOf(page)).toHaveText('پیامک پرداخت باز نرفت؛ پنل پیامک جواب نداد. کمی بعد دوباره بفرست.');
      await expect(line).toContainText('پیامک پرداخت نرفت: پنل پیامک جواب نداد.');
    } finally {
      await fakeMode('ok');
    }
    const sentBefore = (await fakeSms()).messages.length;
    await line.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.getByText('پیامک پرداخت دوباره فرستاده شد و رفت.')).toBeVisible();
    await expect(line).toHaveAttribute('data-paid-sms', 'sent');
    await expect(line).toContainText(`پیامک پرداخت به ${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)} رفت، امروز`);
    await expect(line.getByRole('button', { name: 'دوباره بفرست' })).toHaveCount(0);
    // به sms.ir فقط قالب پرداخت با دو پارامترش رفت؛ روز همان مهلت تحویل به پست سفارش.
    const sent = (await fakeSms()).messages.slice(sentBefore);
    expect(sent.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      [
        phone,
        Number(env.SMS_PAID_TEMPLATE),
        [
          { name: 'ORDER', value: String(paid.number) },
          { name: 'DAY', value: paid.day },
        ],
      ],
    ]);
    const [row] = await sql<{ status: string; provider: string; provider_message_id: string; cost: number; attempts: number }[]>`
      SELECT m.status, m.provider, m.provider_message_id, m.cost, m.attempts
        FROM sms_messages m JOIN payments p ON p.sms_message_id = m.id WHERE p.order_id = ${paid.id}`;
    expect(row).toEqual({ status: 'sent', provider: 'smsir', provider_message_id: String(sent[0]!.id), cost: 1, attempts: 2 });
    const events = await sql<{ detail: Record<string, unknown> }[]>`
      SELECT detail FROM admin_events WHERE action = 'orders.sms_resend' AND target_id = ${paid.id} ORDER BY id`;
    expect(events.map((e) => e.detail)).toEqual([
      { orderNumber: paid.number, outcome: 'failed', error: 'unavailable' },
      { orderNumber: paid.number, outcome: 'sent' },
    ]);
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="paid-sms"]')).toHaveCount(0);
    // «رویدادها» مال مالک است؛ با چیپ «سفارش».
    await ownerPage.goto(at('/events?kind=orders'));
    await expect(ownerPage.locator('main')).toContainText(`پیامک پرداخت سفارش ${paid.number} دوباره فرستاده شد و باز نرفت`);
    await expect(ownerPage.locator('main')).toContainText(`پیامک پرداخت سفارش ${paid.number} دوباره فرستاده شد و رفت`);
    expect(operatorProblems).toEqual([]);
  });

  test('«آزمایش» قالب: شناسه‌ای که sms.ir نمی‌شناسد «رد شد»؛ sms.ir خاموش «جواب نداد» و «با این حال ذخیره کن» با کد تازه؛ «آزموده» زیر نامش', async () => {
    const page = ownerPage;
    await page.goto(at('/settings?key=SMS_TRACKING_TEMPLATE'));
    const row = keyRow(page, 'SMS_TRACKING_TEMPLATE');
    await expect(row.locator('.ad-tpl__p')).toHaveText(['‹ORDER›', '‹BARCODE›']);
    await expect(row.locator('.ad-hint').last()).toContainText('دو پارامتر، ORDER و BARCODE');
    const value = row.getByLabel('شناسهٔ قالب');
    await value.fill('999999');
    await row.getByLabel('موبایل برای پیامک آزمایشی').fill('09120001234');
    await row.getByRole('button', { name: 'آزمایش' }).click();
    await expect(row.locator('[data-test-outcome="rejected"] .jy-note')).toHaveText(
      'sms.ir رد کرد: این شناسهٔ قالب در حساب نیست، هنوز تأیید نشده، یا نام پارامترهایش همین‌ها نیست (پاسخ 400، کد 13). رد شده ذخیره نمی‌شود؛ قالب را در پنل sms.ir ببین.',
    );
    await expect(row.getByLabel('کد برنامهٔ تأیید تو')).toHaveCount(0);

    const template = env.SMS_TRACKING_TEMPLATE!.trim();
    await value.fill(template);
    await fakeMode('down');
    try {
      await row.getByRole('button', { name: 'آزمایش' }).click();
      await expect(row.locator('[data-test-outcome="unavailable"] .jy-note')).toHaveText(
        'sms.ir جواب نداد (پاسخ 500). قالب آزموده نشد؛ اگر مطمئنی، با کد تازه ذخیره کن و بعداً دوباره بیازما.',
      );
    } finally {
      await fakeMode('ok');
    }
    await row.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await row.getByRole('button', { name: 'با این حال ذخیره کن' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«قالب رهگیری sms.ir» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(row.locator('.jy-badge')).toHaveText('از پنل');
    await expect(row.locator('.ad-mask')).toHaveText(`••${template.slice(-4)}`);
    await expect(row.locator('[data-last-test="unavailable"]')).toContainText('آزموده: sms.ir جواب نداد (پاسخ 500) · امروز');
    const [set] = await sql<{ detail: Record<string, unknown> }[]>`
      SELECT detail FROM admin_events WHERE id > ${eventsBefore} AND action = 'settings.key_set' AND target_id = 'SMS_TRACKING_TEMPLATE'`;
    expect(set!.detail).toEqual({ name: 'SMS_TRACKING_TEMPLATE', from: 'env', tested: 'unavailable' });

    // برگرداندن به .env، با کد تازه.
    await page.goto(at('/settings?revert=SMS_TRACKING_TEMPLATE'));
    await row.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await row.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«قالب رهگیری sms.ir» به .env برگشت.');
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);
    await page.goto(at('/events?kind=settings'));
    await expect(page.locator('main')).toContainText('«قالب رهگیری sms.ir» آزموده شد: رد شد (پاسخ 400)');
    await expect(page.locator('main')).toContainText('«قالب رهگیری sms.ir» آزموده شد: sms.ir جواب نداد (پاسخ 500)');
    expect(ownerProblems).toEqual([]);
  });

  test('۳۲۰، ۳۹۰ و ۱۲۸۰: بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل، در «تنظیمات»، آزمایش قالب، پیشخوان و کارت «پرداخت‌ها»', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await owner.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of ['/settings', '/settings?key=SMS_PAID_TEMPLATE', '/', `/orders/${paid.number}`]) {
        await page.goto(at(path));
        expect(await layoutProblems(page), `${path} در ${width}`).toEqual({ overflow: 0, small: [], blank: [] });
      }
      expect(problems).toEqual([]);
      await context.close();
    }
  });
});
