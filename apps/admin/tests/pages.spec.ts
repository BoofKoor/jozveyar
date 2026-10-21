import { randomInt } from 'node:crypto';

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';

import { formatJalaliNumeric, formatJalaliWeekday } from '@jozveyar/text';

import { at, awayFromMidnight, BASE, codeFor, enroll, GATE, layoutProblems, newContext, serverInvite, watch, WRONG } from './helpers';

/**
 * صفحه‌های فرود و «تعرفه»، سرتاسری (برش ۱۵٫۲؛ ADR-071، سؤال‌های ۴۶۱ تا ۴۶۶): فقط مالک. صفحهٔ تازه با نشانی و تیتری که سرور یکدست می‌کند،
 * پیوند به صفحه‌ای که روی سایت نیست (خطا، پیش‌نویس می‌ماند و «انتشار…» بسته) و بلوک قیمت A5 (هشدار، انتشار باز)؛ انتشار با خلاصهٔ صفحهٔ
 * تازه، کد نادرست، پیش‌نویسی که پشت سر صفحه عوض شد (همان که دیده شد، پیش از کد) و کد تازه، تا خود صفحه، مسیر درونی با ۳۰۱، نقشهٔ سایت
 * و پاورقی همان وب ۳۱۰۱ (`E2E_WEB_BASE_URL`؛ فهرست میان‌افزار و ISR هر کدام یک دقیقه‌ای)؛ نشانی و تیتر تازه زمان‌دار با خطای روز و ساعت،
 * فهرست و ویرایشگر با «زمان‌دار»، «پس گرفتن زمان‌دار» بی کد که پیش‌نویس می‌شود، و همان با «همین حالا» تا نشانی قبلی با ۳۰۱؛ صفحهٔ دوم
 * که به اولی پیوند دارد، پس «پیدا نشد» اولی بسته است (و فرم دست‌ساز هم رد)، برداشتن «به صفحهٔ دیگری» («تعرفه») تا هر دو نشانی‌اش با ۳۰۱
 * به «/tarefe»، و دومی «پیدا نشد» تا ۴۰۴؛ «تعرفه» با تیتر و سؤال تازه تا صفحهٔ «تعرفه» سایت، و برگشت به متن پیش‌فرض؛ رویدادها زیر
 * «محتوای سایت» بی متن؛ متصدی و حسابدار نه کارت، نه صفحه؛ و گوشی و دسکتاپ بی سرریز.
 *
 * ادمین‌ها با دستور سرور، و نقش حسابدار با SQL. نسخه‌ها پاک‌نشدنی‌اند (`site_page_versions_append_only`) و نشانی مال صفحه‌ای است که یک بار
 * گرفتش، ولی تریگر ردیفی TRUNCATE را نمی‌گیرد: در آغاز و پایان `TRUNCATE` صفحه‌ها، تا سایت دوباره بی صفحهٔ فرود و با «تعرفه»ی پیش‌فرض باشد.
 * نشانی‌ها شمارهٔ همین اجرا را دارند، تا فهرست میان‌افزار یا ISR اجرای قبل در همان یک دقیقه چیزی را جای این اجرا نگوید.
 *
 *   (متغیرهای `admin.spec.ts`) — همان پنل و پایگاه داده؛ طرز اجرا بالای `admin.spec.ts`. بی `E2E_WEB_BASE_URL` سایت سنجیده نمی‌شود.
 */

const env = process.env;
test.skip(!BASE || !GATE || !env.DATABASE_URL, 'بدون متغیرهای پنل و DATABASE_URL — پنل و پایگاه داده لازم است');
test.use({ baseURL: BASE });

const WEB = env.E2E_WEB_BASE_URL?.trim().replace(/\/+$/, '') || null;
const RUN = randomInt(1000, 9999);
const MINUTE = 60_000;
const DAY_MS = 86_400_000;
/** نشانی صفحهٔ اول، همان‌طور که مالک تایپ می‌کند و همان‌طور که سرور یکدستش می‌کند؛ بعد نشانی تازه‌اش. */
const SLUG_TYPED = ` /Print PDF E2E${RUN} `;
const SLUG = `print-pdf-e2e${RUN}`;
const SLUG_NEW = `print-pdf-online-${RUN}`;
const SLUG_B = `print-arzan-${RUN}`;
/** تیتر با «ي» و رقم فارسی؛ سرور فارسی و لاتینش می‌کند. */
const TITLE_TYPED = `پرينت PDF آنلاین ${RUN.toLocaleString('fa-IR', { useGrouping: false })}`;
const TITLE = `پرینت PDF آنلاین ${RUN}`;
const TITLE_NEW = `پرینت فایل PDF، با صحافی ${RUN}`;
const TARIFF_TITLE = `قیمت چاپ جزوه، امروز ${RUN}`;
const TARIFF_DEFAULT = 'قیمت چاپ جزوه و پرینت، امروز';
const QUESTION = `فاکتور رسمی هم می‌دهید؟ ${RUN}`;
const ISR = { timeout: 130_000, intervals: [5_000] };
const OWNER_NAME = 'سارا کامرانی';

let sql: postgres.Sql;

const versionsOf = (slugOrKind: string) =>
  sql<{ version: number; slug: string; restored_from: number | null; removal: string | null; title: unknown; withdrawn: boolean }[]>`
    SELECT v.version, v.slug, v.restored_from, v.removal, v.content->'title' AS title, v.withdrawn_at IS NOT NULL AS withdrawn
      FROM site_page_versions v JOIN site_pages p ON p.id = v.page_id
     WHERE (p.kind = 'tariff' AND ${slugOrKind} = 'tariff')
        OR v.page_id IN (SELECT page_id FROM site_page_slugs WHERE slug = ${slugOrKind})
     ORDER BY v.version`;
/** رویدادهای صفحه‌های همین اجرا؛ رویدادها پاک‌نشدنی‌اند، پس آنچه اجرای قبل نوشت می‌ماند (مثل `bar.spec.ts`). */
let firstEvent = 0;
const pageEvents = () =>
  sql<{ action: string; detail: Record<string, unknown> }[]>`
    SELECT action, detail FROM admin_events WHERE action LIKE 'content.page_%' AND id > ${firstEvent} ORDER BY id`;

/** صفحه‌ای از سایت در زبانهٔ تازه؛ نشان اینماد پاورقی جواب خالی می‌گیرد، مثل `content.spec.ts` (از اجراگر CI گاهی جواب نمی‌آید). */
async function sitePage(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.route('https://trustseal.enamad.ir/**', (route) => route.fulfill({ status: 204, body: '' }));
  return site;
}

/** متن یک تکهٔ صفحهٔ سایت پس از رفتن به آن، فاصله‌ها یکی، یا «HTTP 404»؛ برای پاییدن فهرست میان‌افزار و ISR. */
async function siteText(site: Page, path: string, selector: string): Promise<string> {
  const response = await site.goto(`${WEB}${path}`);
  if (!response?.ok()) return `HTTP ${response?.status()}`;
  const part = site.locator(selector).first();
  return (await part.count()) > 0 ? ((await part.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '';
}

/** جواب خام یک نشانی سایت بی دنبال کردن ۳۰۱: «301 /tarefe»، «200»، «404». */
async function siteHop(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(`${WEB}${path}`, { maxRedirects: 0 });
  const location = response.headers().location;
  if (!location) return String(response.status());
  // ۳۰۱ صفحه‌ها برگشت‌پذیر است، پس مرورگر نباید نگهش دارد (`middleware.ts`).
  const cache = response.headers()['cache-control'];
  return `${response.status()} ${new URL(location, WEB!).pathname}${cache === 'no-store' ? '' : ` (Cache-Control: ${cache})`}`;
}

/** شمارهٔ صفحه از نشانی ویرایشگر. */
const paramOf = (page: Page) => /\/content\/pages\/(\d+)/.exec(page.url())?.[1] ?? '';

test.describe.serial('صفحه‌های فرود و «تعرفه» (۱۵٫۲)', () => {
  const users = { owner: `sara${RUN}`, operator: `kaveh${RUN}`, accountant: `nima${RUN}` };
  const who = {} as Record<keyof typeof users, { context: BrowserContext; page: Page; problems: string[] }>;
  let ownerSecret = '';
  /** شمارهٔ دو صفحهٔ فرود در پنل. */
  let pageA = '';
  let pageB = '';

  test.beforeAll(async ({ browser }) => {
    // «امروز» زیر هر نسخه، روز پیش‌فرض زمان‌دار (فردا) و «برای فردا» تا نیمه‌شب تهران‌اند، و کل این فایل با شش صبر سایت چند دقیقه است.
    await awayFromMidnight(240_000, 20 * MINUTE);
    sql = postgres(env.DATABASE_URL!, { max: 2, onnotice: () => undefined });
    await sql`TRUNCATE site_page_drafts, site_page_versions, site_page_slugs, site_pages`;
    const [last] = await sql<{ id: number | null }[]>`SELECT max(id)::int AS id FROM admin_events`;
    firstEvent = last?.id ?? 0;

    for (const [key, name] of [
      ['owner', OWNER_NAME],
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
    // نسخه پاک‌نشدنی است، ولی تریگر ردیفی TRUNCATE را نمی‌گیرد: سایت پس از یک دقیقه دوباره بی صفحهٔ فرود است.
    if (sql) await sql`TRUNCATE site_page_drafts, site_page_versions, site_page_slugs, site_pages`;
    for (const one of Object.values(who)) await one.context.close();
    await sql?.end();
  });

  test('مالک: صفحهٔ تازه با خطا و هشدار، پیش‌نویس یکدست، و انتشار با کد تازه تا خود صفحه، نقشهٔ سایت و پاورقی سایت', async () => {
    test.setTimeout(300_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content'));
    const card = page.getByTestId('content-pages');
    await expect(card.locator('.ad-meta')).toHaveText('1 صفحه روی سایت، با «تعرفه»؛ 0 زمان‌دار و 0 پیش‌نویس.');
    await card.getByRole('link', { name: 'صفحه‌ها و مقاله‌ها' }).click();
    await expect(page).toHaveURL(/\/content\/pages$/);
    await expect(page.getByRole('heading', { level: 1, name: 'صفحه‌ها و مقاله‌ها' })).toBeVisible();
    const list = page.getByTestId('pages-list');
    const tariff = list.locator('li[data-page="tarefe"]');
    await expect(tariff.locator('.jy-badge')).toHaveText(['متن پیش‌فرض']);
    await expect(tariff.locator('.ad-texts__meta')).toHaveText(
      '/tarefe · ماشین‌حساب و جدول‌ها از تعرفهٔ فعال؛ تیتر، متن، سؤال‌ها و گوگل از اینجا · متن پیش‌فرض سایت',
    );
    await expect(list.locator('li[data-page]')).toHaveCount(1);
    await expect(page.locator('main')).toContainText('هنوز صفحهٔ فرودی نیست.');
    await expect(page.getByTestId('pages-moved').locator('li')).toHaveText(['/chap-jozve ← صفحهٔ اصلی«چاپ جزوه» خود صفحهٔ اصلی است؛ ثابت سایت، نه از پنل']);

    await page.getByRole('link', { name: 'صفحهٔ تازه' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/new$/);
    await expect(page.getByRole('heading', { level: 1, name: 'صفحهٔ تازه' })).toBeVisible();
    await expect(page.locator('main .ad-sub')).toHaveText('jozveyar.com/… · صفحهٔ تازه، هنوز ذخیره نشده');
    await expect(page.getByRole('link', { name: 'نسخه‌ها' })).toHaveCount(0);
    // صفحهٔ تازهٔ خالی ذخیره نمی‌شود.
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/new\?empty=1/);
    await expect(page.locator('main .jy-note--info').first()).toHaveText('صفحهٔ تازه هنوز خالی است، پس چیزی ذخیره نشد.');
    expect(await sql`SELECT id FROM site_pages`).toEqual([]);

    // پیوند به صفحه‌ای که روی سایت نیست: خطا، پیش‌نویس می‌ماند و «انتشار…» بسته؛ بلوک A5 هشدار است، نه خطا.
    const body = (link: string) =>
      `## PDF همان‌طور چاپ می‌شود\nبند با [تعرفه](/tarefe) و [${link === '/about' ? 'دربارهٔ ما' : 'ارزان'}](${link}).\n\n[[قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم]]\n\n[[قیمت: 100 صفحه، A5]]`;
    await page.getByLabel('نشانی').fill(SLUG_TYPED);
    await page.getByLabel('نام کوتاه').fill('پرینت PDF');
    await page.getByLabel('تیتر صفحه').fill(TITLE_TYPED);
    await page.getByLabel('جملهٔ زیر تیتر').fill('فایل PDF را بینداز؛ قیمت همان لحظه، هر رو {نرخ_سیاه_سفید} تومان.');
    await page.getByLabel('متن صفحه').fill(body(`/${SLUG_B}`));
    await page.getByLabel('در پاورقی، گروه «چاپ جزوه»').check();
    await page.getByLabel('عنوان').fill('پرینت فایل PDF آنلاین {سال}');
    await page.getByLabel('توضیح').fill('چاپ هر رو {نرخ_سیاه_سفید} تومان، با صحافی و ارسال به همهٔ شهرها.');
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/\d+\?saved=1/);
    pageA = paramOf(page);
    const issues = page.getByTestId('page-issues');
    await expect(issues.locator('b')).toHaveText('پیش‌نویس ذخیره شد، ولی تا این یکی درست نشود منتشر نمی‌شود:');
    await expect(issues.locator('li')).toHaveText([
      new RegExp(`^خط 2 \\(«.+»\\): پیوند به /${SLUG_B} است، که روی سایت نیست؛ اول همان صفحه را منتشر کن، یا پیوند را بردار\\.$`),
    ]);
    await expect(page.getByTestId('page-warnings').locator('li')).toHaveText([
      'خط 6، بلوک [[قیمت: 100 صفحه، A5]]: اندازهٔ A5 امروز در تعرفه نیست یا موقتاً خاموش است. روی سایت به جای قیمت «فعلاً ارائه نمی‌شود» می‌آید، تا روزی که گزینه‌اش در تعرفه باشد.',
    ]);
    await expect(page.getByRole('button', { name: 'انتشار…' })).toBeDisabled();
    await expect(page.locator('.ad-pv .jy-note--info')).toHaveText('پیش‌نمایش پس از درست شدن خطاها ساخته می‌شود. این صفحه هنوز روی سایت نیست.');
    await expect(page.getByLabel('نشانی')).toHaveValue(SLUG);
    await expect(page.getByLabel('تیتر صفحه')).toHaveValue(TITLE);
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText(['پیش‌نویس']);
    await expect(page.locator('main .ad-sub')).toHaveText(
      new RegExp(`^jozveyar\\.com/${SLUG} · هنوز منتشر نشده؛ پیش‌نویس منتشرنشده از امروز \\d{2}:\\d{2}$`),
    );

    // درست‌شده: پیش‌نمایش با ظاهر سایت و عدد امروز، و «انتشار…» با همان هشدار باز.
    await page.getByLabel('متن صفحه').fill(body('/about'));
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.locator('main .jy-note--success')).toHaveText('پیش‌نویس ذخیره شد. روی سایت چیزی عوض نشده تا «انتشار…».');
    await expect(page.getByTestId('page-issues')).toHaveCount(0);
    const preview = page.getByTestId('page-preview');
    await expect(preview.locator('.ad-pvc')).toHaveText('جزوه‌یار ‹ پرینت PDF');
    await expect(preview.locator('.ad-pvh__title')).toHaveText(TITLE);
    await expect(preview.locator('.ad-pvh__lead')).toHaveText('فایل PDF را بینداز؛ قیمت همان لحظه، هر رو 1,600 تومان.');
    await expect(preview.locator('h3.ad-pv-h')).toHaveText('PDF همان‌طور چاپ می‌شود');
    await expect(preview).toContainText('فعلاً ارائه نمی‌شود');
    await expect(preview.getByText('دربارهٔ ما', { exact: true })).not.toHaveAttribute('href');
    await expect(page.locator('.ad-serp__t')).toHaveText(/^پرینت فایل PDF آنلاین 14\d\d \| جزوه‌یار$/);

    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/publish$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار پرینت PDF');
    await expect(page.locator('main .ad-sub')).toHaveText(new RegExp(`^صفحه در jozveyar\\.com/${SLUG}، از پیش‌نویس امروز \\d{2}:\\d{2}\\.$`));
    const diff = page.getByTestId('page-diff');
    await expect(diff.locator('li')).toHaveText([`پس از انتشارصفحهٔ «${TITLE}»، با 1 بخش متن و 2 بلوک قیمت؛ در نقشهٔ سایت و پاورقی («چاپ جزوه»).`]);
    await expect(page.locator('main .jy-note--warning')).toHaveCount(1);
    await expect(page.getByRole('radio', { name: /همین حالا/ })).toBeChecked();

    // کد نادرست: همین‌جا زیر فیلد، و چیزی منتشر نمی‌شود.
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(WRONG.code);
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page.locator('#step-code-error')).toHaveText('کد برنامهٔ تأیید درست نیست. کد تازهٔ برنامه را بزن.');
    expect(await versionsOf(SLUG)).toEqual([]);

    // پیش‌نویس پشت سر همین صفحه عوض شد: «همان که دیده شد» پیش از کد رد می‌کند و صفحه «چه عوض می‌شود» تازه را دارد.
    await sql`UPDATE site_page_drafts SET content = jsonb_set(content, '{name}', to_jsonb(${'پرینت پی‌دی‌اف'}::text)), updated_at = now()
               WHERE page_id = ${Number(pageA)}`;
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/publish\\?e=page_changed`));
    await expect(page.locator('main .jy-note--error')).toHaveText(
      'این صفحه یا پیش‌نویسش همین حالا جای دیگری عوض شد؛ حال تازه را ببین و اگر هنوز لازم است، دوباره بزن.',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار پرینت پی‌دی‌اف');
    expect(await versionsOf(SLUG)).toEqual([]);

    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/versions\\?done=1$`));
    await expect(page.locator('main .jy-note--success')).toHaveText('نسخهٔ 1 منتشر شد؛ تا یک دقیقه بعد روی سایت است.');
    const v1 = page.getByTestId('page-versions').locator('li[data-version="1"]');
    await expect(v1.locator('.jy-badge')).toHaveText(['روی سایت']);
    await expect(v1.locator('.ad-versions__meta')).toHaveText(new RegExp(`^امروز \\d{2}:\\d{2}، ${OWNER_NAME}$`));
    await expect(v1.getByRole('link', { name: 'برگرداندن…' })).toHaveCount(0);
    expect(await versionsOf(SLUG)).toEqual([{ version: 1, slug: SLUG, restored_from: null, removal: null, title: TITLE, withdrawn: false }]);
    expect(await sql`SELECT page_id FROM site_page_drafts`).toEqual([]);
    expect((await pageEvents()).map((e) => [e.action, e.detail])).toEqual([
      ['content.page_publish', { page: Number(pageA), kind: 'landing', slug: SLUG, version: 1, restored: null, scheduled: null }],
    ]);
    expect(problems).toEqual([]);

    if (WEB) {
      // خود صفحه، با فهرست میان‌افزار و ISR یک دقیقه‌ای: تیتر، مسیر دیدنی، canonical، جای‌نگهدار با عدد امروز، دو بلوک قیمت و پاورقی.
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, `/${SLUG}`, 'main h1'), ISR).toBe(TITLE);
      await expect(site).toHaveTitle(/^پرینت فایل PDF آنلاین 14\d\d \| جزوه‌یار$/);
      await expect(site.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${SLUG}$`));
      await expect(site.locator('main .lp-crumbs')).toContainText('جزوه‌یار');
      await expect(site.locator('main .lp-crumbs')).toContainText('پرینت پی‌دی‌اف');
      await expect(site.locator('main .home-lead')).toHaveText('فایل PDF را بینداز؛ قیمت همان لحظه، هر رو 1,600 تومان.');
      await expect(site.locator('main h2', { hasText: 'PDF همان‌طور چاپ می‌شود' })).toBeVisible();
      await expect(site.locator('main')).toContainText('فعلاً ارائه نمی‌شود');
      await expect(site.locator('main').getByRole('link', { name: 'دربارهٔ ما' })).toHaveAttribute('href', '/about');
      // پاورقی دو شکل دارد، بی جزوه و در حالت سفارش (زبانهٔ تازه)، هر دو با همین صفحه.
      await expect(site.locator(`footer a[href="/${SLUG}"]`)).toHaveText(['پرینت پی‌دی‌اف', 'پرینت پی‌دی‌اف']);
      // مسیر درونی هرگز نشانی صفحه نیست: ۳۰۱ به نشانی خود صفحه.
      expect(await siteHop(site.request, `/lp/${SLUG}`)).toBe(`301 /${SLUG}`);
      await expect.poll(async () => (await site.request.get(`${WEB}/sitemap.xml`)).text(), ISR).toContain(`/${SLUG}</loc>`);
      // گوشی: بی سرریز افقی، و هر پیوند، دکمه، سؤال و کارت بارگذاری دست‌کم ۴۴ پیکسل، مثل صفحهٔ اصلی و «تعرفه»؛ پیوند درون جمله نه (WCAG 2.5.8، «درون
      // متن»)، که بلندی‌اش همان خط متن است.
      for (const width of [320, 390]) {
        await site.setViewportSize({ width, height: 800 });
        await site.goto(`${WEB}/${SLUG}`);
        const { overflow, small } = await site.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          small: [...document.querySelectorAll<HTMLElement>('main a:not(p a, li a), main summary, main button, main label.jy-upload')]
            .filter((el) => el.checkVisibility())
            .filter((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) < 44)
            .map((el) => el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30)),
        }));
        expect([overflow <= 0, small], `/${SLUG} @ ${width}`).toEqual([true, []]);
      }
      await site.close();
    }
  });

  test('مالک: نشانی و تیتر تازه زمان‌دار، پس گرفتن بی کد، و همان «همین حالا» تا ۳۰۱ نشانی قبلی', async () => {
    test.setTimeout(300_000);
    const { page, problems } = who.owner;
    const tomorrow = new Date(Date.now() + DAY_MS);
    const day = formatJalaliNumeric(tomorrow);
    const when = `${formatJalaliWeekday(tomorrow)}، ساعت 09:00`;
    await page.goto(at(`/content/pages/${pageA}`));
    await expect(page.getByRole('heading', { level: 1, name: 'پرینت پی‌دی‌اف' })).toBeVisible();
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText(['روی سایت']);
    await expect(page.locator('main .ad-sub')).toHaveText(new RegExp(`^jozveyar\\.com/${SLUG} · روی سایت نسخهٔ 1، امروز، ${OWNER_NAME}$`));
    await page.getByLabel('نشانی').fill(SLUG_NEW);
    await page.getByLabel('تیتر صفحه').fill(TITLE_NEW);
    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/publish$`));
    await expect(page.locator('main .ad-sub')).toHaveText(
      new RegExp(`^پیش‌نویس امروز \\d{2}:\\d{2} به جای متن روی سایت، در jozveyar\\.com/${SLUG_NEW}\\.$`),
    );
    await expect(page.getByTestId('page-diff').locator('.ad-mddiff__sec')).toHaveText(['نشانی', 'تیتر صفحه']);
    await expect(page.locator('main .jy-note--info')).toHaveText(
      `نشانی /${SLUG} از این پس برای همیشه با ۳۰۱ به /${SLUG_NEW} می‌رود، تا پیوندها و رتبه‌اش در گوگل گم نشوند.`,
    );

    // «در روز و ساعت»: روز پیش‌فرض فردا و ساعت 09:00؛ ساعت و روز نادرست زیر فیلد خودشان، پیش از کد.
    await page.getByRole('radio', { name: /در روز و ساعت/ }).check();
    await expect(page.getByLabel('روز', { exact: true })).toHaveValue(day);
    await expect(page.getByLabel('ساعت', { exact: true })).toHaveValue('09:00');
    await expect(page.locator('#pub-day-hint')).toHaveText(`${formatJalaliWeekday(tomorrow)}؛ تا 90 روز بعد.`);
    await page.getByLabel('ساعت', { exact: true }).fill('25:00');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'زمان‌دار کن' }).click();
    await expect(page.locator('#pub-hour-error')).toHaveText('ساعت را به شکل 09:00 بنویس، از 00:00 تا 23:59.');
    await page.getByLabel('ساعت', { exact: true }).fill('09:00');
    await page.getByLabel('روز', { exact: true }).fill('1405/13/01');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'زمان‌دار کن' }).click();
    await expect(page.locator('#pub-day-error')).toHaveText('روز را به شکل 1405/08/01 بنویس.');
    expect(await versionsOf(SLUG)).toHaveLength(1);

    await page.getByLabel('روز', { exact: true }).fill(day);
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'زمان‌دار کن' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/versions\\?done=2$`));
    await expect(page.locator('main .jy-note--success')).toHaveText(
      `نسخهٔ 2 برای ${when} زمان‌دار شد؛ تا آن ساعت روی سایت نیست و تا پیش از آن از ویرایش بی کد پس گرفته می‌شود.`,
    );
    const versions = page.getByTestId('page-versions');
    await expect(versions.locator('li[data-version="2"] .jy-badge')).toHaveText(['زمان‌دار']);
    await expect(versions.locator('li[data-version="2"] .ad-versions__meta')).toHaveText(new RegExp(`^امروز \\d{2}:\\d{2}، ${OWNER_NAME}؛ روی سایت ${when}$`));
    await expect(versions.locator('li[data-version="1"] .jy-badge')).toHaveText(['روی سایت']);
    // تا زمان‌دار در راه است هیچ برگرداندنی نیست.
    await expect(versions.getByRole('link', { name: 'برگرداندن…' })).toHaveCount(0);

    await page.goto(at('/content/pages'));
    const row = page.getByTestId('pages-list').locator(`li[data-page="${pageA}"]`);
    // بلوک A5 آزمون اول هنوز در متن است: هشدارش با ردیف می‌ماند (فقط اولی در خط زیر نام).
    await expect(row.locator('.jy-badge')).toHaveText(['روی سایت', 'زمان‌دار', '1 هشدار']);
    await expect(row.locator('.ad-texts__meta')).toHaveText(
      `/${SLUG} · نسخهٔ 1، امروز، ${OWNER_NAME} · در پاورقی · روی سایت ${when} · با کد تازه، ${OWNER_NAME}` +
        ' · بلوک [[قیمت: 100 صفحه، A5]]: اندازهٔ A5 امروز در تعرفه نیست یا موقتاً خاموش است، و روی سایت «فعلاً ارائه نمی‌شود» نشان می‌دهد',
    );
    await expect(row.getByRole('link', { name: 'از سایت بردار…' })).toHaveCount(0);
    await expect(page.locator('.jy-card__meta').first()).toHaveText('2 روی سایت · 1 زمان‌دار · 0 پیش‌نویس');

    // ویرایشگر: «انتشار…» بسته تا زمان‌دار در راه است؛ «پس گرفتن زمان‌دار» بی کد، و متنش پیش‌نویس می‌شود.
    await row.getByRole('link', { name: 'ویرایش' }).click();
    await expect(page.locator('main .jy-note--info').first()).toHaveText(
      `نسخهٔ 2 برای ${when} زمان‌دار است و تا آن ساعت روی سایت نیست. برای انتشار متن دیگری اول «پس گرفتن زمان‌دار» را بزن؛ متنش پیش‌نویس می‌شود.`,
    );
    await expect(page.getByRole('button', { name: 'انتشار…' })).toBeDisabled();
    await expect(page.getByLabel('تیتر صفحه')).toHaveValue(TITLE_NEW);
    const before = await pageEvents();
    await page.getByRole('button', { name: 'پس گرفتن زمان‌دار' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}\\?withdrawn=2`));
    await expect(page.locator('main .jy-note--success')).toHaveText('زمان‌دار نسخهٔ 2 پس گرفته شد و روی سایت نمی‌رود؛ متنش در پیش‌نویس است.');
    await expect(page.locator('.ad-title-row .jy-badge')).toHaveText(['روی سایت', 'پیش‌نویس']);
    await expect(page.getByLabel('نشانی')).toHaveValue(SLUG_NEW);
    expect((await pageEvents()).slice(before.length).map((e) => [e.action, e.detail.version])).toEqual([['content.page_withdraw', 2]]);
    if (WEB) {
      // زمان‌دار هرگز روی سایت نرفت: همان نشانی و تیتر قبلی.
      const site = await sitePage(page.context());
      expect(await siteText(site, `/${SLUG}`, 'main h1')).toBe(TITLE);
      await site.close();
    }

    // همان متن «همین حالا»: نسخهٔ 3، و نسخهٔ 2 «پس گرفته شد» می‌ماند.
    await page.getByRole('button', { name: 'انتشار…' }).click();
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/versions\\?done=3$`));
    await expect(versions.locator('li[data-version="2"] .jy-badge')).toHaveText(['پس گرفته شد']);
    await expect(versions.locator('li[data-version="3"] .jy-badge')).toHaveText(['روی سایت']);
    await expect(versions.locator('li[data-version="1"]').getByRole('link', { name: 'برگرداندن…' })).toBeVisible();
    expect((await versionsOf(SLUG)).map((row) => [row.version, row.slug, row.withdrawn])).toEqual([
      [1, SLUG, false],
      [2, SLUG_NEW, true],
      [3, SLUG_NEW, false],
    ]);

    await page.goto(at('/content/pages'));
    await expect(page.getByTestId('pages-moved').locator('li').nth(1)).toHaveText(`/${SLUG} ← /${SLUG_NEW}نشانی «پرینت پی‌دی‌اف» پس از انتشار عوض شد`);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, `/${SLUG_NEW}`, 'main h1'), ISR).toBe(TITLE_NEW);
      await expect.poll(() => siteHop(site.request, `/${SLUG}`), ISR).toBe(`301 /${SLUG_NEW}`);
      await site.close();
    }
  });

  test('گوشی و دسکتاپ: فهرست، ویرایشگرها، انتشار، برداشتن و نسخه‌ها، بی سرریز افقی، هدف لمسی ۴۴ پیکسل و آیکون‌های با شکل', async ({ browser }) => {
    test.setTimeout(180_000);
    const paths = [
      '/content/pages',
      '/content/pages/new',
      `/content/pages/${pageA}`,
      '/content/pages/tarefe',
      `/content/pages/${pageA}/publish?from=1`,
      `/content/pages/${pageA}/remove`,
      `/content/pages/${pageA}/versions`,
      `/content/pages/${pageA}/versions/1`,
      '/content/pages/tarefe/versions/default',
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

  test('مالک: صفحهٔ دوم با پیوند به اولی؛ «پیدا نشد» بسته، برداشتن «به صفحهٔ دیگری» تا ۳۰۱ به «تعرفه»، و دومی «پیدا نشد» تا ۴۰۴', async () => {
    test.setTimeout(360_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content/pages/new'));
    await page.getByLabel('نشانی').fill(SLUG_B);
    await page.getByLabel('نام کوتاه').fill('پرینت ارزان');
    await page.getByLabel('تیتر صفحه').fill(`پرینت ارزان جزوه ${RUN}`);
    await page.getByLabel('جملهٔ زیر تیتر').fill('ارزان، بی کیفیت کمتر.');
    await page.getByLabel('متن صفحه').fill(`## چرا ارزان\nفایل PDF هم [همین‌جا](/${SLUG_NEW}) چاپ می‌شود.`);
    await page.getByLabel('عنوان').fill('پرینت ارزان');
    await page.getByLabel('توضیح').fill('پرینت ارزان جزوه، با قیمت روشن.');
    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/\d+\/publish$/);
    pageB = /\/content\/pages\/(\d+)\//.exec(page.url())![1]!;
    await expect(page.getByTestId('page-diff').locator('li')).toHaveText([
      `پس از انتشارصفحهٔ «پرینت ارزان جزوه ${RUN}»، با 1 بخش متن؛ در نقشهٔ سایت، بی پیوند در پاورقی.`,
    ]);
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageB}/versions\\?done=1$`));

    // برداشتن اولی: پیوند دومی «پیدا نشد» را می‌بندد، نشانی قبلی‌اش همین حالا به آن می‌رود، و مقصدها با «تعرفه» و دومی.
    await page.goto(at('/content/pages'));
    await page.getByTestId('pages-list').locator(`li[data-page="${pageA}"]`).getByRole('link', { name: 'از سایت بردار…' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/remove$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('از سایت برداشتن «پرینت پی‌دی‌اف»');
    await expect(page.getByTestId('page-inbound')).toContainText(`1 پیوند روی سایت به این صفحه است:«پرینت ارزان»، به /${SLUG_NEW}`);
    await expect(page.locator('main')).toContainText(`/${SLUG} هم همین حالا به این صفحه می‌رود`);
    await expect(page.getByRole('radio', { name: /به صفحهٔ دیگری/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /پیدا نشد/ })).toBeDisabled();
    await expect(page.getByLabel('به', { exact: true }).locator('option')).toHaveText(['صفحهٔ اصلی', 'تعرفه (/tarefe)', `پرینت ارزان (/${SLUG_B})`]);

    // فرم دست‌ساز با «پیدا نشد»: سرور هم می‌بندد، پیش از کد.
    await page.getByRole('radio', { name: /پیدا نشد/ }).evaluate((input: HTMLInputElement) => {
      input.disabled = false;
      input.checked = true;
    });
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'از سایت بردار' }).click();
    await expect(page).toHaveURL(new RegExp(`/content/pages/${pageA}/remove\\?e=page_remove_linked`));
    await expect(page.locator('main .jy-note--error')).toHaveText(
      '«پیدا نشد» بسته است، چون متنی روی سایت یا زمان‌دار به این صفحه پیوند دارد؛ پیوندشان را عوض کن، یا «به صفحهٔ دیگری» را انتخاب کن.',
    );
    expect((await versionsOf(SLUG_NEW)).map((row) => row.removal)).toEqual([null, null, null]);

    await page.getByLabel('به', { exact: true }).selectOption('tariff');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'از سایت بردار' }).click();
    await expect(page).toHaveURL(/\/content\/pages\?done=removed/);
    await expect(page.locator('main .jy-note--success')).toHaveText('صفحه از سایت برداشته شد؛ تا یک دقیقه بعد نشانی‌اش همان می‌شود که انتخاب کردی.');
    const rowA = page.getByTestId('pages-list').locator(`li[data-page="${pageA}"]`);
    await expect(rowA.locator('.jy-badge')).toHaveText(['برداشته']);
    await expect(rowA.locator('.ad-texts__meta')).toHaveText(`/${SLUG_NEW} · برداشته شد، امروز: به /tarefe`);
    await expect(page.getByTestId('pages-moved').locator('li')).toHaveText([
      '/chap-jozve ← صفحهٔ اصلی«چاپ جزوه» خود صفحهٔ اصلی است؛ ثابت سایت، نه از پنل',
      `/${SLUG} ← /tarefe«پرینت پی‌دی‌اف» از سایت برداشته شد، «به صفحهٔ دیگری»`,
      `/${SLUG_NEW} ← /tarefe«پرینت پی‌دی‌اف» از سایت برداشته شد، «به صفحهٔ دیگری»`,
    ]);
    expect((await versionsOf(SLUG_NEW)).at(-1)).toMatchObject({ version: 4, removal: 'moved', title: null });
    expect((await pageEvents()).at(-1)?.detail).toEqual({ page: Number(pageA), version: 4, slug: SLUG_NEW, mode: 'moved', to: expect.any(Number), toPath: '/tarefe' });

    // دومی: بی پیوند، پس «پیدا نشد» باز است.
    await page.getByTestId('pages-list').locator(`li[data-page="${pageB}"]`).getByRole('link', { name: 'از سایت بردار…' }).click();
    await expect(page.locator('main')).toContainText('هیچ متنی روی سایت به این صفحه پیوند ندارد.');
    await page.getByRole('radio', { name: /پیدا نشد/ }).check();
    await expect(page.getByLabel('به', { exact: true })).toBeHidden();
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'از سایت بردار' }).click();
    await expect(page).toHaveURL(/\/content\/pages\?done=removed/);
    await expect(page.getByTestId('pages-list').locator(`li[data-page="${pageB}"] .ad-texts__meta`)).toHaveText(`/${SLUG_B} · برداشته شد، امروز: «پیدا نشد»`);

    // ویرایشگر صفحهٔ برداشته آخرین متنش را دارد.
    await page.goto(at(`/content/pages/${pageB}`));
    await expect(page.locator('main .jy-note--info').first()).toHaveText(
      'این صفحه «پیدا نشد» از سایت برداشته شده؛ فرم آخرین متنش را دارد. با «انتشار…» همان نشانی برمی‌گردد.',
    );
    await expect(page.getByLabel('نشانی')).toHaveValue(SLUG_B);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      // هر دو نشانی اولی با یک ۳۰۱ به «تعرفه» (نه زنجیره)، دومی ۴۰۴، و نقشهٔ سایت بی هر دو.
      await expect.poll(() => siteHop(site.request, `/${SLUG_NEW}`), ISR).toBe('301 /tarefe');
      expect(await siteHop(site.request, `/${SLUG}`)).toBe('301 /tarefe');
      await expect.poll(() => siteHop(site.request, `/${SLUG_B}`), ISR).toBe('404');
      await expect.poll(async () => (await site.request.get(`${WEB}/sitemap.xml`)).text(), ISR).not.toContain(`-${RUN}</loc>`);
      await site.close();
    }
  });

  test('مالک: «تعرفه» با تیتر و سؤال تازه تا صفحهٔ «تعرفه» سایت، برگشت به متن پیش‌فرض، و رویدادها بی متن', async () => {
    test.setTimeout(300_000);
    const { page, problems } = who.owner;
    await page.goto(at('/content/pages'));
    await page.getByTestId('pages-list').locator('li[data-page="tarefe"]').getByRole('link', { name: 'ویرایش' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe$/);
    await expect(page.getByRole('heading', { level: 1, name: 'تعرفه' })).toBeVisible();
    await expect(page.locator('main .ad-sub')).toHaveText('jozveyar.com/tarefe · متن پیش‌فرض سایت');
    await expect(page.getByLabel('تیتر صفحه')).toHaveValue(TARIFF_DEFAULT);
    const items = page.getByTestId('page-faq').locator(':scope > li');
    await expect(items).toHaveCount(3);

    // «سؤال تازه» بی JS: سؤال خالی با خطا، بعد پر.
    await page.getByLabel('تیتر صفحه').fill(TARIFF_TITLE);
    await page.getByRole('button', { name: 'سؤال تازه' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe\?saved=1&n=[0-9a-z]+&open=3$/);
    await expect(items).toHaveCount(4);
    await expect(page.getByTestId('page-issues').locator('li')).toHaveText(['پرسش 4: خالی است.', 'پاسخ 4: خالی است.']);
    // «انتشار…» تا ذخیرهٔ بی خطا بسته است، مثل ۱۱٫۱: خطا از پیش‌نویس ذخیره‌شده است، نه از آنچه در فرم تایپ شد.
    await expect(page.getByRole('button', { name: 'انتشار…' })).toBeDisabled();
    await items.nth(3).getByLabel('پرسش').fill(QUESTION);
    await items.nth(3).getByLabel('پاسخ').fill('نه؛ فاکتور رسمی پس از صورت‌حساب رسمی می‌آید.');
    await page.getByRole('button', { name: 'ذخیره و پیش‌نمایش' }).click();
    await expect(page.getByTestId('page-issues')).toHaveCount(0);
    await page.getByRole('button', { name: 'انتشار…' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe\/publish$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('انتشار تعرفه');
    await expect(page.locator('main .ad-sub')).toHaveText(/^پیش‌نویس امروز \d{2}:\d{2} به جای متن پیش‌فرض، در jozveyar\.com\/tarefe\.$/);
    await expect(page.getByTestId('page-diff').locator('.ad-mddiff__sec')).toHaveText(['تیتر صفحه', `سؤال 4: ${QUESTION}`]);
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'منتشر کن' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe\/versions\?done=1$/);
    const versions = page.getByTestId('page-versions');
    await expect(versions.locator('li[data-version="default"]').getByRole('link', { name: 'برگرداندن…' })).toBeVisible();
    expect((await versionsOf('tariff')).map((row) => [row.version, row.title])).toEqual([[1, TARIFF_TITLE]]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/tarefe', 'main h1'), ISR).toBe(TARIFF_TITLE);
      await expect(site.locator('main')).toContainText(QUESTION);
      await site.close();
    }

    // برگشت به متن پیش‌فرض با کد تازه: نسخهٔ 2 بی متن.
    await versions.locator('li[data-version="default"]').getByRole('link', { name: 'برگرداندن…' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe\/publish\?from=default$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('برگرداندن تعرفه به متن پیش‌فرض');
    await page.getByLabel('کد برنامهٔ تأیید تو').fill(await codeFor(ownerSecret));
    await page.getByRole('button', { name: 'برگردان' }).click();
    await expect(page).toHaveURL(/\/content\/pages\/tarefe\/versions\?done=2$/);
    await expect(page.locator('main .jy-note--success')).toHaveText('متن پیش‌فرض برگشت (نسخهٔ 2)؛ تا یک دقیقه بعد روی سایت است.');
    await expect(versions.locator('li[data-version="2"] .ad-versions__name')).toHaveText('نسخهٔ 2 · برگشت به متن پیش‌فرض');
    await expect(versions.locator('li[data-version="2"] .jy-badge')).toHaveText(['روی سایت']);
    expect((await versionsOf('tariff')).map((row) => [row.version, row.restored_from, row.title])).toEqual([
      [1, null, TARIFF_TITLE],
      [2, 0, null],
    ]);

    // رویدادها زیر «محتوای سایت»: نشانی و نسخه، بی تیتر و متن.
    await page.goto(at('/events?kind=content'));
    const log = page.locator('.ad-log');
    await expect(log).toContainText(`صفحهٔ /${SLUG} منتشر شد، نسخهٔ 1، با کد تازه`);
    await expect(log).toContainText(`زمان‌دار صفحهٔ /${SLUG_NEW} (نسخهٔ 2`);
    await expect(log).toContainText(`صفحهٔ /${SLUG_NEW} منتشر شد، نسخهٔ 3، با کد تازه؛ /${SLUG} از این پس به نشانی تازه می‌رود`);
    await expect(log).toContainText(`صفحهٔ /${SLUG_NEW} از سایت برداشته شد، به /tarefe، با کد تازه`);
    await expect(log).toContainText(`صفحهٔ /${SLUG_B} از سایت برداشته شد، «پیدا نشد»، با کد تازه`);
    await expect(log).toContainText('صفحهٔ «تعرفه» به متن پیش‌فرض برگشت، نسخهٔ 2، با کد تازه');
    for (const hidden of [TITLE, TITLE_NEW, TARIFF_TITLE, QUESTION]) await expect(page.locator('main')).not.toContainText(hidden);
    expect(problems).toEqual([]);

    if (WEB) {
      const site = await sitePage(page.context());
      await expect.poll(() => siteText(site, '/tarefe', 'main h1'), ISR).toBe(TARIFF_DEFAULT);
      await expect(site.locator('main')).not.toContainText(QUESTION);
      await site.close();
    }
  });

  test('متصدی: «محتوای سایت» بی کارت صفحه‌ها و بی صفحه‌هایش؛ حسابدار نه زبانه، نه صفحه', async () => {
    const operator = who.operator.page;
    await operator.goto(at('/content'));
    await expect(operator.getByTestId('content-bar')).toBeVisible();
    await expect(operator.getByTestId('content-pages')).toHaveCount(0);
    for (const path of ['/content/pages', '/content/pages/new', `/content/pages/${pageA}`, '/content/pages/tarefe/publish', `/content/pages/${pageA}/remove`, '/content/pages/tarefe/versions']) {
      await operator.goto(at(path));
      await expect(operator.locator('main'), path).toContainText('این بخش فقط برای مالک است');
      await expect(operator.locator('main form textarea, main form input[name="page"]'), path).toHaveCount(0);
    }
    const accountant = who.accountant.page;
    await accountant.goto(at('/content/pages'));
    await expect(accountant.locator('main')).toContainText('این بخش برای حسابدار باز نیست');
    expect([who.operator.problems, who.accountant.problems]).toEqual([[], []]);
  });
});
