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
 * شده» و سفارشی منجمد با تعرفهٔ تازه (قاعدهٔ ۶). کاتالوگ (۸٫۳): A5، کاغذ و صحافی دیگر در صفحهٔ اصلی و کاشی‌های میز، ارزان‌تر
 * اول؛ صحافی‌ای که به جزوهٔ کلفت‌شده نمی‌خورد جایش را با یادداشت به پیش‌فرض می‌دهد؛ و سفارش A5 با منگنه، منجمد. ۸٫۴: حداقل سفارش،
 * گزینهٔ موقتاً خاموش (`catalog.paused`)، فرمت خاموش و سقف صفحه (`file.*`)، ۴۰۹ وسط خرید، و برگشت بعد از رفرش با گزینهٔ خاموش.
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
/** نرخ A4، یکرو و دورو یکی، مثل تعرفهٔ پایه. */
const a4Rates = (color: number, bw: number): PriceList['printRates'] => ({ a4: { single: { color, bw }, double: { color, bw } } });
const DEARER: PriceList = { ...SEED_PRICE_LIST, version, label: 'تست ۴٫۴ — گران‌تر', printRates: a4Rates(24_000, 18_000) };
const DEAREST: PriceList = { ...SEED_PRICE_LIST, version: version + 1, label: 'تست ۴٫۴ — گران‌ترین', printRates: a4Rates(26_000, 19_000) };
const SPIRAL = SEED_PRICE_LIST.bindingTypes[DEFAULT_BINDING_TYPE_ID]!;
/**
 * کاتالوگ (۸٫۳): A5 با یکرو و دوروی جدا، «گلاسه» فقط A4، و «منگنه» تا 50 برگ در هر دو اندازه، بی چند جلد؛ صحافی پیش‌فرض اول،
 * مثل نسخه‌ای که پنل می‌سازد، تا ترتیب کاشی‌ها (ارزان‌تر اول) سنجیده شود.
 */
const CATALOG: PriceList = {
  ...SEED_PRICE_LIST,
  version: version + 2,
  label: 'تست ۸٫۳ — کاتالوگ',
  printRates: {
    a4: SEED_PRICE_LIST.printRates.a4,
    a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } },
  },
  paperTypes: {
    [DEFAULT_PAPER_TYPE_ID]: { ...SEED_PRICE_LIST.paperTypes[DEFAULT_PAPER_TYPE_ID]!, sheetRates: { a4: 0, a5: 0 } },
    glossy: { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 15_000 } },
  },
  bindingTypes: {
    [DEFAULT_BINDING_TYPE_ID]: { ...SPIRAL, bands: { a4: SPIRAL.bands.a4, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }] } },
    staple: {
      nameFa: 'منگنه',
      enabled: true,
      minSheets: 1,
      maxSheetsPerVolume: 50,
      splitsVolumes: false,
      weightPerVolumeGrams: 5,
      bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 80_000 }], a5: [{ minSheets: 1, maxSheets: 50, priceRials: 60_000 }] },
    },
  },
};
/**
 * ۸٫۴: همان کاتالوگ با حداقل سفارش 30,000 تومان (جمع چاپ، کاغذ و صحافی، پیش از کرایه) و گرد کردن به 1,000 تومان. ده صفحه با طلق و
 * سیم 61,000 تومان است و با منگنه 24,000، پس منگنهٔ یک‌نسخه‌ای زیرش است و دو نسخه نه؛ همه مضرب 1,000‌اند، پس گرد کردن فقط با کرایه
 * دیده می‌شود.
 */
const RULES84: PriceList = {
  ...CATALOG,
  version: version + 3,
  label: 'تست ۸٫۴ — حداقل سفارش',
  settings: { ...CATALOG.settings, minOrderRials: 300_000, roundingStepRials: 10_000 },
};
/** نرخ A4 دوروی یک تعرفه (یکرو همان). */
const rateOf = (list: PriceList, color: 'bw' | 'color') => list.printRates.a4!.double[color];
/** روز کاری تحویل به پست در همین تست؛ پیش‌فرض ۲ است. */
const SLA_DAYS = 3;

/** همان تعرفهٔ پایهٔ پایگاه داده، با نرخ‌های دیگر؛ فعال نه. */
async function copyTariff(list: PriceList) {
  await sql().begin(async (tx) => {
    await tx`
      insert into price_lists (version, label, settings, is_active)
      select ${list.version}, ${list.label}, settings, false from price_lists where version = 1`;
    await tx`
      insert into print_rates (price_list_version, paper_size, sides_mode, color_mode, rate_rials)
      select ${list.version}, paper_size, sides_mode, color_mode,
             case color_mode when 'color' then ${rateOf(list, 'color')}::bigint else ${rateOf(list, 'bw')}::bigint end
      from print_rates where price_list_version = 1`;
    await tx`
      insert into paper_types (price_list_version, id, name_fa, gsm, enabled)
      select ${list.version}, id, name_fa, gsm, enabled from paper_types where price_list_version = 1`;
    await tx`
      insert into paper_rates (price_list_version, paper_type_id, paper_size, rate_rials)
      select ${list.version}, paper_type_id, paper_size, rate_rials from paper_rates where price_list_version = 1`;
    await tx`
      insert into binding_types (price_list_version, id, name_fa, enabled, min_sheets, max_sheets_per_volume, splits_volumes,
                                 weight_per_volume_grams)
      select ${list.version}, id, name_fa, enabled, min_sheets, max_sheets_per_volume, splits_volumes, weight_per_volume_grams
      from binding_types where price_list_version = 1`;
    await tx`
      insert into binding_rate_bands (price_list_version, binding_type_id, paper_size, min_sheets, max_sheets, price_rials)
      select ${list.version}, binding_type_id, paper_size, min_sheets, max_sheets, price_rials
      from binding_rate_bands where price_list_version = 1`;
    await tx`
      insert into shipping_methods (price_list_version, id, name_fa, enabled)
      select ${list.version}, id, name_fa, enabled from shipping_methods where price_list_version = 1`;
    await tx`
      insert into shipping_rates (price_list_version, method_id, zone_id, min_weight_grams, max_weight_grams, price_rials)
      select ${list.version}, method_id, zone_id, min_weight_grams, max_weight_grams, price_rials
      from shipping_rates where price_list_version = 1`;
  });
}

/** یک نسخهٔ کامل از روی خود `PriceList`، فعال نه؛ کرایه‌ها و تنظیم‌ها همان تعرفهٔ پایهٔ پایگاه داده. */
async function insertTariff(list: PriceList) {
  await sql().begin(async (tx) => {
    await tx`
      insert into price_lists (version, label, settings, is_active)
      select ${list.version}, ${list.label}, settings, false from price_lists where version = 1`;
    for (const [size, rate] of Object.entries(list.printRates)) {
      for (const sides of ['single', 'double'] as const) {
        for (const color of ['bw', 'color'] as const) {
          await tx`
            insert into print_rates (price_list_version, paper_size, sides_mode, color_mode, rate_rials)
            values (${list.version}, ${size}, ${sides}, ${color}, ${rate![sides][color]})`;
        }
      }
    }
    for (const [id, paper] of Object.entries(list.paperTypes)) {
      await tx`insert into paper_types (price_list_version, id, name_fa, gsm, enabled) values (${list.version}, ${id}, ${paper.nameFa}, ${paper.gsm}, ${paper.enabled})`;
      for (const [size, rials] of Object.entries(paper.sheetRates)) {
        await tx`insert into paper_rates (price_list_version, paper_type_id, paper_size, rate_rials) values (${list.version}, ${id}, ${size}, ${rials!})`;
      }
    }
    for (const [id, binding] of Object.entries(list.bindingTypes)) {
      await tx`
        insert into binding_types (price_list_version, id, name_fa, enabled, min_sheets, max_sheets_per_volume, splits_volumes, weight_per_volume_grams)
        values (${list.version}, ${id}, ${binding.nameFa}, ${binding.enabled}, ${binding.minSheets}, ${binding.maxSheetsPerVolume},
                ${binding.splitsVolumes}, ${binding.weightPerVolumeGrams})`;
      for (const [size, bands] of Object.entries(binding.bands)) {
        for (const band of bands ?? []) {
          await tx`
            insert into binding_rate_bands (price_list_version, binding_type_id, paper_size, min_sheets, max_sheets, price_rials)
            values (${list.version}, ${id}, ${size}, ${band.minSheets}, ${band.maxSheets}, ${band.priceRials})`;
        }
      }
    }
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
/** یک تنظیم `settings` (۸٫۴): همان که پنل می‌نویسد؛ سرور آپلود و مسیر خرید همان لحظه، و صفحهٔ اصلی با بازسازی ISR. */
const setSetting = (key: string, value: unknown) =>
  sql()`insert into settings (key, value, updated_at) values (${key}, ${sql().json(value as never)}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
async function resetRules84() {
  await setSetting('catalog.paused', { sizes: [], papers: [], bindings: [] });
  await setSetting('file.formats', { word: true, slides: true, image: true });
  await setSetting('file.max_pages', 1500);
}

test.beforeAll(async () => {
  await copyTariff(DEARER);
  await copyTariff(DEAREST);
  await insertTariff(CATALOG);
  await activate(DEARER.version);
  await setSlaDays(SLA_DAYS);
});
test.afterAll(async () => {
  if (!sqlClient) return;
  await activate(1);
  await setSlaDays(2);
  await resetRules84();
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
          paperSize: 'a4',
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
    },
    list,
  );
}
const toman = (rials: number) => formatTomans(rials, false);

/** قیمت یک جزوهٔ سیاه‌سفید دورو، یک نسخه، با `quote()` و کاتالوگ. */
function catalogQuote(
  pages: number,
  { paperSize = 'a4', bindingTypeId = DEFAULT_BINDING_TYPE_ID }: { paperSize?: 'a4' | 'a5'; bindingTypeId?: string },
  zoneId: 'other' | null = null,
) {
  return quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: pages }],
          rules: wholeDocumentRule(pages, 'bw', DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: 'double',
          paperSize,
          bindingTypeId,
        },
      ],
      shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
    },
    CATALOG,
  );
}

/** JSON تعرفهٔ HTML صفحهٔ اصلی (`#jy-tariff`)؛ `<` درونش گریخته است، پس تا `</script>` خوانده می‌شود. */
async function homeTariff(request: APIRequestContext) {
  const response = await request.get('/');
  const html = await response.text();
  const json = /<script id="jy-tariff" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1];
  return {
    response,
    html,
    tariff: json ? (JSON.parse(json) as { priceList: PriceList; slaDays: number; paused: { sizes: string[]; papers: string[]; bindings: string[] } }) : null,
  };
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
const visibleText = (page: Page, text: string) => page.getByText(text).filter({ visible: true }).first();
/** ریز قیمت خلاصهٔ جزوهٔ A5 منگنهٔ ده‌صفحه‌ای، در مرور و صفحهٔ سفارش: اندازه کنار چاپ، و صحافی ردیف خودش. */
async function expectCatalogLines(page: Page) {
  await expect(visibleText(page, 'چاپ سیاه‌سفید، دورو، A5 · 10 صفحه')).toBeVisible();
  await expect(visibleText(page, 'صحافی منگنه · 5 برگ')).toBeVisible();
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

test.describe.serial('تعرفه از پایگاه داده', () => {
  test('صفحهٔ اصلی با تعرفهٔ فعال و روز کاری settings: جدول، مثال، سؤال‌ها، JSON درون HTML، و ISR ۶۰ ثانیه', async ({ request, page }) => {
    await untilHomeHas(request, DEARER.version);
    const { response, html, tariff } = await homeTariff(request);
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=60\b/);
    expect(tariff!.slaDays).toBe(SLA_DAYS);
    expect(tariff!.priceList.label).toBe(DEARER.label);
    expect(tariff!.priceList.printRates).toEqual(DEARER.printRates);
    // همان تعرفه، همان عدد: `quote()` با JSON صفحه و با تعرفهٔ ساختهٔ تست یکی است، کرایه هم
    expect(tenPages(tariff!.priceList, 'other')).toEqual(tenPages(DEARER, 'other'));
    // سؤال‌ها در JSON-LD هم با همان عددها
    expect(html).toContain(`سیاه‌سفید ${formatTomans(rateOf(DEARER, 'bw'))} و رنگی ${formatTomans(rateOf(DEARER, 'color'))}`);
    expect(html).toContain(`حداکثر ${SLA_DAYS} روز کاری`);

    await page.goto('/');
    await expect(page.getByTestId('tariff-print').locator('dd')).toHaveText([
      `${toman(rateOf(DEARER, 'bw'))} تومان`,
      `${toman(rateOf(DEARER, 'color'))} تومان`,
    ]);
    const example = quote(
      {
        items: [
          {
            sections: [{ documentId: 'example', pageCount: 120 }],
            rules: wholeDocumentRule(120, 'bw', DEFAULT_PAPER_TYPE_ID),
            copies: 1,
            sidesMode: 'double',
            paperSize: 'a4',
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
    await expect(page.locator('#faq')).toContainText(`سیاه‌سفید ${toman(rateOf(DEARER, 'bw'))} تومان`);
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

  test('کاتالوگ (۸٫۳): A5، گلاسه و منگنه در صفحهٔ اصلی و میز، ارزان‌تر اول؛ منگنهٔ جزوهٔ کلفت جایش را می‌دهد؛ سفارش A5 منجمد', async ({ browser, request }) => {
    test.setTimeout(240_000);
    await activate(CATALOG.version);
    await untilHomeHas(request, CATALOG.version);
    const catalogContext = await newContext(browser);
    const shop = await catalogContext.newPage();
    const total = shop.getByTestId('summary-total');
    const tiles = (name: string) => shop.locator(`label.jy-tile:has(input[name="${name}"])`);

    // صفحهٔ اصلی: هر اندازه × رنگ، یکرو و دوروی A5 جدا، و کاغذ و صحافی دیگر؛ نام‌ها با رقم لاتین (`Inline`).
    await shop.goto('/');
    const print = shop.getByTestId('tariff-print');
    await expect(print.locator('dt')).toHaveText(['سیاه‌سفید A4', 'رنگی A4', 'سیاه‌سفید A5', 'رنگی A5']);
    await expect(print.locator('dd')).toHaveText(['1,600 تومان', '2,000 تومان', 'دورو 1,000، یکرو 1,200 تومان', 'دورو 1,300، یکرو 1,500 تومان']);
    await expect(print.locator('.home-price__note')).toHaveText('کاغذ تحریر 80 گرم؛ گلاسه هر برگ 1,500 تومان بیشتر. هر برگ در چاپ دورو دو صفحه است.');
    await expect(shop.getByTestId('tariff-bindings')).toHaveText('صحافی‌های دیگر: منگنه (تا 50 برگ) از 6,000 تومان.');

    // میز: کاشی اندازه، کاغذ و صحافی، ارزان‌تر اول (منگنه پیش از طلق و سیم، هرچند پیش‌فرض اول تعرفه است).
    await shop.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(total).toHaveText(toman(catalogQuote(10, {}).totalWithoutShippingRials), { timeout: 20_000 });
    await expect(tiles('jozve-size').locator('.jy-tile__title')).toHaveText(['A4', 'A5']);
    await expect(tiles('jozve-paper').locator('.jy-tile__title')).toHaveText(['تحریر 80 گرم', 'گلاسه']);
    await expect(tiles('jozve-binding').locator('.jy-tile__title')).toHaveText(['منگنه', 'طلق و سیم']);

    // A5: گلاسه A5 ندارد، پس ردیف کاغذ نیست؛ بعد منگنه.
    await tiles('jozve-size').filter({ hasText: 'A5' }).click();
    await expect(total).toHaveText(toman(catalogQuote(10, { paperSize: 'a5' }).totalWithoutShippingRials));
    await expect(tiles('jozve-paper')).toHaveCount(0);
    const staple = tiles('jozve-binding').filter({ hasText: 'منگنه' });
    await staple.click();
    const chosen = { paperSize: 'a5', bindingTypeId: 'staple' } as const;
    await expect(total).toHaveText(toman(catalogQuote(10, chosen).totalWithoutShippingRials));

    // فایل دوم همین جزوه: 157 صفحهٔ دورو، 79 برگ؛ منگنه تا 50 برگ است، پس طلق و سیم قیمت می‌خورد، با یادداشت.
    await shop.setInputFiles('#jozve-add', fixture('yellow-scan-147.pdf'));
    await expect(total).toHaveText(toman(catalogQuote(157, { paperSize: 'a5' }).totalWithoutShippingRials), { timeout: 30_000 });
    await expect(staple.locator('input')).toBeDisabled();
    await expect(staple.locator('.jy-tile__note')).toHaveText('تا 50 برگ؛ این جزوه 79 برگ است');
    await expect(shop.getByTestId('replaced-bindingTypeId')).toHaveText('«منگنه» تا 50 برگ؛ این جزوه 79 برگ است؛ صحافی‌اش «طلق و سیم» شد.');
    // انتخاب خود جزوه نرفته: با برداشتن همان فایل دوباره منگنه.
    await shop.getByRole('button', { name: '«yellow-scan-147.pdf» را از جزوه بردار' }).click();
    await expect(shop.getByTestId('replaced-bindingTypeId')).toHaveCount(0);
    await expect(staple.locator('input')).toBeChecked();
    await expect(total).toHaveText(toman(catalogQuote(10, chosen).totalWithoutShippingRials));

    // سفارش: سرور همان را قیمت می‌دهد و A5 و منگنه را منجمد می‌کند.
    const paid = catalogQuote(10, chosen, 'other').totalRials;
    const mobile = `0912${String(randomInt(10_000_000)).padStart(7, '0')}`;
    await expect(visibleButton(shop, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });
    await visibleButton(shop, 'ادامه — آدرس و تحویل').click();
    await shop.getByRole('button', { name: 'مشهد' }).click();
    await expect(heading(shop, 'نشانی در مشهد')).toBeVisible();
    await expect(total).toHaveText(toman(paid));
    await shop.getByLabel('نشانی', { exact: true }).fill('بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴');
    await shop.getByLabel('نام گیرنده').fill('سارا احمدی');
    await shop.getByLabel('نام گیرنده').press('Enter');
    await shop.getByLabel('شمارهٔ موبایل').fill(mobile);
    await shop.getByLabel('شمارهٔ موبایل').press('Enter');
    await shop.getByLabel('کد پیامک').fill(await codeOf(mobile));
    await shop.getByLabel('کد پیامک').press('Enter');
    await expect(heading(shop, 'مرور و پرداخت')).toBeVisible();
    await expect(visibleText(shop, '10 صفحه · سیاه‌سفید، دورو، A5 · منگنه · 1 نسخه')).toBeVisible();
    await expectCatalogLines(shop);
    await visibleButton(shop, `پرداخت ${toman(paid)} تومان`).click();
    await shop.waitForURL(/\/pay\/mock\/MOCK[0-9A-F]{32}$/);
    const number = Number(await shop.locator('.ck-gate__lines dd.num').textContent());
    await shop.getByRole('button', { name: 'پرداخت موفق' }).click();
    await shop.waitForURL(/\/order\/[0-9a-f-]{36}$/);
    await expect(heading(shop, 'سفارش ثبت شد')).toBeVisible();
    await expectCatalogLines(shop);
    const [order] = await sql()`
      select o.price_list_version, o.total_rials::text as total, i.paper_size::text as size, i.binding_type_id as binding
        from orders o join order_items i on i.order_id = o.id where o.order_number = ${number}`;
    expect(order).toEqual({ price_list_version: CATALOG.version, total: String(paid), size: 'a5', binding: 'staple' });
    await catalogContext.close();
  });
  test('۸٫۴: حداقل سفارش، گزینهٔ موقتاً خاموش، Word خاموش و سقف صفحه؛ ۴۰۹ وسط خرید، و برگشت بعد از رفرش با گزینهٔ خاموش', async ({
    browser,
    request,
  }) => {
    test.setTimeout(420_000);
    // همه پیش از فعال شدن نسخه، تا یک بازسازی ISR همه را با هم بیاورد.
    await insertTariff(RULES84);
    const { minOrderRials, roundingStepRials } = RULES84.settings;
    await sql()`update price_lists set settings = settings || ${sql().json({ minOrderRials, roundingStepRials })} where version = ${RULES84.version}`;
    await setSetting('catalog.paused', { sizes: ['a5'], papers: [], bindings: [] });
    await setSetting('file.formats', { word: false, slides: true, image: true });
    await setSetting('file.max_pages', 15);
    await activate(RULES84.version);
    await untilHomeHas(request, RULES84.version);
    expect((await homeTariff(request)).tariff!.paused).toEqual({ sizes: ['a5'], papers: [], bindings: [] });

    const rulesContext = await newContext(browser);
    const shop = await rulesContext.newPage();
    const total = shop.getByTestId('summary-total');
    const tiles = (name: string) => shop.locator(`label.jy-tile:has(input[name="${name}"])`);
    const quoted = (bindingTypeId: string, copies: number, zoneId: 'other' | null = null) =>
      quote(
        {
          items: [
            {
              sections: [{ documentId: 'test', pageCount: 10 }],
              rules: wholeDocumentRule(10, 'bw', DEFAULT_PAPER_TYPE_ID),
              copies,
              sidesMode: 'double',
              paperSize: 'a4',
              bindingTypeId,
            },
          ],
          shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
        },
        RULES84,
      );
    const priced = (bindingTypeId: string, copies: number) => quoted(bindingTypeId, copies).totalWithoutShippingRials;
    expect([priced(DEFAULT_BINDING_TYPE_ID, 1), priced('staple', 1), priced('staple', 2)]).toEqual([610_000, 240_000, 480_000]);

    // صفحهٔ اصلی: A5 در تعرفه نیست، پس جدول همان یک اندازه است، بی نام اندازه (۸٫۳)؛ Word نه در کارت بارگذاری، نه در انتخاب فایل،
    // نه در سؤال‌ها.
    await shop.goto('/');
    await expect(shop.getByTestId('tariff-print').locator('dt')).toHaveText(['سیاه‌سفید', 'رنگی']);
    await expect(shop.locator('.jy-drop__format')).toHaveText(['PDF', 'پاورپوینت', 'عکس']);
    expect(await shop.locator('#jozve-file').getAttribute('accept')).toBe('.pdf,.pptx,.ppt,.jpg,.jpeg,.png,.webp,.heic');
    await expect(shop.locator('#faq')).toContainText('PDF، پاورپوینت و عکس اسکن‌شده.');

    // میز: کاشی A5 خاموش با «موقتاً در دسترس نیست»؛ طلق و سیم بالای حداقل.
    await shop.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(total).toHaveText(toman(priced(DEFAULT_BINDING_TYPE_ID, 1)), { timeout: 20_000 });
    const a5 = tiles('jozve-size').filter({ hasText: 'A5' });
    await expect(a5.locator('input')).toBeDisabled();
    await expect(a5.locator('.jy-tile__note')).toHaveText('موقتاً در دسترس نیست');
    await expect(shop.getByTestId('min-order')).toHaveCount(0);

    // منگنه: 24,000 تومان، 6,000 تومان زیر حداقل؛ «ادامه» بسته با همان عدد.
    const staple = tiles('jozve-binding').filter({ hasText: 'منگنه' });
    await staple.click();
    await expect(total).toHaveText(toman(priced('staple', 1)));
    await expect(shop.getByTestId('min-order')).toContainText('حداقل سفارش 30,000 تومان است، پیش از ارسال؛ 6,000 تومان مانده.');
    await expect(shop.getByTestId('min-order')).toContainText('نسخهٔ بیشتر بگیر، یا جزوهٔ دیگری اضافه کن.');
    await expect(visibleButton(shop, 'تا حداقل سفارش 6,000 تومان مانده')).toHaveAttribute('aria-disabled', 'true');
    // دو نسخه: بالای حداقل.
    await shop.getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(total).toHaveText(toman(priced('staple', 2)));
    await expect(shop.getByTestId('min-order')).toHaveCount(0);
    await expect(visibleButton(shop, 'ادامه — آدرس و تحویل')).toBeEnabled({ timeout: 90_000 });

    // Word خاموش و فایل 147 صفحه‌ای (سقف 15): هر کدام روی ردیف خودش «پذیرفته نشد»؛ قیمت بی آنها.
    await shop.setInputFiles('#jozve-add', [fixture('jozve-12.docx'), fixture('yellow-scan-147.pdf')]);
    const refused = shop.getByTestId('section-blocked');
    await expect(refused).toHaveCount(2, { timeout: 30_000 });
    await expect(refused.nth(0)).toContainText('فایل Word فعلاً پذیرفته نمی‌شود');
    await expect(refused.nth(0)).toContainText('از Word خروجی PDF بگیر و همان را جایش بینداز.');
    await expect(refused.nth(1)).toContainText('هر فایل تا 15 صفحه پذیرفته می‌شود');
    await expect(refused.nth(1)).toContainText('این فایل 147 صفحه است. دو تکه‌اش کن و هر دو را بینداز؛ با هم یک جزوه می‌شوند.');
    await expect(shop.getByTestId('price-refused')).toContainText('که پذیرفته نشدند');
    await expect(total).toHaveText(toman(priced('staple', 2)));
    await expect(visibleButton(shop, 'اول تکلیف فایل‌های پذیرفته‌نشده را روشن کن')).toBeDisabled();
    await shop.getByRole('button', { name: '«jozve-12.docx» را از جزوه بردار' }).click();
    await shop.getByRole('button', { name: '«yellow-scan-147.pdf» را از جزوه بردار' }).click();
    await expect(visibleButton(shop, 'ادامه — آدرس و تحویل')).toBeEnabled();

    // سرور همان را دوباره می‌سنجد، با تنظیم همین لحظه: آپلود Word ۴۱۵، و سقف صفحه‌ای که همین حالا کم شد ۴۲۲.
    const upload = await shop.request.post('/api/uploads', { data: { name: 'jozve.docx', sizeBytes: 10_000 } });
    expect([upload.status(), await upload.json()]).toEqual([415, { error: 'format_off' }]);
    const [doc] = await sql()`select id from documents where original_name = 'plain-bw-10.pdf' order by created_at desc limit 1`;
    const item = (bindingTypeId: string) => ({
      documentIds: [doc!.id],
      colorMode: 'bw',
      paperTypeId: DEFAULT_PAPER_TYPE_ID,
      sidesMode: 'double',
      paperSize: 'a4',
      bindingTypeId,
      copies: 2,
    });
    await setSetting('file.max_pages', 5);
    const tooMany = await shop.request.post('/api/checkout/quote', { data: { items: [item('staple')], place: null } });
    expect([tooMany.status(), await tooMany.json()]).toEqual([422, { error: 'too_many_pages', documentIds: [doc!.id], maxPages: 5 }]);
    await setSetting('file.max_pages', 15);

    // وسط خرید منگنه موقتاً خاموش شد: «ادامه» ۴۰۹ می‌گیرد و میز با فهرست همین لحظه جایش را به طلق و سیم می‌دهد، با یادداشت.
    await setSetting('catalog.paused', { sizes: ['a5'], papers: [], bindings: ['staple'] });
    const paused = await shop.request.post('/api/checkout/quote', { data: { items: [item('staple')], place: null } });
    expect([paused.status(), await paused.json()]).toEqual([409, { error: 'option_unavailable', paused: { sizes: ['a5'], papers: [], bindings: ['staple'] } }]);
    await visibleButton(shop, 'ادامه — آدرس و تحویل').click();
    await expect(staple.locator('input')).toBeDisabled();
    await expect(staple.locator('.jy-tile__note')).toHaveText('موقتاً در دسترس نیست');
    const replaced = 'منگنه موقتاً در دسترس نیست؛ صحافی این جزوه «طلق و سیم» شد. اگر صحافی دیگری می‌خواهی، همین‌جا عوض کن.';
    await expect(shop.getByTestId('replaced-bindingTypeId')).toHaveText(replaced);
    await expect(visibleText(shop, 'گزینه‌ای از چاپ این سفارش همین حالا موقتاً در دسترس نیست')).toBeVisible();
    await expect(total).toHaveText(toman(priced(DEFAULT_BINDING_TYPE_ID, 2)));
    await expect(shop.getByTestId('summary-rounding')).toHaveCount(0);
    await visibleButton(shop, 'ادامه — آدرس و تحویل').click();
    await expect(heading(shop, 'به کدام شهر بفرستیم؟')).toBeVisible();

    // با کرایه، جمع گرد می‌شود و ردیف «گرد کردن» ردیف‌ها را با جمع یکی می‌کند.
    const shipped = quoted(DEFAULT_BINDING_TYPE_ID, 2, 'other');
    expect(shipped.roundingRials).not.toBe(0);
    await shop.getByRole('button', { name: 'مشهد' }).click();
    await expect(heading(shop, 'نشانی در مشهد')).toBeVisible();
    await expect(total).toHaveText(toman(shipped.totalRials));
    const rounding = shop.getByTestId('summary-rounding').filter({ visible: true });
    await expect(rounding.locator('dd')).toHaveText(`${shipped.roundingRials < 0 ? '−' : ''}${toman(Math.abs(shipped.roundingRials))}`);
    expect(shipped.subtotalRials + shipped.shippingRials! + shipped.roundingRials).toBe(shipped.totalRials);

    // برگشت بعد از رفرش (سؤال ۲۲۴): JSON تازهٔ صفحه منگنه را خاموش دارد؛ همان قدم با طلق و سیم، و در میز همان یادداشت.
    await expect
      .poll(async () => (await homeTariff(request)).tariff?.paused.bindings, { timeout: 100_000, intervals: [2_000] })
      .toEqual(['staple']);
    await shop.reload();
    await expect(heading(shop, 'نشانی در مشهد')).toBeVisible({ timeout: 15_000 });
    await expect(total).toHaveText(toman(shipped.totalRials));
    await shop.goBack();
    await expect(heading(shop, 'به کدام شهر بفرستیم؟')).toBeVisible();
    await shop.goBack();
    await expect(shop.getByTestId('replaced-bindingTypeId')).toHaveText(replaced);
    await expect(staple.locator('input')).toBeDisabled();

    // دوباره روشن: انتخاب خود جزوه (منگنه) برمی‌گردد، بی کلیک.
    await setSetting('catalog.paused', { sizes: ['a5'], papers: [], bindings: [] });
    const back = await shop.request.post('/api/checkout/quote', { data: { items: [item('staple')], place: null } });
    expect(back.status()).toBe(200);
    await rulesContext.close();
    await resetRules84();
  });
});
