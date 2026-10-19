import { randomInt } from 'node:crypto';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatDeadlineDay, formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import { at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch, WRONG } from './helpers';

/**
 * نوار اعلان، سرتاسری (برش ۱۱٫۳؛ ADR-066، سؤال‌های ۲۸۲، ۲۸۷ و ۲۹۱ تا ۲۹۴): متصدی زبانهٔ «محتوای سایت» را با کارت نوار دارد (متن‌ها نه)، و نوار را
 * با فرم و پیش‌نمایش زنده روشن می‌کند: بی کد خطای کد، کد نادرست، و کد تازه؛ نوار روی همان وب ۳۱۰۱ بالای سربرگ هر صفحه می‌آید (`E2E_WEB_BASE_URL`،
 * ISR یک دقیقه‌ای) و پس از انداختن فایل نیست. مالک خطای فیلدها را بی کد می‌بیند، نواری را که SQL پشت سر صفحه عوض کرد ذخیره نمی‌کند (همان که دیده
 * شد)، بازه می‌گذارد، و وقتی همهٔ چاپخانه‌ها تعطیل‌اند پیام تعطیلی جای نوار روی سایت است و کارت همین را می‌گوید؛ «خاموش کن» بی کد، تا نوار از سایت
 * برود. رویدادها زیر «محتوای سایت»؛ حسابدار نه زبانه دارد نه صفحه.
 *
 * ادمین‌ها با دستور سرور، و نقش حسابدار با SQL. نوار تنظیم `content.bar` است: در آغاز و پایان خاموش و بی متن؛ رویدادها پاک‌نشدنی‌اند، پس فقط
 * رویدادهای پس از آغاز همین اجرا سنجیده می‌شوند؛ و چاپخانه‌هایی که برای تعطیلی بسته شدند در پایان دوباره باز.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` سایت سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const ISR = { timeout: 100_000, intervals: [5_000] };
const OFF = { mode: 'off', from: null, until: null, text: '', href: '', linkText: '' };
const TEXT = `هر صفحهٔ سیاه‌سفید فقط **{نرخ_سیاه_سفید} تومان** ${RUN}`;

let sql: postgres.Sql;
/** چاپخانه‌هایی که این فایل برای «همه تعطیل» بست. */
let closed: string[] = [];
/** آخرین رویداد پیش از این فایل: رویدادها پاک‌نشدنی‌اند (`admin_events_append_only`)، پس فقط رویدادهای همین اجرا سنجیده می‌شوند. */
let before = 0;

const barValue = async () => (await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'content.bar'`)[0]?.value;
const barEvents = () =>
  sql<{ detail: { change: string; fresh: boolean } }[]>`SELECT detail FROM admin_events WHERE action = 'content.bar' AND id > ${before} ORDER BY id`;

/** صفحه‌ای از سایت در زبانهٔ تازه؛ نشان اینماد پاورقی جواب خالی می‌گیرد، مثل `content.spec.ts`. */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

/** متن نوار بالای سربرگ یک صفحهٔ سایت (فاصله‌ها یکی)، یا خالی؛ برای پاییدن ISR. */
async function barText(site: Page, path: string, selector = '.site-bar'): Promise<string> {
  const response = await site.goto(`${WEB}${path}`);
  if (!response?.ok()) return `HTTP ${response?.status()}`;
  const bar = site.locator(selector).first();
  return (await bar.count()) > 0 ? ((await bar.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '';
}

test.describe.serial('نوار اعلان (۱۱٫۳)', () => {
  const users = { owner: `bahar${RUN}`, operator: `omid${RUN}`, accountant: `leila${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[]; secret: string }>;

  test.beforeAll(async ({ browser }) => {
    // «امروز 10:05» زیر کارت و روزهای بازه تا نیمه‌شب تهران‌اند، و کل این فایل با سه صبر ISR چند دقیقه است.
    await awayFromMidnight(240_000, 10 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`UPDATE settings SET value = ${sql.json(OFF)} WHERE key = 'content.bar'`;
    before = Number((await sql<{ id: string | null }[]>`SELECT max(id) AS id FROM admin_events`)[0]?.id ?? 0);
    for (const [key, name] of [
      ['owner', 'بهار مقدم'],
      ['operator', 'امید فرهادی'],
      ['accountant', 'لیلا صادقی'],
    ] as const) {
      const context = await newContext(browser);
      const page = await context.newPage();
      const problems = watch(page);
      const secret = await enroll(page, serverInvite(users[key], key === 'owner' ? '--owner' : '--operator', '--name', name));
      who[key] = { context, page, problems, secret };
    }
    await sql`UPDATE admin_user_roles SET role_id = 'accountant'
               WHERE admin_user_id = (SELECT id FROM admin_users WHERE username = ${users.accountant})`;
  });

  test.afterAll(async () => {
    if (sql) {
      if (closed.length > 0) {
        await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL, availability_note = NULL WHERE id = ANY(${closed})`;
      }
      await sql`UPDATE settings SET value = ${sql.json(OFF)} WHERE key = 'content.bar'`;
    }
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('متصدی: زبانهٔ «محتوای سایت» با کارت نوار و بی متن‌ها؛ روشن کردن با پیش‌نمایش زنده و کد تازه، تا بالای سربرگ سایت', async () => {
    test.setTimeout(240_000);
    const { page, problems, secret } = who.operator;
    await page.goto(at());
    const nav = page.getByRole('navigation', { name: 'بخش‌های پنل' }).getByRole('link');
    await expect(nav).toHaveText(['پیشخوان', 'سفارش‌ها', 'ارسال', 'تعرفه', 'محتوای سایت']);
    await nav.filter({ hasText: 'محتوای سایت' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'محتوای سایت' })).toBeVisible();
    const card = page.getByTestId('content-bar');
    await expect(card.locator('[data-bar-state]')).toHaveText('خاموش');
    await expect(card).toContainText('متنی ندارد؛ با «ویرایش» بنویسش و روشنش کن.');
    await expect(card.getByRole('button', { name: 'خاموش کن' })).toHaveCount(0);
    await expect(page.getByTestId('content-texts')).toHaveCount(0);

    await card.getByRole('link', { name: 'ویرایش' }).click();
    await expect(page).toHaveURL(/\/content\/bar$/);
    await expect(page.getByRole('heading', { level: 1, name: 'نوار اعلان' })).toBeVisible();
    await expect(page.getByText('پیش‌نمایش با نوشتن متن ساخته می‌شود.')).toBeVisible();
    await page.getByRole('radio', { name: 'همیشه' }).check();
    // روزها فقط با «در بازه».
    await expect(page.getByLabel('روز اول')).toBeHidden();
    await page.getByLabel('متن', { exact: true }).fill(TEXT);
    await page.getByLabel('پیوند (اختیاری)').fill('/#tariff');
    await page.getByLabel('متن پیوند').fill('دیدن تعرفه');
    // پیش‌نمایش زنده با عدد امروز (خط‌چین) و «متن پیوند ←»؛ شمار نویسه با عددها.
    const phone = page.locator('[data-bar-preview="phone"] .site-bar');
    await expect(phone).toContainText(`هر صفحهٔ سیاه‌سفید فقط`);
    await expect(phone.locator('b .ad-live-n')).toHaveText(/^\d[\d,]*$/);
    await expect(phone.locator('.site-bar__go')).toHaveText('دیدن تعرفه');
    await expect(phone).toHaveAttribute('data-href', '/#tariff');
    const plain = (await phone.locator('.site-bar__in > span').textContent())!.replace(/\s+/g, ' ').trim().replace(/ دیدن تعرفه$/, '');
    await expect(page.locator('[data-bar-count]')).toHaveText(String([...plain].length));

    // بی کد: خطای زیر فیلد کد؛ هیچ ننشست.
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('روشن کردن و هر تغییر نوار روشن کد تازهٔ برنامهٔ تأیید می‌خواهد؛ «خاموش کن» بی کد است.');
    await expect(page.getByLabel('متن', { exact: true })).toHaveValue(TEXT);
    await expect(page.getByRole('radio', { name: 'همیشه' })).toBeChecked();
    // پیام خود کد نادرست را منتظر می‌ماند: فرم پس از هر پاسخ فیلد کد را خالی می‌کند، و پاسخی که دیر برسد کد درست بعدی را می‌برد.
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await barValue()).toEqual(OFF);

    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.getByText('نوار اعلان روشن شد؛ تا یک دقیقه بعد روی سایت است.')).toBeVisible();
    await expect(page.locator('.ad-title-row [data-bar-state]')).toHaveText('روشن، همیشه');
    await expect(page.locator('.ad-sub')).toHaveText(/^روشن از امروز \d{2}:\d{2}، امید فرهادی، با کد تازه\.$/);
    expect(await barValue()).toEqual({ mode: 'always', from: null, until: null, text: TEXT, href: '/#tariff', linkText: 'دیدن تعرفه' });
    expect((await barEvents()).map((event) => [event.detail.change, event.detail.fresh])).toEqual([['on', true]]);

    // کارت: نشان، پیش‌نمایش، جا و پیوند، آخرین تغییر، و «خاموش کن».
    await page.goto(at('/content'));
    await expect(card.locator('[data-bar-state]')).toHaveText('روشن، همیشه');
    await expect(card).toContainText('بالای همهٔ صفحه‌های سایت، جز پس از انداختن فایل؛ پیوند به تعرفهٔ صفحهٔ اصلی. روشن از امروز');
    await expect(card.getByRole('button', { name: 'خاموش کن' })).toBeVisible();

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => barText(site, '/'), ISR).toContain(`${RUN} دیدن تعرفه`);
      // کل نوار پیوند تعرفه است، بالای سربرگ، و عدد پررنگ همان نرخ امروز.
      const bar = site.locator('a.site-bar');
      await expect(bar).toHaveAttribute('href', '/#tariff');
      await expect(bar.locator('b')).toHaveText(/^\d[\d,]* تومان$/);
      // درست بالای سربرگ (نخستین فرزند بدنه `div` پنهان مرز متادیتای نکست است).
      expect(await site.evaluate(() => document.querySelector('.site-bar')?.nextElementSibling?.classList.contains('site-top'))).toBe(true);
      // همان نوار در صفحه‌های دیگر هم (ISR هر صفحه ساعت خودش را دارد)؛ پس از انداختن فایل (نشانهٔ `data-jozve` جزیرهٔ سفارش) نه.
      await expect.poll(() => barText(site, '/terms'), ISR).toContain(`${RUN} دیدن تعرفه`);
      await site.goto(`${WEB}/`);
      await expect(bar).toBeVisible();
      await site.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), { hidden: true })).setAttribute('data-jozve', ''));
      await expect(bar).toBeHidden();
      await site.close();
    }
    expect(problems).toEqual([]);
  });

  test('مالک: خطای فیلدها بی کد، نوار عوض‌شده پشت سر صفحه، بازه با کد تازه، و پیام تعطیلی جای نوار؛ «خاموش کن» بی کد تا نوار از سایت برود', async () => {
    test.setTimeout(300_000);
    const { page, problems, secret } = who.owner;
    await page.goto(at('/content/bar'));
    await expect(page.locator('.ad-title-row [data-bar-state]')).toHaveText('روشن، همیشه');
    await expect(page.getByLabel('متن', { exact: true })).toHaveValue(TEXT);

    // خطای فیلدها پیش از کد: دو پررنگ، و پیوند به سایت دیگر.
    await page.getByLabel('متن', { exact: true }).fill('**یک** و **دو**');
    await page.getByLabel('پیوند (اختیاری)').fill('https://t.me/jozveyar');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.getByText('نوار ذخیره نشد؛ خطای هر فیلد زیر همان فیلد است.')).toBeVisible();
    await expect(page.locator('#bar-text-error')).toContainText('نوار فقط یک پررنگ دارد');
    await expect(page.locator('#bar-href-error')).toContainText('پیوند نوار فقط به صفحه‌ای از همین سایت می‌رود');
    await expect(page.locator('#step-code-error')).toHaveCount(0);

    // نواری که SQL پشت سر صفحه عوض کرد: پیش از کد، با حال تازه.
    await page.getByLabel('متن', { exact: true }).fill(`متن مالک ${RUN}`);
    await page.getByLabel('پیوند (اختیاری)').fill('');
    await sql`UPDATE settings SET value = jsonb_set(value, '{linkText}', '"دیدن نرخ‌ها"') WHERE key = 'content.bar'`;
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.getByText('نوار همین حالا جای دیگری عوض شد؛ حال تازه‌اش را ببین و اگر هنوز لازم است دوباره ذخیره کن.')).toBeVisible();
    await expect(page.getByLabel('متن پیوند')).toHaveValue('دیدن نرخ‌ها');
    expect(await barValue()).toMatchObject({ text: TEXT, linkText: 'دیدن نرخ‌ها' });

    // بازه از امروز تا دو روز بعد، بی پیوند، با کد تازه.
    const today = new Date();
    const lastDay = tehranDayStart(today, 2);
    await page.getByRole('radio', { name: 'در بازه' }).check();
    await page.getByLabel('روز اول').fill(formatJalaliNumeric(today));
    await page.getByLabel('روز آخر').fill(formatJalaliNumeric(lastDay));
    await expect(page.locator('#bar-until-hint')).toContainText(formatDeadlineDay(tehranDayStart(today, 3)).split(' ')[0]!);
    await page.getByLabel('متن', { exact: true }).fill(`سفارش‌های پنجشنبه از شنبه چاپ می‌شوند ${RUN}`);
    await page.getByLabel('پیوند (اختیاری)').fill('');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(secret));
    await page.getByRole('button', { name: 'ذخیره کن' }).click();
    await expect(page.getByText('نوار اعلان عوض شد؛ تا یک دقیقه بعد روی سایت است.')).toBeVisible();
    await expect(page.locator('.ad-title-row [data-bar-state]')).toHaveText(`روشن تا ${formatDeadlineDay(tehranDayStart(today, 3))}`);
    expect(await barValue()).toMatchObject({ mode: 'range', from: tehranDayStart(today).toISOString(), until: tehranDayStart(today, 3).toISOString(), href: '' });

    // همهٔ چاپخانه‌ها تعطیل: پیام تعطیلی جای نوار روی سایت، و کارت همین را می‌گوید.
    closed = (
      await sql<{ id: string }[]>`
        UPDATE print_partners SET availability = 'closed', closed_from = ${tehranDayStart(today)}, closed_until = ${tehranDayStart(today, 2)}
         WHERE deactivated_at IS NULL RETURNING id`
    ).map((row) => row.id);
    await page.goto(at('/content'));
    await expect(page.locator('[data-bar-closure]')).toContainText(`همهٔ چاپخانه‌ها تا ${formatDeadlineDay(tehranDayStart(today, 2))} تعطیل‌اند`);
    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => barText(site, '/', '[data-closure]'), ISR).toContain('تعطیل‌اند');
      expect(await site.locator('.site-bar').count()).toBe(1);
      expect(await site.locator('.site-bar').textContent()).not.toContain(String(RUN));
      // پیام تعطیلی در حالت سفارش هم می‌ماند.
      await site.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), { hidden: true })).setAttribute('data-jozve', ''));
      await expect(site.locator('[data-closure]')).toBeVisible();
      await site.close();
    }
    await sql`UPDATE print_partners SET availability = 'open', closed_from = NULL, closed_until = NULL WHERE id = ANY(${closed})`;
    closed = [];

    // «خاموش کن» از کارت: بی کد، و متن می‌ماند.
    await page.goto(at('/content'));
    await page.getByTestId('content-bar').getByRole('button', { name: 'خاموش کن' }).click();
    await expect(page.getByText('نوار اعلان خاموش شد؛ تا یک دقیقه بعد از سایت می‌رود.')).toBeVisible();
    await expect(page.getByTestId('content-bar').locator('[data-bar-state]')).toHaveText('خاموش');
    await expect(page.getByTestId('content-bar')).toContainText(`روی سایت نیست. خاموش از امروز`);
    expect(await barValue()).toMatchObject({ mode: 'off', from: null, until: null, text: `سفارش‌های پنجشنبه از شنبه چاپ می‌شوند ${RUN}` });
    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => site.goto(`${WEB}/`).then(() => site.locator('.site-bar').count()), ISR).toBe(0);
      await site.close();
    }

    // رویدادها: زیر «محتوای سایت»، همان سطر طرح، بی متن نوار.
    await page.goto(at('/events?kind=content'));
    const log = page.locator('main');
    await expect(log).toContainText('نوار اعلان خاموش شد');
    await expect(log).toContainText(`نوار اعلان عوض شد، تا ${formatDeadlineDay(tehranDayStart(today, 3))}، با کد تازه`);
    await expect(log).toContainText('نوار اعلان روشن شد، همیشه، با کد تازه');
    await expect(log).not.toContainText(String(RUN));
    expect((await barEvents()).map((event) => [event.detail.change, event.detail.fresh])).toEqual([
      ['on', true],
      ['change', true],
      ['off', false],
    ]);
    expect(problems).toEqual([]);
  });

  test('حسابدار: نه زبانه، نه کارت، نه صفحهٔ نوار؛ متصدی متن‌ها را ندارد', async () => {
    const accountant = who.accountant.page;
    await accountant.goto(at());
    await expect(accountant.locator(`a[href$="${GATE}/content"]`)).toHaveCount(0);
    for (const path of ['/content', '/content/bar']) {
      await accountant.goto(at(path));
      await expect(accountant.locator('main'), path).toContainText('این بخش برای حسابدار باز نیست');
      await expect(accountant.locator('main form'), path).toHaveCount(0);
    }
    const operator = who.operator.page;
    await operator.goto(at('/content/terms'));
    await expect(operator.locator('main')).toContainText('این بخش فقط برای مالک است');
    await expect(operator.locator('main')).toContainText('نوار اعلان و بنر صفحهٔ اصلی را عوض کنی');
    expect([who.accountant.problems, who.operator.problems]).toEqual([[], []]);
  });

  test('گوشی و دسکتاپ: «محتوای سایت» و «نوار اعلان» برای مالک و متصدی بی سرریز افقی، هدف لمسی ۴۴ و آیکون با شکل؛ نوار سایت در ۳۲۰ پیکسل دو خط', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    // نوار روشن، با متن طرح، تا پیش‌نمایش‌ها و کارت هم سنجیده شوند.
    await sql`UPDATE settings SET value = ${sql.json({ mode: 'always', from: null, until: null, text: TEXT, href: '/#tariff', linkText: 'دیدن تعرفه' })}
               WHERE key = 'content.bar'`;
    for (const role of ['owner', 'operator'] as const) {
      for (const path of ['/content', '/content/bar']) {
        for (const width of [320, 390, 1280]) {
          const context = await newContext(browser, { width, height: 800 });
          await context.addCookies(await who[role].context.cookies());
          const page = await context.newPage();
          const problems = watch(page);
          await page.goto(at(path));
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          const { overflow, small, blank } = await layoutProblems(page);
          expect([overflow <= 0, small, blank], `${role} ${path} @ ${width}`).toEqual([true, [], []]);
          expect(problems, `${role} ${path} @ ${width}`).toEqual([]);
          await context.close();
        }
      }
    }
    if (WEB) {
      const context = await newContext(browser, { width: 320, height: 800 });
      const site = await sitePage(context);
      await expect.poll(() => barText(site, '/'), ISR).toContain(`${RUN} دیدن تعرفه`);
      const box = await site.locator('a.site-bar').boundingBox();
      // دو خط با line-height ۱٫۷ و ۸ پیکسل بالا و پایین: کمتر از ۷۰ پیکسل؛ و کل نوار هدف لمسی دست‌کم ۴۴.
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeLessThan(70);
      expect(await site.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await context.close();
    }
  });
});
