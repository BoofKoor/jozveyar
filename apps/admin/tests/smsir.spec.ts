import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { barcodeOf, parcel } from '@jozveyar/db/postfile.fixtures';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { orderPaidText, trackingText } from '@jozveyar/sms';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import {
  assignAtPayment,
  at,
  BASE,
  enroll,
  GATE,
  layoutProblems,
  newContext,
  postFile,
  serverInvite,
  SMSIR,
  smsirMock,
  uploadPostFile as upload,
  watch,
} from './helpers';

/**
 * پیامک با sms.ir، سرتاسری (برش ۷٫۱، ADR-049؛ طرح برش ۷: `m-dash-alerts`، `ad-paysms` و کارت «اعتبار پیامک»): همان پنل با
 * `SMS_PROVIDER=smsir`، و sms.ir ساختگی که پنل با `SMSIR_API_URL` به آن وصل است؛ هیچ درخواستی به sms.ir واقعی نمی‌رود.
 *
 * - اعتبار همین حالا از sms.ir: کارت «اعتبار پیامک» با «برای حدود N روز»، و «اعتبار پیامک کم است» پیشخوان.
 * - سقف کد کل سایت که پر شد: هشدار پیشخوان با «تا حدود»، مالک با پیوند «تنظیمات» و متصدی «به مالک بگو».
 * - «ثبت» فایل پست: پیامک رهگیری با شناسهٔ قالب رهگیری و دو پارامتر، ردیف «رفت» با هزینه و `provider = 'smsir'`.
 * - sms.ir جواب نداد (۵۰۰): «پیامک نرفت: پنل پیامک جواب نداد (کد 500).»، و «دوباره بفرست» که با sms.ir می‌رود.
 * - پیامک پرداخت که نرفت: هشدار پیشخوان و ردیف «پیامک پرداخت» کارت «پرداخت‌ها» با «دوباره بفرست»، و رویداد زیر چیپ «پرداخت و بازپرداخت».
 *
 * CI پس از اجرای اصلی پنل را با `SMS_PROVIDER=smsir` و شناسهٔ قالب‌های همین فایل در `.env` دوباره بالا می‌آورد و فقط همین فایل را اجرا
 * می‌کند (اجرای اصلی کنسولی است و این فایل خودش را رد می‌کند). کلید API همان `SMS_API_KEY` محیط است و sms.ir ساختگی همان را می‌شناسد.
 * اعتبار نمایشی تا ۵ دقیقه همان خواندن اول است (هر نود)، پس سنجش اعتبار اول و پیش از هر پیامک این فایل است.
 */

const env = process.env;
const SMSIR_ON = env.SMS_PROVIDER?.trim().toLowerCase() === 'smsir';
test.skip(
  !BASE || !GATE || !env.DATABASE_URL || !SMSIR || !SMSIR_ON || !env.SMS_API_KEY,
  'بدون SMS_PROVIDER=smsir، SMSIR_API_URL، SMS_API_KEY و متغیرهای پنل — پنل با sms.ir ساختگی لازم است',
);
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TEHRAN = { provinceId: 8, cityId: 394 };
/** همان شناسه‌هایی که CI در `.env` این اجرا می‌گذارد. */
const TPL = { otp: env.SMS_OTP_TEMPLATE ?? '100001', paid: env.SMS_PAID_TEMPLATE ?? '100002', tracking: env.SMS_TRACKING_TEMPLATE ?? '100003' };
const TEMPLATES = { [TPL.otp]: ['CODE'], [TPL.paid]: ['ORDER', 'DAY'], [TPL.tracking]: ['ORDER', 'BARCODE'] };
/** اعتبار sms.ir ساختگی و هزینهٔ هر پیامک؛ هفت کد تأیید هفتهٔ گذشته با همین هزینه، پس «برای حدود 2 روز». */
const CREDIT = 250;
const COST = 100;
const TODAY = 'امروز \\d\\d:\\d\\d';
let sql: postgres.Sql;

interface Seeded {
  id: string;
  number: number;
  phone: string;
  grams: number;
  paymentId: string;
}

/**
 * سفارش پرداخت‌شده همان‌طور که سرور می‌نویسد (سفارش، پرداخت، چاپخانه در پرداخت)؛ مثل `sms.spec.ts`. با `paidSms`، پرداخت از ۷٫۱:
 * تلاش «در انتظار» که در همان گذار «موفق» پیامک پرداخت منتظرش را می‌گیرد (`payments_sms`)؛ پیامکی که ده دقیقه پیش ساخته شد و نرفت
 * (پنل پیش از فرستادن افتاد).
 */
async function paidOrder(name: string, phone: string, { printing = true, paidSms = false } = {}): Promise<Seeded> {
  const paidAt = new Date(Date.now() - 60 * MINUTE);
  const docId = randomUUID();
  await sql`
    INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                           session_hash, upload_id, part_size_bytes, uploaded_at, file_expires_at)
    VALUES (${docId}, 'ریاضی ۲.pdf', 'pdf', 'application/pdf', 1000, ${`uploads/${docId}.pdf`}, 'ready', 10,
            ${'e2e'.padEnd(64, '7')}, 'e2e', ${8 * 1024 * 1024}, now(), ${new Date(Date.now() + 2 * DAY)})`;
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
              ${TEHRAN.provinceId}, ${TEHRAN.cityId}, ${name}, ${phone}, 'خیابان ولیعصر، پلاک 12', ${new Date(paidAt.getTime() - 30 * MINUTE)})
      RETURNING id, order_number`;
    const [item] = await tx<{ id: string }[]>`
      INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
      VALUES (${row!.id}, 1, 10, 1, 'double', 'spiral_clear') RETURNING id`;
    await tx`INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (${item!.id}, 1, ${docId}, 10)`;
    await tx`INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
             VALUES (${item!.id}, 1, ${tx.json(rules[0]!.pageRanges)}, 'bw', 'tahrir80')`;
    const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
    let paymentId: string;
    if (paidSms) {
      const [payment] = await tx<{ id: string }[]>`
        INSERT INTO payments (order_id, provider, amount_rials, authority, created_at)
        VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${authority}, ${new Date(paidAt.getTime() - MINUTE)}) RETURNING id`;
      const day = 'دوشنبه 6 مهر';
      const [sms] = await tx<{ id: number }[]>`
        INSERT INTO sms_messages (provider, to_mobile, purpose, body, params, status, created_at)
        VALUES ('queued', ${phone}, 'order_paid', ${orderPaidText(row!.order_number, day)}, ${tx.json([String(row!.order_number), day])},
                'pending', ${new Date(Date.now() - 10 * MINUTE)})
        RETURNING id`;
      await tx`UPDATE payments SET status = 'succeeded', ref_id = '803114', verified_at = ${paidAt}, verified_amount_rials = amount_rials,
               sms_message_id = ${sms!.id} WHERE id = ${payment!.id}`;
      paymentId = payment!.id;
    } else {
      const [payment] = await tx<{ id: string }[]>`
        INSERT INTO payments (order_id, provider, amount_rials, verified_amount_rials, status, authority, ref_id, verified_at, created_at)
        VALUES (${row!.id}, 'mock', ${breakdown.totalRials}, ${breakdown.totalRials}, 'succeeded', ${authority}, '803114', ${paidAt}, ${new Date(paidAt.getTime() - MINUTE)})
        RETURNING id`;
      paymentId = payment!.id;
    }
    await tx`UPDATE orders SET status = 'paid', paid_at = ${paidAt}, post_handoff_due_at = ${tehranDayStart(paidAt, 3)} WHERE id = ${row!.id}`;
    await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor, note)
             VALUES (${row!.id}, 'awaiting_payment', 'paid', ${paidAt}, 'gateway', ${tx.json({ paymentId })})`;
    await assignAtPayment(tx, row!.id, paidAt);
    if (printing) {
      await tx`UPDATE orders SET status = 'printing' WHERE id = ${row!.id}`;
      await tx`INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (${row!.id}, 'paid', 'printing', ${new Date(paidAt.getTime() + 10 * MINUTE)}, 'system')`;
    }
    return { id: row!.id, number: row!.order_number, phone, grams: breakdown.estWeightGrams, paymentId };
  });
}

const today = () => formatJalaliNumeric(new Date());
const code = (n: number) => barcodeOf(RUN * 1000 + 700 + n);
const row = (n: number, nameG: string, grams: number) => parcel(n, code(n), nameG, 'تهران', grams, 1_295_000, { date: today() });
const phoneText = (phone: string) => `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
const smsRows = async (purpose: string, phone: string) =>
  sql<{ status: string; provider: string; cost: string | null; error: string | null; attempts: number }[]>`
    SELECT status, provider, cost::text AS cost, error, attempts FROM sms_messages WHERE purpose = ${purpose} AND to_mobile = ${phone} ORDER BY id`;

test.describe.serial('پیامک با sms.ir', () => {
  let owner: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operator: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  const o = {} as Record<'A' | 'B' | 'C', Seeded>;
  const phone = (n: number) => `0915${String(RUN).slice(1)}7${String(n).padStart(3, '0')}`;
  /** هفت کد تأیید هفتهٔ گذشته که sms.ir پذیرفت (هزینه‌دار، بی متن و بی پارامتر)؛ و سه کد که سقف ساعتی را پر کرد. */
  let seededSms: number[] = [];
  let seededOtp: string[] = [];
  let hourLimit: unknown = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // «امروز» فایل پست تا نیمه‌شب تهران است؛ نزدیک نیمه‌شب، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 5 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    // پیش از اولین خواندن اعتبار (ورود = پیشخوان): sms.ir ساختگی و هزینهٔ هفتهٔ گذشته.
    await smsirMock.configure({ keys: [env.SMS_API_KEY!.trim()], templates: TEMPLATES, credit: CREDIT, cost: COST, fail: null, drop: 0 });
    await smsirMock.reset();
    seededSms = (
      await sql<{ id: number }[]>`
        INSERT INTO sms_messages (provider, to_mobile, purpose, status, attempts, cost, created_at, attempted_at, sent_at)
        SELECT 'smsir', '09120000000', 'otp', 'sent', 1, ${COST}, t, t, t
          FROM generate_series(1, 7) AS g, LATERAL (SELECT now() - g * interval '20 hours' AS t) AS s
        RETURNING id`
    ).map((r) => r.id);
    // سقف ساعتی کل سایت ۳، و سه کد همین امروز در ساعت گذشته: سقف پر است تا حدود یک ساعت دیگر.
    hourLimit = (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'otp.site_hourly_limit'`)[0]?.value ?? 300;
    await sql`UPDATE settings SET value = '3' WHERE key = 'otp.site_hourly_limit'`;
    const first = Math.max(Date.now() - 3 * MINUTE, tehranDayStart(new Date(), 0).getTime() + 1_000);
    for (const k of [0, 1, 2]) {
      const at = new Date(first + k * 1_000);
      const [otp] = await sql<{ id: string }[]>`
        INSERT INTO otp_requests (mobile, code_hash, session_hash, ip_hash, created_at, expires_at)
        VALUES ('09120000001', md5(${`${RUN}c${k}`}), md5(${`${RUN}s${k}`}), md5(${`${RUN}i${k}`}), ${at}, ${new Date(at.getTime() + 2 * MINUTE)})
        RETURNING id`;
      seededOtp.push(otp!.id);
    }
    o.A = await paidOrder('مهسا طاهری', phone(1));
    o.B = await paidOrder('امید شریفی', phone(2));
    o.C = await paidOrder('نرگس امینی', phone(3), { printing: false, paidSms: true });

    owner = await newContext(browser);
    ownerPage = await owner.newPage();
    ownerProblems = watch(ownerPage);
    await enroll(ownerPage, serverInvite(`sara${RUN}`, '--name', 'سارا رضایی'));
    operator = await newContext(browser);
    operatorPage = await operator.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(`ali${RUN}`, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    if (sql) {
      await sql`UPDATE settings SET value = ${sql.json((hourLimit ?? 300) as postgres.JSONValue)} WHERE key = 'otp.site_hourly_limit'`;
      if (seededOtp.length) await sql`DELETE FROM otp_requests WHERE id = ANY(${seededOtp})`;
      if (seededSms.length) await sql`DELETE FROM sms_messages WHERE id = ANY(${seededSms})`;
      const ids = Object.values(o).map((one) => one.id);
      if (ids.length > 0) {
        await sql`DELETE FROM payments WHERE order_id = ANY(${ids})`;
        await sql`DELETE FROM orders WHERE id = ANY(${ids})`;
      }
    }
    await owner?.close();
    await operator?.close();
    await sql?.end();
  });

  test('اعتبار همین حالا از sms.ir و «برای حدود 2 روز»؛ «اعتبار پیامک کم است» و «سقف کد پیامکی پر شد» در پیشخوان، به ترتیب', async () => {
    const page = ownerPage;
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="credit"]')).toBeVisible();
    // سؤال ۱۴۰: خطا، بعد هشدار، بعد خبر. هشدار سقف پیش از اعتبار (طرح)، و پیامک پرداخت پس از آنها.
    const order = await page.locator('.ad-alerts > [data-alert]').evaluateAll((els) => els.map((el) => el.getAttribute('data-alert')));
    expect(order.filter((kind) => ['otp-cap', 'credit', 'paid-sms'].includes(kind!))).toEqual(['otp-cap', 'credit', 'paid-sms']);
    const cap = page.locator('[data-alert="otp-cap"]');
    await expect(cap).toHaveClass(/jy-note--warning/);
    await expect(cap).toHaveText(
      /^سقف کد پیامکی کل سایت پر شد: 3 کد در ساعت گذشته، از \d\d:\d\d\. تا حدود (فردا )?\d\d:\d\d به هیچ شماره‌ای کد تازه نمی‌رود\. اگر مشتری واقعی است، سقف را در «تنظیمات» بالا ببر\.$/,
    );
    await expect(cap.getByRole('link', { name: '«تنظیمات»' })).toHaveAttribute('href', at('/settings#otp'));
    const credit = page.locator('[data-alert="credit"]');
    await expect(credit).toHaveClass(/jy-note--warning/);
    await expect(credit).toHaveText(
      'اعتبار پیامک کم است: 250 در sms.ir، برای حدود 2 روز با مصرف هفتهٔ گذشته. شارژ کن؛ بی اعتبار کد تأیید نمی‌رود و کسی نمی‌تواند سفارش بدهد.',
    );

    // متصدی همان‌ها را می‌بیند، ولی «تنظیمات» مال مالک است.
    await operatorPage.goto(at('/'));
    await expect(operatorPage.locator('[data-alert="otp-cap"]')).toContainText('اگر مشتری واقعی است، به مالک بگو سقف را در «تنظیمات» بالا ببرد.');
    await expect(operatorPage.locator('[data-alert="otp-cap"]').getByRole('link')).toHaveCount(0);
    await expect(operatorPage.locator('[data-alert="credit"]')).toBeVisible();

    // کارت «اعتبار پیامک»: عدد خود sms.ir، همین حالا؛ و شمار کد همان سه کد ساعت گذشته.
    await page.goto(at('/settings'));
    const card = page.locator('section[data-setting="sms.credit_alert_days"]');
    await expect(card.locator('.jy-card__meta')).toHaveText(/^sms\.ir، ساعت \d\d:\d\d$/);
    await expect(card.locator('.ad-credit .num')).toHaveText('250');
    await expect(card.locator('.ad-usage')).toHaveText('برای حدود 2 روز با مصرف هفتهٔ گذشته (7 پیامک).');
    await expect(page.locator('[data-otp-usage]')).toContainText('ساعت گذشته 3 کد');
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('«ثبت» فایل پست: پیامک رهگیری با sms.ir (قالب رهگیری، سفارش و بارکد)، ردیف «رفت» با هزینه؛ sms.ir جواب نداد: «نرفت (کد 500)» و «دوباره بفرست»', async () => {
    const page = operatorPage;
    // اعتبار نمایشی همان خواندن اول است؛ خود sms.ir ساختگی برای پیامک‌های این فایل شارژ می‌شود.
    await smsirMock.configure({ credit: 10_000 });
    await upload(page, `FileName-${RUN}7.xls`, postFile([row(1, `طاهری ${o.A.number}`, o.A.grams)]));
    await expect(page.locator('[data-count="ok"] .ad-tile__n')).toHaveText('1', { timeout: 30_000 });
    await page.getByRole('button', { name: /^ثبت/ }).click();
    await expect(page.getByText('ثبت شد: 1 کد رهگیری نشست و 1 پیامک رفت.')).toBeVisible();
    expect((await smsirMock.messages()).messages.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      [o.A.phone, Number(TPL.tracking), [{ name: 'ORDER', value: String(o.A.number) }, { name: 'BARCODE', value: code(1) }]],
    ]);
    expect(await smsRows('tracking', o.A.phone)).toEqual([{ status: 'sent', provider: 'smsir', cost: String(COST), error: null, attempts: 1 }]);
    const [body] = await sql<{ body: string }[]>`SELECT body FROM sms_messages WHERE purpose = 'tracking' AND to_mobile = ${o.A.phone}`;
    expect(body!.body).toBe(trackingText(o.A.number, code(1)));

    // sms.ir یک بار ۵۰۰: «ثبت» می‌نشیند و پیامک B نرفت، با علت و کد پاسخ؛ خودکار دوباره نمی‌رود.
    await smsirMock.configure({ fail: { http: 500, times: 1 } });
    await upload(page, `FileName-${RUN}8.xls`, postFile([row(2, `شریفی ${o.B.number}`, o.B.grams)]));
    await expect(page.locator('[data-count="ok"] .ad-tile__n')).toHaveText('1', { timeout: 30_000 });
    await page.getByRole('button', { name: /^ثبت/ }).click();
    await expect(page.getByText(`ثبت شد: 1 کد رهگیری نشست؛ پیامک سفارش ${o.B.number} نرفت.`)).toBeVisible();
    await expect(page.locator('main')).toContainText('پیامک نرفت: پنل پیامک جواب نداد (کد 500).');
    expect(await smsRows('tracking', o.B.phone)).toEqual([{ status: 'failed', provider: 'smsir', cost: null, error: 'unavailable:500', attempts: 1 }]);

    await page.goto(at(`/orders/${o.B.number}`));
    await expect(page.locator('[data-sms="failed"]')).toContainText('نرفت: پنل پیامک جواب نداد (کد 500).');
    await page.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.getByText('پیامک رهگیری دوباره فرستاده شد و رفت.')).toBeVisible();
    await expect(page.locator('[data-sms="sent"]')).toContainText(`به ${phoneText(o.B.phone)} رفت، امروز`);
    expect(await smsRows('tracking', o.B.phone)).toEqual([{ status: 'sent', provider: 'smsir', cost: String(COST), error: null, attempts: 2 }]);
    expect((await smsirMock.messages()).messages.map((m) => m.mobile)).toEqual([o.A.phone, o.B.phone]);
    expect(operatorProblems).toEqual([]);
  });

  test('پیامک پرداخت که نرفت: هشدار پیشخوان، ردیف «پیامک پرداخت» با «دوباره بفرست» که با sms.ir می‌رود، و رویداد زیر «پرداخت و بازپرداخت»', async () => {
    const page = operatorPage;
    await page.goto(at('/'));
    const alert = page.locator('[data-alert="paid-sms"]');
    await expect(alert).toHaveText(`پیامک پرداخت سفارش ${o.C.number} نرفت؛ از کارت «پرداخت‌ها» دوباره بفرست.`);
    await alert.getByRole('link', { name: String(o.C.number) }).click();
    const sms = page.locator('.ad-paysms');
    await expect(sms).toHaveAttribute('data-paysms', 'failed');
    await expect(sms.locator('b')).toHaveText('پیامک پرداخت');
    await expect(sms.locator('.ad-paysms__fail')).toHaveText(new RegExp(`^نرفت: فرستادنش نیمه‌کاره ماند، ${TODAY}$`));
    await sms.getByRole('button', { name: 'دوباره بفرست' }).click();
    await expect(page.getByText('پیامک پرداخت دوباره فرستاده شد و رفت.')).toBeVisible();
    await expect(page.locator('.ad-paysms')).toHaveAttribute('data-paysms', 'sent');
    await expect(page.locator('.ad-paysms')).toContainText(`به ${phoneText(o.C.phone)} رفت، امروز`);
    await expect(page.locator('.ad-paysms').getByRole('button')).toHaveCount(0);
    const sent = (await smsirMock.messages()).messages.at(-1)!;
    expect([sent.mobile, sent.templateId, sent.parameters]).toEqual([
      o.C.phone,
      Number(TPL.paid),
      [
        { name: 'ORDER', value: String(o.C.number) },
        { name: 'DAY', value: 'دوشنبه 6 مهر' },
      ],
    ]);
    expect(await smsRows('order_paid', o.C.phone)).toEqual([{ status: 'sent', provider: 'smsir', cost: String(COST), error: null, attempts: 1 }]);
    const [event] = await sql<{ detail: { outcome: string; orderNumber: number } }[]>`
      SELECT detail FROM admin_events WHERE action = 'payments.sms_resend' AND target_id = ${o.C.id}`;
    expect(event!.detail).toMatchObject({ outcome: 'sent', orderNumber: o.C.number });
    await page.goto(at('/'));
    await expect(page.locator('[data-alert="paid-sms"]')).toHaveCount(0);
    // «رویدادها» مال مالک است؛ با چیپ «پرداخت و بازپرداخت».
    await ownerPage.goto(at('/events?kind=payments'));
    await expect(ownerPage.getByRole('link', { name: 'پرداخت و بازپرداخت' })).toHaveAttribute('aria-current', 'page');
    await expect(ownerPage.locator('main')).toContainText(`پیامک پرداخت سفارش ${o.C.number} دوباره فرستاده شد و رفت`);
    expect(operatorProblems).toEqual([]);
    expect(ownerProblems).toEqual([]);
  });

  test('۳۲۰، ۳۹۰ و ۱۲۸۰: بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون با شکل، در پیشخوان، «پرداخت‌ها» و «تنظیمات»', async ({ browser }) => {
    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await owner.cookies());
      const page = await context.newPage();
      for (const path of ['/', `/orders/${o.C.number}`, `/orders/${o.B.number}`, '/settings']) {
        await page.goto(at(path));
        expect(await layoutProblems(page), `${path} در ${width}`).toEqual({ overflow: 0, small: [], blank: [] });
      }
      await context.close();
    }
  });
});
