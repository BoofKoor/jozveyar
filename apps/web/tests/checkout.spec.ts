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
import { formatDeadlineDay, formatTomans } from '@jozveyar/text';

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
    // کارگر PDF جزوه را می‌سازد (`prepare_order`).
    const [job] = await sql()`select kind from jobs where order_id = ${order!.id}`;
    expect(job?.kind).toBe('prepare_order');
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

test.describe('پرداخت', () => {
  test('پرداخت ناموفق: «پرداخت انجام نشد»، همان قیمت منجمد، و «دوباره پرداخت کن» تا «ثبت شد»', async ({ browser }) => {
    const context = await newContext(browser);
    const page = await context.newPage();
    await dropReady(page);
    await toPay(page);
    await signIn(page, newMobile());
    const number = await payAt(page, 'پرداخت ناموفق', TEN.other.totalRials);

    await expect(page.getByTestId('payment-failed')).toContainText('پرداخت انجام نشد.');
    await expect(page.getByTestId('order-awaiting')).toContainText(`سفارش ${number}`);
    await expect(page.getByTestId('order-awaiting')).toContainText('در انتظار پرداخت');
    await expect(page.getByTestId('summary-total')).toHaveText(toman(TEN.other.totalRials));
    // سفارش ساخته شده: مرور پیوند ویرایش ندارد
    await expect(page.getByTestId('order-awaiting').getByRole('button')).toHaveCount(0);

    await visibleButton(page, 'دوباره پرداخت کن').click();
    await page.waitForURL(/\/pay\/mock\//);
    await expect(page.locator('.ck-gate__lines dd.num')).toHaveText(String(number));
    await page.getByRole('button', { name: 'پرداخت موفق' }).click();
    await page.waitForURL(/\/order\//);
    await expect(page.getByRole('heading', { level: 1, name: 'سفارش ثبت شد' })).toBeVisible();
    const payments = await sql()`select p.status from payments p join orders o on o.id = p.order_id
                                 where o.order_number = ${number} order by p.created_at`;
    expect(payments.map((p) => p.status)).toEqual(['failed', 'succeeded']);
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
