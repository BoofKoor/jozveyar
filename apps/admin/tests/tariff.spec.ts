import { randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import { draftLabel } from '../lib/tariff';
import { alertOf, at, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * تعرفه در پنل، سرتاسری (برش ۴٫۵؛ طرح `docs/ui/mockups/admin.html` حالت‌های `m-tariff*`، ADR-040 و ADR-022): نسخه‌ها و
 * نسخهٔ فعال فقط‌خواندنی برای هر دو نقش، پیش‌نویس از روی نسخهٔ فعال (فقط مالک)، ویرایش با «نسخهٔ فعال: …» و پیش‌نمایش
 * چهار جزوهٔ طرح با همان `quote()`، سنجش با پیام دقیق طرح و «اول خطا را درست کن»، فعال کردن در صفحهٔ جدا با کد تازه،
 * برگشت با فعال کردن دوبارهٔ نسخهٔ قبل، و «همین حالا عوض شد» با پیام روشن. سایت (وب روی ۳۱۰۱، همان پایگاه داده) نسخهٔ
 * تازه را با ISR تا یک دقیقه نشان می‌دهد.
 *
 * همان پنل و پایگاه دادهٔ `admin.spec.ts` (طرز اجرا بالای همان)، و برای سایت `E2E_WEB_BASE_URL=http://127.0.0.1:3101`.
 * تعرفهٔ فعال را عوض می‌کند، پس آخرین فایل پنل است (ترتیب نام) و در پایان نسخهٔ ۱ دوباره فعال است، هر جا که افتاده باشد.
 */

const env = process.env;
const WEB = env.E2E_WEB_BASE_URL;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون E2E_ADMIN_BASE_URL، ADMIN_BASE_PATH و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const NO_ACCESS = 'این بخش فقط برای مالک است';

let sql: postgres.Sql;
/** رویدادهای پیش از این اجرا (رویدادها فقط افزودنی‌اند؛ اجرای دوباره روی همان پایگاه داده). */
let eventsBefore = 0;

/** نسخهٔ فعال، و نسخهٔ ۱ دوباره فعال (پایان تست، یا اجرای قبلی که وسط کار افتاد)؛ پیش‌نویس‌ها پاک. */
async function restoreBase() {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM price_lists WHERE activated_at IS NULL`;
    await tx`UPDATE price_lists SET is_active = false WHERE is_active AND version <> 1`;
    await tx`UPDATE price_lists SET is_active = true WHERE version = 1 AND NOT is_active`;
  });
}

const activeVersion = async () => (await sql<{ version: number }[]>`SELECT version FROM price_lists WHERE is_active`)[0]?.version;
const tariffEvents = async () =>
  sql<{ action: string; detail: Record<string, unknown> }[]>`
    SELECT action, detail FROM admin_events WHERE target_type = 'price_list' AND id > ${eventsBefore} ORDER BY id`;
const orderCount = async (version: number) =>
  Number((await sql<{ n: string }[]>`SELECT count(*) AS n FROM orders WHERE price_list_version = ${version}`)[0]!.n);
/** سفارش‌های ثبت‌شده، همان که هست: نسخه و مبلغ منجمد (قاعدهٔ ۶). */
const frozenOrders = async () =>
  sql<{ id: string; v: number; total: string }[]>`SELECT id, price_list_version AS v, total_rials AS total FROM orders ORDER BY id`;

/** نسخهٔ تعرفهٔ JSON درون HTML صفحهٔ اصلی سایت (`#jy-tariff`، ۴٫۴). */
async function siteVersion(): Promise<number | null> {
  const html = await (await fetch(`${WEB}/`)).text();
  const json = /<script[^>]*id="jy-tariff"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  return json ? (JSON.parse(json) as { priceList: { version: number } }).priceList.version : null;
}

/** شمارهٔ نسخه از سرصفحهٔ ویرایشگر یا فعال‌سازی: «نسخهٔ 2»، «فعال کردن نسخهٔ 2». */
const versionIn = async (page: Page) => Number(/(\d+)\s*$/.exec(await page.getByRole('heading', { level: 1 }).innerText())![1]);

const rowOf = (page: Page, version: number) => page.locator(`.ad-versions li[data-version="${version}"]`);
const bar = (page: Page) => page.locator('.ad-bar');
const note = (page: Page) => page.locator('.ad-bar__note[data-note]');
const bandInput = (page: Page, row: number, part: 'از برگ' | 'تا برگ' | 'قیمت') =>
  page.locator(`tr[data-band="${row}"]`).getByLabel(part, { exact: true });
/** خطوط «تغییرها»ی صفحهٔ فعال‌سازی: [چه، از ← به]. */
const changesOf = (page: Page) =>
  page.locator('[data-changes] li').evaluateAll((items) => items.map((li) => [...li.children].map((cell) => (cell.textContent ?? '').trim())));
const cells = (page: Page, selector: string) =>
  page.locator(`${selector} tbody tr`).evaluateAll((rows) => rows.map((row) => [...row.children].map((cell) => (cell.textContent ?? '').trim())));

test.describe.serial('تعرفه در پنل', () => {
  const owner = `sara${RUN}`;
  const operator = `ali${RUN}`;
  let ownerSecret = '';
  let ownerContext: BrowserContext;
  let ownerPage: Page;
  let ownerProblems: string[] = [];
  let operatorContext: BrowserContext;
  let operatorPage: Page;
  let operatorProblems: string[] = [];
  /** نسخهٔ پیش‌نویس اول، که فعال می‌شود؛ شماره از خود صفحه (اجرای دوباره روی همان پایگاه داده شمارهٔ دیگری دارد). */
  let first = 0;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // «امروز 10:48» و نام ماه پیش‌نویس: نزدیک نیمه‌شب تهران، تست تا روز تازه صبر می‌کند.
    const toMidnight = tehranDayStart(new Date(), 1).getTime() - Date.now();
    if (toMidnight < 3 * MINUTE) await new Promise((resolve) => setTimeout(resolve, toMidnight + 5_000));
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await restoreBase();
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);

    ownerContext = await newContext(browser);
    ownerPage = await ownerContext.newPage();
    ownerProblems = watch(ownerPage);
    ownerSecret = await enroll(ownerPage, serverInvite(owner, '--name', 'سارا رضایی'));
    operatorContext = await newContext(browser);
    operatorPage = await operatorContext.newPage();
    operatorProblems = watch(operatorPage);
    await enroll(operatorPage, serverInvite(operator, '--operator', '--name', 'علی محمدی'));
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await operatorContext?.close();
    if (sql) {
      await restoreBase();
      await sql.end();
    }
  });

  test('هر دو نقش نسخه‌ها و نسخهٔ فعال را فقط‌خواندنی می‌بینند؛ «نسخهٔ تازه» و فعال کردن فقط با مالک', async () => {
    const [v1] = await sql<{ at: Date }[]>`SELECT activated_at AS at FROM price_lists WHERE version = 1`;
    const orders = await orderCount(1);
    for (const page of [ownerPage, operatorPage]) {
      await page.goto(at('/tariff'));
      await expect(page.getByRole('heading', { name: 'تعرفه', level: 1 })).toBeVisible();
      await expect(page.locator('.ad-sub')).toHaveText('هر تغییر، نسخهٔ تازه است؛ سفارش ثبت‌شده همیشه با نسخهٔ خودش می‌ماند.');
      const row = rowOf(page, 1);
      await expect(row.locator('.ad-versions__name')).toHaveText('نسخهٔ 1 · تعرفهٔ پایه — شهریور ۱۴۰۵');
      await expect(row.locator('.jy-badge')).toHaveText('فعال');
      await expect(row.locator('.ad-versions__meta')).toHaveText(`فعال از ${formatJalaliNumeric(v1!.at)} · ${orders} سفارش با این نسخه`);
      // همان عددهای طرح پنل (`m-tariff`)، از نسخهٔ فعال پایگاه داده.
      expect(await cells(page, '[data-tariff="print"]')).toEqual([
        ['سیاه‌سفید', '1,600 تومان'],
        ['رنگی', '2,000 تومان'],
        ['کاغذ', 'تحریر ۸۰ گرم'],
      ]);
      await expect(page.locator('[data-tariff="print"]')).toContainText('یکرو و دورو هم‌قیمت‌اند؛ هر رو یک صفحه است.');
      await expect(page.locator('[data-tariff="binding"] h2')).toHaveText('صحافی طلق و سیم');
      expect(await cells(page, '[data-tariff="binding"]')).toEqual([
        ['1 تا 150', '45,000'],
        ['151 تا 300', '50,000'],
        ['301 تا 450', '55,000'],
        ['451 تا 600', '62,000'],
        ['601 تا 700', '68,000'],
        ['701 تا 800', '78,000'],
      ]);
      await expect(page.locator('[data-tariff="binding"]')).toContainText('بالای 800 برگ، جلد تازه.');
      await expect(page.locator('[data-tariff="shipping"] h2')).toHaveText('پست پیشتاز');
      expect(await cells(page, '[data-tariff="shipping"]')).toEqual([
        ['تا 1 کیلو', '129,500', '137,750'],
        ['1 تا 3 کیلو', '150,000', '161,812'],
        ['بالای 3 کیلو', '200,000', '207,200'],
      ]);
      await expect(page.locator('[data-tariff="shipping"]')).toContainText('تومان. روش‌های دیگر ارسال خاموش‌اند.');
      expect(await cells(page, '[data-tariff="rest"]')).toEqual([
        ['مالیات', '0٪'],
        ['گرد کردن', 'ندارد'],
        ['حداقل سفارش', 'ندارد'],
        ['وزن بسته‌بندی', '100 گرم'],
      ]);
    }
    await expect(ownerPage.getByRole('button', { name: 'نسخهٔ تازه' })).toBeVisible();
    await expect(operatorPage.getByRole('button', { name: 'نسخهٔ تازه' })).toHaveCount(0);
    // نسخهٔ فعال خود صفحهٔ تعرفه است؛ فعال کردن فقط مالک.
    await operatorPage.goto(at('/tariff/1'));
    await expect(operatorPage).toHaveURL(new RegExp(`${GATE}/tariff$`));
    await operatorPage.goto(at('/tariff/1/activate'));
    await expect(operatorPage.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    await ownerPage.goto(at('/tariff/1/activate'));
    await expect(ownerPage).toHaveURL(new RegExp(`${GATE}/tariff$`));
    await ownerPage.goto(at('/tariff/999999'));
    await expect(ownerPage.getByRole('heading', { name: 'این نسخه پیدا نشد' })).toBeVisible();
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('نسخهٔ تازه از روی نسخهٔ فعال: «نسخهٔ فعال: …»، پیش‌نمایش طرح با quote()، ذخیره؛ یک پیش‌نویس در هر زمان', async () => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    first = await versionIn(ownerPage);
    await expect(ownerPage).toHaveURL(new RegExp(`${GATE}/tariff/${first}$`));
    await expect(ownerPage.locator('.ad-sub')).toHaveText(/^از روی نسخهٔ 1 · سارا رضایی، امروز \d\d:\d\d$/);
    await expect(ownerPage.getByLabel('نام نسخه')).toHaveValue(draftLabel(new Date()));
    const bw = ownerPage.getByLabel('سیاه‌سفید، هر رو (تومان)');
    const color = ownerPage.getByLabel('رنگی، هر رو (تومان)');
    await expect(bw).toHaveValue('1,600');
    await expect(ownerPage.locator('#d-bw-hint')).toHaveText('نسخهٔ فعال: 1,600');
    await expect(ownerPage.locator('#d-color-hint')).toHaveText('نسخهٔ فعال: 2,000');
    await expect(bandInput(ownerPage, 2, 'از برگ')).toHaveValue('301');
    await expect(bandInput(ownerPage, 2, 'قیمت')).toHaveValue('55,000');
    await expect(ownerPage.getByLabel('بقیهٔ کشور، 1 تا 3 کیلو')).toHaveValue('161,812');
    await expect(note(ownerPage)).toHaveText('');
    // بی تغییر، «فعال کن…» پیوند صفحهٔ فعال‌سازی است؛ پیش‌نمایش یکی.
    await expect(bar(ownerPage).getByRole('link', { name: 'فعال کن…' })).toBeVisible();
    expect((await cells(ownerPage, '[data-preview]')).map((row) => row[3])).toEqual(['0', '0', '0', '0']);

    // همان عددهای طرح (`m-tariff-draft`): ورودی تومان با ارقام فارسی هم پذیرفته است.
    await bw.fill('۱۷۰۰');
    await bw.blur();
    await expect(bw).toHaveValue('1,700');
    await color.fill('2,200');
    expect(await cells(ownerPage, '[data-preview]')).toEqual([
      ['147 صفحه، سیاه‌سفید، دورو', '280,200', '294,900', '+14,700'],
      ['120 صفحه، رنگی، دورو', '285,000', '309,000', '+24,000'],
      ['3 فایل، 300 صفحه، یکرو', '530,000', '560,000', '+30,000'],
      ['1,650 صفحه، دو جلد', '2,750,000', '2,915,000', '+165,000'],
    ]);
    await expect(note(ownerPage)).toHaveText('تغییرهای ذخیره‌نشده داری.');
    // Enter در فیلد فرم را نمی‌فرستد (ذخیره و فعال کردن هر کدام دکمهٔ خودشان را دارند).
    await color.press('Enter');
    await ownerPage.waitForTimeout(1_000);
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${first}$`));
    await expect(note(ownerPage)).toHaveText('تغییرهای ذخیره‌نشده داری.');
    const [before] = await sql<{ bw: number }[]>`SELECT click_rate_bw_rials::int AS bw FROM price_lists WHERE version = ${first}`;
    expect(before!.bw).toBe(16_000);

    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${first}\\?saved=1$`));
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    await expect(bw).toHaveValue('1,700');
    const [saved] = await sql<{ bw: number; color: number; activated: Date | null; active: boolean; based: number }[]>`
      SELECT click_rate_bw_rials::int AS bw, click_rate_color_rials::int AS color, activated_at AS activated, is_active AS active, based_on AS based
      FROM price_lists WHERE version = ${first}`;
    // تومان در فرم، ریال در پایگاه داده (قاعدهٔ ۳).
    expect(saved).toEqual({ bw: 17_000, color: 22_000, activated: null, active: false, based: 1 });
    expect(await activeVersion()).toBe(1);

    // یک پیش‌نویس در هر زمان: صفحهٔ تعرفه «ادامهٔ پیش‌نویس» دارد، نه «نسخهٔ تازه».
    await ownerPage.goto(at('/tariff'));
    await expect(ownerPage.getByRole('button', { name: 'نسخهٔ تازه' })).toHaveCount(0);
    await expect(ownerPage.locator('.ad-pagehead').getByRole('link', { name: 'ادامهٔ پیش‌نویس' })).toHaveAttribute(
      'href',
      new RegExp(`/tariff/${first}$`),
    );
    const row = rowOf(ownerPage, first);
    await expect(row.locator('.jy-badge')).toHaveText('پیش‌نویس');
    await expect(row.locator('.ad-versions__meta')).toHaveText(/^از روی نسخهٔ 1 · سارا رضایی، امروز \d\d:\d\d$/);
    // متصدی پیش‌نویس را در فهرست می‌بیند، ولی بازش نمی‌کند.
    await operatorPage.goto(at('/tariff'));
    await expect(rowOf(operatorPage, first).locator('.jy-badge')).toHaveText('پیش‌نویس');
    await expect(rowOf(operatorPage, first).getByRole('link')).toHaveCount(0);
    for (const path of [`/tariff/${first}`, `/tariff/${first}/activate`]) {
      await operatorPage.goto(at(path));
      await expect(operatorPage.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    }
    expect((await tariffEvents()).map((e) => [e.action, e.detail])).toEqual([
      ['tariff.draft', { version: first, from: 1 }],
      ['tariff.draft_save', { version: first }],
    ]);
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('سنجش: شکاف با پیام طرح و «اول خطا را درست کن»، هشدار ده برابر؛ سرور هم رد می‌کند؛ افزودن و حذف بازه', async () => {
    await ownerPage.goto(at(`/tariff/${first}`));
    const from = bandInput(ownerPage, 2, 'از برگ');
    await from.fill('302');
    // همان پیام طرح (`m-tariff-invalid`)، زیر همان ردیف، و فیلد نامعتبر.
    const gap = ownerPage.locator('tr[data-band-issues="2"] .jy-error');
    await expect(gap).toHaveText('برگ 301 قیمت ندارد: بازهٔ قبلی تا 300 است. «از» را 301 کن.');
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    const gapId = await gap.getAttribute('id');
    expect(gapId).toBeTruthy();
    await expect(from).toHaveAttribute('aria-describedby', gapId!);
    await expect(ownerPage.locator('[data-preview]')).toHaveCount(0);
    await expect(ownerPage.getByText('تا خطای صحافی درست نشود، پیش‌نمایش حساب نمی‌شود.')).toBeVisible();
    const blocked = bar(ownerPage).getByRole('button', { name: 'اول خطا را درست کن' });
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    await expect(bar(ownerPage).getByRole('button', { name: 'فعال کن…' })).toHaveCount(0);

    // هشدار، نه خطا: «شاید ریال نوشته‌ای».
    const bw = ownerPage.getByLabel('سیاه‌سفید، هر رو (تومان)');
    await bw.fill('17,000');
    await expect(ownerPage.locator('#d-bw-warn')).toHaveText('17,000 تومان؟ بیش از ده برابر نسخهٔ فعال (1,600) است؛ شاید ریال نوشته‌ای.');
    await expect(bw).not.toHaveAttribute('aria-invalid', 'true');

    // سرور منبع حقیقت است: پیش‌نویس با خطا ذخیره نمی‌شود.
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس خطا دارد؛ اول خطا را درست کن.');
    const [row] = await sql<{ bw: number }[]>`SELECT click_rate_bw_rials::int AS bw FROM price_lists WHERE version = ${first}`;
    expect(row!.bw).toBe(17_000);

    await from.fill('301');
    await bw.fill('1,700');
    await expect(ownerPage.locator('#d-bw-warn')).toHaveCount(0);
    await expect(ownerPage.locator('[data-preview]')).toBeVisible();

    // بازهٔ تازه: ردیف خالی نادیده است؛ بالای سقف جلد خطاست؛ حذفش همه را برمی‌گرداند.
    await ownerPage.getByRole('button', { name: 'افزودن بازه' }).click();
    const added = bandInput(ownerPage, 6, 'از برگ');
    await expect(added).toBeFocused();
    await expect(bar(ownerPage).getByRole('button', { name: 'اول خطا را درست کن' })).toHaveCount(0);
    await added.fill('801');
    await bandInput(ownerPage, 6, 'تا برگ').fill('900');
    await bandInput(ownerPage, 6, 'قیمت').fill('90,000');
    await expect(ownerPage.locator('tr[data-band-issues="6"] .jy-error')).toHaveText('بالای 800 برگ جلد تازه است: «تا»ی آخرین بازه 800 باشد.');
    await expect(blocked).toBeVisible();
    await ownerPage.locator('tr[data-band="6"]').getByRole('button', { name: 'حذف این بازه' }).click();
    await expect(ownerPage.locator('tr[data-band]')).toHaveCount(6);
    await expect(ownerPage.locator('.jy-error')).toHaveCount(0);
    await expect(ownerPage.locator('[data-preview]')).toBeVisible();
    // فرم همان ذخیره‌شده است: «فعال کن…» پیوند.
    await expect(note(ownerPage)).toHaveText('');
    await expect(bar(ownerPage).getByRole('link', { name: 'فعال کن…' })).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('فعال کردن در صفحهٔ جدا با کد تازه: تغییرها، کد نادرست همان‌جا؛ سفارش ثبت‌شده منجمد؛ سایت تا یک دقیقه', async () => {
    test.setTimeout(240_000);
    const orders = await frozenOrders();
    // ویرایشگری که پیش از فعال شدن باز ماند.
    const stale = await ownerContext.newPage();
    await stale.goto(at(`/tariff/${first}`));

    await ownerPage.goto(at(`/tariff/${first}`));
    await bar(ownerPage).getByRole('link', { name: 'فعال کن…' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${first}/activate$`));
    await expect(ownerPage.getByRole('heading', { level: 1 })).toHaveText(`فعال کردن نسخهٔ ${first}`);
    await expect(ownerPage.locator('.ad-back')).toHaveText(`نسخهٔ ${first}`);
    // همان خطوط طرح (`m-tariff-activate`).
    expect(await changesOf(ownerPage)).toEqual([
      ['چاپ سیاه‌سفید، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ رنگی، هر رو', '2,000 ← 2,200 تومان'],
      ['صحافی، پست و بقیه', 'بی تغییر'],
    ]);
    await expect(ownerPage.locator('.jy-note--info')).toHaveText(
      `از همین لحظه، سفارش‌های تازه با نسخهٔ ${first} قیمت می‌خورند و صفحهٔ اصلی سایت تا یک دقیقه تعرفهٔ تازه را نشان می‌دهد. سفارش‌های ثبت‌شده همان قیمت خودشان را دارند.`,
    );
    await expect(ownerPage.locator('.ad-hint').last()).toHaveText('نسخهٔ فعال‌شده دیگر ویرایش نمی‌شود. برای برگشت، نسخهٔ 1 را دوباره فعال کن.');

    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await activeVersion()).toBe(1);

    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff\\?done=${first}$`));
    await expect(ownerPage.locator('[data-flash]')).toHaveText(
      `نسخهٔ ${first} فعال شد. سفارش‌های تازه با همین نسخه قیمت می‌خورند و صفحهٔ اصلی سایت تا یک دقیقه تعرفهٔ تازه را نشان می‌دهد.`,
    );
    await expect(rowOf(ownerPage, first).locator('.jy-badge')).toHaveText('فعال');
    await expect(rowOf(ownerPage, first).locator('.ad-versions__meta')).toHaveText(new RegExp(`^فعال از \\d{4}/\\d\\d/\\d\\d · 0 سفارش با این نسخه$`));
    await expect(rowOf(ownerPage, 1).locator('.jy-badge')).toHaveCount(0);
    await expect(rowOf(ownerPage, 1).locator('.ad-versions__meta')).toHaveText(/^فعال بود \d{4}\/\d\d\/\d\d/);
    await expect(rowOf(ownerPage, 1).getByRole('link', { name: 'دوباره فعال کن…' })).toBeVisible();
    expect(await cells(ownerPage, '[data-tariff="print"]')).toEqual([
      ['سیاه‌سفید', '1,700 تومان'],
      ['رنگی', '2,200 تومان'],
      ['کاغذ', 'تحریر ۸۰ گرم'],
    ]);

    const [row] = await sql<{ active: boolean; activated: Date | null }[]>`
      SELECT is_active AS active, activated_at AS activated FROM price_lists WHERE version = ${first}`;
    expect(row!.active).toBe(true);
    expect(row!.activated).not.toBeNull();
    expect((await tariffEvents()).at(-1)).toEqual({ action: 'tariff.activate', detail: { version: first, previous: 1, again: false } });
    // سفارش ثبت‌شده همان نسخه و مبلغ خودش را دارد.
    expect(await frozenOrders()).toEqual(orders);

    // نسخهٔ فعال‌شده دیگر پیش‌نویس نیست: ویرایشگر کهنه ذخیره نمی‌کند؛ صفحه‌اش خود صفحهٔ تعرفه است.
    await stale.getByLabel('رنگی، هر رو (تومان)').fill('2,300');
    await bar(stale).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(stale)).toHaveText('این نسخه دیگر پیش‌نویس نیست: فعال شده و ویرایش نمی‌شود. برای تغییر، نسخهٔ تازه بساز.');
    await stale.close();
    const [kept] = await sql<{ color: number }[]>`SELECT click_rate_color_rials::int AS color FROM price_lists WHERE version = ${first}`;
    expect(kept!.color).toBe(22_000);
    await ownerPage.goto(at(`/tariff/${first}`));
    await expect(ownerPage).toHaveURL(new RegExp(`${GATE}/tariff$`));

    // سایت: صفحهٔ اصلی با ISR ۶۰ ثانیه، همان پایگاه داده (۴٫۴).
    if (WEB) await expect.poll(siteVersion, { timeout: 150_000, intervals: [2_000] }).toBe(first);
    else test.info().annotations.push({ type: 'skip', description: 'بی E2E_WEB_BASE_URL، سایت سنجیده نشد' });
    expect(ownerProblems).toEqual([]);
  });

  test('برگشت: نسخهٔ 1 دوباره فعال می‌شود، با کد تازه؛ دوره‌ها در فهرست و رویدادها', async () => {
    await ownerPage.goto(at('/tariff'));
    await rowOf(ownerPage, 1).getByRole('link', { name: 'دوباره فعال کن…' }).click();
    await expect(ownerPage.getByRole('heading', { level: 1 })).toHaveText('فعال کردن دوبارهٔ نسخهٔ 1');
    expect(await changesOf(ownerPage)).toEqual([
      ['چاپ سیاه‌سفید، هر رو', '1,700 ← 1,600 تومان'],
      ['چاپ رنگی، هر رو', '2,200 ← 2,000 تومان'],
      ['صحافی، پست و بقیه', 'بی تغییر'],
    ]);
    await expect(ownerPage.locator('.ad-hint').last()).toHaveText(`برای برگشت، نسخهٔ ${first} را دوباره فعال کن.`);
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage).toHaveURL(/\/tariff\?done=1$/);
    expect(await activeVersion()).toBe(1);
    await expect(rowOf(ownerPage, 1).locator('.ad-versions__meta')).toHaveText(
      /^فعال از \d{4}\/\d\d\/\d\d، و پیش‌تر \d{4}\/\d\d\/\d\d(، \d\d:\d\d)? تا (\d{4}\/\d\d\/\d\d|\d\d:\d\d) · \d+ سفارش با این نسخه$/,
    );
    await expect(rowOf(ownerPage, first).locator('.ad-versions__meta')).toHaveText(
      /^فعال بود \d{4}\/\d\d\/\d\d(، \d\d:\d\d تا \d\d:\d\d| تا \d{4}\/\d\d\/\d\d) · 0 سفارش با این نسخه$/,
    );
    expect((await tariffEvents()).at(-1)).toEqual({ action: 'tariff.activate', detail: { version: 1, previous: first, again: true } });

    // نسخهٔ قبل، فقط‌خواندنی برای هر دو نقش؛ «دوباره فعال کن…» فقط مالک.
    for (const page of [ownerPage, operatorPage]) {
      await page.goto(at(`/tariff/${first}`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`نسخهٔ ${first} · ${draftLabel(new Date())}`);
      expect(await cells(page, '[data-tariff="print"]')).toEqual([
        ['سیاه‌سفید', '1,700 تومان'],
        ['رنگی', '2,200 تومان'],
        ['کاغذ', 'تحریر ۸۰ گرم'],
      ]);
      await expect(page.getByRole('textbox')).toHaveCount(0);
    }
    await expect(ownerPage.getByRole('link', { name: 'دوباره فعال کن…' })).toBeVisible();
    await expect(operatorPage.getByRole('link', { name: 'دوباره فعال کن…' })).toHaveCount(0);

    // رویدادها: همهٔ کارهای تعرفه، بی مقدار.
    await ownerPage.goto(at('/events?kind=tariff'));
    const lines = ownerPage.locator('.ad-log li');
    await expect(lines.nth(0)).toContainText(`نسخهٔ 1 تعرفه دوباره فعال شد، به جای نسخهٔ ${first}`);
    await expect(lines.nth(1)).toContainText(`نسخهٔ ${first} تعرفه فعال شد، به جای نسخهٔ 1`);
    await expect(lines.nth(2)).toContainText(`پیش‌نویس نسخهٔ ${first} تعرفه ذخیره شد`);
    await expect(lines.nth(3)).toContainText(`پیش‌نویس نسخهٔ ${first} تعرفه ساخته شد، از روی نسخهٔ 1`);
    expect(ownerProblems).toEqual([]);
    expect(operatorProblems).toEqual([]);
  });

  test('همین حالا عوض شد: پیش‌نویسی که جای دیگر ذخیره شد رونویسی نمی‌شود؛ پاک کردن با «پاک شود؟»', async () => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    const draft = await versionIn(ownerPage);
    expect(draft).toBe(first + 1);
    const other = await ownerContext.newPage();
    await other.goto(at(`/tariff/${draft}`));

    await ownerPage.getByLabel('سیاه‌سفید، هر رو (تومان)').fill('1,650');
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    await other.getByLabel('رنگی، هر رو (تومان)').fill('2,100');
    await bar(other).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(other)).toHaveText(
      'پیش‌نویس همین حالا جای دیگری ذخیره شد. صفحه را دوباره باز کن تا تازه‌ترینش را ببینی؛ تغییرهای این صفحه ذخیره نشد.',
    );
    const [row] = await sql<{ bw: number; color: number }[]>`
      SELECT click_rate_bw_rials::int AS bw, click_rate_color_rials::int AS color FROM price_lists WHERE version = ${draft}`;
    expect(row).toEqual({ bw: 16_500, color: 20_000 });
    await other.reload();
    await expect(other.getByLabel('سیاه‌سفید، هر رو (تومان)')).toHaveValue('1,650');
    await other.close();

    // پاک کردن: اول «پاک شود؟»، و «انصراف» برمی‌گرداند.
    await bar(ownerPage).getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    await expect(bar(ownerPage).locator('.ad-bar__note')).toHaveText(`پیش‌نویس نسخهٔ ${draft} با همهٔ تغییرهایش پاک شود؟`);
    await bar(ownerPage).getByRole('button', { name: 'انصراف' }).click();
    await expect(bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' })).toBeVisible();
    await bar(ownerPage).getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    await bar(ownerPage).getByRole('button', { name: 'پیش‌نویس را پاک کن' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff\\?deleted=${draft}$`));
    await expect(ownerPage.locator('[data-flash]')).toHaveText(`پیش‌نویس نسخهٔ ${draft} پاک شد.`);
    await expect(rowOf(ownerPage, draft)).toHaveCount(0);
    expect(await sql`SELECT 1 FROM price_lists WHERE version = ${draft}`).toHaveLength(0);
    expect((await tariffEvents()).at(-1)).toEqual({ action: 'tariff.draft_delete', detail: { version: draft } });
    // پیش‌نویسی که نیست.
    await ownerPage.goto(at(`/tariff/${draft}`));
    await expect(ownerPage.getByRole('heading', { name: 'این نسخه پیدا نشد' })).toBeVisible();
    expect(ownerProblems).toEqual([]);
  });

  test('فعال کردن نسبت به نسخهٔ فعالی که دیگر فعال نیست: پیام روشن پیش از سنجش کد، نه ۵۰۰؛ بعد نسخهٔ 1 دوباره', async () => {
    test.setTimeout(180_000);
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    // شمارهٔ پیش‌نویس پاک‌شده دوباره به کار می‌رود.
    const draft = await versionIn(ownerPage);
    expect(draft).toBe(first + 1);
    await ownerPage.getByLabel('رنگی، هر رو (تومان)').fill('2,100');
    await bar(ownerPage).getByRole('button', { name: 'فعال کن…' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${draft}/activate$`));
    // زبانهٔ دیگر: برگشت به نسخهٔ اول، نسبت به نسخهٔ 1 که الان فعال است.
    const other = await ownerContext.newPage();
    const otherProblems = watch(other);
    await other.goto(at(`/tariff/${first}/activate`));
    await expect(other.getByRole('heading', { level: 1 })).toHaveText(`فعال کردن دوبارهٔ نسخهٔ ${first}`);

    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff\\?done=${draft}$`));
    expect(await activeVersion()).toBe(draft);

    // کد این‌جا حتی سنجیده نمی‌شود: کاری که انجام‌شدنی نیست کد را هدر نمی‌دهد و «کد نادرست» نمی‌شمارد.
    const failedBefore = (await sql`SELECT 1 FROM admin_events WHERE action = 'auth.code_failed'`).length;
    await other.getByLabel('کد برنامهٔ تأیید تو').fill('000000');
    await other.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(other).toHaveURL(new RegExp(`/tariff/${first}/activate\\?e=tariff_changed$`));
    await expect(alertOf(other)).toHaveText('تعرفهٔ فعال یا این نسخه همین حالا عوض شد؛ تغییرها را دوباره ببین و اگر هنوز لازم است، دوباره فعال کن.');
    expect((await sql`SELECT 1 FROM admin_events WHERE action = 'auth.code_failed'`).length).toBe(failedBefore);
    expect(await activeVersion()).toBe(draft);
    // تغییرها حالا نسبت به نسخهٔ تازهٔ فعال‌اند.
    expect(await changesOf(other)).toEqual([
      ['چاپ سیاه‌سفید، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ رنگی، هر رو', '2,100 ← 2,200 تومان'],
      ['صحافی، پست و بقیه', 'بی تغییر'],
    ]);
    expect(otherProblems).toEqual([]);
    await other.close();

    // پایان: نسخهٔ 1 دوباره فعال، از همان راه.
    await ownerPage.goto(at('/tariff/1/activate'));
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage).toHaveURL(/\/tariff\?done=1$/);
    expect(await activeVersion()).toBe(1);
    expect(ownerProblems).toEqual([]);
  });

  test('گوشی و دسکتاپ: فهرست، پیش‌نویس با خطا، فعال کردن و نسخهٔ قبل، با نام بلند؛ بی سرریز افقی و هدف لمسی ۴۴ پیکسل', async ({ browser }) => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    const draft = await versionIn(ownerPage);
    // نام هرچه ادمین نوشت است: بلندترین بی فاصله، و نشانه‌گذاری HTML که فقط متن است.
    const long = `<b>${'تعرفه‌آزمایشی'.repeat(4)}</b>`.slice(0, 60);
    await ownerPage.getByLabel('نام نسخه').fill(long);
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    await ownerPage.goto(at('/tariff'));
    await expect(rowOf(ownerPage, draft).locator('.ad-versions__name')).toHaveText(`نسخهٔ ${draft} · ${long}`);
    await expect(rowOf(ownerPage, draft).locator('b')).toHaveCount(0);

    for (const width of [320, 390, 1280]) {
      const context = await newContext(browser, { width, height: 800 });
      await context.addCookies(await ownerContext.cookies());
      const page = await context.newPage();
      const problems = watch(page);
      for (const path of [`/tariff`, `/tariff/${draft}`, `/tariff/${draft}?error`, `/tariff/${draft}/activate`, `/tariff/${first}`]) {
        await page.goto(at(path.replace('?error', '')));
        if (path.endsWith('?error')) {
          await bandInput(page, 2, 'از برگ').fill('302');
          await page.getByLabel('سیاه‌سفید، هر رو (تومان)').fill('17,000');
          await expect(page.locator('tr[data-band-issues="2"] .jy-error')).toBeVisible();
        }
        const { overflow, small, blank } = await layoutProblems(page);
        expect(overflow, `${width} ${path}`).toBeLessThanOrEqual(0);
        expect(small, `${width} ${path}`).toEqual([]);
        expect(blank, `${width} ${path}`).toEqual([]);
      }
      expect(problems).toEqual([]);
      await context.close();
    }
    expect(ownerProblems).toEqual([]);
  });
});
