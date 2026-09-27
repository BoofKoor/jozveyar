import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';
import type { PriceList } from '@jozveyar/contracts';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  DEFAULT_SHIPPING_METHOD_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatTomans } from '@jozveyar/text';

/**
 * تعرفه از پایگاه داده در سایت (برش ۴٫۴، ADR-040): صفحهٔ اصلی با ISR ۶۰ ثانیه تعرفهٔ فعال و `order.sla_days` را از پایگاه
 * داده می‌خواند، در جدول تعرفه، سؤال‌ها و «روز کاری»ها، و به JSON درون HTML که `quote()` مرورگر با آن حساب می‌کند. پس
 * پیش‌فاکتور مرورگر همان عدد سرور است (قاعدهٔ ۱ و ۲)، پس از رفرش هم (۳د)؛ و تعرفه‌ای که وسط خرید عوض شد، ۴۰۹ «تعرفه به‌روز
 * شده» و سفارشی منجمد با تعرفهٔ تازه (قاعدهٔ ۶).
 *
 * همان سرور و سرویس‌های «مسیر خرید، سرتاسری» (`checkout.spec.ts`)، ولی **آخر و جدا**: تعرفهٔ فعال را عوض می‌کند، و ISR
 * صفحه را تا یک دقیقه با همان نگه می‌دارد. در پایان تعرفهٔ پایه دوباره فعال می‌شود. CI همین را پس از بقیه اجرا می‌کند:
 *
 *   E2E_TARIFF_BASE_URL=http://127.0.0.1:3300 DATABASE_URL=… npx playwright test tests/tariff.spec.ts
 */

const BASE = process.env.E2E_TARIFF_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

test.skip(!BASE || !DATABASE_URL, 'بدون E2E_TARIFF_BASE_URL و DATABASE_URL — سرور mock، پستگرس، Garage و کارگر لازم است');
test.use({ baseURL: BASE });
test.setTimeout(180_000);

const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', name);

let sqlClient: ReturnType<typeof postgres> | null = null;
const sql = () => (sqlClient ??= postgres(DATABASE_URL!, { max: 2, onnotice: () => undefined }));

/**
 * دو نسخهٔ تازه از روی تعرفهٔ پایه، با نرخ چاپ دیگر (ریال به‌ازای هر رو). شمارهٔ نسخه‌ها تصادفی است تا اجرای دوباره روی همان
 * پایگاه داده (سفارشی که به نسخهٔ قبلی اشاره می‌کند) گیر نکند.
 */
const version = randomInt(10_000, 1_000_000);
const DEARER: PriceList = { ...SEED_PRICE_LIST, version, label: 'تست ۴٫۴ — گران‌تر', clickRates: { color: 24_000, bw: 18_000 } };
const DEAREST: PriceList = { ...SEED_PRICE_LIST, version: version + 1, label: 'تست ۴٫۴ — گران‌ترین', clickRates: { color: 26_000, bw: 19_000 } };
/** روز کاری تحویل به پست در همین تست؛ پیش‌فرض ۲ است. */
const SLA_DAYS = 3;

/** همان تعرفهٔ پایهٔ پایگاه داده، با نرخ‌های دیگر؛ فعال نه. */
async function copyTariff(list: PriceList) {
  await sql().begin(async (tx) => {
    await tx`
      insert into price_lists (version, label, click_rate_color_rials, click_rate_bw_rials, settings, is_active)
      select ${list.version}, ${list.label}, ${list.clickRates.color!}, ${list.clickRates.bw!}, settings, false
      from price_lists where version = 1`;
    await tx`
      insert into paper_types (price_list_version, id, name_fa, gsm, enabled, rate_per_sheet_rials)
      select ${list.version}, id, name_fa, gsm, enabled, rate_per_sheet_rials from paper_types where price_list_version = 1`;
    await tx`
      insert into binding_types (price_list_version, id, name_fa, enabled, max_sheets_per_volume, weight_per_volume_grams)
      select ${list.version}, id, name_fa, enabled, max_sheets_per_volume, weight_per_volume_grams
      from binding_types where price_list_version = 1`;
    await tx`
      insert into binding_rate_bands (price_list_version, binding_type_id, min_sheets, max_sheets, price_rials)
      select ${list.version}, binding_type_id, min_sheets, max_sheets, price_rials from binding_rate_bands where price_list_version = 1`;
    await tx`
      insert into shipping_methods (price_list_version, id, name_fa, enabled)
      select ${list.version}, id, name_fa, enabled from shipping_methods where price_list_version = 1`;
    await tx`
      insert into shipping_rates (price_list_version, method_id, zone_id, min_weight_grams, max_weight_grams, price_rials)
      select ${list.version}, method_id, zone_id, min_weight_grams, max_weight_grams, price_rials
      from shipping_rates where price_list_version = 1`;
  });
}

/** فقط یک تعرفه فعال است (ایندکس یکتای جزئی)، پس اول همه خاموش، بعد یکی روشن؛ مثل `activatePriceList`. */
async function activate(versionToActivate: number) {
  await sql().begin(async (tx) => {
    await tx`update price_lists set is_active = false where is_active`;
    await tx`update price_lists set is_active = true where version = ${versionToActivate}`;
  });
}

const setSlaDays = (days: number) => sql()`update settings set value = ${sql().json(days)}, updated_at = now() where key = 'order.sla_days'`;

test.beforeAll(async () => {
  await copyTariff(DEARER);
  await copyTariff(DEAREST);
  await activate(DEARER.version);
  await setSlaDays(SLA_DAYS);
});
test.afterAll(async () => {
  if (!sqlClient) return;
  await activate(1);
  await setSlaDays(2);
  await sqlClient.end();
  sqlClient = null;
});

/** قیمت `plain-bw-10.pdf` (۱۰ صفحهٔ سیاه‌سفید دورو، یک نسخه) با `quote()` و همین تعرفه. */
function tenPages(list: PriceList, zoneId: 'other' | null) {
  return quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: 10 }],
          rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: 'double',
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
    },
    list,
  );
}
const toman = (rials: number) => formatTomans(rials, false);

/** JSON تعرفهٔ HTML صفحهٔ اصلی (`#jy-tariff`)؛ `<` درونش گریخته است، پس تا `</script>` خوانده می‌شود. */
async function homeTariff(request: APIRequestContext) {
  const response = await request.get('/');
  const html = await response.text();
  const json = /<script id="jy-tariff" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1];
  return { response, html, tariff: json ? (JSON.parse(json) as { priceList: PriceList; slaDays: number }) : null };
}

/** ISR: صفحه‌ای که پیش از تغییر ساخته شده تا یک دقیقه می‌ماند، و درخواست بعد از آن بازسازی‌اش می‌کند. */
async function untilHomeHas(request: APIRequestContext, wanted: number) {
  await expect
    .poll(async () => (await homeTariff(request)).tariff?.priceList.version, { timeout: 100_000, intervals: [2_000] })
    .toBe(wanted);
}

/** هر مرورگر IP خودش را دارد، تا سقف کد پیامکی هر IP بین تست‌ها پر نشود (مثل `checkout.spec.ts`). */
function newContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-real-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
  });
}
const visibleButton = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();
const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

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

test.describe.serial('تعرفه از پایگاه داده', () => {
  test('صفحهٔ اصلی با تعرفهٔ فعال و روز کاری settings: جدول، مثال، سؤال‌ها، JSON درون HTML، و ISR ۶۰ ثانیه', async ({ request, page }) => {
    await untilHomeHas(request, DEARER.version);
    const { response, html, tariff } = await homeTariff(request);
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=60\b/);
    expect(tariff!.slaDays).toBe(SLA_DAYS);
    expect(tariff!.priceList.label).toBe(DEARER.label);
    expect(tariff!.priceList.clickRates).toEqual(DEARER.clickRates);
    // همان تعرفه، همان عدد: `quote()` با JSON صفحه و با تعرفهٔ ساختهٔ تست یکی است، کرایه هم
    expect(tenPages(tariff!.priceList, 'other')).toEqual(tenPages(DEARER, 'other'));
    // سؤال‌ها در JSON-LD هم با همان عددها
    expect(html).toContain(`سیاه‌سفید ${formatTomans(DEARER.clickRates.bw!)} و رنگی ${formatTomans(DEARER.clickRates.color!)}`);
    expect(html).toContain(`حداکثر ${SLA_DAYS} روز کاری`);

    await page.goto('/');
    await expect(page.getByTestId('tariff-print').locator('dd')).toHaveText([
      `${toman(DEARER.clickRates.bw!)} تومان`,
      `${toman(DEARER.clickRates.color!)} تومان`,
    ]);
    const example = quote(
      {
        items: [
          {
            sections: [{ documentId: 'example', pageCount: 120 }],
            rules: wholeDocumentRule(120, 'bw', DEFAULT_PAPER_TYPE_ID),
            copies: 1,
            sidesMode: 'double',
            bindingTypeId: DEFAULT_BINDING_TYPE_ID,
          },
        ],
        shipping: null,
      },
      DEARER,
    );
    await expect(page.getByTestId('tariff-example')).toContainText(
      `چاپ ${toman(example.items[0]!.printRials)} و صحافی ${toman(example.items[0]!.bindingRials)}، روی هم ${toman(example.totalWithoutShippingRials)} تومان`,
    );
    await expect(page.locator('.home-trust')).toContainText(`تحویل پست تا ${SLA_DAYS} روز کاری`);
    await expect(page.locator('#how')).toContainText(`تا ${SLA_DAYS} روز کاری بعد، جزوه تحویل پست`);
    await expect(page.locator('#faq')).toContainText(`حداکثر ${SLA_DAYS} روز کاری پس از پرداخت`);
    await expect(page.locator('#faq')).toContainText(`سیاه‌سفید ${toman(DEARER.clickRates.bw!)} تومان`);
  });

  let context: BrowserContext;
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    context = await newContext(browser);
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('پیش‌فاکتور مرورگر همان عدد سرور است: «جزوه و قیمت»، پس از رفرش، و قدم شهر و نشانی', async ({ request }) => {
    await untilHomeHas(request, DEARER.version);
    const none = tenPages(DEARER, null);
    const other = tenPages(DEARER, 'other');
    // تعرفهٔ پایه عدد دیگری می‌داد؛ پس برابری پایین یعنی مرورگر تعرفهٔ پایگاه داده را خوانده است
    expect(tenPages(SEED_PRICE_LIST, null).totalWithoutShippingRials).not.toBe(none.totalWithoutShippingRials);

    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(page.getByTestId('price-total')).toContainText(toman(none.totalWithoutShippingRials), { timeout: 20_000 });
    await expect(visibleButton(page, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });
    await expect(page.getByTestId('summary-total')).toHaveText(toman(none.totalWithoutShippingRials));

    // برگشت بعد از رفرش (۳د): همان عدد، با شمارش سرور و تعرفهٔ همین صفحه
    await page.reload();
    await expect(page.getByTestId('summary-total')).toHaveText(toman(none.totalWithoutShippingRials), { timeout: 15_000 });

    // قدم شهر: عدد سرور (`POST /api/checkout/quote`)، همان که مرورگر نشان داد
    await visibleButton(page, 'ادامه — آدرس و تحویل').click();
    await expect(heading(page, 'به کدام شهر بفرستیم؟')).toBeVisible();
    await expect(page.getByTestId('summary-total')).toHaveText(toman(none.totalWithoutShippingRials));
    await page.getByRole('button', { name: 'مشهد' }).click();
    await expect(heading(page, 'نشانی در مشهد')).toBeVisible();
    await expect(page.getByTestId('summary-total')).toHaveText(toman(other.totalRials));
    await expect(page.getByText(`تحویل به پست تا ${SLA_DAYS} روز کاری بعد از پرداخت.`).first()).toBeVisible();
  });

  test('تعرفه‌ای که وسط خرید عوض شد: ۴۰۹ «تعرفه به‌روز شده»، و سفارش منجمد با تعرفهٔ تازه و روز کاری settings', async () => {
    const before = tenPages(DEARER, 'other');
    const after = tenPages(DEAREST, 'other');
    const mobile = `0912${String(randomInt(10_000_000)).padStart(7, '0')}`;

    await page.getByLabel('نشانی', { exact: true }).fill('بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴');
    await page.getByLabel('نام گیرنده').fill('سارا احمدی');
    await page.getByLabel('نام گیرنده').press('Enter');
    await expect(heading(page, 'تأیید با پیامک')).toBeVisible();
    await page.getByLabel('شمارهٔ موبایل').fill(mobile);
    await page.getByLabel('شمارهٔ موبایل').press('Enter');
    await expect(heading(page, 'کد تأیید')).toBeVisible();
    await page.getByLabel('کد پیامک').fill(await codeOf(mobile));
    await page.getByLabel('کد پیامک').press('Enter');
    await expect(heading(page, 'مرور و پرداخت')).toBeVisible();
    await expect(page.getByText(`تحویل به پست تا ${SLA_DAYS} روز کاری بعد از پرداخت؛`)).toBeVisible();

    // ادمین تعرفهٔ تازه‌ای فعال کرد؛ «پرداخت» با عدد قبلی ۴۰۹ می‌گیرد و عدد تازه با دلیلش می‌آید
    await activate(DEAREST.version);
    await visibleButton(page, `پرداخت ${toman(before.totalRials)} تومان`).click();
    await expect(page.getByTestId('price-changed')).toContainText(`حالا ${toman(after.totalRials)} تومان است، چون تعرفه به‌روز شده`);

    await visibleButton(page, `پرداخت ${toman(after.totalRials)} تومان`).click();
    await page.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
    await expect(page.locator('.ck-gate__lines')).toContainText(`${toman(after.totalRials)} تومان`);
    const number = Number(await page.locator('.ck-gate__lines dd.num').textContent());
    await page.getByRole('button', { name: 'پرداخت موفق' }).click();
    await page.waitForURL(/\/order\/[0-9a-f-]{36}$/);
    await expect(heading(page, 'سفارش ثبت شد')).toBeVisible();

    // bigint از postgres رشته می‌آید
    const [order] = await sql()`select price_list_version, total_rials::text as total, sla_days from orders where order_number = ${number}`;
    expect(order).toMatchObject({ price_list_version: DEAREST.version, total: String(after.totalRials), sla_days: SLA_DAYS });

    // قیمت سفارش منجمد است (قاعدهٔ ۶): تعرفهٔ دیگری فعال شد، سفارش همان
    await activate(DEARER.version);
    await page.reload();
    await expect(page.getByTestId('summary-total')).toHaveText(toman(after.totalRials));
    const [again] = await sql()`select price_list_version, total_rials::text as total from orders where order_number = ${number}`;
    expect(again).toMatchObject({ price_list_version: DEAREST.version, total: String(after.totalRials) });
  });
});
