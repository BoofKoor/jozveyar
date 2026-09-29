import { randomBytes, randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric, jalaliYear, tehranDayStart, toPersianDigits } from '@jozveyar/text';

import { holidaysView } from '../lib/settings';
import { alertOf, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * تنظیمات و کلیدها در پنل، سرتاسری (برش ۴٫۶؛ طرح `docs/ui/mockups/admin.html` حالت‌های `m-settings` و `m-key-edit`، ADR-041):
 * فقط مالک؛ روز کاری تحویل به پست با شمارنده و سایت (وب روی ۳۱۰۱) با ISR تا یک دقیقه؛ سقف ساعتی کد پیامکی؛ روزهای نگهداری
 * فایل‌های سفارش (برش ۵٫۱، ADR-044)؛ تعطیلی‌ها با افزودن و حذف و «با تقویم رسمی تطبیق دادم»؛ و کلیدهای سرویس‌ها با کد تازه،
 * فقط ۴ نویسهٔ آخر، و «برگرداندن به .env».
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، و برای سایت `E2E_WEB_BASE_URL=http://127.0.0.1:3101`. کلید
 * `.env` پنل همان `SMS_API_KEY` محیط همین اجراست (CI تصادفی می‌سازد)، و مقداری که تست از پنل وارد می‌کند `E2E_KEY_PROBE`
 * (وگرنه تصادفی)؛ CI پس از اجرا لاگ پنل و وب را برای هر دو می‌جوید. هیچ سنجشی مقدار کلید را چاپ نمی‌کند (فقط درست و نادرست).
 * در پایان تنظیم‌ها همان پیش از تست‌اند و کلیدهای پنل پاک.
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const DAY = 86_400_000;
const NO_ACCESS = 'این بخش فقط برای مالک است';
/** مقداری که مالک برای کلید API کاوه‌نگار وارد می‌کند. */
const PROBE = env.E2E_KEY_PROBE?.trim() || randomBytes(20).toString('hex');
/** همان `.env` پنل. */
const ENV_KEY = env.SMS_API_KEY?.trim() ?? '';
const SETTING_KEYS = ['order.sla_days', 'otp.site_hourly_limit', 'order.files_retention_days', 'calendar.holidays', 'calendar.official_through'];

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
    test.setTimeout(180_000);
    // «امروز» و روزهای آینده به روز تهران: نزدیک نیمه‌شب تهران، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 5 * 60_000) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`DELETE FROM service_secrets`;
    // اجرای قبلی که وسط کار افتاد: پیش‌فرض‌های عددی دوباره (تعطیلی‌ها همان که هست).
    await sql`UPDATE settings SET value = '2' WHERE key = 'order.sla_days'`;
    await sql`UPDATE settings SET value = '300' WHERE key = 'otp.site_hourly_limit'`;
    await sql`UPDATE settings SET value = '30' WHERE key = 'order.files_retention_days'`;
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

  test('متصدی نه زبانه دارد، نه صفحه («فقط مالک» با متن طرح)؛ مالک پنج کارت با عددهای پایگاه داده، و کلید .env فقط با ۴ نویسهٔ آخر', async () => {
    await operatorPage.goto(at());
    await expect(operatorPage.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link')).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'تعرفه']);
    await operatorPage.goto(at('/settings'));
    await expect(operatorPage.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    await expect(operatorPage.locator('.ad-noaccess .ad-lead')).toHaveText(
      'تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، تنظیمات، کلیدها، چاپخانه‌ها، ادمین‌ها، رویدادها و برگرداندن ورود فایل پست با مالک پنل است.',
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
    await expect(card(page, 'otp.site_hourly_limit').getByRole('heading')).toHaveText('سقف کد پیامکی');
    await expect(page.getByLabel('کد در ساعت، برای کل سایت')).toHaveValue('300');
    await expect(card(page, 'otp.site_hourly_limit').locator('.jy-hint')).toHaveText(
      'جلوی رباتی که با شماره‌ها و اینترنت‌های زیاد پیامک می‌فرستد. سقف هر شماره (5) و هر اینترنت (20) ثابت است.',
    );
    // نگهداری فایل‌های سفارش (۵٫۱): پیش‌فرض ۳۰ روز.
    await expect(card(page, 'order.files_retention_days').getByRole('heading')).toHaveText('فایل‌های سفارش');
    await expect(keepField(page)).toHaveValue('30');
    await expect(card(page, 'order.files_retention_days').locator('.jy-hint')).toHaveText(
      'PDF جزوه، فایل چاپ و برگه بعد از این پاک می‌شوند تا دیسک پر نشود؛ تا آن موقع اگر بسته گم شد، دوباره چاپ می‌شود. سفارش باز هرگز. مشخصات و رویدادها می‌مانند.',
    );

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
      'کلیدها رمزشده نگه داشته می‌شوند و کاملشان دیگر نشان داده نمی‌شود. مقدار پنل بر مقدار .env مقدم است. سایت از این کلیدها با راه افتادن درگاه و پنل پیامک واقعی استفاده می‌کند.',
    );
    await expect(keys.locator('.ad-keys__name')).toHaveText(['کلید API کاوه‌نگار', 'قالب کد پیامکی کاوه‌نگار', 'کد پذیرندهٔ زیبال']);
    const api = keyRow(page, 'SMS_API_KEY');
    if (ENV_KEY) {
      await expect(api.locator('.jy-badge')).toHaveText('از .env');
      await expect(api.locator('.ad-mask')).toHaveText(`••••••••${ENV_KEY.length >= 8 ? ENV_KEY.slice(-4) : ''}`);
      await expect(api.getByRole('link', { name: 'تغییر' })).toBeVisible();
      expect((await html(page)).includes(ENV_KEY)).toBe(false);
    }
    await expect(keyRow(page, 'SMS_OTP_TEMPLATE').locator('.jy-badge')).toHaveText('خالی');
    await expect(keyRow(page, 'SMS_OTP_TEMPLATE').locator('.ad-keys__meta')).toContainText('نام قالبی که در پنل کاوه‌نگار تأیید می‌شود');
    await expect(keyRow(page, 'SMS_OTP_TEMPLATE').getByRole('link', { name: 'وارد کن' })).toBeVisible();
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

  test('سقف ساعتی کد پیامکی: ارقام فارسی با جداکننده، و خطای بازه', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const field = page.getByLabel('کد در ساعت، برای کل سایت');
    await field.fill('۱٬۰۰۰');
    await card(page, 'otp.site_hourly_limit').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toHaveText('سقف ساعتی کد پیامکی کل سایت ذخیره شد: 1,000 کد در ساعت.');
    await expect(field).toHaveValue('1000');
    expect(await settingOf('otp.site_hourly_limit')).toBe(1000);
    for (const bad of ['0', '100001', 'سیصد']) {
      // هر بار از صفحهٔ تازه: خطای این سه یک متن است، و خطای بار قبل پیش از پاسخ سرور هم دیده می‌شد؛ پاسخ دیررس بعد فرم را
      // بازمی‌نشاند و عدد بعدی را رونویسی می‌کرد (درس CI ۴٫۶).
      await page.goto(at('/settings'));
      await field.fill(bad);
      await card(page, 'otp.site_hourly_limit').getByRole('button', { name: 'ذخیره' }).click();
      await expect(card(page, 'otp.site_hourly_limit').locator('.jy-error'), bad).toHaveText('سقف عدد صحیح 1 تا 100,000 باشد.');
      await expect(field, bad).toHaveValue(bad);
    }
    expect(await settingOf('otp.site_hourly_limit')).toBe(1000);
    await field.fill('300');
    await card(page, 'otp.site_hourly_limit').getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '.ad-flash')).toContainText('300 کد در ساعت.');
    expect(await settingOf('otp.site_hourly_limit')).toBe(300);
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

  test('کلیدها: کد تازه، فقط ۴ نویسهٔ آخر، مقدار نه در صفحه و نه در پایگاه داده و رویداد؛ «همین حالا عوض شد» پیش از کد؛ برگرداندن به .env', async () => {
    const page = ownerPage;
    await page.goto(at('/settings'));
    const api = keyRow(page, 'SMS_API_KEY');
    await api.getByRole('link', { name: ENV_KEY ? 'تغییر' : 'وارد کن' }).click();
    await expect(page).toHaveURL(/[?&]key=SMS_API_KEY/);
    const value = api.getByLabel('کلید تازه');
    await expect(value).toHaveAttribute('type', 'password');
    await expect(value).toHaveAttribute('autocomplete', 'off');
    await expect(api.locator('.jy-hint').first()).toHaveText('بعد از ذخیره فقط 4 نویسهٔ آخرش دیده می‌شود. آزمایش کلید با خود پنل پیامک واقعی می‌آید.');

    // مقدار نادرست پیش از کد: نه کد مصرف می‌شود، نه «کد نادرست».
    const failures = await codeFailures();
    await value.fill('دو کلمه');
    await api.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await api.getByRole('button', { name: 'ذخیره' }).click();
    await expect(api.locator(`#k-SMS_API_KEY-error`)).toHaveText('فقط نویسهٔ لاتین، رقم و نشانه، بی فاصله؛ حداکثر 512 نویسه.');
    expect(await codeFailures()).toBe(failures);

    // کد نادرست: هیچ نوشته نمی‌شود، و فیلد کلید خالی برمی‌گردد (مقدار هرگز از سرور برنمی‌گردد).
    await value.fill(PROBE);
    await api.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await api.getByRole('button', { name: 'ذخیره' }).click();
    await expect(api.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    await expect(value).toHaveValue('');
    expect(await codeFailures()).toBe(failures + 1);
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);

    await value.fill(PROBE);
    await api.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await api.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«کلید API کاوه‌نگار» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    await expect(api.locator('.jy-badge')).toHaveText('از پنل');
    await expect(api.locator('.ad-mask')).toHaveText(`••••••••${PROBE.slice(-4)}`);
    await expect(api.locator('.ad-keys__meta')).toContainText(`سارا رضایی، ${formatJalaliNumeric(new Date())}`);
    await expect(api.getByRole('link', { name: 'برگرداندن به .env' })).toBeVisible();
    expect((await html(page)).includes(PROBE)).toBe(false);
    const [row] = await sql<{ sealed: string; updated_by: string | null }[]>`SELECT sealed, updated_by FROM service_secrets WHERE name = 'SMS_API_KEY'`;
    expect(row!.sealed.startsWith('v1.')).toBe(true);
    expect(row!.sealed.includes(PROBE)).toBe(false);
    expect(row!.updated_by).not.toBeNull();
    expect(JSON.stringify(await sql`SELECT * FROM admin_events WHERE id > ${eventsBefore}`).includes(PROBE)).toBe(false);

    // دو زبانه: زبانهٔ دیگر «وارد کن» قالب را باز کرده، این یکی زودتر واردش می‌کند؛ آن یکی پیش از سنجش کد رد می‌شود.
    const other = await ownerContext.newPage();
    const otherProblems = watch(other);
    await other.goto(at('/settings?key=SMS_OTP_TEMPLATE'));
    await expect(keyRow(other, 'SMS_OTP_TEMPLATE').getByLabel('نام قالب')).toBeVisible();
    await page.goto(at('/settings?key=SMS_OTP_TEMPLATE'));
    const template = keyRow(page, 'SMS_OTP_TEMPLATE');
    await template.getByLabel('نام قالب').fill('jozveyar-otp');
    await template.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await template.getByRole('button', { name: 'ذخیره' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«قالب کد پیامکی کاوه‌نگار» ذخیره شد؛ از این لحظه مقدار پنل به کار می‌رود.');
    const stale = keyRow(other, 'SMS_OTP_TEMPLATE');
    await stale.getByLabel('نام قالب').fill('another-template');
    await stale.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await stale.getByRole('button', { name: 'ذخیره' }).click();
    await expect(alertOf(other)).toHaveText('این کلید همین حالا جای دیگری عوض شد؛ وضعیت تازه را ببین و اگر هنوز لازم است، دوباره بزن.');
    await expect(keyRow(other, 'SMS_OTP_TEMPLATE').locator('.jy-badge')).toHaveText('از پنل');
    expect(await codeFailures()).toBe(failures + 1);
    expect(otherProblems).toEqual([]);
    await other.close();

    // برگرداندن به .env: کلید API به .env، و قالب (که .env ندارد) به خالی.
    await page.goto(at('/settings'));
    await api.getByRole('link', { name: 'برگرداندن به .env' }).click();
    await expect(api.locator('.jy-note--warning')).toHaveText(
      ENV_KEY
        ? `مقدار پنل پاک می‌شود و از این لحظه مقدار .env به کار می‌رود (••••••••${ENV_KEY.length >= 8 ? ENV_KEY.slice(-4) : ''}). مقدار پنل دیگر برنمی‌گردد، مگر دوباره واردش کنی.`
        : 'مقدار پنل پاک می‌شود و .env این کلید را ندارد؛ پس از این، کلید خالی است.',
    );
    await api.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await api.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toContainText('«کلید API کاوه‌نگار» به .env برگشت');
    await expect(api.locator('.jy-badge')).toHaveText(ENV_KEY ? 'از .env' : 'خالی');
    await page.goto(at('/settings?revert=SMS_OTP_TEMPLATE'));
    await expect(template.locator('.jy-note--warning')).toHaveText('مقدار پنل پاک می‌شود و .env این کلید را ندارد؛ پس از این، کلید خالی است.');
    await template.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await template.getByRole('button', { name: 'به .env برگردان' }).click();
    await expect(successIn(page, '#keys')).toHaveText('«قالب کد پیامکی کاوه‌نگار» به .env برگشت؛ .env این کلید را ندارد و کلید خالی است.');
    expect((await sql`SELECT 1 FROM service_secrets`).length).toBe(0);

    expect((await settingEvents()).filter((e) => e.action.startsWith('settings.key_')).map((e) => [e.action, e.detail])).toEqual([
      ['settings.key_set', { name: 'SMS_API_KEY', from: ENV_KEY ? 'env' : 'empty' }],
      ['settings.key_set', { name: 'SMS_OTP_TEMPLATE', from: 'empty' }],
      ['settings.key_revert', { name: 'SMS_API_KEY', to: ENV_KEY ? 'env' : 'empty' }],
      ['settings.key_revert', { name: 'SMS_OTP_TEMPLATE', to: 'empty' }],
    ]);

    // صفحهٔ رویدادها: چیپ «تنظیمات و کلیدها»، بی مقدار.
    await page.goto(at('/events?kind=settings'));
    await expect(page.getByRole('link', { name: 'تنظیمات و کلیدها' })).toHaveAttribute('aria-current', 'page');
    const log = page.locator('.ad-log');
    await expect(log.first()).toContainText('کلید «کلید API کاوه‌نگار» به .env برگشت');
    await expect(log.first()).toContainText(`کلید «کلید API کاوه‌نگار» ${ENV_KEY ? 'عوض شد' : 'وارد شد'}`);
    await expect(log.first()).toContainText('کلید «قالب کد پیامکی کاوه‌نگار» وارد شد');
    await expect(log.first()).toContainText('روز کاری تحویل به پست: 3 ← 4');
    await expect(log.first()).toContainText('سقف ساعتی کد پیامکی کل سایت: 300 ← 1,000');
    await expect(log.first()).toContainText('روزهای نگهداری فایل‌های سفارش: 30 ← 31');
    expect((await html(page)).includes(PROBE)).toBe(false);
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
      for (const path of ['/settings', '/settings?all', '/settings?key=SMS_API_KEY', '/settings?revert=PAYMENT_MERCHANT_ID']) {
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
