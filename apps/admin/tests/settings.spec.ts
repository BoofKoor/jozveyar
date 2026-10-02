import { randomBytes, randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric, jalaliYear, toPersianDigits } from '@jozveyar/text';

import { holidaysView } from '../lib/settings';
import { alertOf, at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, SMSIR, smsirMock, watch } from './helpers';

/**
 * تنظیمات و کلیدها در پنل، سرتاسری (برش ۴٫۶؛ طرح `docs/ui/mockups/admin.html` حالت‌های `m-settings` و `m-key-edit`، ADR-041):
 * فقط مالک؛ روز کاری تحویل به پست با شمارنده و سایت (وب روی ۳۱۰۱) با ISR تا یک دقیقه؛ سقف کد پیامکی؛ روزهای نگهداری فایل‌های
 * سفارش (برش ۵٫۱، ADR-044)؛ تعطیلی‌ها با افزودن و حذف و «با تقویم رسمی تطبیق دادم»؛ و کلیدهای سرویس‌ها با کد تازه، فقط ۴ نویسهٔ
 * آخر، و «برگرداندن به .env». از برش ۷٫۱ (ADR-049، طرح برش ۷): سقف ۲۴ ساعتهٔ کد کنار ساعتی با شمار واقعی، کارت «اعتبار پیامک»،
 * پنج کلید با متن قالب، کلید API «آزمایش و ذخیره» («رد شد» بی کد، «در دسترس نیست» و «بی آزمایش ذخیره کن»)، قالب با پیامک آزمایشی
 * پیش از ذخیره، و «آزمایش» مقدار امروز.
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، و برای سایت `E2E_WEB_BASE_URL=http://127.0.0.1:3101`. کلید
 * `.env` پنل همان `SMS_API_KEY` محیط همین اجراست (CI تصادفی می‌سازد)، و مقداری که تست از پنل وارد می‌کند `E2E_KEY_PROBE`
 * (وگرنه تصادفی)؛ CI پس از اجرا لاگ پنل و وب را برای هر دو می‌جوید. هیچ سنجشی مقدار کلید را چاپ نمی‌کند (فقط درست و نادرست).
 * sms.ir همان سرور ساختگی است که پنل با `SMSIR_API_URL` به آن وصل است (`node packages/sms/mock/smsir.mjs 3300`)؛ بی آن این
 * فایل اجرا نمی‌شود، تا «آزمایش» هیچ کلیدی به sms.ir واقعی نرود. در پایان تنظیم‌ها همان پیش از تست‌اند و کلیدهای پنل پاک.
 * یک اجرا ۸ آزمایش کلید می‌کند و سقف ۱۰ در ساعت است، و رویدادها پاک‌شدنی نیستند؛ پس اجرای دوباره در همان ساعت پایگاه دادهٔ تازه
 * می‌خواهد، مثل CI.
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.skip(!SMSIR, 'بدون SMSIR_API_URL — sms.ir ساختگی لازم است، تا آزمایش کلید به sms.ir واقعی نرود');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const DAY = 86_400_000;
const NO_ACCESS = 'این بخش فقط برای مالک است';
/** مقداری که مالک برای کلید API sms.ir وارد می‌کند. */
const PROBE = env.E2E_KEY_PROBE?.trim() || randomBytes(20).toString('hex');
/** کلید دومی که sms.ir ساختگی هم می‌شناسد («بی آزمایش ذخیره کن»)؛ با همان پیشوند، تا جست‌وجوی CI در لاگ آن را هم بگیرد. */
const PROBE2 = `${PROBE}b`;
/** همان `.env` پنل. */
const ENV_KEY = env.SMS_API_KEY?.trim() ?? '';
const SETTING_KEYS = [
  'order.sla_days',
  'otp.site_hourly_limit',
  'otp.site_daily_limit',
  'order.files_retention_days',
  'sms.credit_alert_days',
  'calendar.holidays',
  'calendar.official_through',
];
/** شناسهٔ قالب‌هایی که sms.ir ساختگی می‌شناسد، با نام پارامترهای همان یک منبع (`@jozveyar/sms`). */
const TPL = { otp: '100001', paid: '100002', tracking: '100003' };
const TEMPLATES = { [TPL.otp]: ['CODE'], [TPL.paid]: ['ORDER', 'DAY'], [TPL.tracking]: ['ORDER', 'BARCODE'] };
/** اعتبار حسابی که sms.ir ساختگی می‌دهد، مثل طرح. */
const CREDIT = 184_200;
/** «امروز 10:52»؛ ساعت هر چه باشد. */
const TODAY = 'امروز \\d\\d:\\d\\d';

let sql: postgres.Sql;
/** رویدادهای پیش از این اجرا (رویدادها فقط افزودنی‌اند؛ اجرای دوباره روی همان پایگاه داده). */
let eventsBefore = 0;
/** تنظیم‌های پیش از تست، که در پایان برمی‌گردند. */
let before: { key: string; value: unknown }[] = [];

const settingOf = async (key: string) => (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${key}`)[0]?.value;
const holidays = async () => ((await settingOf('calendar.holidays')) ?? []) as { date: string; title: string }[];
const settingEvents = async () =>
  sql<{ action: string; target: string; detail: Record<string, unknown> }[]>`
    SELECT action, target_id AS target, detail FROM admin_events WHERE id > ${eventsBefore} AND action LIKE 'settings.%' ORDER BY id`;
const codeFailures = async () =>
  Number((await sql<{ n: string }[]>`SELECT count(*) AS n FROM admin_events WHERE id > ${eventsBefore} AND action = 'auth.code_failed'`)[0]!.n);
/** مهلت سفارش‌های ثبت‌شده (اگر `orders.spec.ts` پیش از این نشانده): تعطیلی‌ها و روز کاری تازه عوضشان نمی‌کنند. */
const deadlines = async () => sql<{ id: string; due: Date | null; sla: number }[]>`
  SELECT id, post_handoff_due_at AS due, sla_days AS sla FROM orders ORDER BY id`;
/** نسخهٔ JSON صفحهٔ اصلی سایت (`#jy-tariff`، ۴٫۴): روز کاری تحویل به پست. */
async function siteSlaDays(): Promise<number | null> {
  const html = await (await fetch(`${WEB}/`)).text();
  const json = /<script[^>]*id="jy-tariff"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  return json ? (JSON.parse(json) as { slaDays: number }).slaDays : null;
}

const card = (page: Page, key: string) => page.locator(`section[data-setting="${key}"]`);
/** فیلد عدد شمارنده (گروه شمارنده هم همین نام را دارد). */
const slaField = (page: Page) => page.getByRole('spinbutton', { name: 'روز کاری بعد از پرداخت' });
const keepField = (page: Page) => page.getByRole('spinbutton', { name: 'روز نگهداری بعد از «تحویل پست شد» یا «لغو شد»' });
const keyRow = (page: Page, name: string) => page.locator(`li[data-key="${name}"]`);
const successIn = (page: Page, where: string) => page.locator(`${where} .jy-note--success`);
const html = async (page: Page) => page.content();
/** روز آینده‌ای که در فهرست نیست، تا پایان سال بعد، از `days` روز بعد به این طرف. */
async function freeDay(from: number): Promise<string> {
  const taken = new Set((await holidays()).map((h) => h.date));
  const limit = jalaliYear(new Date()) + 1;
  for (let k = from; k < from + 400; k += 1) {
    const date = formatJalaliNumeric(new Date(Date.now() + k * DAY));
    if (!taken.has(date) && Number(date.slice(0, 4)) <= limit) return date;
  }
  throw new Error('روز آزادی پیدا نشد');
}

test.describe.serial('تنظیمات و کلیدها در پنل', () => {
  const owner = `sara${RUN}`;
  const operator = `ali${RUN}`;
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;

  test.beforeAll(async ({ browser }) => {
    // «امروز» و روزهای آینده به روز تهران: نزدیک نیمه‌شب تهران، تست تا روز تازه صبر می‌کند.
    await awayFromMidnight(180_000, 5 * 60_000);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`DELETE FROM service_secrets`;
    // اجرای قبلی که وسط کار افتاد: پیش‌فرض‌های عددی دوباره (تعطیلی‌ها همان که هست).
    await sql`UPDATE settings SET value = '2' WHERE key = 'order.sla_days'`;
    await sql`UPDATE settings SET value = '300' WHERE key = 'otp.site_hourly_limit'`;
    await sql`UPDATE settings SET value = '2000' WHERE key = 'otp.site_daily_limit'`;
    await sql`UPDATE settings SET value = '30' WHERE key = 'order.files_retention_days'`;
    await sql`UPDATE settings SET value = '7' WHERE key = 'sms.credit_alert_days'`;
    await sql`UPDATE settings SET value = '1405' WHERE key = 'calendar.official_through'`;
    before = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM settings WHERE key IN ${sql(SETTING_KEYS)}`;
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    await enroll(operatorPage, serverInvite(operator, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await operatorContext?.close();
    if (sql) {
      await sql`DELETE FROM service_secrets`;
      for (const row of before) await sql`UPDATE settings SET value = ${sql.json(row.value as postgres.JSONValue)} WHERE key = ${row.key}`;
      await sql.end();
    }
  });

  test('متصدی نه زبانه دارد، نه صفحه («فقط مالک» با متن طرح)؛ مالک کارت‌ها با عددهای پایگاه داده، و کلید .env فقط با ۴ نویسهٔ آخر', async () => {
    await operatorPage.goto(at());
    await expect(operatorPage.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link')).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'تعرفه']);
    await operatorPage.goto(at('/settings'));
    await expect(operatorPage.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    await expect(operatorPage.locator('.ad-noaccess .ad-lead')).toHaveText(
      'تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، تنظیمات، کلیدها، چاپخانه‌ها، ادمین‌ها، رویدادها، برگرداندن ورود فایل پست و گزارش ارسال با مالک پنل است.',
    );
    expect((await html(operatorPage)).includes('کلیدهای سرویس‌ها')).toBe(false);

    const page = ownerPage;
    await page.goto(at());
    const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' });
    // «تعرفه»ی مالک از ۶٫۱ با بخش‌های مالک: در دسکتاپ کنارشان، در گوشی زیر «بیشتر» (طرح برش ۶).
    await expect(nav.locator('.ad-nav__wide')).toHaveText(['تعرفه', 'تنظیمات', 'چاپخانه‌ها', 'ادمین‌ها', 'رویدادها']);
    await nav.locator('.ad-nav__wide', { hasText: 'تنظیمات' }).click();
    await expect(page.getByRole('heading', { name: 'تنظیمات', level: 1 })).toBeVisible();
    await expect(nav.locator('.ad-nav__wide', { hasText: 'تنظیمات' })).toHaveAttribute('aria-current', 'page');

    await expect(card(page, 'order.sla_days').getByRole('heading')).toHaveText('تحویل به پست');
    await expect(slaField(page)).toHaveValue('2');
    await expect(card(page, 'order.sla_days').locator('.jy-hint')).toHaveText(
      'روز کاری شنبه تا چهارشنبه است، بی تعطیلی رسمی. سایت («تحویل پست تا 2 روز کاری») و سفارش‌های تازه از همین می‌خوانند؛ سفارش ثبت‌شده مهلت خودش را دارد.',
    );
    // سقف کد (۷٫۱): ساعتی و ۲۴ ساعته با یک «ذخیره»، و ثابت‌های لایه‌ها همان که وب با آنها می‌سنجد.
    await expect(card(page, 'otp.site_limits').getByRole('heading')).toHaveText('سقف کد پیامکی');
    await expect(page.getByLabel('کد در ساعت، برای کل سایت')).toHaveValue('300');
    await expect(page.getByLabel('کد در 24 ساعت، برای کل سایت')).toHaveValue('2,000');
    await expect(card(page, 'otp.site_limits').locator('.jy-hint')).toHaveText(
      'ترمز آخر در برابر ربات؛ پر شدن هر کدام هشدار پیشخوان است. ثابت‌ها: هر مرورگر 5 در ساعت؛ هر شماره 5 در ساعت و 10 در 24 ساعت؛ هر اینترنت 20 در ساعت؛ و کد فقط برای مرورگری که جزوهٔ آماده روی سرور دارد.',
    );
    // نگهداری فایل‌های سفارش (۵٫۱): پیش‌فرض ۳۰ روز.
    await expect(card(page, 'order.files_retention_days').getByRole('heading')).toHaveText('فایل‌های سفارش');
    await expect(keepField(page)).toHaveValue('30');
    await expect(card(page, 'order.files_retention_days').locator('.jy-hint')).toHaveText(
      'PDF جزوه، فایل چاپ و برگه بعد از این پاک می‌شوند تا دیسک پر نشود؛ تا آن موقع اگر بسته گم شد، دوباره چاپ می‌شود. سفارش باز هرگز. مشخصات و رویدادها می‌مانند.',
    );
    // اعتبار پیامک (۷٫۱، سؤال ۱۳۷): پیامک این اجرا کنسولی است، پس پنل خودش اعتبار را نمی‌خواند؛ آستانه به روز مصرف.
    const credit = card(page, 'sms.credit_alert_days');
    await expect(credit.getByRole('heading')).toHaveText('اعتبار پیامک');
    await expect(credit.locator('.ad-credit')).toHaveCount(0);
    await expect(credit.locator('.jy-note--info')).toHaveText(
      ENV_KEY
        ? 'پیامک‌ها هنوز کنسولی‌اند؛ اعتبار با «آزمایش» کلید API خوانده می‌شود، پایین همین صفحه.'
        : 'کلید API sms.ir خالی است یا خوانده نشد؛ با واردکردنش اعتبار دیده می‌شود.',
    );
    await expect(page.getByRole('spinbutton', { name: 'هشدار پیشخوان وقتی اعتبار کمتر از این شد (روز مصرف)' })).toHaveValue('7');

    // تعطیلی‌ها: پنج روز نزدیک، «همه را ببین»، و هشدار پیش‌بینی قمری؛ همه از فهرست پایگاه داده و امروزِ تهران.
    const view = holidaysView(await holidays(), 1405, new Date());
    const hol = page.locator('#holidays');
    await expect(hol.getByRole('heading')).toHaveText('تعطیلی‌های رسمی');
    await expect(hol.locator('.jy-card__meta')).toHaveText('روز کاری تحویل به پست این روزها را نمی‌شمارد');
    await expect(hol.locator('[data-days="upcoming"] > li .ad-days__date')).toHaveText(view.upcoming.slice(0, 5).map((h) => h.date));
    await expect(hol.locator('[data-days="upcoming"] > li .ad-days__title')).toHaveText(view.upcoming.slice(0, 5).map((h) => h.title));
    if (view.upcoming.length > 5) {
      await expect(hol.locator('[data-days="rest"] summary')).toHaveAccessibleName(`همه را ببین (${view.upcoming.length} روز تا پایان ${view.lastYear})`);
      await hol.locator('[data-days="rest"] summary').click();
      await expect(hol.locator('[data-days="rest"] summary')).toHaveAccessibleName('فقط پنج روز نزدیک');
      await expect(hol.locator('[data-days="rest"] li')).toHaveCount(view.upcoming.length - 5);
    }
    await expect(hol.locator('[data-note="unconfirmed"] p')).toHaveText(
      `تاریخ تعطیلی‌های قمری ${view.unconfirmedYear} هنوز پیش‌بینی است. با انتشار تقویم رسمی ${view.unconfirmedYear} تطبیقشان بده.`,
    );

    // کلیدها: منبع و فقط ۴ نویسهٔ آخر؛ مقدار کامل در صفحه نیست.
    const keys = page.locator('#keys');
    await expect(keys.getByRole('heading')).toHaveText('کلیدهای سرویس‌ها');
    await expect(keys.locator('.jy-card__meta')).toHaveText('فقط مالک');
    await expect(keys.locator('.jy-note--info')).toHaveText(
      'کلیدها رمزشده نگه داشته می‌شوند و کاملشان دیگر نشان داده نمی‌شود؛ شناسهٔ قالب راز نیست و کامل دیده می‌شود. مقدار پنل بر مقدار .env مقدم است. هر مقدار تازه پیش از ذخیره با خود sms.ir یا زیبال آزموده می‌شود، و «آزمایش» مقدار امروز را بی تغییر می‌سنجد.',
    );
    await expect(keys.locator('.ad-keys__name')).toHaveText([
      'کلید API sms.ir',
      'شناسهٔ قالب کد تأیید',
      'شناسهٔ قالب پیامک پرداخت',
      'شناسهٔ قالب پیامک رهگیری',
      'کد پذیرندهٔ زیبال',
    ]);
    const api = keyRow(page, 'SMS_API_KEY');
    if (ENV_KEY) {
      await expect(api.locator('.jy-badge')).toHaveText('از .env');
      await expect(api.locator('.ad-mask')).toHaveText(`••••••••${ENV_KEY.length >= 8 ? ENV_KEY.slice(-4) : ''}`);
      await expect(api.getByRole('link', { name: 'تغییر' })).toBeVisible();
      await expect(api.getByRole('button', { name: 'آزمایش' })).toBeVisible();
      expect((await html(page)).includes(ENV_KEY)).toBe(false);
    }
    // هر قالب متنش را از همان یک منبع پیامک نشان می‌دهد، تا در sms.ir عین همین ساخته شود؛ کلید خالی «آزمایش» ندارد.
    const otp = keyRow(page, 'SMS_OTP_TEMPLATE');
    await expect(otp.locator('.jy-badge')).toHaveText('خالی');
    await expect(otp.locator('.ad-keys__meta')).toContainText('قالبی که با همین متن در sms.ir تأیید شد');
    await expect(otp.locator('.ad-keys__tpl')).toHaveText('متن در sms.ir، دو خط: «کد تأیید جزوه‌یار: #CODE#این کد را به کسی نده.» · پارامتر: CODE');
    await expect(otp.getByRole('link', { name: 'وارد کن' })).toBeVisible();
    await expect(otp.getByRole('link', { name: 'آزمایش' })).toHaveCount(0);
    await expect(keyRow(page, 'SMS_PAID_TEMPLATE').locator('.ad-keys__tpl')).toHaveText(
      'متن در sms.ir: «جزوه‌یار: سفارش #ORDER# پرداخت شد؛ تحویل به پست تا #DAY#» · پارامترها: ORDER، DAY',
    );
    await expect(keyRow(page, 'SMS_TRACKING_TEMPLATE').locator('.ad-keys__tpl')).toHaveText(
      'متن در sms.ir: «جزوه‌یار: سفارش #ORDER# به پست رسید. کد رهگیری #BARCODE#» · پارامترها: ORDER، BARCODE',
    );
    // کد پذیرنده از ۷٫۲ با زیبال آزموده می‌شود، وقتی مقدار دارد (`payments.spec.ts` خود آزمایش را می‌سنجد، با سقف ۱۰ در ساعت).
    await expect(keyRow(page, 'PAYMENT_MERCHANT_ID').getByRole('button', { name: 'آزمایش' })).toHaveCount(process.env.PAYMENT_MERCHANT_ID ? 1 : 0);
    await expect(page.getByRole('link', { name: 'برگرداندن به .env' })).toHaveCount(0);
  });

  test('روز کاری تحویل: شمارنده، خطای بازه، رویداد با قبل و بعد، زبانهٔ کهنه که رونویسی نمی‌کند، و سایت با ISR', async () => {
    const page = ownerPage;
    const orders = await deadlines();
    await page.goto(at('/settings'));
    const other = await ownerContext.newPage();
    await other.goto(at('/settings'));

    const field = slaField(page);
    await card(page, 'order.sla_days').getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(field).toHaveValue('3');
    await card(page, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText(
      'روز کاری تحویل به پست ذخیره شد: 3. سفارش‌های تازه با همین حساب می‌شوند و صفحهٔ اصلی سایت تا یک دقیقه عدد تازه را نشان می‌دهد.',
    );
    expect(await settingOf('order.sla_days')).toBe(3);
    await expect(field).toHaveValue('3');

    // بیرون از بازه: خطا زیر همان فیلد، با عدد نوشته‌شده؛ چیزی ذخیره نمی‌شود.
    await field.fill('31');
    await card(page, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    const error = card(page, 'order.sla_days').locator('.jy-error');
    await expect(error).toHaveText('روز کاری عدد صحیح 1 تا 30 باشد.');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', 's-sla-error s-sla-hint');
    await expect(field).toHaveValue('31');
    expect(await settingOf('order.sla_days')).toBe(3);

    // زبانهٔ دیگر هنوز «2» را نشان می‌دهد: ذخیره‌اش رونویسی نمی‌کند، پیام روشن و عدد تازه.
    await slaField(other).fill('5');
    await card(other, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    await expect(alertOf(other)).toHaveText('این تنظیم همین حالا جای دیگری عوض شد؛ مقدار تازه را ببین و اگر هنوز لازم است، دوباره ذخیره کن.');
    await expect(slaField(other)).toHaveValue('3');
    expect(await settingOf('order.sla_days')).toBe(3);
    // حالا با عدد تازه: همان را دوباره (مقصد یکسان، بی رویداد دوم)، بعد ۴.
    await card(other, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(other, '.ad-flash')).toContainText('ذخیره شد: 3.');
    await slaField(other).fill('4');
    await card(other, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(other, '.ad-flash')).toContainText('ذخیره شد: 4.');
    expect(await settingOf('order.sla_days')).toBe(4);
    await other.close();

    expect((await settingEvents()).map((e) => [e.action, e.target, e.detail])).toEqual([
      ['settings.update', 'order.sla_days', { key: 'order.sla_days', from: 2, to: 3 }],
      ['settings.update', 'order.sla_days', { key: 'order.sla_days', from: 3, to: 4 }],
    ]);
    // سفارش‌های ثبت‌شده روز کاری و مهلت خودشان را دارند.
    expect(await deadlines()).toEqual(orders);
    // سایت همان عدد را حداکثر یک دقیقه بعد (ISR) نشان می‌دهد.
    if (WEB) await expect.poll(siteSlaDays, { timeout: 150_000, intervals: [2_000] }).toBe(4);

    await page.goto(at('/settings'));
    await slaField(page).fill('2');
    await card(page, 'order.sla_days').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toContainText('ذخیره شد: 2.');
    expect(ownerProblems).toEqual([]);
  });

  test('سقف کد پیامکی: ساعتی و ۲۴ ساعتهٔ کل سایت با یک «ذخیره»، شمار واقعی، ارقام فارسی با جداکننده، و خطای هر فیلد زیر خودش (۷٫۱)', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const otp = card(page, 'otp.site_limits');
    const hour = page.getByLabel('کد در ساعت، برای کل سایت');
    const day = page.getByLabel('کد در 24 ساعت، برای کل سایت');
    // شمار واقعی کدها، همان پنجره‌های لغزان.
    const [usage] = await sql<{ hour: number; day: number }[]>`
      SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, count(*)::int AS day
        FROM otp_requests WHERE created_at > now() - interval '24 hours'`;
    const n = (value: number) => value.toLocaleString('en-US');
    await expect(otp.locator('.ad-usage')).toHaveText(`ساعت گذشته ${n(usage!.hour)} کد · 24 ساعت گذشته ${n(usage!.day)} کد`);

    await hour.fill('۱٬۰۰۰');
    await day.fill('۳٬۰۰۰');
    await otp.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('سقف کد پیامکی کل سایت ذخیره شد: 1,000 کد در ساعت و 3,000 کد در 24 ساعت.');
    await expect(hour).toHaveValue('1,000');
    await expect(day).toHaveValue('3,000');
    expect(await settingOf('otp.site_hourly_limit')).toBe(1000);
    expect(await settingOf('otp.site_daily_limit')).toBe(3000);

    // خطای هر فیلد زیر خودش، با نوشته‌ها؛ یکی نادرست یعنی هیچ‌کدام ذخیره نمی‌شود (۲۵۰۰ درست است ولی نمی‌نشیند).
    const tries: [string, string, ('hour' | 'day')[]][] = [
      ['0', '2500', ['hour']],
      ['100001', '3000', ['hour']],
      ['سیصد', '3000', ['hour']],
      ['1000', '1000001', ['day']],
      ['0', '0', ['hour', 'day']],
    ];
    for (const [h, d, bad] of tries) {
      // هر بار از صفحهٔ تازه: پاسخ دیررس بار قبل فرم را بازمی‌نشاند و عدد بعدی را رونویسی می‌کرد (درس CI ۴٫۶).
      await page.goto(at('/settings'));
      await hour.fill(h);
      await day.fill(d);
      await otp.getByRole('button', { name: 'ذخیره' }).click();
      const label = `${h} ${d}`;
      await expect(otp.locator('#s-otp-error'), label).toHaveCount(bad.includes('hour') ? 1 : 0);
      await expect(otp.locator('#s-otp-day-error'), label).toHaveCount(bad.includes('day') ? 1 : 0);
      if (bad.includes('hour')) {
        await expect(otp.locator('#s-otp-error'), label).toHaveText('سقف ساعتی عدد صحیح 1 تا 100,000 باشد.');
        await expect(hour, label).toHaveAttribute('aria-invalid', 'true');
      }
      if (bad.includes('day')) {
        await expect(otp.locator('#s-otp-day-error'), label).toHaveText('سقف 24 ساعته عدد صحیح 1 تا 1,000,000 باشد.');
        await expect(day, label).toHaveAttribute('aria-describedby', 's-otp-day-error s-otp-hint');
      }
      await expect(hour, label).toHaveValue(h);
      await expect(day, label).toHaveValue(d);
    }
    expect(await settingOf('otp.site_hourly_limit')).toBe(1000);
    expect(await settingOf('otp.site_daily_limit')).toBe(3000);

    await page.goto(at('/settings'));
    await hour.fill('300');
    await day.fill('2000');
    await otp.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('سقف کد پیامکی کل سایت ذخیره شد: 300 کد در ساعت و 2,000 کد در 24 ساعت.');
    expect(await settingOf('otp.site_hourly_limit')).toBe(300);
    expect(await settingOf('otp.site_daily_limit')).toBe(2000);
    expect(
      (await settingEvents()).filter((e) => e.target.startsWith('otp.')).map((e) => [e.target, e.detail]),
    ).toEqual([
      ['otp.site_hourly_limit', { key: 'otp.site_hourly_limit', from: 300, to: 1000 }],
      ['otp.site_daily_limit', { key: 'otp.site_daily_limit', from: 2000, to: 3000 }],
      ['otp.site_hourly_limit', { key: 'otp.site_hourly_limit', from: 1000, to: 300 }],
      ['otp.site_daily_limit', { key: 'otp.site_daily_limit', from: 3000, to: 2000 }],
    ]);
    expect(ownerProblems).toEqual([]);
  });

  test('اعتبار پیامک: آستانهٔ هشدار به روز مصرف، شمارنده، خطای بازهٔ 1 تا 90، و رویداد (۷٫۱، سؤال ۱۳۷)', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const credit = card(page, 'sms.credit_alert_days');
    const field = page.getByRole('spinbutton', { name: 'هشدار پیشخوان وقتی اعتبار کمتر از این شد (روز مصرف)' });
    await credit.getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(field).toHaveValue('8');
    await credit.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('آستانهٔ هشدار اعتبار پیامک ذخیره شد: 8 روز مصرف.');
    expect(await settingOf('sms.credit_alert_days')).toBe(8);
    for (const bad of ['0', '91']) {
      await page.goto(at('/settings'));
      await field.fill(bad);
      await credit.getByRole('button', { name: 'ذخیره' }).click();
      await expect(credit.locator('.jy-error'), bad).toHaveText('روز مصرف عدد صحیح 1 تا 90 باشد.');
      await expect(field, bad).toHaveValue(bad);
    }
    expect(await settingOf('sms.credit_alert_days')).toBe(8);
    await page.goto(at('/settings'));
    await credit.getByRole('button', { name: 'یکی کمتر' }).click();
    await credit.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('آستانهٔ هشدار اعتبار پیامک ذخیره شد: 7 روز مصرف.');
    expect((await settingEvents()).filter((e) => e.target === 'sms.credit_alert_days').map((e) => e.detail)).toEqual([
      { key: 'sms.credit_alert_days', from: 7, to: 8 },
      { key: 'sms.credit_alert_days', from: 8, to: 7 },
    ]);
    expect(ownerProblems).toEqual([]);
  });

  test('فایل‌های سفارش: شمارنده، خطای بازهٔ ۷ تا ۳۶۵، و رویداد با قبل و بعد (برش ۵٫۱، ADR-044)', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const keep = card(page, 'order.files_retention_days');
    await keep.getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(keepField(page)).toHaveValue('31');
    await keep.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('روزهای نگهداری فایل‌های سفارش ذخیره شد: 31 روز. کارگر در دور بعدش با همین پاک می‌کند.');
    expect(await settingOf('order.files_retention_days')).toBe(31);
    // بیرون از بازه، هر دو سو: خطا زیر همان فیلد، با عدد نوشته‌شده؛ چیزی ذخیره نمی‌شود. پایین‌تر از ۷ روز فایل سفارشی را
    // که تازه به پست رسیده و شاید گم شود، زود می‌برد.
    for (const bad of ['6', '366']) {
      await page.goto(at('/settings'));
      await keepField(page).fill(bad);
      await keep.getByRole('button', { name: 'ذخیره' }).click();
      await expect(keep.locator('.jy-error'), bad).toHaveText('روز نگهداری عدد صحیح 7 تا 365 باشد.');
      await expect(keepField(page), bad).toHaveAttribute('aria-invalid', 'true');
      await expect(keepField(page), bad).toHaveValue(bad);
    }
    expect(await settingOf('order.files_retention_days')).toBe(31);
    await page.goto(at('/settings'));
    await keep.getByRole('button', { name: 'یکی کمتر' }).click();
    await keep.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toContainText('ذخیره شد: 30 روز.');
    expect(await settingOf('order.files_retention_days')).toBe(30);
    expect((await settingEvents()).filter((e) => e.target === 'order.files_retention_days').map((e) => e.detail)).toEqual([
      { key: 'order.files_retention_days', from: 30, to: 31 },
      { key: 'order.files_retention_days', from: 31, to: 30 },
    ]);
    expect(ownerProblems).toEqual([]);
  });

  test('تعطیلی‌ها: افزودن با ارقام فارسی، خطا با جایش، تکراری با مناسبت، حذف (گذشته هم) بی اثر بر مهلت سفارش‌ها، و تطبیق با تقویم رسمی', async () => {
    const page = ownerPage;
    const orders = await deadlines();
    const count = (await holidays()).length;
    const day = await freeDay(40);
    const [y, m, d] = day.split('/').map(Number);
    await page.goto(at('/settings'));
    const form = page.getByRole('form', { name: 'افزودن تعطیلی' });
    const date = form.getByLabel('تاریخ');
    const title = form.getByLabel('مناسبت');

    await date.fill(toPersianDigits(`${y}/${m}/${d}`));
    await title.fill(`  روز آزمایش  ${RUN} `);
    await form.getByRole('button', { name: 'افزودن' }).click();
    await expect(successIn(page, '#holidays')).toHaveText(`تعطیلی ${day} افزوده شد.`);
    const added = await holidays();
    expect(added).toHaveLength(count + 1);
    expect(added.find((h) => h.date === day)).toEqual({ date: day, title: `روز آزمایش ${RUN}` });
    expect(added.map((h) => h.date)).toEqual([...added.map((h) => h.date)].sort());
    await expect(page.locator(`#holidays li[data-date="${day}"]`)).toHaveCount(1);

    // خطاها زیر همان فیلد، با نوشته‌ها.
    const tries: [string, string, string, 'date' | 'title'][] = [
      [day, 'دوباره', `${day} همین حالا در فهرست است: روز آزمایش ${RUN}.`, 'date'],
      [formatJalaliNumeric(new Date()), 'امروز', 'فقط روزهای بعد از امروز؛ امروز و گذشته روی مهلت هیچ سفارشی اثر ندارند.', 'date'],
      ['1405/12/30', 'کبیسه نیست', 'این روز در تقویم نیست.', 'date'],
      ['فردا', 'x', 'تاریخ را به شکل 1406/03/25 بنویس.', 'date'],
      [`${jalaliYear(new Date()) + 2}/01/01`, 'دور', `فقط تا پایان ${jalaliYear(new Date()) + 1}؛ تعطیلی‌های سال بعدش را با آمدن ${jalaliYear(new Date()) + 1} وارد کن.`, 'date'],
      [await freeDay(60), ' ', 'مناسبت را بنویس (حداکثر 100 نویسه).', 'title'],
    ];
    for (const [value, name, message, where] of tries) {
      await date.fill(value);
      await title.fill(name);
      await form.getByRole('button', { name: 'افزودن' }).click();
      const field = where === 'date' ? date : title;
      await expect(form.locator(`#${where === 'date' ? 's-hd' : 's-ht'}-error`), value).toHaveText(message);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(date).toHaveValue(value);
    }
    expect(await holidays()).toHaveLength(count + 1);

    // حذف همان، و یک روز گذشته؛ مهلت سفارش‌های ثبت‌شده همان می‌ماند. روز تازه شاید زیر «همه را ببین» است.
    if (await page.locator('[data-days="rest"] li[data-date="' + day + '"]').count()) await page.locator('[data-days="rest"] summary').click();
    await page.locator(`#holidays li[data-date="${day}"]`).getByRole('button', { name: `حذف ${day}` }).click();
    await expect(successIn(page, '#holidays')).toHaveText(`تعطیلی ${day} حذف شد.`);
    expect((await holidays()).some((h) => h.date === day)).toBe(false);
    const past = holidaysView(await holidays(), 1405, new Date()).past[0];
    if (past) {
      await page.locator('[data-days="past"] summary').click();
      await page.locator(`[data-days="past"] li[data-date="${past.date}"]`).getByRole('button', { name: `حذف ${past.date}` }).click();
      await expect(successIn(page, '#holidays')).toHaveText(`تعطیلی ${past.date} حذف شد.`);
      expect((await holidays()).some((h) => h.date === past.date)).toBe(false);
    }
    expect(await deadlines()).toEqual(orders);

    // تطبیق با تقویم رسمی: هشدار پیش‌بینی می‌رود.
    const year = holidaysView(await holidays(), 1405, new Date()).unconfirmedYear!;
    await page.getByRole('button', { name: `با تقویم رسمی ${year} تطبیق دادم` }).click();
    await expect(successIn(page, '#holidays')).toHaveText(`تعطیلی‌های ${year} با تقویم رسمی تطبیق‌داده‌شده ثبت شد.`);
    await expect(page.locator('[data-note="unconfirmed"]')).toHaveCount(0);
    expect(await settingOf('calendar.official_through')).toBe(year);

    const events = (await settingEvents()).filter((e) => e.action !== 'settings.update' || e.target === 'calendar.official_through');
    expect(events.map((e) => [e.action, e.detail])).toEqual([
      ['settings.holiday_add', { date: day, title: `روز آزمایش ${RUN}` }],
      ['settings.holiday_remove', { date: day, title: `روز آزمایش ${RUN}` }],
      ...(past ? [['settings.holiday_remove', { date: past.date, title: past.title }]] : []),
      ['settings.update', { key: 'calendar.official_through', from: 1405, to: year }],
    ]);
    expect(ownerProblems).toEqual([]);
  });

  test('کلیدها: کلید API «آزمایش و ذخیره» (رد شد بی کد، در دسترس نیست و «بی آزمایش ذخیره کن»)، «آزمایش» مقدار امروز و کارت اعتبار، قالب با پیامک آزمایشی پیش از ذخیره، کد تازه، فقط ۴ نویسهٔ آخر، «همین حالا عوض شد» پیش از کد، و برگرداندن به .env', async () => {
    test.setTimeout(240_000);
    const page = ownerPage;
    await smsirMock.configure({ keys: [PROBE, PROBE2, ...(ENV_KEY ? [ENV_KEY] : [])], templates: TEMPLATES, credit: CREDIT, cost: 1 });
    await smsirMock.reset();
    await page.goto(at('/settings'));
    const api = keyRow(page, 'SMS_API_KEY');
    await api.getByRole('link', { name: ENV_KEY ? 'تغییر' : 'وارد کن' }).click();
    await expect(page).toHaveURL(/[?&]key=SMS_API_KEY/);
    const value = api.getByLabel('کلید تازه');
    const code = api.getByLabel('کد برنامهٔ تأیید تو');
    const save = api.getByRole('button', { name: 'آزمایش و ذخیره' });
    await expect(value).toHaveAttribute('type', 'password');
    await expect(value).toHaveAttribute('autocomplete', 'off');
    // «بی آزمایش ذخیره کن» فقط پس از «در دسترس نیست»، نه پیش از آزمایش و نه با «رد شد» (پایین).
    const skip = api.getByRole('button', { name: 'بی آزمایش ذخیره کن' });
    await expect(skip).toHaveCount(0);
    await expect(api.locator('.jy-hint').first()).toHaveText(
      'پیش از ذخیره با خود sms.ir آزموده می‌شود: اعتبار حساب، بی پیامک و بی هزینه. «رد شد» ذخیره نمی‌شود. بعد از ذخیره فقط 4 نویسهٔ آخرش دیده می‌شود.',
    );

    // مقدار نادرست پیش از آزمایش و کد: نه درخواستی به sms.ir، نه کد مصرف.
    const failures = await codeFailures();
    await value.fill('دو کلمه');
    await code.fill('000000');
    await save.click();
    await expect(api.locator('#k-SMS_API_KEY-error')).toHaveText('کلید API همان رشتهٔ پنل sms.ir است: نویسهٔ لاتین، رقم و نشانه، بی فاصله، دست‌کم 8 نویسه.');
    expect(await codeFailures()).toBe(failures);

    // کلیدی که sms.ir نمی‌شناسد: «رد شد» با کد پاسخ، ذخیره نمی‌شود، و کد را نمی‌سنجد.
    await value.fill(`${PROBE}x`);
    await code.fill('000000');
    await save.click();
    await expect(api.locator('[data-key-note="rejected"]')).toHaveText(
      'رد شد: sms.ir این کلید را نپذیرفت (کد 401)، پس کلید تازه ذخیره نشد. کلید را از پنل sms.ir دوباره بردار و بیازما.',
    );
    await expect(value).toHaveValue('');
    await expect(skip).toHaveCount(0);
    expect(await codeFailures()).toBe(failures);
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);

    // کد نادرست: آزمایش درست بود ولی هیچ نوشته نمی‌شود، و فیلد کلید خالی برمی‌گردد (مقدار هرگز از سرور برنمی‌گردد).
    await value.fill(PROBE);
    await code.fill('000000');
    await save.click();
    await expect(api.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    await expect(value).toHaveValue('');
    expect(await codeFailures()).toBe(failures + 1);
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);

    await value.fill(PROBE);
    await code.fill(await codeFor(ownerSecret));
    await save.click();
    await expect(successIn(page, '#keys')).toHaveText('«کلید API sms.ir» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(api.locator('.jy-badge')).toHaveText('از پنل');
    await expect(api.locator('.ad-mask')).toHaveText(`••••••••${PROBE.slice(-4)}`);
    await expect(api.locator('.ad-keys__meta')).toContainText(`سارا رضایی، ${formatJalaliNumeric(new Date())}`);
    await expect(api.locator('.ad-keys__test')).toHaveText(new RegExp(`^درست · پیش از ذخیرهٔ ${TODAY} sms\\.ir پذیرفت، اعتبار 184,200\\.$`));
    await expect(api.getByRole('link', { name: 'برگرداندن به .env' })).toBeVisible();
    expect((await html(page)).includes(PROBE)).toBe(false);
    const [row] = await sql<{ sealed: string; updated_by: string | null }[]>`SELECT sealed, updated_by FROM service_secrets WHERE name = 'SMS_API_KEY'`;
    expect(row!.sealed.startsWith('v1.')).toBe(true);
    expect(row!.sealed.includes(PROBE)).toBe(false);
    expect(row!.updated_by).not.toBeNull();

    // «آزمایش» مقدار امروز، بی کد: اعتبار همین حالا؛ کارت «اعتبار پیامک» همان عدد را از آخرین آزمایش نشان می‌دهد، بی «تومان».
    await api.getByRole('button', { name: 'آزمایش' }).click();
    await expect(successIn(page, '#keys')).toHaveText(new RegExp(`^«کلید API sms\\.ir»: درست · آزمایش ${TODAY}: sms\\.ir پذیرفت، اعتبار 184,200\\.$`));
    const credit = card(page, 'sms.credit_alert_days');
    await expect(credit.locator('.ad-credit .num')).toHaveText('184,200');
    await expect(credit.locator('.ad-credit small')).toHaveText('اعتبار sms.ir');
    await expect(credit.locator('.jy-card__meta')).toHaveText(/^آخرین «آزمایش» کلید API، ساعت \d\d:\d\d$/);
    await expect(credit.locator('.ad-usage')).toHaveText(/^(برای حدود \d+ روز با مصرف هفتهٔ گذشته|هفتهٔ گذشته پیامکی با sms\.ir نرفت)/);
    expect((await html(page)).includes('تومان</small>')).toBe(false);

    // sms.ir جواب نداد: «در دسترس نیست»، ذخیره نمی‌شود و کد را نمی‌سنجد؛ «بی آزمایش ذخیره کن» همان کلید را، دوباره واردشده، با رسید
    // همان آزمایش می‌پذیرد.
    await smsirMock.configure({ drop: 1 });
    await page.goto(at('/settings?key=SMS_API_KEY'));
    await value.fill(PROBE2);
    await code.fill('000000');
    await save.click();
    await expect(api.locator('[data-key-note="unavailable"]')).toHaveText(
      'در دسترس نیست: sms.ir جواب نداد، پس مقدار تازه آزموده و ذخیره نشد. کمی بعد دوباره بیازما، یا بی آزمایش ذخیره کن و بعد با «آزمایش» بسنجش. مقدار پس از هر پاسخ پاک می‌شود؛ دوباره واردش کن.',
    );
    await expect(api.locator('.jy-hint').first()).toHaveText('کلید پس از هر پاسخ پاک می‌شود و به مرورگر برنمی‌گردد؛ دوباره واردش کن.');
    await expect(api.getByRole('button', { name: 'دوباره آزمایش و ذخیره' })).toBeVisible();
    await expect(value).toHaveValue('');
    expect(await codeFailures()).toBe(failures + 1);
    await value.fill(PROBE2);
    await code.fill(await codeFor(ownerSecret));
    await skip.click();
    await expect(successIn(page, '#keys')).toHaveText('«کلید API sms.ir» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(api.locator('.ad-mask')).toHaveText(`••••••••${PROBE2.slice(-4)}`);
    await expect(api.locator('.ad-keys__test')).toHaveText(new RegExp(`^آزموده نشد · ${TODAY} بی آزمایش ذخیره شد، چون sms\\.ir جواب نداد\\. با «آزمایش» بسنجش\\.$`));

    // دو زبانه: زبانهٔ دیگر «وارد کن» قالب را باز کرده، این یکی زودتر واردش می‌کند؛ آن یکی پیش از سنجش کد رد می‌شود.
    const other = await ownerContext.newPage();
    const otherProblems = watch(other);
    await other.goto(at('/settings?key=SMS_OTP_TEMPLATE'));
    await expect(keyRow(other, 'SMS_OTP_TEMPLATE').getByLabel('شناسهٔ قالب')).toBeVisible();
    await page.goto(at('/settings?key=SMS_OTP_TEMPLATE'));
    const template = keyRow(page, 'SMS_OTP_TEMPLATE');
    const send = template.getByRole('button', { name: 'پیامک آزمایشی بفرست' });
    // «ذخیره» پیش از پیامک آزمایشی نیست؛ شناسهٔ نادرست یا موبایل نادرست خطا زیر همان فیلد، بی پیامک.
    await expect(template.getByRole('button', { name: 'ذخیره' })).toHaveCount(0);
    await template.getByLabel('شناسهٔ قالب').fill('jozveyar-otp');
    await template.getByLabel('موبایل برای پیامک آزمایشی').fill('09123456789');
    await send.click();
    await expect(template.locator('#kt-SMS_OTP_TEMPLATE-error')).toHaveText('شناسهٔ قالب عدد است، همان که پنل sms.ir کنار قالب تأییدشده نشان می‌دهد.');
    await expect(template.getByLabel('موبایل برای پیامک آزمایشی')).toHaveValue('09123456789');
    await template.getByLabel('شناسهٔ قالب').fill(toPersianDigits(TPL.otp));
    await template.getByLabel('موبایل برای پیامک آزمایشی').fill('0912');
    await send.click();
    await expect(template.locator('#kt-SMS_OTP_TEMPLATE-tel-error')).toHaveText('شمارهٔ موبایل درست نیست؛ 11 رقم است و با 09 شروع می‌شود.');
    expect((await smsirMock.messages()).messages).toEqual([]);
    // درست: یک پیامک آزمایشی با پارامتر نمونه به همان شماره؛ بعد «ذخیره» با کد تازه.
    await template.getByLabel('موبایل برای پیامک آزمایشی').fill('۰۹۱۲۳۴۵۶۷۸۹');
    await send.click();
    await expect(template.locator('[data-key-note="sent"]')).toContainText(
      'پیامک آزمایشی رفت (sms.ir پذیرفت) به 0912 ••• 6789. روی گوشی ببین همین رسیده: «کد تأیید جزوه‌یار: 48213',
    );
    expect((await smsirMock.messages()).messages.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      ['09123456789', Number(TPL.otp), [{ name: 'CODE', value: '48213' }]],
    ]);
    await template.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await template.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«شناسهٔ قالب کد تأیید» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(template.locator('.jy-badge')).toHaveText('از پنل');
    await expect(template.locator('.ad-keys__meta > .num')).toHaveText(TPL.otp);
    await expect(template.locator('.ad-keys__test')).toHaveText(new RegExp(`^درست · پیش از ذخیرهٔ ${TODAY} پیامک آزمایشی رفت\\.$`));

    // زبانهٔ کهنه: پیامک آزمایشی‌اش می‌رود، ولی «ذخیره» پیش از سنجش کد رد می‌شود.
    const stale = keyRow(other, 'SMS_OTP_TEMPLATE');
    await stale.getByLabel('شناسهٔ قالب').fill(TPL.otp);
    await stale.getByLabel('موبایل برای پیامک آزمایشی').fill('09123456789');
    await stale.getByRole('button', { name: 'پیامک آزمایشی بفرست' }).click();
    await expect(stale.locator('[data-key-note="sent"]')).toBeVisible();
    await stale.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await stale.getByRole('button', { name: 'ذخیره' }).click();
    await expect(alertOf(other)).toHaveText('این کلید همین حالا جای دیگری عوض شد؛ وضعیت تازه را ببین و اگر هنوز لازم است، دوباره بزن.');
    await expect(keyRow(other, 'SMS_OTP_TEMPLATE').locator('.jy-badge')).toHaveText('از پنل');
    expect(await codeFailures()).toBe(failures + 1);
    expect(otherProblems).toEqual([]);
    await other.close();

    // «آزمایش» شناسهٔ امروز: پیامک آزمایشی به موبایلی که همین‌جا وارد می‌شود، بی کد؛ نتیجه کنار همان کلید.
    await page.goto(at('/settings'));
    await template.getByRole('link', { name: 'آزمایش' }).click();
    await expect(page).toHaveURL(/[?&]test=SMS_OTP_TEMPLATE/);
    await template.getByLabel('موبایل برای پیامک آزمایشی').fill('09351234567');
    await template.getByRole('button', { name: 'پیامک آزمایشی بفرست' }).click();
    await expect(successIn(page, '#keys')).toHaveText(new RegExp(`^«شناسهٔ قالب کد تأیید»: درست · پیامک آزمایشی ${TODAY} به 0935 ••• 4567 رفت\\.$`));
    await expect(template.locator('.ad-keys__test')).toHaveText(new RegExp(`^درست · پیامک آزمایشی ${TODAY} به 0935 ••• 4567 رفت\\.$`));
    expect((await smsirMock.messages()).messages.map((m) => m.mobile)).toEqual(['09123456789', '09123456789', '09351234567']);

    // برگرداندن به .env: کلید API به .env، و قالب (که .env ندارد) به خالی؛ خط آزمایش مقدار قبلی می‌رود.
    await page.goto(at('/settings'));
    await api.getByRole('link', { name: 'برگرداندن به .env' }).click();
    await expect(api.locator('.jy-note--warning')).toHaveText(
      ENV_KEY
        ? `مقدار پنل پاک می‌شود و از این لحظه مقدار .env به کار می‌رود (••••••••${ENV_KEY.length >= 8 ? ENV_KEY.slice(-4) : ''}). مقدار پنل دیگر برنمی‌گردد، مگر دوباره واردش کنی.`
        : 'مقدار پنل پاک می‌شود و .env این کلید را ندارد؛ پس از این، کلید خالی است.',
    );
    await code.fill(await codeFor(ownerSecret));
    await api.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toContainText('«کلید API sms.ir» به .env برگشت');
    await expect(api.locator('.jy-badge')).toHaveText(ENV_KEY ? 'از .env' : 'خالی');
    await expect(api.locator('.ad-keys__test')).toHaveCount(0);
    await page.goto(at('/settings?revert=SMS_OTP_TEMPLATE'));
    await expect(template.locator('.jy-note--warning')).toHaveText('مقدار پنل پاک می‌شود و .env این کلید را ندارد؛ پس از این، کلید خالی است.');
    await template.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await template.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«شناسهٔ قالب کد تأیید» به .env برگشت؛ .env این کلید را ندارد و کلید خالی است.');
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);

    // رویدادها: هر آزمایش با نتیجه و عدد پاسخ، ذخیره با نتیجهٔ آزمایش پیش از آن؛ موبایل پوشیده، هرگز مقدار کلید.
    const masked = { mobile: '0912 ••• 6789' };
    expect((await settingEvents()).filter((e) => e.action.startsWith('settings.key_')).map((e) => [e.action, e.detail])).toEqual([
      ['settings.key_test', { name: 'SMS_API_KEY', subject: 'new', outcome: 'rejected', http: 401, status: 401 }],
      ['settings.key_test', { name: 'SMS_API_KEY', subject: 'new', outcome: 'ok', credit: CREDIT }],
      ['settings.key_test', { name: 'SMS_API_KEY', subject: 'new', outcome: 'ok', credit: CREDIT }],
      ['settings.key_set', { name: 'SMS_API_KEY', from: ENV_KEY ? 'env' : 'empty', tested: 'ok', credit: CREDIT }],
      ['settings.key_test', { name: 'SMS_API_KEY', subject: 'current', outcome: 'ok', credit: CREDIT }],
      ['settings.key_test', { name: 'SMS_API_KEY', subject: 'new', outcome: 'unavailable' }],
      ['settings.key_set', { name: 'SMS_API_KEY', from: 'panel', tested: 'skipped' }],
      ['settings.key_test', { name: 'SMS_OTP_TEMPLATE', subject: 'new', outcome: 'ok', ...masked }],
      ['settings.key_set', { name: 'SMS_OTP_TEMPLATE', from: 'empty', tested: 'ok' }],
      ['settings.key_test', { name: 'SMS_OTP_TEMPLATE', subject: 'new', outcome: 'ok', ...masked }],
      ['settings.key_test', { name: 'SMS_OTP_TEMPLATE', subject: 'current', outcome: 'ok', mobile: '0935 ••• 4567' }],
      ['settings.key_revert', { name: 'SMS_API_KEY', to: ENV_KEY ? 'env' : 'empty' }],
      ['settings.key_revert', { name: 'SMS_OTP_TEMPLATE', to: 'empty' }],
    ]);
    const events = JSON.stringify(await sql`SELECT * FROM admin_events WHERE id > ${eventsBefore}`);
    for (const secret of [PROBE, PROBE2, '09123456789', '09351234567']) expect(events.includes(secret)).toBe(false);

    // صفحهٔ رویدادها: چیپ «تنظیمات و کلیدها»، بی مقدار.
    await page.goto(at('/events?kind=settings'));
    await expect(page.getByRole('link', { name: 'تنظیمات و کلیدها' })).toHaveAttribute('aria-current', 'page');
    const log = page.locator('.ad-log');
    await expect(log.first()).toContainText('کلید «کلید API sms.ir» به .env برگشت');
    await expect(log.first()).toContainText(`کلید «کلید API sms.ir»، آزموده ${ENV_KEY ? 'عوض شد' : 'وارد شد'}`);
    await expect(log.first()).toContainText('کلید «کلید API sms.ir»، بی آزمایش عوض شد');
    await expect(log.first()).toContainText('کلید «کلید API sms.ir» (مقدار تازه) آزمایش شد: رد شد (کد 401)');
    await expect(log.first()).toContainText('کلید «شناسهٔ قالب کد تأیید» پس از پیامک آزمایشی وارد شد');
    await expect(log.first()).toContainText('کلید «شناسهٔ قالب کد تأیید» آزمایش شد با پیامک به 0935 ••• 4567: درست');
    await expect(log.first()).toContainText('روز کاری تحویل به پست: 3 ← 4');
    await expect(log.first()).toContainText('سقف ساعتی کد پیامکی کل سایت: 300 ← 1,000');
    await expect(log.first()).toContainText('سقف کد پیامکی کل سایت در 24 ساعت: 2,000 ← 3,000');
    await expect(log.first()).toContainText('هشدار اعتبار پیامک (روز مصرف): 7 ← 8');
    await expect(log.first()).toContainText('روزهای نگهداری فایل‌های سفارش: 30 ← 31');
    for (const secret of [PROBE, PROBE2]) expect((await html(page)).includes(secret)).toBe(false);
    expect(ownerProblems).toEqual([]);
  });

  test('مقدار پنلی که با SECRETS_KEY امروز باز نمی‌شود: «خوانده نشد»، نه .env و نه خالی؛ و گوشی و دسکتاپ بی سرریز و با هدف لمسی ۴۴ پیکسل', async ({ browser }) => {
    // مهروموم به شکل درست ولی با کلید دیگر (مثل `.env`ی که بی پشتیبان از نو ساخته شد).
    const sealed = `v1.${randomBytes(12).toString('base64url')}.${randomBytes(40).toString('base64url')}`;
    await sql`INSERT INTO service_secrets (name, sealed, updated_at) VALUES ('PAYMENT_MERCHANT_ID', ${sealed}, now())`;
    const page = ownerPage;
    await page.goto(at('/settings'));
    const merchant = keyRow(page, 'PAYMENT_MERCHANT_ID');
    await expect(merchant.locator('.jy-badge')).toHaveText('خوانده نشد');
    await expect(merchant.locator('.ad-keys__meta')).toContainText('با SECRETS_KEY امروز باز نمی‌شود؛ دوباره واردش کن، یا به .env برگردان.');

    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const view = await context.newPage();
      const problems = watch(view);
      for (const path of ['/settings', '/settings?all', '/settings?key=SMS_API_KEY', '/settings?key=SMS_PAID_TEMPLATE', '/settings?revert=PAYMENT_MERCHANT_ID']) {
        await view.goto(at(path.replace('?all', '')));
        if (path.endsWith('?all')) {
          await view.locator('[data-days="rest"] summary').click();
          await view.locator('[data-days="past"] summary').click();
          await view.getByRole('form', { name: 'افزودن تعطیلی' }).getByRole('button', { name: 'افزودن' }).click();
          await expect(view.locator('#s-hd-error')).toBeVisible();
        }
        const { overflow, small, blank } = await layoutProblems(view);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }

    // برگرداندن کلیدی که خوانده نشد، با کد تازه.
    await page.goto(at('/settings?revert=PAYMENT_MERCHANT_ID'));
    await merchant.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await merchant.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toContainText('«کد پذیرندهٔ زیبال» به .env برگشت');
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);
    expect(ownerProblems).toEqual([]);
  });
});
