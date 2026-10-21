import { randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric } from '@jozveyar/text';

import { at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch, WRONG } from './helpers';

/**
 * متن‌های سایت، سرتاسری (برش ۱۱٫۱؛ ADR-065، سؤال‌های ۲۸۲ تا ۲۹۰): «محتوای سایت» فقط برای مالک؛ ویرایش «قوانین» با سه خطای طرح (پیوند
 * بیرونی، جای‌نگهدار ناشناس با پیشنهاد، HTML) که پیش‌نویس را نگه می‌دارد و «انتشار…» را می‌بندد؛ پیش‌نویس یکدست («ي» فارسی) با پیش‌نمایش
 * و عدد امروز جای‌نگهدار؛ انتشار با «چه عوض می‌شود»، کد نادرست، پیش‌نویسی که پشت سر صفحه عوض شد (همان که دیده شد، پیش از کد) و کد تازه؛
 * «نسخه‌ها»، «دیدن» و برگشت به متن پیش‌فرض؛ سؤال‌ها بی JS (افزودن، سؤال خالی با خطا، بالاتر، حذف)؛ و «تماس و پاورقی» با سنجش شکل و شمارهٔ
 * فارسی. هر انتشار روی همان وب ۳۱۰۱ دیده می‌شود (`E2E_WEB_BASE_URL`، ISR یک دقیقه‌ای): صفحهٔ «قوانین»، سؤال‌های صفحهٔ اصلی، صفحهٔ «تماس»
 * و پاورقی. رویدادها زیر «محتوای سایت» بی متن؛ متصدی از ۱۱٫۳ زبانه را با کارت نوار اعلان دارد ولی متن‌ها و صفحه‌هایشان را نه (`bar.spec.ts`)،
 * و حسابدار هیچ‌کدام.
 *
 * ادمین‌ها با دستور سرور، و نقش حسابدار با SQL. نسخه‌ها پاک‌نشدنی‌اند (`site_content_versions_append_only`)، ولی تریگر ردیفی TRUNCATE را
 * نمی‌گیرد: در آغاز و پایان `TRUNCATE` متن‌ها، تا سایت دوباره متن پیش‌فرض را نشان دهد (مثل `refunds` در `refunds.spec.ts`).
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` سایت سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
/** تیتر تازهٔ قوانین با «ي» عربی؛ سرور فارسی‌اش می‌کند. */
const TITLE_TYPED = `قوانين سفارش جزوه‌يار ${RUN}`;
const TITLE = `قوانین سفارش جزوه‌یار ${RUN}`;
const SECTION = `بخش آزمایشی ${RUN}`;
const QUESTION = `پشت جلد هم چاپ می‌شود؟ ${RUN}`;
const LEGAL = `مسئولیت محتوای فایل با سفارش‌دهنده است ${RUN}.`;
const ISR = { timeout: 100_000, intervals: [5_000] };

let sql: postgres.Sql;

const versionsOf = (kind: string) =>
  sql<{ version: number; restored_from: number | null; title: unknown }[]>`
    SELECT version, restored_from, content->'title' AS title FROM site_content_versions WHERE kind = ${kind} ORDER BY version`;
const contentEvents = () =>
  sql<{ action: string; detail: unknown }[]>`SELECT action, detail FROM admin_events WHERE action = 'content.publish' ORDER BY id`;

/** صفحه‌ای از سایت در زبانهٔ تازه؛ نشان اینماد پاورقی جواب خالی می‌گیرد، مثل `reviews.spec.ts` (از اجراگر CI گاهی جواب نمی‌آید). */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

/**
 * متن یک تکهٔ صفحهٔ سایت پس از رفتن به آن، فاصله‌ها یکی، یا خالی اگر نیست؛ برای پاییدن ISR. `textContent`، نه `innerText`: عدد درون پرسش
 * (`.num`) در `summary` فلکس سطر جدا می‌شد.
 */
async function siteText(site: Page, path: string, selector: string): Promise<string> {
  const response = await site.goto(`${WEB}${path}`);
  if (!response?.ok()) return `HTTP ${response?.status()}`;
  const part = site.locator(selector).first();
  return (await part.count()) > 0 ? ((await part.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '';
}

test.describe.serial('متن‌های سایت (۱۱٫۱)', () => {
  const users = { owner: `sara${RUN}`, operator: `kaveh${RUN}`, accountant: `nima${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[] }>;
  let ownerSecret = '';
  let sla = '';

  test.beforeAll(async ({ browser }) => {
    // «امروز» زیر هر نسخه و «به‌روز شده در» صفحهٔ قوانین تا نیمه‌شب تهران است، و کل این فایل با چهار صبر ISR چند دقیقه است.
    await awayFromMidnight(240_000, 12 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`TRUNCATE site_content_drafts, site_content_versions`;
    const [setting] = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'order.sla_days'`;
    sla = String(setting?.value ?? 2);

    for (const [key, name] of [
      ['owner', 'سارا کامرانی'],
      ['operator', 'کاوه نادری'],
      ['accountant', 'نیما رستمی'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      who[key] = { context, page, problems: watch(page) };
      const secret = await enroll(page, serverInvite(users[key], key === 'owner' ? '--owner' : '--operator', '--name', name));
      if (key === 'owner') ownerSecret = secret;
    }
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.accountant})`;
  });

  test.afterAll(async () => {
    // نسخه پاک‌نشدنی است، ولی تریگر ردیفی TRUNCATE را نمی‌گیرد: سایت پس از ISR بعدی دوباره متن پیش‌فرض را دارد.
    if (sql) await sql`TRUNCATE site_content_drafts, site_content_versions`;
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: «محتوای سایت»، قوانین با سه خطای طرح، پیش‌نویس یکدست با پیش‌نمایش، و انتشار با کد تازه تا صفحهٔ «قوانین» سایت', async () => {
    test.setTimeout(240_000);
    const { page, problems } = who.owner;
    const today = formatJalaliNumeric(new Date());
    await page.goto(at());
    await expect(page.locator(`nav a[href$="${GATE}/content"]`).first()).toBeAttached();
    await page.goto(at('/content'));
    await expect(page.getByRole('heading', { level: 1, name: 'محتوای سایت' })).toBeVisible();
    const list = page.getByTestId('content-texts');
    await expect(list.locator('li[data-kind]')).toHaveCount(6);
    await expect(list.locator('li[data-kind]').locator('.ad-texts__name')).toHaveText([
      'صفحهٔ اصلی',
      'سؤال‌های پرتکرار',
      'قوانین',
      'حریم خصوصی',
      'دربارهٔ ما',
      'تماس و پاورقی',
    ]);
    const terms = list.locator('li[data-kind="terms"]');
    await expect(terms.locator('.ad-texts__meta')).toHaveText('/terms · متن پیش‌فرض سایت');
    await expect(list.locator('li[data-kind="faq"] .ad-texts__meta')).toHaveText('6 سؤال، در صفحهٔ اصلی و گوگل · متن پیش‌فرض سایت');

    await terms.getByRole('link', { name: 'ویرایش' }).click();
    await expect(page).toHaveURL(/\/content\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'قوانین' })).toBeVisible();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('متن پیش‌فرض سایت');
    await expect(page.getByRole('link', { name: 'نسخه‌ها' })).toHaveCount(0);
    const body = page.getByLabel('متن صفحه');
    const original = await body.inputValue();
    expect(original).toContain('## ');

    // سه خطای طرح «خطای متن»: پیش‌نویس می‌ماند، «انتشار…» بسته است و پیش‌نمایش جایش را به یادداشت می‌دهد.
    const broken = `${original}\n\nسؤال‌ها در [تلگرام ما](https://t.me/jozveyar).\n\nفایل {روزهای_نگهداری} روز می‌ماند.\n\nمبلغ <b>کامل</b> برمی‌گردد.`;
    const lineOf = (needle: string) => broken.split('\n').findIndex((line) => line.includes(needle)) + 1;
    await body.fill(broken);
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    const issues = page.getByTestId('content-issues');
    await expect(issues.locator('b')).toHaveText('پیش‌نویس ذخیره شد، ولی تا این 3 مورد درست نشوند منتشر نمی‌شود:');
    const items = issues.locator('li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText(
      `خط ${lineOf('تلگرام')} («سؤال‌ها در [تلگرام…»): پیوند فقط به همین سایت، tel: یا mailto: می‌رود؛ https://t.me/jozveyar سایت دیگری است. تلگرام و اینستاگرام را در «تماس و پاورقی» بگذار؛ سایت پیوندشان را خودش می‌سازد.`,
    );
    await expect(items.nth(1)).toHaveText(
      `خط ${lineOf('روزهای_نگهداری')} («فایل {روزهای_نگهداری} روز…»): جای‌نگهداری به نام {روزهای_نگهداری} نیست. منظورت {روزهای_فایل} بود؟`,
    );
    await expect(items.nth(2)).toHaveText(
      `خط ${lineOf('<b>')} («مبلغ <b>کامل</b> برمی‌گردد.»): HTML پذیرفته نمی‌شود (<b>). برای پررنگ، دو ستاره دو طرف متن بگذار: **کامل**.`,
    );
    await expect(body).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#f-body-error')).toHaveText(
      `3 خط مشکل دارد: ${lineOf('تلگرام')}، ${lineOf('روزهای_نگهداری')} و ${lineOf('<b>')}. شرح هر کدام بالای صفحه است.`,
    );
    await expect(page.getByRole('button', { name: 'انتشار…' })).toBeDisabled();
    await expect(page.locator('.ad-pv')).toContainText('پیش‌نمایش پس از درست شدن این 3 مورد ساخته می‌شود. روی سایت همان متن پیش‌فرض است.');
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('پیش‌نویس');

    await page.goto(at('/content'));
    await expect(terms.locator('.ad-texts__name .jy-badge')).toHaveText('پیش‌نویس');
    await expect(terms.locator('.ad-texts__meta')).toHaveText(/^\/terms · متن پیش‌فرض سایت؛ پیش‌نویس منتشرنشده از امروز \d{2}:\d{2}$/);
    await terms.getByRole('link', { name: 'ادامهٔ ویرایش' }).click();
    await expect(body).toHaveValue(broken);

    // درست‌شده: «ي» فارسی می‌شود، پیش‌نمایش با ظاهر سایت و عدد امروز جای‌نگهدار، و «به‌روز شده در» امروز با انتشار.
    const fixed = `${original}\n\n## ${SECTION}\nجزوه تا {روز_کاری} روز کاری بعد به پست می‌رسد. سؤالی بود؟ از [تماس](/contact) بپرس.`;
    await page.getByLabel('تیتر صفحه').fill(TITLE_TYPED);
    await body.fill(fixed);
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.locator('main .jy-note--success')).toHaveText('پیش‌نویس ذخیره شد. روی سایت چیزی عوض نشده تا «انتشار…».');
    await expect(issues).toHaveCount(0);
    await expect(page.getByLabel('تیتر صفحه')).toHaveValue(TITLE);
    const preview = page.locator('.ad-pv__frame');
    await expect(preview.locator('.pg-title')).toHaveText(TITLE);
    await expect(preview.locator('.pg-meta')).toHaveText(`به‌روز شده در ${today}، با انتشار`);
    await expect(preview.locator('h3.ad-pv-h', { hasText: SECTION })).toBeVisible();
    await expect(preview).toContainText(`جزوه تا ${sla} روز کاری بعد به پست می‌رسد.`);
    await expect(preview.locator('.ad-live-n', { hasText: sla }).first()).toBeVisible();
    await expect(preview.getByText('تماس', { exact: true })).not.toHaveAttribute('href');
    await expect(page.locator('main')).toContainText(`در زبانهٔ مرورگر و گوگل «قوانین و مقررات | جزوه‌یار» می‌شود · 15 از 60 نویسه`);

    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/publish$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار قوانین');
    await expect(page.locator('main .ad-sub')).toHaveText(/^پیش‌نویس امروز \d{2}:\d{2} به جای متن پیش‌فرض سایت\.$/);
    const diff = page.getByTestId('content-diff');
    await expect(diff.locator('.ad-mddiff__sec')).toHaveText(['تیتر صفحه', SECTION, SECTION]);
    await expect(diff.locator('.ad-mddiff__new').first()).toContainText(`پس از انتشار${TITLE}`);
    await expect(diff.locator('.ad-mddiff__new ins').first()).toHaveText(`سفارش`);
    await expect(page.locator('main')).toContainText('بقیهٔ متن صفحه، جملهٔ آغاز، عنوان گوگل و توضیح گوگل همان است.');
    await expect(page.locator('main .jy-note--info')).toHaveText(
      `صفحهٔ «قوانین» تا یک دقیقه بعد متن تازه را دارد و «به‌روز شده در» آن ${today} می‌شود. مرور سفارش و صفحهٔ سفارش به همین صفحه پیوند می‌دهند.`,
    );
    await expect(page.locator('main')).toContainText('متن پیش‌فرض همیشه در «نسخه‌ها» هست و از همان‌جا برمی‌گردد.');

    // کد نادرست: همین‌جا زیر فیلد، و چیزی منتشر نمی‌شود.
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await versionsOf('terms')).toEqual([]);

    // پیش‌نویس پشت سر همین صفحه عوض شد (زبانهٔ دیگر): «همان که دیده شد» پیش از کد رد می‌کند و «چه عوض می‌شود» تازه را نشان می‌دهد.
    await sql`UPDATE site_content_drafts SET content = jsonb_set(content, '{lead}', to_jsonb(${'جملهٔ آغاز از زبانهٔ دیگر.'}::text)), updated_at = now()
               WHERE kind = 'terms'`;
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/publish\?e=content_changed$/);
    await expect(page.locator('main .jy-note--error')).toHaveText(
      'متن روی سایت یا پیش‌نویس همین حالا عوض شد؛ «چه عوض می‌شود» را دوباره ببین و بعد منتشر کن.',
    );
    await expect(diff.locator('.ad-mddiff__sec')).toHaveText(['تیتر صفحه', 'جملهٔ آغاز', SECTION, SECTION]);
    expect(await versionsOf('terms')).toEqual([]);

    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/versions\?done=1$/);
    await expect(page.locator('main .jy-note--success')).toHaveText('نسخهٔ 1 منتشر شد. صفحهٔ «قوانین» تا یک دقیقه دیگر همین را دارد.');
    const versions = page.getByTestId('content-versions');
    const v1 = versions.locator('li[data-version="1"]');
    await expect(v1.locator('.jy-badge')).toHaveText('روی سایت');
    await expect(v1.locator('.ad-versions__meta')).toHaveText(/^امروز \d{2}:\d{2}، سارا کامرانی، با کد تازه$/);
    await expect(v1.getByRole('link', { name: 'برگرداندن…' })).toHaveCount(0);
    await expect(versions.locator('li[data-version="default"]').getByRole('link', { name: 'برگرداندن…' })).toBeVisible();
    expect(await versionsOf('terms')).toEqual([{ version: 1, restored_from: null, title: TITLE }]);
    expect(await sql`SELECT kind FROM site_content_drafts`).toEqual([]);
    expect((await contentEvents()).map((e) => e.detail)).toEqual([{ kind: 'terms', version: 1, restored: null }]);
    expect(problems).toEqual([]);

    if (WEB) {
      // صفحهٔ «قوانین» با ISR یک دقیقه‌ای: تیتر، بخش تازه با عدد امروز و پیوند «تماس»، و «به‌روز شده در» امروز.
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/terms', 'main h1'), ISR).toBe(TITLE);
      await expect(site.locator('main h2', { hasText: SECTION })).toBeVisible();
      await expect(site.locator('main')).toContainText(`جزوه تا ${sla} روز کاری بعد به پست می‌رسد.`);
      await expect(site.locator('main').getByRole('link', { name: 'تماس' })).toHaveAttribute('href', '/contact');
      await expect(site.locator('main .pg-lead')).toHaveText('جملهٔ آغاز از زبانهٔ دیگر.');
      await expect(site.locator('main .pg-meta')).toHaveText(`به‌روز شده در ${today}`);
      await expect(site).toHaveTitle('قوانین و مقررات | جزوه‌یار');
      await site.close();
    }
  });

  test('مالک: «دیدن» نسخهٔ ۱، برگشت به متن پیش‌فرض با کد تازه، و رویدادها زیر «محتوای سایت» بی متن', async () => {
    test.setTimeout(180_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content/terms/versions'));
    const versions = page.getByTestId('content-versions');
    await versions.locator('li[data-version="1"]').getByRole('link', { name: 'دیدن' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/versions\/1$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('نسخهٔ 1');
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('روی سایت');
    await expect(page.locator('.ad-pv__frame .pg-title')).toHaveText(TITLE);
    await expect(page.getByRole('link', { name: 'برگرداندن…' })).toHaveCount(0);

    await page.goto(at('/content/terms/versions'));
    await versions.locator('li[data-version="default"]').getByRole('link', { name: 'برگرداندن…' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/publish\?from=default$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('برگرداندن قوانین به متن پیش‌فرض');
    await expect(page.locator('main .ad-sub')).toHaveText(/^متن پیش‌فرض سایت به جای نسخهٔ 1 \(امروز، سارا کامرانی\)\.$/);
    await expect(page.locator('main')).toContainText('نسخهٔ 1 در «نسخه‌ها» می‌ماند و از همان‌جا برمی‌گردد.');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'برگردان' }).click();
    await expect(page).toHaveURL(/\/content\/terms\/versions\?done=2$/);
    await expect(page.locator('main .jy-note--success')).toHaveText('متن پیش‌فرض برگشت (نسخهٔ 2). صفحهٔ «قوانین» تا یک دقیقه دیگر همین را دارد.');
    const v2 = versions.locator('li[data-version="2"]');
    await expect(v2.locator('.ad-versions__name')).toHaveText('نسخهٔ 2 · برگشت به متن پیش‌فرض');
    await expect(v2.locator('.jy-badge')).toHaveText('روی سایت');
    await expect(versions.locator('li[data-version="1"]').getByRole('link', { name: 'برگرداندن…' })).toBeVisible();
    await expect(versions.locator('li[data-version="default"]').getByRole('link', { name: 'برگرداندن…' })).toHaveCount(0);
    expect(await versionsOf('terms')).toEqual([
      { version: 1, restored_from: null, title: TITLE },
      { version: 2, restored_from: 0, title: null },
    ]);

    await page.goto(at('/content/terms'));
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText('متن پیش‌فرض سایت');
    await expect(page.locator('main .ad-sub')).toHaveText(/^jozveyar\.com\/terms · برگشت به متن پیش‌فرض امروز، سارا کامرانی$/);

    expect((await contentEvents()).map((e) => e.detail)).toEqual([
      { kind: 'terms', version: 1, restored: null },
      { kind: 'terms', version: 2, restored: 0 },
    ]);
    await page.goto(at('/events?kind=content'));
    await expect(page.locator('main').getByRole('link', { name: 'محتوای سایت' })).toHaveAttribute('aria-current', /.+/);
    const log = page.locator('.ad-log');
    await expect(log).toContainText('متن «قوانین» منتشر شد، نسخهٔ 1، با کد تازه');
    await expect(log).toContainText('متن «قوانین» به متن پیش‌فرض برگشت، نسخهٔ 2، با کد تازه');
    await expect(page.locator('main')).not.toContainText(TITLE);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/terms', 'main h1'), ISR).toBe('قوانین جزوه‌یار');
      await expect(site.locator('main')).not.toContainText(SECTION);
      await site.close();
    }
  });

  test('مالک: سؤال‌ها بی JS — افزودن، سؤال خالی با خطا، بالاتر و حذف — و انتشار تا سؤال‌های صفحهٔ اصلی', async () => {
    test.setTimeout(240_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content/faq'));
    await expect(page.getByRole('heading', { level: 1, name: 'سؤال‌های پرتکرار' })).toBeVisible();
    const items = page.getByTestId('faq-items').locator(':scope > li');
    const before = await items.count();
    expect(before).toBe(6);
    const firstQ = await items.nth(0).locator('.ad-faq__q').innerText();
    const lastQ = await items.nth(before - 1).locator('.ad-faq__q').innerText();
    await expect(items.nth(0).locator('details')).toHaveAttribute('open', '');

    await page.getByRole('button', { name: 'افزودن سؤال' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/faq\\?saved=1&n=[0-9a-z]+&open=${before}$`));
    await expect(items).toHaveCount(before + 1);
    const added = items.nth(before);
    await expect(added.locator('details')).toHaveAttribute('open', '');
    await expect(added.locator('.ad-faq__q')).toHaveText('سؤال تازه');
    await expect(page.getByTestId('content-issues').locator('li')).toHaveText([`پرسش ${before + 1}: خالی است.`, `پاسخ ${before + 1}: خالی است.`]);
    await expect(page.getByRole('button', { name: 'انتشار…' })).toBeDisabled();

    await added.getByLabel('پرسش').fill(QUESTION);
    await added.getByLabel('پاسخ').fill('نه؛ رنگی هر رو {نرخ_رنگی} تومان است و جلد جداست.');
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.getByTestId('content-issues')).toHaveCount(0);
    await expect(items.nth(before).locator('.ad-faq__q')).toHaveText(QUESTION);

    // «بالاتر» سؤال تازه را یکی بالا می‌برد و باز نگهش می‌دارد.
    await items.nth(before).locator('summary').click();
    await items.nth(before).getByRole('button', { name: 'بالاتر' }).click();
    await expect(page).toHaveURL(new RegExp(`&open=${before - 1}$`));
    await expect(items.nth(before - 1).locator('.ad-faq__q')).toHaveText(QUESTION);
    await expect(items.nth(before - 1).locator('details')).toHaveAttribute('open', '');
    await expect(items.nth(before).locator('.ad-faq__q')).toHaveText(lastQ);
    // سؤال آخر بسته است و دکمه‌هایش پنهان؛ «پایین‌تر»ش بسته است.
    await expect(items.nth(before).locator('button[name="op"][value^="down:"]')).toBeDisabled();

    // حذف سؤال اول.
    await items.nth(0).locator('summary').click();
    await items.nth(0).getByRole('button', { name: 'حذف این سؤال' }).click();
    await expect(items).toHaveCount(before);
    await expect(items.nth(0).locator('.ad-faq__q')).not.toHaveText(firstQ);
    await expect(items.nth(0).getByRole('button', { name: 'بالاتر' })).toBeDisabled();

    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار سؤال‌های پرتکرار');
    const diff = page.getByTestId('content-diff');
    await expect(diff.locator('.ad-mddiff__sec')).toHaveText([`سؤال ${before - 1}: ${QUESTION}`, `سؤال 1: ${firstQ}`]);
    await expect(diff.locator('.ad-mddiff__new').last()).toHaveText('پس از انتشاربرداشته می‌شود.');
    await expect(page.locator('main .jy-note--info')).toContainText('سؤال‌های صفحهٔ اصلی تا یک دقیقه بعد متن تازه را دارد.');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(/\/content\/faq\/versions\?done=1$/);
    await expect(page.locator('main .jy-note--success')).toHaveText('نسخهٔ 1 منتشر شد. سؤال‌های صفحهٔ اصلی تا یک دقیقه دیگر همین را دارد.');
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/', '#faq'), ISR).toContain(QUESTION);
      const faq = await siteText(site, '/', '#faq');
      expect(faq).not.toContain(firstQ);
      expect(faq).not.toContain('{نرخ_رنگی}');
      // همان پرسش در دادهٔ گوگل (`FAQPage`)، با عدد امروز و بی جای‌نگهدار.
      const ld = await site.locator('script[type="application/ld+json"]').textContent();
      expect(ld).toContain(QUESTION);
      expect(ld).not.toContain('{نرخ_رنگی}');
      await site.close();
    }
  });

  test('مالک: «تماس و پاورقی» با سنجش شکل، موبایل با ارقام فارسی و تلگرام از پیوند، تا صفحهٔ «تماس» و پاورقی سایت', async () => {
    test.setTimeout(180_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content/contact'));
    await expect(page.getByRole('heading', { level: 1, name: 'تماس و پاورقی' })).toBeVisible();
    await page.getByLabel('موبایل، پیامک و تماس').fill('۰۹۱۲ ۳۴۵ ۶۷۸۹');
    await page.getByLabel('تلفن ثابت').fill('021');
    await page.getByLabel('تلگرام').fill('https://t.me/jozveyar_e2e');
    await page.getByLabel('جملهٔ پایین').fill(LEGAL);
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.getByTestId('content-issues').locator('li')).toHaveText(['تلفن ثابت: تلفن ثابت 11 رقم است، با پیش‌شمارهٔ شهر (مثل 021).']);
    await expect(page.locator('#f-phone-error')).toHaveText('تلفن ثابت 11 رقم است، با پیش‌شمارهٔ شهر (مثل 021).');
    await expect(page.getByLabel('تلفن ثابت')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('تلفن ثابت').fill('021 6649 1234');
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.getByTestId('content-issues')).toHaveCount(0);
    await expect(page.getByLabel('موبایل، پیامک و تماس')).toHaveValue('09123456789');
    await expect(page.getByLabel('تلفن ثابت')).toHaveValue('02166491234');
    await expect(page.getByLabel('تلگرام')).toHaveValue('jozveyar_e2e');
    const preview = page.locator('.ad-pv__frame .pg-contact');
    await expect(preview.locator('dt')).toContainText(['پیامک و تماس', 'تلفن', 'ایمیل', 'تلگرام']);
    await expect(preview).toContainText('0912 345 6789');
    await expect(preview).toContainText('021 6649 1234');
    await expect(preview).toContainText('@jozveyar_e2e');

    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار تماس و پاورقی');
    await expect(page.getByTestId('content-diff').locator('.ad-mddiff__sec')).toHaveText(['موبایل', 'تلفن ثابت', 'تلگرام', 'جملهٔ پایین پاورقی']);
    await expect(page.locator('main .jy-note--info')).toHaveText(
      'صفحهٔ «تماس»، نشانی «دربارهٔ ما» و پاورقی همهٔ صفحه‌ها تا یک دقیقه بعد متن تازه را دارد.',
    );
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(/\/content\/contact\/versions\?done=1$/);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/contact', 'main .pg-contact'), ISR).toContain('0912 345 6789');
      const contact = site.locator('main .pg-contact');
      await expect(contact.getByRole('link', { name: '0912 345 6789' })).toHaveAttribute('href', 'tel:+989123456789');
      await expect(contact.getByRole('link', { name: '021 6649 1234' })).toHaveAttribute('href', 'tel:+982166491234');
      const telegram = contact.getByRole('link', { name: '@jozveyar_e2e' });
      await expect(telegram).toHaveAttribute('href', 'https://t.me/jozveyar_e2e');
      await expect(telegram).toHaveAttribute('target', '_blank');
      await expect(site.locator('footer')).toContainText(LEGAL);
      // سازمان در دادهٔ گوگل صفحهٔ اصلی (۱۵٫۱): تلگرام همان شبکهٔ صفحهٔ «تماس»، و راه تماس با اولین شماره به شکل بین‌المللی.
      const ld = () => siteText(site, '/', 'script[type="application/ld+json"]');
      await expect.poll(ld, ISR).toContain('"sameAs":["https://t.me/jozveyar_e2e"]');
      expect(await ld()).toContain('"telephone":"+989123456789"');
      await site.close();
    }
  });

  test('متصدی: زبانه با کارت نوار اعلان، بی متن‌ها و صفحه‌هایشان؛ حسابدار نه زبانه، نه صفحه', async () => {
    const operator = who.operator.page;
    await operator.goto(at());
    await expect(operator.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(operator.locator(`nav a[href$="${GATE}/content"]`)).toHaveCount(1);
    await operator.goto(at('/content'));
    await expect(operator.getByTestId('content-bar')).toBeVisible();
    await expect(operator.getByTestId('content-texts')).toHaveCount(0);
    for (const path of ['/content/terms', '/content/terms/publish', '/content/terms/versions', '/content/terms/versions/1']) {
      await operator.goto(at(path));
      await expect(operator.locator('main'), path).toContainText('این بخش فقط برای مالک است');
      await expect(operator.locator('main textarea, main form[action] input[name="kind"]'), path).toHaveCount(0);
    }
    const accountant = who.accountant.page;
    await accountant.goto(at());
    await expect(accountant.locator(`a[href$="${GATE}/content"]`)).toHaveCount(0);
    await accountant.goto(at('/content/faq'));
    await expect(accountant.locator('main')).toContainText('این بخش برای حسابدار باز نیست');
    expect([who.operator.problems, who.accountant.problems]).toEqual([[], []]);
  });

  test('گوشی و دسکتاپ: فهرست، ویرایشگرها، انتشار و نسخه‌ها، بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    test.setTimeout(180_000);
    const paths = [
      '/content',
      '/content/home',
      '/content/terms',
      '/content/faq',
      '/content/contact',
      '/content/terms/publish?from=1',
      '/content/terms/versions',
      '/content/terms/versions/1',
    ];
    for (const path of paths) {
      for (const width of [320, 390, 1280]) {
        const context = await newContext(browser, { width, height: 800 });
        await context.addCookies(await who.owner.context.cookies());
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(at(path));
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const { overflow, small, blank } = await layoutProblems(page);
        expect([overflow <= 0, small, blank], `${path} @ ${width}`).toEqual([true, [], []]);
        expect(problems, `${path} @ ${width}`).toEqual([]);
        await context.close();
      }
    }
  });
});
