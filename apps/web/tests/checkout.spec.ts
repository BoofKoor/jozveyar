import { expect, test, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';
import type { Breakdown } from '@jozveyar/contracts';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  DEFAULT_SHIPPING_METHOD_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatDeadlineDay, formatJalaliWeekday, formatTomans } from '@jozveyar/text';

/**
 * مسیر خرید، سرتاسری (برش ۳ج؛ طرح `docs/ui/mockups/checkout.html`، ADR-033 تا ADR-035): از «ادامه» تا «سفارش
 * ثبت شد»، روی build تولیدی با پستگرس، Garage و کارگر اسناد واقعی. کد پیامکی را تست مستقیم از `sms_messages`
 * می‌خواند (پیامک کنسولی)؛ هیچ مسیر پشتی در وب نیست.
 *
 *   CHECKOUT_MODE=mock SESSION_SECRET=<۳۲+ نویسه> DATABASE_URL=… S3_ENDPOINT=… S3_PUBLIC_ENDPOINT=… \
 *   S3_ACCESS_KEY=… S3_SECRET_KEY=… S3_BUCKET=jozveyar NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3300 \
 *     node scripts/serve-standalone.mjs 3300
 *   DATABASE_URL=… python -m docworker        (از services/docworker، با همان متغیرها)
 *   E2E_CHECKOUT_BASE_URL=http://127.0.0.1:3300 DATABASE_URL=… npx playwright test tests/checkout.spec.ts
 *
 * پایگاه دادهٔ تازه لازم است: تعرفهٔ فعال همان تعرفهٔ پایه است و عددهای انتظار از همان `quote()` درمی‌آیند.
 * بی این متغیرها رد می‌شود؛ CI آن را در مرحلهٔ «مسیر خرید، سرتاسری» اجرا می‌کند.
 */

const BASE = process.env.E2E_CHECKOUT_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

test.skip(!BASE || !DATABASE_URL, 'بدون E2E_CHECKOUT_BASE_URL و DATABASE_URL — سرور mock، پستگرس، Garage و کارگر لازم است');
test.use({ baseURL: BASE });
test.setTimeout(120_000);

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);

let sqlClient: ReturnType<typeof postgres> | null = null;
const sql = () => (sqlClient ??= postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined }));
test.afterAll(async () => {
  await sqlClient?.end();
  sqlClient = null;
});

/** قیمت همان جزوه با `quote()` و تعرفهٔ پایه؛ سرور با تعرفهٔ فعال پایگاه داده، که روی پایگاه دادهٔ تازه همین است. */
function priceOf(pages: number, zoneId: 'tehran' | 'other' | null): Breakdown {
  return quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: pages }],
          rules: wholeDocumentRule(pages, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: 'double',
          paperSize: 'a4',
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
    },
    SEED_PRICE_LIST,
  );
}
const toman = (rials: number) => formatTomans(rials, false);
/** ۱۰ صفحهٔ سیاه‌سفید دورو (`plain-bw-10.pdf`)، بی ارسال و با کرایهٔ هر منطقه. */
const TEN = { none: priceOf(10, null), tehran: priceOf(10, 'tehran'), other: priceOf(10, 'other') };

/** هر مرورگر IP خودش را دارد، تا سقف ۲۰ کد در ساعت هر IP (ADR-033) بین تست‌ها و اجراها پر نشود. */
async function newContext(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport,
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
}
const newMobile = () => `0912${String(randomInt(10_000_000)).padStart(7, '0')}`;

/** دکمه‌ای که الان دیده می‌شود: در دسکتاپ خلاصه، در موبایل نوار. */
const visibleButton = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();

/** فایل، و صبر تا رسیدنش به سرور و بررسی سرور: «ادامه» فقط آن‌وقت باز است (ADR-034). */
async function dropOn(page: Page, file = 'plain-bw-10.pdf') {
  await page.setInputFiles('#jozve-file', fixture(file));
  await expect(visibleButton(page, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });
}

async function dropReady(page: Page, file = 'plain-bw-10.pdf') {
  await page.goto('/');
  await dropOn(page, file);
}

/** نشانه‌هایی که `flow.spec.ts` در باندل اولیه نبودنشان را می‌سنجد: تکهٔ مسیر خرید و فهرست شهرها. */
const CHECKOUT_MARKERS = ['ck-cities', '/api/checkout/otp', 'بندرعباس'];

async function toCity(page: Page) {
  await visibleButton(page, 'ادامه — آدرس و تحویل').click();
  await expect(page.getByRole('heading', { level: 1, name: 'به کدام شهر بفرستیم؟' })).toBeVisible();
}

const RECIPIENT = { address: 'بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴، واحد ۳', postal: '۹۱۸۹۹۱۴۳۶۵', name: 'سارا  احمدي' };

async function toPay(page: Page) {
  await toCity(page);
  await page.getByRole('button', { name: 'مشهد' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'نشانی در مشهد' })).toBeVisible();
  await page.getByLabel('نشانی', { exact: true }).fill(RECIPIENT.address);
  await page.getByLabel('کد پستی').fill(RECIPIENT.postal);
  await page.getByLabel('نام گیرنده').fill(RECIPIENT.name);
  await page.getByLabel('نام گیرنده').press('Enter');
}

/** آخرین کد پیامکی این شماره، از پیامک کنسولی. */
async function codeOf(mobile: string): Promise<string> {
  let body = '';
  await expect
    .poll(async () => {
      const [row] = await sql()`select body from sms_messages where to_mobile = ${mobile} and purpose = 'otp' order by id desc limit 1`;
      body = row?.body ?? '';
      return body;
    })
    .toMatch(/\d{5}/);
  return /(\d{5})/.exec(body)![1]!;
}

async function signIn(page: Page, mobile: string) {
  await expect(page.getByRole('heading', { level: 1, name: 'تأیید با پیامک' })).toBeVisible();
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.getByLabel('شمارهٔ موبایل').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'کد تأیید' })).toBeVisible();
  await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
  await page.getByLabel('کد پیامک').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();
}

/** «پرداخت X تومان»، درگاه نمونه، و تصمیم؛ برمی‌گرداند شمارهٔ سفارشی که درگاه نشان داد. */
async function payAt(page: Page, decision: 'پرداخت موفق' | 'پرداخت ناموفق' | 'انصراف و بازگشت', totalRials: number) {
  await visibleButton(page, `پرداخت ${toman(totalRials)} تومان`).click();
  await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'درگاه پرداخت نمونه' })).toBeVisible();
  // بی پوستهٔ سایت: نه سربرگ، نه پاورقی
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('contentinfo')).toBeHidden();
  await expect(page.locator('.ck-gate__lines')).toContainText(`${toman(totalRials)} تومان`);
  const number = Number(await page.locator('.ck-gate__lines dd.num').textContent());
  await page.getByRole('button', { name: decision }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]{36}$/);
  return number;
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

/** `.num` دیدنی حرف فارسی ندارد (مثل card.spec.ts)؛ و چیزی برای سنجیدن بود. */
async function plainNumbers(page: Page, atLeast: number) {
  const texts = await page
    .locator('.num')
    .evaluateAll((elements) => elements.filter((el) => el.checkVisibility()).map((el) => el.textContent ?? ''));
  expect(texts.filter((text) => /[؀-ۿ]/.test(text))).toEqual([]);
  expect(texts.length).toBeGreaterThanOrEqual(atLeast);
}

test.describe.serial('سفارش کامل', () => {
  let context: BrowserContext;
  let page: Page;
  let orderUrl = '';
  const mobile = newMobile();

  test.beforeAll(async ({ browser }) => {
    context = await newContext(browser);
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('شهر با یک تپ، نشانی، کد پیامکی، مرور، درگاه نمونه، و «سفارش ثبت شد»', async () => {
    // شاهد نشانه‌های `flow.spec.ts`: پیش از فایل در هیچ اسکریپتی نیستند، و تا قدم شهر رسیده‌اند.
    const scripts: Promise<string>[] = [];
    const onScript = (response: Response) => {
      if (response.request().resourceType() !== 'script') return;
      scripts.push(response.body().then((body) => body.toString('latin1'), () => ''));
    };
    page.on('response', onScript);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initial = (await Promise.all(scripts)).join('\n');
    await dropOn(page);
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.none.totalWithoutShippingRials));
    await toCity(page);
    const loaded = (await Promise.all(scripts)).join('\n');
    page.off('response', onScript);
    for (const marker of CHECKOUT_MARKERS) {
      const bytes = Buffer.from(marker).toString('latin1');
      expect(initial.includes(bytes), `${marker}، پیش از فایل`).toBe(false);
      expect(loaded.includes(bytes), `${marker}، تا قدم شهر`).toBe(true);
    }

    // قدم شهر: کرایهٔ هر دو منطقه از قیمت سرور، و هیچ دکمه‌ای؛ تپ روی شهر خودش کار است.
    await expect(page.getByTestId('zone-rates')).toHaveText(
      `کرایهٔ پست پیشتاز در استان تهران ${toman(TEN.tehran.shippingRials!)} و بقیهٔ کشور ${toman(TEN.other.shippingRials!)} تومان`,
    );
    await expect(page.locator('.home-sum__go')).toHaveCount(0);
    await expect(page.getByTestId('shipping-from')).toContainText(toman(TEN.none.shippingFromRials!));
    const steps = page.getByRole('navigation', { name: 'قدم‌های سفارش' }).getByRole('listitem');
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');
    await expect(steps.first().getByRole('link', { name: 'جزوه و قیمت' })).toBeVisible();

    // مشهد: بقیهٔ کشور. ردیف ارسال و جمع با ارسال، از قیمت سرور.
    await page.getByRole('button', { name: 'مشهد' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'نشانی در مشهد' })).toBeVisible();
    await expect(page.locator('.ck-sub')).toContainText(`خراسان رضوی · پست پیشتاز ${toman(TEN.other.shippingRials!)} تومان`);
    await expect(page.getByTestId('summary-shipping')).toHaveText(`ارسال پست پیشتاز به مشهد${toman(TEN.other.shippingRials!)}`);
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.other.totalRials));

    // کد پستی ۵ رقمی: خطا با سه نشانه همان‌جا، نه سه قدم بعد؛ Enter درون فیلد همان «ادامه» است.
    await page.getByLabel('نشانی', { exact: true }).fill(RECIPIENT.address);
    await page.getByLabel('کد پستی').fill('12345');
    await page.getByLabel('نام گیرنده').fill(RECIPIENT.name);
    await page.getByLabel('نام گیرنده').press('Enter');
    await expect(page.getByTestId('ck-postal-error')).toHaveText('کد پستی 10 رقم است. اگر نمی‌دانی، خالی بگذار.');
    await expect(page.getByLabel('کد پستی')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('کد پستی')).toBeFocused();
    await page.getByLabel('کد پستی').fill(RECIPIENT.postal);
    await visibleButton(page, 'ادامه — موبایل و پرداخت').click();

    await signIn(page, mobile);

    // مرور: جزوه، گیرندهٔ نرمال‌شده، موبایل تأییدشده، تحویل؛ جمع روی دکمه همان جمع سرور.
    await expect(page.getByTestId('recap-jozve')).toContainText('plain-bw-10.pdf');
    await expect(page.getByTestId('recap-address')).toContainText('سارا احمدی');
    await expect(page.getByTestId('recap-address')).toContainText('مشهد، بلوار وکیل‌آباد، وکیل‌آباد 12، پلاک 24، واحد 3');
    await expect(page.getByTestId('recap-address')).toContainText('کد پستی 9189914365');
    await expect(page.getByTestId('recap-mobile')).toContainText(`${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`);
    await expect(page.getByTestId('recap-mobile')).toContainText('تأیید شد');
    // پیش‌نیاز `live` (ADR-052): مرور به `/terms` پیوند می‌دهد، و خود صفحه ۲۰۰ است (`site.spec.ts`).
    await expect(page.getByRole('link', { name: 'قوانین جزوه‌یار' })).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'قوانین جزوه‌یار' })).toHaveAttribute('target', '_blank');
    await plainNumbers(page, 8);

    const number = await payAt(page, 'پرداخت موفق', TEN.other.totalRials);
    orderUrl = page.url();

    // صفحهٔ سفارش: «ثبت شد»، روز تحویل به پست همان که سرور حساب کرد، و خلاصهٔ منجمد.
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await expect(page.getByTestId('order-paid')).toContainText(`سفارش ${number} · ${toman(TEN.other.totalRials)} تومان پرداخت شد.`);
    const [order] = await sql()`
      select status, post_handoff_due_at, recipient_name, postal_code, recipient_phone, id
      from orders where order_number = ${number}`;
    expect(order).toMatchObject({ status: 'paid', recipient_name: 'سارا احمدی', postal_code: '9189914365', recipient_phone: mobile });
    await expect(page.getByTestId('handoff-day')).toHaveText(`تحویل به پست تا ${formatDeadlineDay(order!.post_handoff_due_at as Date)}`);
    await expect(page.locator('.home-sum__label')).toHaveText('پرداخت شد');
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.other.totalRials));
    // پس از پرداخت، قدم‌ها همه انجام‌شده‌اند و هیچ‌کدام پیوند نیست.
    await expect(page.getByRole('navigation', { name: 'قدم‌های سفارش' }).locator('li.is-done')).toHaveCount(3);
    await expect(page.getByRole('navigation', { name: 'قدم‌های سفارش' }).getByRole('link')).toHaveCount(0);
    await expect(page).toHaveTitle(/سفارش/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await plainNumbers(page, 6);
    // کارگر PDF جزوه و فایل چاپ (`prepare_order`) و برگهٔ سفارش (`prepare_ticket`، برش ۵٫۱) را می‌سازد.
    const jobs = await sql()`select kind from jobs where order_id = ${order!.id} order by kind`;
    expect(jobs.map((job) => job.kind)).toEqual(['prepare_order', 'prepare_ticket']);
    // چاپخانه در همان تراکنش پرداخت (برش ۵٫۲): تنها چاپخانهٔ دادهٔ پایه در تهران است و سفارش به مشهد، پس از ۱۰٫۱ «نزدیک‌ترین»
    // (پیش‌فرض فقط برابری فاصله است)؛ کرایه همان کرایهٔ مشهد.
    const assigned = await sql()`
      select p.name, a.rule, a.actor, a.from_partner_id, o.print_partner_id = p.id as current, o.shipping_zone_id
      from order_assignments a join print_partners p on p.id = a.to_partner_id join orders o on o.id = a.order_id
      where a.order_id = ${order!.id}`;
    expect(assigned).toEqual([
      { name: 'چاپخانهٔ جزوه‌یار', rule: 'nearest', actor: 'system', from_partner_id: null, current: true, shipping_zone_id: 'other' },
    ]);
  });

  test('غریبه فقط شماره، وضعیت و روز تحویل را می‌بیند', async ({ browser }) => {
    const stranger = await newContext(browser);
    const other = await stranger.newPage();
    await other.goto(orderUrl);
    await expect(other.getByTestId('order-stranger')).toContainText('پرداخت شد');
    await expect(other.getByTestId('order-stranger')).toContainText('تحویل به پست تا');
    await expect(other.getByText('سارا احمدی')).toHaveCount(0);
    await expect(other.getByText(mobile.slice(7))).toHaveCount(0);
    await expect(other.getByText('تومان')).toHaveCount(0);
    await stranger.close();

    // شاهد: همان نشانی با نشست صاحب سفارش موبایل و مبلغ را دارد
    await page.goto(orderUrl);
    await expect(page.getByTestId('order-paid')).toContainText(mobile.slice(7));
    await expect(page.getByText('تومان')).not.toHaveCount(0);
  });

  test('وضعیت‌های پنل روی صفحهٔ سفارش (۴٫۳): در حال چاپ، به پست رسید، و لغو شد با مبلغی که برمی‌گردد', async ({ browser }) => {
    // پنل وضعیت را از همان گذارهایی عوض می‌کند که تریگر `orders_status_flow` می‌پذیرد؛ اینجا همان را با SQL.
    const token = new URL(orderUrl).pathname.split('/').at(-1)!;
    const [order] = await sql()`select order_number, total_rials::text, post_handoff_due_at from orders where public_token = ${token}`;
    const number = order!.order_number as number;
    const total = Number(order!.total_rials);
    const due = order!.post_handoff_due_at as Date;
    const set = (status: string, handedAt: Date | null = null) =>
      sql()`update orders set status = ${status}, handed_to_post_at = ${handedAt} where public_token = ${token}`;

    await set('printing');
    await page.goto(orderUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'جزوه‌ات در حال چاپ است' })).toBeVisible();
    const printing = page.getByTestId('order-printing');
    await expect(printing.locator('.ck-sub')).toHaveText(`سفارش ${number} · ${toman(total)} تومان پرداخت شد.`);
    await expect(printing.locator('li[aria-current="step"]')).toHaveText('چاپ و صحافیجزوه‌ات در حال چاپ و صحافی است.');
    await expect(page.getByTestId('handoff-day')).toHaveText(`تحویل به پست تا ${formatDeadlineDay(due)}`);
    await expect(page.locator('.home-sum__label')).toHaveText('پرداخت شد');
    await plainNumbers(page, 5);

    // یک دقیقه پیش از پایان مهلت: در مهلت.
    const handedAt = new Date(due.getTime() - 60_000);
    await set('handed_to_post', handedAt);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'جزوه‌ات به پست رسید' })).toBeVisible();
    const handed = page.getByTestId('order-handed');
    const day = formatJalaliWeekday(handedAt);
    await expect(handed.locator('.ck-sub')).toHaveText(`سفارش ${number} ${day} تحویل پست شد.`);
    await expect(handed.locator('li.is-done')).toHaveCount(3);
    await expect(handed.locator('li.is-done').last()).toHaveText(`تحویل به پست${day}، در مهلت.`);
    await expect(handed.locator('li[aria-current="step"]')).toContainText('کد رهگیری پست');
    await expect(handed.locator('li[aria-current="step"]')).toContainText(`${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}`);
    await expect(page.locator('.home-sum__ship')).toHaveText(`${day} تحویل پست شد.`);
    // غریبه: وضعیت و روز تحویل پست، نه بیشتر.
    const stranger = await newContext(browser);
    const other = await stranger.newPage();
    await other.goto(orderUrl);
    await expect(other.getByTestId('order-stranger')).toContainText('تحویل پست شد');
    await expect(other.getByTestId('order-stranger')).toContainText(`${day} تحویل پست شد.`);
    await expect(other.getByText('تومان')).toHaveCount(0);
    await stranger.close();

    // برگرداندن یک قدم، و لغو.
    await set('printing');
    await set('cancelled');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش لغو شد' })).toBeVisible();
    await expect(page.getByTestId('order-cancelled').locator('.ck-sub')).toHaveText(
      `سفارش ${number} لغو شد و چاپ نمی‌شود. مبلغ پرداختی، ${toman(total)} تومان، برمی‌گردد.`,
    );
    await expect(page.locator('.home-sum__label')).toHaveText('برمی‌گردد');
    await expect(page.locator('.home-sum__ship')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'جزوهٔ دیگری داری؟ بینداز' })).toHaveAttribute('href', '/');
    // پرداختی دوباره نیست.
    await expect(page.getByRole('button', { name: /پرداخت/ })).toHaveCount(0);
    await plainNumbers(page, 3);
    await set('paid');
  });

  test('همین گوشی موبایلش را تأیید کرده: جزوهٔ بعدی بی کد به مرور می‌رسد؛ «عوض کن» نشست را باطل می‌کند', async () => {
    await dropReady(page, 'image-scan-6.pdf');
    await visibleButton(page, 'ادامه — آدرس و تحویل').click();
    // جا و نشانی از سفارش قبل همین صفحه نیست (صفحه تازه بار شد)؛ شهر دوباره، و نشانی.
    await expect(page.getByRole('heading', { level: 1, name: 'به کدام شهر بفرستیم؟' })).toBeVisible();
    await page.getByRole('button', { name: 'تهران' }).click();
    await page.getByLabel('نشانی', { exact: true }).fill('تهران، خیابان ولیعصر، پلاک ۱۲');
    await page.getByLabel('نام گیرنده').fill('رضا کریمی');
    await page.getByLabel('نام گیرنده').press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();
    await expect(page.getByTestId('recap-mobile')).toContainText('تأیید شد');

    await page.getByTestId('recap-mobile').getByRole('button', { name: 'عوض کن' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'تأیید با پیامک' })).toBeVisible();
    await expect(page.getByLabel('شمارهٔ موبایل')).toHaveValue(mobile);
    const status = await page.evaluate(() => fetch('/api/checkout').then((r) => r.json()));
    expect(status).toEqual({ mode: 'mock', auth: null });
  });
});

/**
 * چند جزوه در یک سفارش (برش ۸٫۲، سؤال ۱۸۲؛ سؤال ۲۲۵): هر جزوه تنظیمات خودش، قیمت سرور با یک قلم برای هر جزوه و کرایه یک بار،
 * مرور «جزوه‌ها»، و سفارش با دو قلم منجمد؛ صفحهٔ سفارش با متن جمع.
 */
test('دو جزوه: هر کدام تنظیمات خودش، قیمت سرور با دو قلم، مرور «جزوه‌ها»، و سفارش با دو قلم', async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const mobile = newMobile();
  await page.goto('/');
  await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
  await expect(visibleButton(page, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });
  await page.getByTestId('jozve-ask').locator('label.jy-tile').filter({ hasText: 'هر فایل جزوهٔ جدا' }).click();
  // جزوهٔ ۲ (plain-bw-10، به ترتیب نام) دو نسخه
  await page.getByRole('button', { name: /^تنظیمات چاپ/ }).nth(1).click();
  await page.getByRole('button', { name: 'یکی بیشتر' }).click();
  const item = (pages: number, copies: number) => ({
    sections: [{ documentId: 'test', pageCount: pages }],
    rules: wholeDocumentRule(pages, 'bw', DEFAULT_PAPER_TYPE_ID),
    copies,
    sidesMode: 'double' as const,
    paperSize: 'a4' as const,
    bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  });
  const two = (zoneId: 'other' | null) =>
    quote({ items: [item(6, 1), item(10, 2)], shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null }, SEED_PRICE_LIST);
  await expect(page.getByTestId('summary-total')).toHaveText(toman(two(null).totalWithoutShippingRials));
  await expect(page.getByTestId('jozve-price')).toHaveText([toman(two(null).items[0]!.totalRials), toman(two(null).items[1]!.totalRials)]);

  await toPay(page);
  await signIn(page, mobile);
  const recap = page.getByTestId('recap-jozve');
  await expect(recap.locator('dt')).toHaveText('جزوه‌ها');
  await expect(recap.getByTestId('recap-jozves-item')).toHaveText([
    'جزوهٔ 11image-scan-6.pdf6 صفحه6 صفحه · سیاه‌سفید، دورو، A4 · طلق و سیم · 1 نسخه',
    'جزوهٔ 21plain-bw-10.pdf10 صفحه10 صفحه · سیاه‌سفید، دورو، A4 · طلق و سیم · 2 نسخه',
  ]);
  await expect(page.locator('.ck-sum-jozve .ck-file__name').first()).toHaveText('2 جزوه، 2 فایل');
  await expect(page.getByTestId('summary-jozve')).toHaveCount(2);
  await expect(page.getByTestId('summary-shipping')).toContainText(toman(two('other').shippingRials!));
  await expect(page.getByTestId('summary-total')).toHaveText(toman(two('other').totalRials));
  await expect(page.locator('.ck-sub').first()).toContainText('جزوه‌ها به صف چاپ می‌روند.');

  const number = await payAt(page, 'پرداخت موفق', two('other').totalRials);
  await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
  await expect(page.getByTestId('order-paid')).toContainText('جزوه‌هایت در صف چاپ‌اند.');
  await expect(page.getByTestId('summary-jozve')).toHaveCount(2);
  await expect(page.getByTestId('summary-total')).toHaveText(toman(two('other').totalRials));
  const items = await sql()`
    select i.seq, i.page_count, i.copies, array_agg(d.original_name order by s.seq) as files
    from order_items i join orders o on o.id = i.order_id
    join order_item_sections s on s.order_item_id = i.id join documents d on d.id = s.document_id
    where o.order_number = ${number} group by i.seq, i.page_count, i.copies order by i.seq`;
  expect(items).toEqual([
    { seq: 1, page_count: 6, copies: 1, files: ['image-scan-6.pdf'] },
    { seq: 2, page_count: 10, copies: 2, files: ['plain-bw-10.pdf'] },
  ]);
  await context.close();
});

/**
 * کد تخفیف (برش ۱۱٫۴، سؤال‌های ۲۹۸ تا ۳۰۱): در مرور، پس از کد پیامکی؛ متن یکدست (حرف کوچک و خط تیره همان کد است)، «اعمال شد» با ردیف
 * تخفیف و جمع سرور، و سفارش منجمد با کد. کدی که نیست، و همان مشتری با کد یک‌بارمصرفش در سفارش دوم، پیام روشن زیر فیلد. تعرفهٔ پایه پله
 * ندارد، پس کد همیشه می‌نشیند؛ پله در `tariff.spec.ts`.
 */
test('کد تخفیف: یکدست، «اعمال شد» با ردیف تخفیف، سفارش منجمد با کد؛ کد ناشناس و «پیش‌تر به کار برده‌ای»', async ({ browser }) => {
  const code = `E2E${randomInt(36 ** 6).toString(36).toUpperCase().padStart(6, '0')}`;
  // ۲۰٪ تا 5,000 تومان: ۲۰٪ ده صفحه 12,200 تومان است، پس سقف می‌خورد.
  const [row] = await sql()`
    insert into discount_codes (code, kind, percent, max_discount_rials, created_by)
    values (${code}, 'percent', 20, 50000, gen_random_uuid()) returning id`;
  const terms = { id: row!.id as string, code, minOrderRials: 0, kind: 'percent' as const, percent: 20, maxRials: 50_000 };
  const withCode = quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: 10 }],
          rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: 'double',
          paperSize: 'a4',
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId: 'other' },
    },
    SEED_PRICE_LIST,
    { code: terms },
  );
  expect([withCode.discountRials, withCode.totalRials]).toEqual([50_000, TEN.other.totalRials - 50_000]);

  const context = await newContext(browser);
  const page = await context.newPage();
  const discountLine = page.getByTestId('summary-discount').filter({ visible: true });
  const apply = page.getByRole('button', { name: 'اعمال', exact: true });
  await dropReady(page);
  await toPay(page);
  await signIn(page, newMobile());

  await page.getByTestId('discount-open').click();
  await page.getByLabel('کد تخفیف').fill('NOPE404');
  await apply.click();
  await expect(page.getByTestId('ck-discount-code-error')).toHaveText('این کد را نمی‌شناسیم؛ همان را که داری دوباره تایپ کن.');
  await expect(page.getByLabel('کد تخفیف')).toHaveAttribute('aria-invalid', 'true');
  await expect(discountLine).toHaveCount(0);

  await page.getByLabel('کد تخفیف').fill(` ${code.slice(0, 3).toLowerCase()}-${code.slice(3).toLowerCase()} `);
  await apply.click();
  await expect(page.getByTestId('discount-applied')).toContainText(`کد ${code} اعمال شد.`);
  await expect(discountLine).toHaveText(`تخفیف کد ${code}−5,000`);
  await expect(page.getByTestId('summary-total')).toHaveText(toman(withCode.totalRials));
  await plainNumbers(page, 8);

  const number = await payAt(page, 'پرداخت موفق', withCode.totalRials);
  await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
  await expect(discountLine).toHaveText(`تخفیف کد ${code}−5,000`);
  const [order] = await sql()`
    select discount_code_id, discount_rials::text as discount, total_rials::text as total, price_breakdown->'discount' as discount_json
      from orders where order_number = ${number}`;
  expect(order).toEqual({
    discount_code_id: terms.id,
    discount: '50000',
    total: String(withCode.totalRials),
    discount_json: { source: 'code', codeId: terms.id, code, percent: 20 },
  });

  // همین مشتری، سفارش دوم: سقف هر مشتری ۱ است و سفارش اول پرداخت شد.
  await dropReady(page, 'image-scan-6.pdf');
  await visibleButton(page, 'ادامه — آدرس و تحویل').click();
  await page.getByRole('button', { name: 'تهران' }).click();
  await page.getByLabel('نشانی', { exact: true }).fill('تهران، خیابان ولیعصر، پلاک ۱۲');
  await page.getByLabel('نام گیرنده').fill('رضا کریمی');
  await page.getByLabel('نام گیرنده').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();
  await page.getByTestId('discount-open').click();
  await page.getByLabel('کد تخفیف').fill(code);
  await apply.click();
  await expect(page.getByTestId('ck-discount-code-error')).toHaveText('این کد را پیش‌تر برای سفارش دیگری به کار برده‌ای.');
  await expect(discountLine).toHaveCount(0);
  await context.close();
});

test.describe('قدم‌ها', () => {
  test('«برگشت» گوشی قدم قبل را می‌آورد و «جلو» همان قدم را، با همان نشانی', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toCity(page);
    await page.getByRole('button', { name: 'مشهد' }).click();
    await page.getByLabel('نشانی', { exact: true }).fill(RECIPIENT.address);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'به کدام شهر بفرستیم؟' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: 'جزوهٔ تو' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'جزوهٔ تو' })).toBeFocused();
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.none.totalWithoutShippingRials));
    await page.goForward();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'نشانی در مشهد' })).toBeVisible();
    await expect(page.getByLabel('نشانی', { exact: true })).toHaveValue(RECIPIENT.address);
    // همان صفحه ماند: فایل دوباره بار نشد
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.other.totalRials));

    // پیوند قدم انجام‌شده هم همان است؛ و «ادامه»ی دوباره با جای انتخاب‌شده، مستقیم نشانی.
    await page.getByRole('navigation', { name: 'قدم‌های سفارش' }).getByRole('link', { name: 'جزوه و قیمت' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'جزوهٔ تو' })).toBeVisible();
    await visibleButton(page, 'ادامه — آدرس و تحویل').click();
    await expect(page.getByRole('heading', { level: 1, name: 'نشانی در مشهد' })).toBeVisible();
    await context.close();
  });

  test('جست‌وجوی شهر با نام استان؛ «در فهرست نیست؟»: استان، و نام شهر در خود نشانی', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toCity(page);

    await expect(page.getByRole('group', { name: 'شهرهای پرتکرار' })).toBeVisible();
    await page.getByRole('searchbox').fill('بندر');
    const results = page.getByRole('list', { name: 'شهرهای پیدا شده' }).getByRole('button');
    await expect(results.first()).toContainText('بندرعباس');
    await expect(results.first()).toContainText('هرمزگان');
    // با جست‌وجو دکمه‌های شهرهای پرتکرار کنار می‌روند
    await expect(page.getByRole('group', { name: 'شهرهای پرتکرار' })).toHaveCount(0);

    await page.getByRole('searchbox').fill('روستای ناپیدا');
    await expect(page.getByText('شهری با این نام پیدا نشد.')).toBeVisible();
    await page.getByRole('button', { name: 'استان را انتخاب کن' }).click();
    await page.getByRole('list', { name: 'استان‌ها' }).getByRole('button', { name: 'خراسان رضوی' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'نشانی در استان خراسان رضوی' })).toBeVisible();
    await expect(page.getByText('نام شهر یا روستا را هم بنویس.')).toBeVisible();
    await expect(page.getByTestId('summary-shipping')).toHaveText(
      `ارسال پست پیشتاز به استان خراسان رضوی${toman(TEN.other.shippingRials!)}`,
    );

    // Enter در جست‌وجو اولین نتیجه را برمی‌دارد
    await page.getByRole('button', { name: 'شهر دیگر' }).click();
    await page.getByRole('searchbox').fill('کرج');
    await page.getByRole('searchbox').press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'نشانی در کرج' })).toBeVisible();
    // کرج در البرز است، نه استان تهران: کرایهٔ بقیهٔ کشور (سؤال ۹)
    await expect(page.getByTestId('summary-shipping')).toContainText(toman(TEN.other.shippingRials!));
    await context.close();
  });

  test('کد اشتباه با فرصت باقی؛ «پیامک نرسید» بعد از ۹۰ ثانیه؛ کد منقضی و «ارسال کد تازه»', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    const mobile = newMobile();
    await page.clock.install();
    await dropReady(page);
    await toPay(page);
    await page.getByLabel('شمارهٔ موبایل').fill(mobile);
    await visibleButton(page, 'ارسال کد').click();
    await expect(page.getByRole('heading', { level: 1, name: 'کد تأیید' })).toBeVisible();
    const code = await codeOf(mobile);
    await expect(page.getByTestId('resend-wait')).toContainText('ارسال دوباره تا 1:');

    await page.getByLabel('کد پیامک').fill(code === '00000' ? '11111' : '00000');
    await visibleButton(page, 'تأیید کد').click();
    await expect(page.getByTestId('ck-otp-error')).toHaveText('کد درست نیست. دوباره نگاه کن و بزن؛ 2 بار دیگر فرصت هست.');
    await expect(page.getByLabel('کد پیامک')).toHaveAttribute('aria-invalid', 'true');

    // ۹۰ ثانیه بعد «پیامک نرسید؟»، نه زودتر؛ سرور هنوز «زود است» می‌گوید، پس شمارش معکوس برمی‌گردد.
    await expect(page.getByTestId('code-late')).toHaveCount(0);
    await page.clock.fastForward(91_000);
    await expect(page.getByTestId('code-late')).toContainText('پیامک نرسید؟');
    await expect(page.getByTestId('code-late').getByRole('button', { name: 'کد را با تماس صوتی بگیر' })).toHaveCount(0);
    await page.getByTestId('code-late').getByRole('button', { name: 'ارسال دوباره' }).click();
    await expect(page.getByTestId('resend-wait')).toBeVisible();

    // دو دقیقه گذشت، روی سرور هم: کد منقضی، فیلد بسته، و «ارسال کد تازه».
    await sql()`update otp_requests set created_at = created_at - interval '121 seconds', expires_at = expires_at - interval '121 seconds'
                where mobile = ${mobile}`;
    await page.clock.fastForward(121_000);
    await expect(page.getByTestId('code-closed')).toHaveText('این کد دیگر اعتبار ندارد؛ هر کد 2 دقیقه اعتبار دارد. کد تازه بگیر.');
    await expect(page.getByLabel('کد پیامک')).toBeDisabled();
    await visibleButton(page, 'ارسال کد تازه').click();
    await expect(page.getByLabel('کد پیامک')).toBeEnabled();
    await expect.poll(() => codeOf(mobile)).not.toBe(code);
    await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
    await page.getByLabel('کد پیامک').press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'مرور و پرداخت' })).toBeVisible();
    await context.close();
  });
});

test('موبایل مسدود (۱۲٫۲، سؤال ۲۱۲): کد نمی‌رود، «پرداخت» و «دوباره پرداخت کن» نه، با «تماس»؛ پس از رفع مسدودی همان راه', async ({ browser }) => {
  const MESSAGE = 'ثبت سفارش با این شماره ممکن نیست؛ از «تماس» پیام بده.';
  /** مسدودی همان‌طور که پنل می‌نشاند؛ رفعش همان بستن یک‌بارهٔ ردیف (`mobile_blocks_guard`). */
  const block = (mobile: string) =>
    sql()`insert into mobile_blocks (mobile, reason, blocked_by) values (${mobile}, 'آزمایش سرتاسری', gen_random_uuid())`;
  const unblock = (mobile: string) =>
    sql()`update mobile_blocks set unblocked_at = now(), unblocked_by = gen_random_uuid() where mobile = ${mobile} and unblocked_at is null`;
  const contactOf = async (note: ReturnType<Page['getByTestId']>) => {
    const link = note.getByRole('link', { name: '«تماس»' });
    await expect(link).toHaveAttribute('href', '/contact');
    await expect(link).toHaveAttribute('target', '_blank');
  };

  const context = await newContext(browser);
  const page = await context.newPage();
  await dropReady(page);
  await toPay(page);

  // کد پیامکی نمی‌رود: پیام زیر فیلد، بی ردیف کد.
  const blocked = newMobile();
  await block(blocked);
  await page.getByLabel('شمارهٔ موبایل').fill(blocked);
  await visibleButton(page, 'ارسال کد').click();
  await expect(page.getByTestId('ck-tel-error')).toHaveText(MESSAGE);
  await contactOf(page.getByTestId('ck-tel-error'));
  await expect(page.getByLabel('شمارهٔ موبایل')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'تأیید با پیامک' })).toBeVisible();
  expect(await sql()`select 1 from otp_requests where mobile = ${blocked}`).toHaveLength(0);

  // شمارهٔ دیگر کد می‌گیرد؛ مسدودی میان کد و «پرداخت»: سفارش ساخته نمی‌شود.
  const mobile = newMobile();
  await signIn(page, mobile);
  await block(mobile);
  await visibleButton(page, `پرداخت ${toman(TEN.other.totalRials)} تومان`).click();
  await expect(page.getByTestId('pay-failed')).toHaveText(MESSAGE);
  await contactOf(page.getByTestId('pay-failed'));
  expect(await sql()`select 1 from orders where recipient_phone = ${mobile}`).toHaveLength(0);

  // پس از رفع: سفارش و پرداخت ناموفق؛ مسدودی دوباره: «دوباره پرداخت کن» درگاه را باز نمی‌کند.
  await unblock(mobile);
  const number = await payAt(page, 'انصراف و بازگشت', TEN.other.totalRials);
  await block(mobile);
  await visibleButton(page, 'دوباره پرداخت کن').click();
  await expect(page.getByTestId('pay-again-failed')).toHaveText(MESSAGE);
  await contactOf(page.getByTestId('pay-again-failed'));
  await expect(page).toHaveURL(/\/order\//);
  const attempts = await sql()`select count(*)::int as n from payments p join orders o on o.id = p.order_id where o.order_number = ${number}`;
  expect(attempts[0]!.n).toBe(1);
  await unblock(mobile);
  await unblock(blocked);
  await context.close();
});

test.describe('پرداخت', () => {
  test('پرداخت ناموفق: علت از درگاه (کارت، لغو)، همان قیمت منجمد، و «دوباره پرداخت کن» تا «ثبت شد»', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toPay(page);
    await signIn(page, newMobile());

    // تا هدایت به درگاه (برش ۷٫۲، سؤال ۱۲۹): دکمهٔ بستهٔ «در حال رفتن…» و «خودکار برمی‌گردی».
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/checkout/orders', async (route) => {
      await held;
      await route.continue();
    });
    await visibleButton(page, `پرداخت ${toman(TEN.other.totalRials)} تومان`).click();
    await expect(page.getByTestId('pay-going')).toContainText('به درگاه پرداخت نمونه می‌روی.');
    await expect(page.getByTestId('pay-going')).toContainText('بعد از پرداخت، خودکار به همین سایت برمی‌گردی و سفارشت را می‌بینی.');
    await expect(visibleButton(page, 'در حال رفتن به درگاه نمونه…')).toBeDisabled();
    release();
    await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
    await page.unroute('**/api/checkout/orders');
    const number = Number(await page.locator('.ck-gate__lines dd.num').textContent());
    await page.getByRole('button', { name: 'پرداخت ناموفق' }).click();
    await page.waitForURL(/\/order\/[0-9a-f-]{36}$/);

    // علت از استعلام درگاه، گروه کارت (سؤال ۱۳۱)
    await expect(page.getByTestId('payment-failed')).toContainText(
      'پرداخت انجام نشد: موجودی کارت کافی نبود. پولی از حسابت کم نشده؛ با کارت دیگری دوباره پرداخت کن.',
    );
    await expect(page.getByTestId('order-awaiting')).toContainText(`سفارش ${number}`);
    await expect(page.getByTestId('order-awaiting')).toContainText('در انتظار پرداخت');
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.other.totalRials));
    // سفارش ساخته شده: مرور پیوند ویرایش ندارد
    await expect(page.getByTestId('order-awaiting').getByRole('button')).toHaveCount(0);

    // انصراف در درگاه: گروه لغو
    await visibleButton(page, 'دوباره پرداخت کن').click();
    await page.waitForURL(/\/pay\/mock\//);
    await page.getByRole('button', { name: 'انصراف و بازگشت' }).click();
    await page.waitForURL(/\/order\//);
    await expect(page.getByTestId('payment-failed')).toHaveText('پرداخت را در درگاه لغو کردی. پولی از حسابت کم نشده.');

    await visibleButton(page, 'دوباره پرداخت کن').click();
    await page.waitForURL(/\/pay\/mock\//);
    await expect(page.locator('.ck-gate__lines dd.num')).toHaveText(String(number));
    await page.getByRole('button', { name: 'پرداخت موفق' }).click();
    await page.waitForURL(/\/order\//);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    const payments = await sql()`select p.status, p.failure_code, p.gateway_status, p.settled_via from payments p join orders o on o.id = p.order_id
                                 where o.order_number = ${number} order by p.created_at`;
    expect(payments.map((p) => [p.status, p.failure_code, p.gateway_status, p.settled_via])).toEqual([
      ['failed', 'declined', 5, 'callback'],
      ['failed', 'cancelled', 3, 'callback'],
      ['succeeded', null, 1, 'callback'],
    ]);
    await context.close();
  });

  test('برگشت زودرس: «پرداخت هنوز انجام نشده» و تلاش نمی‌سوزد؛ پرداخت دوم بعد از «ثبت شد» یادداشت دارد (برش ۷٫۲)', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toPay(page);
    await signIn(page, newMobile());
    await visibleButton(page, `پرداخت ${toman(TEN.other.totalRials)} تومان`).click();
    await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
    const first = page.url().split('/').at(-1)!;
    const [row] = await sql()`select p.return_key, o.public_token, o.order_number from payments p join orders o on o.id = p.order_id
                              where p.authority = ${first}`;

    // برگشت پیش از هر تصمیمی (زودرس، یا نشانی دست‌ساز) با پارامترهای زیبال «ناموفق»، و بعد «موفق»: برگشت فقط کلید همان تلاش را
    // می‌خواند، و درگاه «در انتظار پرداخت» می‌گوید؛ پس نه می‌سوزد و نه پرداخت می‌شود (سؤال ۱۴۵).
    for (const forged of ['success=0&status=3', 'success=1&status=2']) {
      await page.goto(`/pay/callback/${row!.return_key}?trackId=${first}&${forged}&orderId=${row!.order_number}`);
      await page.waitForURL(`**/order/${row!.public_token}`);
      await expect(page.getByTestId('payment-unpaid')).toHaveText(
        'پرداخت هنوز انجام نشده. درگاه نمونه می‌گوید این پرداخت هنوز منتظر توست و پولی از حسابت کم نشده. اگر صفحهٔ پرداخت را بستی، دوباره پرداخت کن.',
      );
      await expect(page.getByTestId('payment-failed')).toHaveCount(0);
    }
    // فقط مبدأ به درگاه (سؤال ۱۲۲): «دوباره پرداخت کن» از همین صفحه به زیبال می‌رود.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin');
    // کلید ناشناس ۴۰۴؛ پارامتر درگاه چیزی را عوض نمی‌کند.
    expect((await page.request.get(`/pay/callback/${'0'.repeat(32)}?trackId=1&success=1&status=2`, { maxRedirects: 0 })).status()).toBe(404);

    // تلاش دوم با «دوباره پرداخت کن»، موفق.
    await visibleButton(page, 'دوباره پرداخت کن').click();
    await page.waitForURL(/\/pay\/mock\//);
    await page.getByRole('button', { name: 'پرداخت موفق' }).click();
    await page.waitForURL(/\/order\//);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await expect(page.getByTestId('extra-payment')).toHaveCount(0);

    // همان زبانهٔ اول هنوز باز بود و آن هم پرداخت شد: سفارش پیش‌تر پرداخت شده، پس `verify` هرگز (سؤال ۱۲۱).
    const decided = await page.request.post(`/api/checkout/mock-gateway/${first}`, { data: { decision: 'success' } });
    expect(decided.status()).toBe(200);
    const back = await page.request.get(((await decided.json()) as { redirectUrl: string }).redirectUrl, { maxRedirects: 0 });
    expect(back.status()).toBe(303);
    await page.reload();
    await expect(page.getByTestId('extra-payment')).toHaveText(
      `یک پرداخت دیگر هم برای همین سفارش انجام شد (${toman(TEN.other.totalRials)} تومان). سفارش پیش‌تر پرداخت شده بود، پس این یکی را تأیید نکردیم: ` +
        'درگاه نمونه آن را 15 دقیقه پس از پرداخت خودکار به همان کارت برمی‌گرداند، و بعضی بانک‌ها تا 72 ساعت دیرتر نشانش می‌دهند. کاری لازم نیست.',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    const payments = await sql()`select p.status, p.failure_code, p.gateway_status from payments p join orders o on o.id = p.order_id
                                 where o.order_number = ${row!.order_number} order by p.created_at`;
    expect(payments.map((p) => [p.status, p.failure_code, p.gateway_status])).toEqual([
      ['failed', 'order_not_payable', 2],
      ['succeeded', null, 1],
    ]);
    await context.close();
  });

  test('«پرداختت در حال بررسی است»: بی «دوباره پرداخت کن»، و صفحه خودش به «ثبت شد» می‌رسد (برش ۷٫۲، سؤال ۱۳۰)', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await page.clock.install();
    await dropReady(page);
    await toPay(page);
    await signIn(page, newMobile());
    await visibleButton(page, `پرداخت ${toman(TEN.other.totalRials)} تومان`).click();
    await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
    const authority = page.url().split('/').at(-1)!;
    // پول گرفته شد و پاسخ `verify` نرسید: همان حالت با SQL (درگاه نمونه شکست شبکه ندارد).
    const [row] = await sql()`update payments set gateway_status = 2, gateway_checked_at = now(), returned_at = now()
                              where authority = ${authority} returning (select public_token from orders where id = order_id) as public_token`;
    await page.goto(`/order/${row!.public_token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'پرداختت در حال بررسی است' })).toBeVisible();
    await expect(page.getByTestId('order-checking')).toContainText('دوباره پرداخت نکن. اگر پولی از حسابت کم شده، همین پرداخت است.');
    await expect(visibleButton(page, 'در حال بررسی پرداخت…')).toBeDisabled();
    await expect(page.getByRole('button', { name: /دوباره پرداخت/ })).toHaveCount(0);
    await expect(page.getByTestId('checking-refresh')).toContainText(/آخرین بررسی ساعت \d\d:\d\d\./);
    // تلاش تازه هم نه (دو زبانه): ۴۰۹ «در حال بررسی».
    const again = await page.request.post(`/api/checkout/orders/${row!.public_token}/pay`);
    expect(again.status()).toBe(409);
    expect(((await again.json()) as { error: string }).error).toBe('payment_checking');
    await page.getByRole('button', { name: 'الان دوباره ببین' }).click();
    // تا همین بررسی تمام نشده، بازهٔ ۱۵ ثانیه‌ای پایین رد می‌شود (`running` در `CheckingWatch`) و جوابِ پیش از «پرداخت موفق» «در حال
    // بررسی» است؛ بازهٔ بعد بیرون از `expect` است. دکمه تا پایان بررسی بسته است.
    await expect(page.getByRole('button', { name: 'الان دوباره ببین' })).toBeEnabled();
    await expect(page.getByTestId('order-checking')).toBeVisible();

    // درگاه «پرداخت موفق» و برگشت از جای دیگر (Push Transaction)؛ این صفحه در ۱۵ ثانیه خودش «ثبت شد» است.
    const decided = await page.request.post(`/api/checkout/mock-gateway/${authority}`, { data: { decision: 'success' } });
    await page.request.get(((await decided.json()) as { redirectUrl: string }).redirectUrl, { maxRedirects: 0 });
    await page.clock.fastForward(15_000);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await context.close();
  });

  test('عدد دیگر روی سرور (۴۰۹): عدد تازه و دلیلش روی مرور، و پرداخت با همان عدد تازه', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    // قیمت مرور را مرورگر ۱۲ صفحه و ۱,۰۰۰ تومان بیشتر ببیند؛ سرور موقع «پرداخت» عدد خودش را می‌گوید.
    let tamper = false;
    await page.route('**/api/checkout/quote', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { breakdown: Breakdown };
      if (tamper && body.breakdown.shippingRials !== null) {
        body.breakdown.items[0]!.pageCount = 12;
        body.breakdown.totalRials += 10_000;
      }
      await route.fulfill({ response, json: body });
    });
    await dropReady(page);
    await toPay(page);
    tamper = true;
    await signIn(page, newMobile());
    const shown = TEN.other.totalRials + 10_000;
    await expect(visibleButton(page, `پرداخت ${toman(shown)} تومان`)).toBeEnabled();

    await visibleButton(page, `پرداخت ${toman(shown)} تومان`).click();
    await expect(page.getByTestId('price-changed')).toHaveText(
      `قیمت عوض شد: حالا ${toman(TEN.other.totalRials)} تومان است، چون سرور جزوه را 10 صفحه شمرد، نه 12. اگر موافقی، دوباره «پرداخت» را بزن.`,
    );
    await page.unroute('**/api/checkout/quote');
    await payAt(page, 'پرداخت موفق', TEN.other.totalRials);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    await context.close();
  });
});

test.describe('موبایل', () => {
  for (const width of [320, 390]) {
    test(`کار بعدی در نوار پایین، هدف لمسی ۴۴ و بی اسکرول افقی در ${width} پیکسل`, async ({ browser }) => {
      const context = await newContext(browser, { width, height: 844 });
      const page = await context.newPage();
      await dropReady(page);
      await toCity(page);
      // `exact`: تیتر قهرمان («… قیمت را همین حالا ببین») برای صفحه‌خوان می‌ماند و نامش «قیمت» دارد.
      const dock = page.getByRole('region', { name: 'قیمت', exact: true });
      // قدم شهر دکمه ندارد؛ جمع در نوار هست
      await expect(dock.getByRole('button')).toHaveCount(0);
      await expect(dock.getByTestId('price-total')).toHaveText(toman(TEN.none.totalWithoutShippingRials));
      await noHorizontalScroll(page);
      const targets = await page
        .locator('.home-desk button, .home-desk a, .home-desk input, .home-flow a')
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.checkVisibility())
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { name: el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30), size: Math.min(r.width, r.height) };
            }),
        );
      // هشت شهر، جست‌وجو و پیوند «جزوه و قیمت»
      expect(targets.length).toBeGreaterThanOrEqual(10);
      for (const { name, size } of targets) expect(size, name).toBeGreaterThanOrEqual(44);

      await page.getByRole('button', { name: 'مشهد' }).click();
      const go = dock.getByRole('button', { name: 'ادامه — موبایل و پرداخت' });
      await expect(go).toHaveText('ادامه');
      await expect(dock.getByTestId('price-total')).toHaveText(toman(TEN.other.totalRials));
      await expect(dock).toContainText('جمع با ارسال');
      await expect(dock).toContainText('پست پیشتاز به مشهد');
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect(go).toBeInViewport();
      await noHorizontalScroll(page);

      await page.getByLabel('نشانی', { exact: true }).fill(RECIPIENT.address);
      await page.getByLabel('نام گیرنده').fill(RECIPIENT.name);
      await go.click();
      await signIn(page, newMobile());
      await expect(dock.getByRole('button', { name: `پرداخت ${toman(TEN.other.totalRials)} تومان` })).toHaveText('پرداخت');
      await noHorizontalScroll(page);
      await context.close();
    });
  }
});
