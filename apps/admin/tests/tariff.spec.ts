import { randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric } from '@jozveyar/text';

import { draftLabel } from '../lib/tariff';
import { alertOf, at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch } from './helpers';

/**
 * تعرفه در پنل، سرتاسری (برش ۴٫۵؛ طرح `docs/ui/mockups/admin.html` حالت‌های `m-tariff*`، ADR-040 و ADR-022): نسخه‌ها و
 * نسخهٔ فعال فقط‌خواندنی برای هر دو نقش، پیش‌نویس از روی نسخهٔ فعال (فقط مالک)، ویرایش با «نسخهٔ فعال: …» و پیش‌نمایش
 * چهار جزوهٔ طرح با همان `quote()`، سنجش با پیام دقیق طرح و «اول خطا را درست کن»، فعال کردن در صفحهٔ جدا با کد تازه،
 * برگشت با فعال کردن دوبارهٔ نسخهٔ قبل، و «همین حالا عوض شد» با پیام روشن. سایت (وب روی ۳۱۰۱، همان پایگاه داده) نسخهٔ
 * تازه را با ISR تا یک دقیقه نشان می‌دهد. کاتالوگ (۸٫۳): نرخ یکرو و دورو، A5 با تیک، کاغذ و صحافی تازه با بازه‌های هر
 * اندازه، پیش‌نمایش گزینهٔ تازه با «—» و «تازه»، و همان در پایگاه داده.
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
/** فقط تعرفهٔ پایه هست (CI، پایگاه دادهٔ تازه). */
let fresh = false;

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
/** ردیف بازهٔ یک صحافی در یک اندازه (`spiral_clear.a4`: طلق و سیم، A4). */
const bandInput = (page: Page, row: number, part: 'از برگ' | 'تا برگ' | 'قیمت', table = 'spiral_clear.a4') =>
  page.locator(`[data-bands="${table}"] tr[data-band="${row}"]`).getByLabel(part, { exact: true });
const bandIssue = (page: Page, row: number, table = 'spiral_clear.a4') => page.locator(`[data-bands="${table}"] tr[data-band-issues="${row}"] .jy-error`);
/** فیلد نرخ هر رو: اندازه، یکرو یا دورو، رنگ. */
const rateField = (page: Page, size: 'a4' | 'a5' | 'a3', sides: 'double' | 'single', color: 'bw' | 'color') =>
  page.locator(`#d-print-${size}-${sides}-${color}`);
/** نرخ هر روی یک نسخه در پایگاه داده، ریال: `{ 'a4.double.bw': 16000, … }`. */
async function printRatesOf(version: number): Promise<Record<string, number>> {
  const rows = await sql<{ key: string; rials: number }[]>`
    SELECT paper_size::text || '.' || sides_mode::text || '.' || color_mode::text AS key, rate_rials::int AS rials
      FROM print_rates WHERE price_list_version = ${version} ORDER BY 1`;
  return Object.fromEntries(rows.map((row) => [row.key, row.rials]));
}
/** چهار نرخ A4 یک نسخه، تومان؛ یکرو و دورو یکی. */
const a4Rates = (bw: number, color: number) => ({ 'a4.double.bw': bw * 10, 'a4.double.color': color * 10, 'a4.single.bw': bw * 10, 'a4.single.color': color * 10 });
/** «افزودن بازه» زیر جدول یک صحافی در یک اندازه، و پر کردن ردیف تازه. */
async function addBand(page: Page, table: string, from: string, to: string, price: string) {
  const index = await page.locator(`[data-bands="${table}"] tr[data-band]`).count();
  await page.locator(`.ad-binding-bands:has([data-bands="${table}"])`).getByRole('button', { name: 'افزودن بازه' }).click();
  await expect(bandInput(page, index, 'از برگ', table)).toBeFocused();
  await bandInput(page, index, 'از برگ', table).fill(from);
  await bandInput(page, index, 'تا برگ', table).fill(to);
  await bandInput(page, index, 'قیمت', table).fill(price);
}
/** هر چهار نرخ A4 در ویرایشگر. */
async function fillA4(page: Page, bw: string, color: string) {
  for (const sides of ['double', 'single'] as const) {
    await rateField(page, 'a4', sides, 'bw').fill(bw);
    await rateField(page, 'a4', sides, 'color').fill(color);
  }
}
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
    // «امروز 10:48» و نام ماه پیش‌نویس: نزدیک نیمه‌شب تهران، تست تا روز تازه صبر می‌کند.
    await awayFromMidnight(180_000, 3 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await restoreBase();
    eventsBefore = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]!.id ?? 0);
    fresh = (await sql`SELECT 1 FROM price_lists`).length === 1;

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
      // پایگاه دادهٔ تازه (CI): فقط تعرفهٔ پایه، از زمان نشاندنش. اجرای دوباره روی همان پایگاه داده دوره‌های پیش‌تر هم دارد.
      await expect(row.locator('.ad-versions__meta')).toHaveText(
        fresh
          ? `فعال از ${formatJalaliNumeric(v1!.at)} · ${orders} سفارش با این نسخه`
          : new RegExp(`^فعال( از \\d{4}/\\d\\d/\\d\\d)?(، و پیش‌تر [^·]+)? · ${orders} سفارش با این نسخه$`),
      );
      // همان عددهای طرح پنل (`m-tariff`)، از نسخهٔ فعال پایگاه داده؛ از ۸٫۳ دورو و یکرو هر اندازه جدا.
      expect(await cells(page, '[data-tariff="print"]')).toEqual([
        ['سیاه‌سفید A4', '1,600', '1,600'],
        ['رنگی A4', '2,000', '2,000'],
      ]);
      await expect(page.locator('[data-tariff="print"] .ad-hint')).toHaveText('تومان؛ هر رو یک صفحه است. A5 و A3 ارائه نمی‌شود.');
      expect(await cells(page, '[data-tariff="paper"]')).toEqual([['تحریر ۸۰ گرم', '80', '0']]);
      const spiral = page.locator('[data-tariff="binding"] [data-binding="spiral_clear"]');
      await expect(spiral.locator('h3')).toHaveText('طلق و سیم');
      await expect(spiral.locator('.ad-hint')).toHaveText('هر جلد 1 تا 800 برگ؛ بالاتر چند جلد می‌شود · وزن هر جلد 60 گرم');
      expect(await cells(page, '[data-tariff="binding"]')).toEqual([
        ['1 تا 150', '45,000'],
        ['151 تا 300', '50,000'],
        ['301 تا 450', '55,000'],
        ['451 تا 600', '62,000'],
        ['601 تا 700', '68,000'],
        ['701 تا 800', '78,000'],
      ]);
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
    const bw = rateField(ownerPage, 'a4', 'double', 'bw');
    const color = rateField(ownerPage, 'a4', 'double', 'color');
    await expect(bw).toHaveValue('1,600');
    await expect(ownerPage.getByLabel('سیاه‌سفید یکرو')).toHaveValue('1,600');
    await expect(ownerPage.locator('#d-print-a4-double-bw-hint')).toHaveText('نسخهٔ فعال: 1,600');
    await expect(ownerPage.locator('#d-print-a4-single-color-hint')).toHaveText('نسخهٔ فعال: 2,000');
    // A5 و A3 بی تیک، بی فیلد؛ کاغذ و صحافی پیش‌فرض بی «حذف» و بی «روشن».
    await expect(ownerPage.getByLabel('A5 ارائه می‌شود')).not.toBeChecked();
    await expect(ownerPage.getByLabel('A3 ارائه می‌شود')).not.toBeChecked();
    await expect(ownerPage.locator('[id^="d-print-a5-"], [id^="d-print-a3-"]')).toHaveCount(0);
    const tahrir = ownerPage.locator('[data-paper="tahrir80"]');
    await expect(tahrir.getByLabel('نام کاغذ')).toHaveValue('تحریر ۸۰ گرم');
    await expect(tahrir.getByLabel('هر برگ A4')).toHaveValue('0');
    await expect(tahrir.getByRole('button', { name: 'حذف این کاغذ' })).toHaveCount(0);
    await expect(ownerPage.locator('[data-binding="spiral_clear"]').getByRole('button', { name: 'حذف این صحافی' })).toHaveCount(0);
    await expect(ownerPage.locator('[data-binding="spiral_clear"]').getByLabel('کمینهٔ برگ')).toHaveAttribute('readonly', '');
    await expect(bandInput(ownerPage, 2, 'از برگ')).toHaveValue('301');
    await expect(bandInput(ownerPage, 2, 'قیمت')).toHaveValue('55,000');
    await expect(ownerPage.getByLabel('بقیهٔ کشور، 1 تا 3 کیلو')).toHaveValue('161,812');
    await expect(note(ownerPage)).toHaveText('');
    // بی تغییر، «فعال کن…» پیوند صفحهٔ فعال‌سازی است؛ پیش‌نمایش یکی.
    await expect(bar(ownerPage).getByRole('link', { name: 'فعال کن…' })).toBeVisible();
    expect((await cells(ownerPage, '[data-preview]')).map((row) => row[3])).toEqual(['0', '0', '0', '0']);

    // همان عددهای طرح (`m-tariff-draft`)، با یکرو و دورو هم‌نرخ: ورودی تومان با ارقام فارسی هم پذیرفته است.
    await fillA4(ownerPage, '1,700', '2,200');
    await bw.fill('۱۷۰۰');
    await bw.blur();
    await expect(bw).toHaveValue('1,700');
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
    expect(await printRatesOf(first)).toEqual(a4Rates(1_600, 2_000));

    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${first}\\?saved=1$`));
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    await expect(bw).toHaveValue('1,700');
    const [saved] = await sql<{ activated: Date | null; active: boolean; based: number }[]>`
      SELECT activated_at AS activated, is_active AS active, based_on AS based FROM price_lists WHERE version = ${first}`;
    expect(saved).toEqual({ activated: null, active: false, based: 1 });
    // تومان در فرم، ریال در پایگاه داده (قاعدهٔ ۳).
    expect(await printRatesOf(first)).toEqual(a4Rates(1_700, 2_200));
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
    const gap = bandIssue(ownerPage, 2);
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
    const bw = rateField(ownerPage, 'a4', 'double', 'bw');
    await bw.fill('17,000');
    await expect(ownerPage.locator('#d-print-a4-double-bw-warn')).toHaveText('17,000 تومان؟ بیش از ده برابر نسخهٔ فعال (1,600) است؛ شاید ریال نوشته‌ای.');
    await expect(bw).not.toHaveAttribute('aria-invalid', 'true');

    // سرور منبع حقیقت است: پیش‌نویس با خطا ذخیره نمی‌شود.
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس خطا دارد؛ اول خطا را درست کن.');
    expect(await printRatesOf(first)).toEqual(a4Rates(1_700, 2_200));

    await from.fill('301');
    await bw.fill('1,700');
    await expect(ownerPage.locator('#d-print-a4-double-bw-warn')).toHaveCount(0);
    await expect(ownerPage.locator('[data-preview]')).toBeVisible();

    // بازهٔ تازه: ردیف خالی نادیده است؛ بالای سقف جلد خطاست؛ حذفش همه را برمی‌گرداند.
    await ownerPage.getByRole('button', { name: 'افزودن بازه' }).click();
    const added = bandInput(ownerPage, 6, 'از برگ');
    await expect(added).toBeFocused();
    await expect(bar(ownerPage).getByRole('button', { name: 'اول خطا را درست کن' })).toHaveCount(0);
    await added.fill('801');
    await bandInput(ownerPage, 6, 'تا برگ').fill('900');
    await bandInput(ownerPage, 6, 'قیمت').fill('90,000');
    await expect(bandIssue(ownerPage, 6)).toHaveText('بالای 800 برگ سقف جلد است: «تا»ی آخرین بازه 800 باشد.');
    await expect(blocked).toBeVisible();
    await ownerPage.locator('[data-bands="spiral_clear.a4"] tr[data-band="6"]').getByRole('button', { name: 'حذف این بازه' }).click();
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
    // همان خطوط طرح (`m-tariff-activate`)، از ۸٫۳ برای هر رنگ، رو و اندازه.
    expect(await changesOf(ownerPage)).toEqual([
      ['چاپ سیاه‌سفید، دورو، A4، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ سیاه‌سفید، یکرو، A4، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ رنگی، دورو، A4، هر رو', '2,000 ← 2,200 تومان'],
      ['چاپ رنگی، یکرو، A4، هر رو', '2,000 ← 2,200 تومان'],
      ['کاغذ، صحافی، پست و بقیه', 'بی تغییر'],
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
      ['سیاه‌سفید A4', '1,700', '1,700'],
      ['رنگی A4', '2,200', '2,200'],
    ]);

    const [row] = await sql<{ active: boolean; activated: Date | null }[]>`
      SELECT is_active AS active, activated_at AS activated FROM price_lists WHERE version = ${first}`;
    expect(row!.active).toBe(true);
    expect(row!.activated).not.toBeNull();
    expect((await tariffEvents()).at(-1)).toEqual({ action: 'tariff.activate', detail: { version: first, previous: 1, again: false } });
    // سفارش ثبت‌شده همان نسخه و مبلغ خودش را دارد.
    expect(await frozenOrders()).toEqual(orders);

    // نسخهٔ فعال‌شده دیگر پیش‌نویس نیست: ویرایشگر کهنه ذخیره نمی‌کند؛ صفحه‌اش خود صفحهٔ تعرفه است.
    await rateField(stale, 'a4', 'double', 'color').fill('2,300');
    await bar(stale).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(stale)).toHaveText('این نسخه دیگر پیش‌نویس نیست: فعال شده و ویرایش نمی‌شود. برای تغییر، نسخهٔ تازه بساز.');
    await stale.close();
    expect(await printRatesOf(first)).toEqual(a4Rates(1_700, 2_200));
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
      ['چاپ سیاه‌سفید، دورو، A4، هر رو', '1,700 ← 1,600 تومان'],
      ['چاپ سیاه‌سفید، یکرو، A4، هر رو', '1,700 ← 1,600 تومان'],
      ['چاپ رنگی، دورو، A4، هر رو', '2,200 ← 2,000 تومان'],
      ['چاپ رنگی، یکرو، A4، هر رو', '2,200 ← 2,000 تومان'],
      ['کاغذ، صحافی، پست و بقیه', 'بی تغییر'],
    ]);
    await expect(ownerPage.locator('.ad-hint').last()).toHaveText(`برای برگشت، نسخهٔ ${first} را دوباره فعال کن.`);
    await ownerPage.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await ownerPage.getByRole('button', { name: 'فعال کن', exact: true }).click();
    await expect(ownerPage).toHaveURL(/\/tariff\?done=1$/);
    expect(await activeVersion()).toBe(1);
    await expect(rowOf(ownerPage, 1).locator('.ad-versions__meta')).toHaveText(
      /^فعال از \d{4}\/\d\d\/\d\d، و پیش‌تر \d{4}\/\d\d\/\d\d(، \d\d:\d\d)? تا (\d{4}\/\d\d\/\d\d|\d\d:\d\d)(، [^·]+)? · \d+ سفارش با این نسخه$/,
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
        ['سیاه‌سفید A4', '1,700', '1,700'],
        ['رنگی A4', '2,200', '2,200'],
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

  test('کاتالوگ (۸٫۳): A5 با تیک، کاغذ و صحافی تازه با بازه‌ها، پیش‌نمایش گزینهٔ تازه، و همان در پایگاه داده و «چه عوض می‌شود»', async () => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    const draft = await versionIn(ownerPage);
    expect(draft).toBe(first + 1);

    // A5 با تیک: هرچه لازم دارد خطای جای خودش است؛ برداشتن تیک همه را می‌برد.
    const a5 = ownerPage.getByLabel('A5 ارائه می‌شود');
    await a5.check();
    await expect(ownerPage.locator('#d-print-a5-double-bw-error')).toHaveText('عدد را بنویس.');
    const tahrir = ownerPage.locator('[data-paper="tahrir80"]');
    await expect(tahrir.locator('#d-paper-tahrir80-a5-error')).toHaveText('کاغذ پیش‌فرض نرخ هر اندازه را دارد؛ صفر هم می‌شود.');
    await expect(ownerPage.locator('[data-binding="spiral_clear"] .ad-issues .jy-error')).toHaveText('صحافی پیش‌فرض بازه‌های هر اندازه را دارد.');
    await expect(ownerPage.getByText('تا خطاها درست نشوند، پیش‌نمایش حساب نمی‌شود.')).toBeVisible();
    await a5.uncheck();
    await expect(ownerPage.locator('.jy-error')).toHaveCount(0);
    await a5.check();
    for (const sides of ['double', 'single'] as const) {
      await rateField(ownerPage, 'a5', sides, 'bw').fill('1,200');
      await rateField(ownerPage, 'a5', sides, 'color').fill('1,500');
    }
    await tahrir.getByLabel('هر برگ A5').fill('0');
    await addBand(ownerPage, 'spiral_clear.a5', '1', '800', '40,000');
    await expect(ownerPage.locator('.jy-error')).toHaveCount(0);

    // کاغذ تازه: فوکوس روی نامش، نرخ هر اندازهٔ ارائه‌شده صفر از پیش؛ نام تکراری نه.
    await ownerPage.getByRole('button', { name: 'افزودن کاغذ' }).click();
    const glossy = ownerPage.locator('[data-paper^="paper_"]');
    await expect(glossy.getByLabel('نام کاغذ')).toBeFocused();
    await expect(glossy.getByLabel('هر برگ A5')).toHaveValue('0');
    await expect(glossy.locator('.jy-error')).toHaveText('نام کاغذ را بنویس.');
    await glossy.getByLabel('نام کاغذ').fill('تحریر 80 گرم');
    await expect(glossy.locator('.jy-error')).toHaveText('این نام را گزینهٔ دیگری هم دارد.');
    await glossy.getByLabel('نام کاغذ').fill('گلاسه');
    await glossy.getByLabel('گرماژ').fill('135');
    await glossy.getByLabel('هر برگ A4').fill('3,000');
    await glossy.getByLabel('هر برگ A5').fill('2,000');

    // صحافی تازه: 1 تا 50 برگ و «نمی‌خورد» از پیش؛ قیمت بازه را مالک می‌نویسد.
    await ownerPage.getByRole('button', { name: 'افزودن صحافی' }).click();
    const staple = ownerPage.locator('[data-binding^="binding_"]');
    await expect(staple.getByLabel('نام صحافی')).toBeFocused();
    await expect(staple.getByLabel('نمی‌خورد')).toBeChecked();
    await expect(staple.getByText('این صحافی A5 ندارد.')).toBeVisible();
    await staple.getByLabel('نام صحافی').fill('منگنه');
    await staple.getByLabel('وزن هر جلد (گرم)').fill('5');
    const stapleId = (await staple.getAttribute('data-binding'))!;
    await bandInput(ownerPage, 0, 'قیمت', `${stapleId}.a4`).fill('5,000');
    await expect(ownerPage.locator('.jy-error')).toHaveCount(0);

    // پیش‌نمایش: چهار نمونهٔ طرح، و یک نمونه برای A5، گلاسه و منگنه که نسخهٔ فعال ندارد.
    expect((await cells(ownerPage, '[data-preview]')).slice(4)).toEqual([
      ['147 صفحه، سیاه‌سفید، دورو، A5', '—', '216,400', 'تازه'],
      ['120 صفحه، رنگی، دورو، گلاسه', '—', '465,000', 'تازه'],
      ['100 صفحه، دورو، منگنه', '—', '165,000', 'تازه'],
    ]);

    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    expect(await printRatesOf(draft)).toEqual({
      ...a4Rates(1_600, 2_000),
      'a5.double.bw': 12_000,
      'a5.double.color': 15_000,
      'a5.single.bw': 12_000,
      'a5.single.color': 15_000,
    });
    const glossyId = (await glossy.getAttribute('data-paper'))!;
    const papers = await sql<{ id: string; name: string; gsm: number; rates: string }[]>`
      SELECT t.id, t.name_fa AS name, t.gsm, string_agg(r.paper_size::text || ':' || r.rate_rials, ' ' ORDER BY r.paper_size) AS rates
        FROM paper_types t JOIN paper_rates r ON r.price_list_version = t.price_list_version AND r.paper_type_id = t.id
       WHERE t.price_list_version = ${draft}
       GROUP BY t.id, t.name_fa, t.gsm ORDER BY t.id <> 'tahrir80', t.id`;
    expect([...papers]).toEqual([
      { id: 'tahrir80', name: 'تحریر ۸۰ گرم', gsm: 80, rates: 'a4:0 a5:0' },
      { id: glossyId, name: 'گلاسه', gsm: 135, rates: 'a4:30000 a5:20000' },
    ]);
    const bindings = await sql<{ id: string; name: string; min: number; max: number; splits: boolean; weight: number; bands: string }[]>`
      SELECT t.id, t.name_fa AS name, t.min_sheets AS min, t.max_sheets_per_volume AS max, t.splits_volumes AS splits,
             t.weight_per_volume_grams AS weight,
             string_agg(b.paper_size::text || ':' || b.min_sheets || '-' || b.max_sheets || '=' || b.price_rials, ' '
                        ORDER BY b.paper_size, b.min_sheets) AS bands
        FROM binding_types t JOIN binding_rate_bands b ON b.price_list_version = t.price_list_version AND b.binding_type_id = t.id
       WHERE t.price_list_version = ${draft}
       GROUP BY t.id, t.name_fa, t.min_sheets, t.max_sheets_per_volume, t.splits_volumes, t.weight_per_volume_grams
       ORDER BY t.id <> 'spiral_clear', t.id`;
    expect([...bindings]).toEqual([
      {
        id: 'spiral_clear',
        name: 'طلق و سیم',
        min: 1,
        max: 800,
        splits: true,
        weight: 60,
        bands: 'a4:1-150=450000 a4:151-300=500000 a4:301-450=550000 a4:451-600=620000 a4:601-700=680000 a4:701-800=780000 a5:1-800=400000',
      },
      { id: stapleId, name: 'منگنه', min: 1, max: 50, splits: false, weight: 5, bands: 'a4:1-50=50000' },
    ]);

    // «چه عوض می‌شود»، بی فعال کردن.
    await bar(ownerPage).getByRole('link', { name: 'فعال کن…' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff/${draft}/activate$`));
    expect(await changesOf(ownerPage)).toEqual([
      ['اندازهٔ A5', 'تازه'],
      ['چاپ سیاه‌سفید، دورو، A5، هر رو', 'تازه: 1,200 تومان'],
      ['چاپ سیاه‌سفید، یکرو، A5، هر رو', 'تازه: 1,200 تومان'],
      ['چاپ رنگی، دورو، A5، هر رو', 'تازه: 1,500 تومان'],
      ['چاپ رنگی، یکرو، A5، هر رو', 'تازه: 1,500 تومان'],
      ['کاغذ «تحریر ۸۰ گرم»، A5، هر برگ', 'تازه: 0 تومان'],
      ['کاغذ «گلاسه»', 'تازه'],
      ['صحافی «طلق و سیم»، A5', 'تازه'],
      ['صحافی «منگنه»', 'تازه'],
      ['پست و بقیه', 'بی تغییر'],
    ]);

    // حذف کاغذ و خاموش کردن صحافی: پایگاه داده همان، و پیش‌نمایش بی گزینهٔ خاموش.
    await ownerPage.goto(at(`/tariff/${draft}`));
    await glossy.getByRole('button', { name: 'حذف این کاغذ' }).click();
    await expect(ownerPage.locator('[data-paper]')).toHaveCount(1);
    await staple.getByLabel('روشن', { exact: true }).uncheck();
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    expect((await sql<{ id: string }[]>`SELECT id FROM paper_types WHERE price_list_version = ${draft}`).map((row) => row.id)).toEqual(['tahrir80']);
    expect((await sql<{ enabled: boolean }[]>`SELECT enabled FROM binding_types WHERE price_list_version = ${draft} AND id = ${stapleId}`)[0]).toEqual({
      enabled: false,
    });
    expect((await cells(ownerPage, '[data-preview]')).map((row) => row[0])).toEqual([
      '147 صفحه، سیاه‌سفید، دورو',
      '120 صفحه، رنگی، دورو',
      '3 فایل، 300 صفحه، یکرو',
      '1,650 صفحه، دو جلد',
      '147 صفحه، سیاه‌سفید، دورو، A5',
    ]);

    // پایان: پیش‌نویس پاک، تا شمارهٔ بعدی همان بماند.
    await bar(ownerPage).getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    await bar(ownerPage).getByRole('button', { name: 'پیش‌نویس را پاک کن' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/tariff\\?deleted=${draft}$`));
    expect(ownerProblems).toEqual([]);
  });

  test('همین حالا عوض شد: پیش‌نویسی که جای دیگر ذخیره شد رونویسی نمی‌شود؛ پاک کردن با «پاک شود؟»', async () => {
    await ownerPage.goto(at('/tariff'));
    await ownerPage.getByRole('button', { name: 'نسخهٔ تازه' }).click();
    await expect(ownerPage.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');
    const draft = await versionIn(ownerPage);
    expect(draft).toBe(first + 1);
    const other = await ownerContext.newPage();
    await other.goto(at(`/tariff/${draft}`));

    await rateField(ownerPage, 'a4', 'double', 'bw').fill('1,650');
    await bar(ownerPage).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(ownerPage)).toHaveText('پیش‌نویس ذخیره شد.');
    await rateField(other, 'a4', 'double', 'color').fill('2,100');
    await bar(other).getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(note(other)).toHaveText(
      'پیش‌نویس همین حالا جای دیگری ذخیره شد. صفحه را دوباره باز کن تا تازه‌ترینش را ببینی؛ تغییرهای این صفحه ذخیره نشد.',
    );
    expect(await printRatesOf(draft)).toEqual({ ...a4Rates(1_600, 2_000), 'a4.double.bw': 16_500 });
    await other.reload();
    await expect(rateField(other, 'a4', 'double', 'bw')).toHaveValue('1,650');
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
    await rateField(ownerPage, 'a4', 'double', 'color').fill('2,100');
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
      ['چاپ سیاه‌سفید، دورو، A4، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ سیاه‌سفید، یکرو، A4، هر رو', '1,600 ← 1,700 تومان'],
      ['چاپ رنگی، دورو، A4، هر رو', '2,100 ← 2,200 تومان'],
      ['چاپ رنگی، یکرو، A4، هر رو', '2,000 ← 2,200 تومان'],
      ['کاغذ، صحافی، پست و بقیه', 'بی تغییر'],
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
    // نام هرچه ادمین نوشت است: بلندترین (۶۰ نویسه، LABEL_MAX) بی فاصله، و نشانه‌گذاری HTML که فقط متن است.
    const long = `<b>${'تعرفه‌آزمایشی'.repeat(5)}`.slice(0, 56) + '</b>';
    expect([...long]).toHaveLength(60);
    await ownerPage.getByLabel('نام نسخه').fill(long);
    // با A5 و صحافی دوم، تا قاب‌ها و جدول‌های بازهٔ کاتالوگ (۸٫۳) هم در گوشی سنجیده شوند.
    await ownerPage.getByLabel('A5 ارائه می‌شود').check();
    for (const sides of ['double', 'single'] as const) {
      for (const color of ['bw', 'color'] as const) await rateField(ownerPage, 'a5', sides, color).fill('1,200');
    }
    await ownerPage.locator('[data-paper="tahrir80"]').getByLabel('هر برگ A5').fill('0');
    await addBand(ownerPage, 'spiral_clear.a5', '1', '800', '40,000');
    await ownerPage.getByRole('button', { name: 'افزودن صحافی' }).click();
    await ownerPage.locator('[data-binding^="binding_"]').getByLabel('نام صحافی').fill('منگنه');
    await ownerPage.locator('[data-binding^="binding_"] [data-band="0"]').getByLabel('قیمت', { exact: true }).fill('5,000');
    await expect(ownerPage.locator('.jy-error')).toHaveCount(0);
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
          await rateField(page, 'a4', 'double', 'bw').fill('17,000');
          await expect(bandIssue(page, 2)).toBeVisible();
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
