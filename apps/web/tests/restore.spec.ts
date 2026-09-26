import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  DEFAULT_SHIPPING_METHOD_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatTomans } from '@jozveyar/text';

/**
 * برگشت بعد از رفرش (برش ۳د، ADR-036)، با سرویس‌های واقعی: گوشی صفحه را از نو بار کرد (رفرش، یا مرورگری که زبانه را
 * وقت رفتن به برنامهٔ پیامک بست) و همان قدم، با همان جزوه و نشانی برمی‌گردد. عدد صفحه‌ها و رنگ از خود سرور است
 * (`GET /api/uploads/<id>`). همان مرحلهٔ CI «مسیر خرید، سرتاسری» و همان طرز اجرای `checkout.spec.ts`:
 *
 *   E2E_CHECKOUT_BASE_URL=http://127.0.0.1:3300 DATABASE_URL=… npx playwright test tests/restore.spec.ts
 *
 * بی سرور (فایل‌های منتظر انتخاب دوباره، «پیش از هر اسکریپتی»، زبانهٔ تازه، «از اول» و حافظهٔ بسته) در
 * `jozve.spec.ts`؛ رفرش وسط آپلود در `upload.spec.ts`.
 */

const BASE = process.env.E2E_CHECKOUT_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

test.skip(!BASE || !DATABASE_URL, 'بدون E2E_CHECKOUT_BASE_URL و DATABASE_URL — سرور mock، پستگرس، Garage و کارگر لازم است');
test.use({ baseURL: BASE });
test.setTimeout(120_000);

const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', name);

let sqlClient: ReturnType<typeof postgres> | null = null;
const sql = () => (sqlClient ??= postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined }));
test.afterAll(async () => {
  await sqlClient?.end();
  sqlClient = null;
});

/** قیمت `plain-bw-10.pdf` (۱۰ صفحهٔ سیاه‌سفید دورو) با `quote()` و تعرفهٔ پایه، مثل `checkout.spec.ts`. */
function tenPages(zoneId: 'other' | null, copies = 1) {
  return quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: 10 }],
          rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies,
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

/** هر مرورگر IP خودش را دارد، تا سقف کد پیامکی هر IP بین تست‌ها پر نشود (مثل `checkout.spec.ts`). */
function newContext(browser: Browser, headers: Record<string, string> = {}): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`, ...headers },
  });
}
const newMobile = () => `0912${String(randomInt(10_000_000)).padStart(7, '0')}`;
const visibleButton = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();
const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

/** فایل، و صبر تا رسیدنش به سرور و بررسی سرور. */
async function dropReady(
  page: Page,
  files: Parameters<Page['setInputFiles']>[1] = fixture('plain-bw-10.pdf'),
  ready = 'ادامه — آدرس و تحویل',
) {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', files);
  await expect(visibleButton(page, ready)).toBeEnabled({ timeout: 90_000 });
}

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

/** «پرداخت X تومان» تا درگاه نمونه؛ شمارهٔ سفارشی که درگاه نشان داد. */
async function toGateway(page: Page, totalRials: number): Promise<number> {
  const pay = visibleButton(page, `پرداخت ${toman(totalRials)} تومان`);
  await expect(pay).toBeEnabled();
  await expect(pay).not.toHaveAttribute('aria-busy', 'true');
  await pay.click();
  await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
  return Number(await page.locator('.ck-gate__lines dd.num').textContent());
}

const ADDRESS = 'بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴';

test('رفرش در هر قدم: همان قدم، با همان جزوه، جا، نشانی، موبایل و کد؛ و «برگشت» گوشی از روی رفرش هم', async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const mobile = newMobile();
  const [none, mashhad] = [tenPages(null), tenPages('other')];

  // جزوه و قیمت: عدد سرور، و «ادامه» باز
  await dropReady(page);
  await page.reload();
  await expect(page.getByTestId('summary-total')).toHaveText(toman(none.totalWithoutShippingRials));
  await expect(page.getByTestId('stat-page-count')).toHaveText('10');
  await expect(page.getByTestId('file-info')).toContainText('A4');
  await expect(visibleButton(page, 'ادامه — آدرس و تحویل')).toBeEnabled();

  // شهر
  await visibleButton(page, 'ادامه — آدرس و تحویل').click();
  await expect(heading(page, 'به کدام شهر بفرستیم؟')).toBeVisible();
  await page.reload();
  await expect(heading(page, 'به کدام شهر بفرستیم؟')).toBeVisible();
  await expect(heading(page, 'به کدام شهر بفرستیم؟')).toBeFocused();

  // نشانی، نیمه‌تایپ‌شده
  await page.getByRole('button', { name: 'مشهد' }).click();
  await expect(heading(page, 'نشانی در مشهد')).toBeVisible();
  await page.getByLabel('نشانی', { exact: true }).fill(ADDRESS);
  await page.getByLabel('نام گیرنده').fill('سارا احمدی');
  await page.reload();
  await expect(heading(page, 'نشانی در مشهد')).toBeVisible();
  await expect(page.getByLabel('نشانی', { exact: true })).toHaveValue(ADDRESS);
  await expect(page.getByLabel('نام گیرنده')).toHaveValue('سارا احمدی');
  await expect(page.getByTestId('summary-total')).toHaveText(toman(mashhad.totalRials));

  // موبایل، تایپ‌شده ولی فرستاده‌نشده
  await page.getByLabel('نام گیرنده').press('Enter');
  await expect(heading(page, 'تأیید با پیامک')).toBeVisible();
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.reload();
  await expect(heading(page, 'تأیید با پیامک')).toBeVisible();
  await expect(page.getByLabel('شمارهٔ موبایل')).toHaveValue(mobile);

  // کد: همان کد زنده، با همان شمارش معکوس؛ خود کد برنمی‌گردد
  await page.getByLabel('شمارهٔ موبایل').press('Enter');
  await expect(heading(page, 'کد تأیید')).toBeVisible();
  await page.getByLabel('کد پیامک').fill('12');
  await page.reload();
  await expect(heading(page, 'کد تأیید')).toBeVisible();
  await expect(page.getByTestId('resend-wait')).toContainText('ارسال دوباره تا 1:');
  await expect(page.getByLabel('کد پیامک')).toHaveValue('');
  // رفرش کد تازه نخواست
  const [otp] = await sql()`select count(*)::int as count from otp_requests where mobile = ${mobile}`;
  expect(otp?.count).toBe(1);

  // مرور: موبایل تأییدشده از سرور
  await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
  await page.getByLabel('کد پیامک').press('Enter');
  await expect(heading(page, 'مرور و پرداخت')).toBeVisible();
  await page.reload();
  await expect(heading(page, 'مرور و پرداخت')).toBeVisible();
  await expect(page.getByTestId('recap-mobile')).toContainText('تأیید شد');
  await expect(page.getByTestId('recap-address')).toContainText('سارا احمدی');
  await expect(visibleButton(page, `پرداخت ${toman(mashhad.totalRials)} تومان`)).toBeEnabled();

  // خانه‌های تاریخچهٔ پیش از رفرش هنوز همان قدم‌اند
  await page.goBack();
  await expect(heading(page, 'نشانی در مشهد')).toBeVisible();
  await page.goBack();
  await expect(heading(page, 'به کدام شهر بفرستیم؟')).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(heading(page, 'مرور و پرداخت')).toBeVisible();
  await context.close();
});

test('بعد از «پرداخت»: رفرش و زدن دوباره همان سفارش است، نه سفارش دوم؛ سفارش پرداخت‌شده پیش‌نویس را پاک می‌کند', async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const mobile = newMobile();
  const total = tenPages('other').totalRials;
  await dropReady(page);
  await visibleButton(page, 'ادامه — آدرس و تحویل').click();
  await page.getByRole('button', { name: 'مشهد' }).click();
  await page.getByLabel('نشانی', { exact: true }).fill(ADDRESS);
  await page.getByLabel('نام گیرنده').fill('رضا کریمی');
  await page.getByLabel('نام گیرنده').press('Enter');
  await page.getByLabel('شمارهٔ موبایل').fill(mobile);
  await page.getByLabel('شمارهٔ موبایل').press('Enter');
  await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
  await page.getByLabel('کد پیامک').press('Enter');
  await expect(heading(page, 'مرور و پرداخت')).toBeVisible();

  const first = await toGateway(page, total);
  // از درگاه برگشت، و صفحه از نو بار شد (نه از حافظهٔ مرورگر)
  await page.goBack();
  await page.reload();
  await expect(heading(page, 'مرور و پرداخت')).toBeVisible();
  expect(await toGateway(page, total)).toBe(first);
  const orders = await sql()`select order_number from orders where recipient_phone = ${mobile}`;
  expect(orders.map((o) => o.order_number)).toEqual([first]);

  await page.getByRole('button', { name: 'پرداخت موفق' }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]{36}$/);
  await expect(heading(page, 'سفارش ثبت شد')).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('jy.draft'))).toBeNull();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
  await context.close();
});

test('سندی که دیگر روی سرور نیست: صفحهٔ معمول، با یک خط که چرا', async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  const name = `رفته-${randomInt(1_000_000)}.pdf`;
  await dropReady(page, { name, mimeType: 'application/pdf', buffer: readFileSync(fixture('plain-bw-10.pdf')) });
  const [doc] = await sql()`select id from documents where original_name = ${name}`;
  // همان «انصراف» مرورگر: فایل از استوریج پاک می‌شود
  expect(await page.evaluate((id) => fetch(`/api/uploads/${id}`, { method: 'DELETE' }).then((r) => r.status), doc!.id)).toBe(200);

  await page.reload();
  await expect(page.getByTestId('jozve-lost')).toHaveText('جزوهٔ قبلی دیگر روی سرور نیست؛ دوباره بینداز.');
  await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
  await expect(page.getByTestId('file-waiting')).toHaveCount(0);
  // پیش‌نویسی که برنگشت، بار بعد هم برنمی‌گردد
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('jozve-lost')).toHaveCount(0);
  await context.close();
});

test('روی سایت زنده (خرید خاموش): جزوه و تنظیمات چاپ برمی‌گردند، و «ادامه» همان «به‌زودی»', async ({ browser }) => {
  // دیوار دامنه (ADR-035): درخواستی که برای jozveyar.com آمده، خرید را خاموش می‌بیند
  const context = await newContext(browser, { 'x-forwarded-host': 'jozveyar.com' });
  const page = await context.newPage();
  await page.goto('/');
  await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
  // «به‌زودی» منتظر سرور نیست؛ پس صبر تا هر دو فایل روی سرور رسیده و بررسی شده باشند
  await expect(page.getByTestId('section-upload')).toHaveText(Array(2).fill('فایل رسید · همهٔ صفحات بررسی شد'), {
    timeout: 90_000,
  });
  await expect(visibleButton(page, 'ثبت سفارش آنلاین به‌زودی')).toBeVisible();
  await page.getByRole('button', { name: 'یکی بیشتر' }).click();
  await expect(page.locator('#copies')).toHaveValue('2');
  const total = await page.getByTestId('summary-total').textContent();

  await page.reload();
  await expect(page.getByTestId('stat-page-count')).toHaveText('16');
  await expect(page.locator('#copies')).toHaveValue('2');
  await expect(page.getByTestId('summary-total')).toHaveText(total!);
  await expect(page.getByTestId('section-waiting')).toHaveCount(0);
  await expect(visibleButton(page, 'ثبت سفارش آنلاین به‌زودی')).toHaveAttribute('aria-disabled', 'true');
  await context.close();
});

test('از رفرش تا قیمت روی صفحه، با پردازندهٔ ۴ برابر کند: زیر ۲ ثانیه', async ({ browser }) => {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await dropReady(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const startedAt = Date.now();
  await page.reload();
  await expect(page.getByTestId('price-total')).toHaveText(toman(tenPages(null).totalWithoutShippingRials), { timeout: 10_000 });
  const restoreMs = Date.now() - startedAt;
  console.log(`از رفرش تا قیمت با throttle 4×: ${restoreMs}ms`);
  expect(restoreMs).toBeLessThan(2_000);
  await context.close();
});
