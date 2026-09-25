import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * کارت «جزوهٔ تو» (docs/UI.md): چیزهایی که تست‌های قیمت نمی‌بینند — جهت عددها کنار متن فارسی،
 * نمایش اندازهٔ کاغذ، راهنمای رنگ پیش از پایان بررسی، نام دکمه‌ها، اندازهٔ هدف لمس، و رنگ نوار
 * پیشرفت و خوانایی دکمهٔ «در حال بررسی…».
 *
 * مثل `flow.spec.ts` بدون استوریج؛ آپلود فقط در تست «در حال ارسال» ساختگی است.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);
/** همان بایت‌های یک نمونه، با نام دیگر — ترتیب جزوه از نام است. */
const renamed = (source: string, name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: readFileSync(fixture(source)),
});

/** کانال‌های یک رنگ برند، از خود فایل برند؛ کد رنگ در تست نوشته نمی‌شود. */
const BRAND = readFileSync(join(process.cwd(), '..', '..', 'docs', 'brand', 'jozveyar-colors.css'), 'utf8');
function brandChannels(name: string): number[] {
  const digits = new RegExp(`--jy-${name}:\\s*#([0-9a-fA-F]{6})`).exec(BRAND)?.[1];
  if (!digits) throw new Error(`${name} در فایل برند نیست`);
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
}
/** کانال‌های رنگی که مرورگر حساب کرده (`getComputedStyle`). */
const channels = (computed: string) => computed.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
/** کنتراست WCAG دو رنگ. */
function contrast(a: number[], b: number[]) {
  const luminance = ([r, g, b]: number[]) =>
    [r!, g!, b!]
      .map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const card = (page: Page) => page.getByRole('region', { name: 'جزوهٔ تو' });
const colorHint = (page: Page) => page.getByTestId('color-hint');
const fileInfo = (page: Page) => page.getByTestId('file-info');
const ready = (page: Page) =>
  expect(page.getByRole('button', { name: 'ادامه — آدرس و تحویل' })).toBeEnabled({ timeout: 30_000 });

/**
 * `.num`های دیدنی صفحه، و آنهایی که حرف فارسی دارند. `.num` جهت را چپ‌به‌راست می‌کند؛ روی متن
 * فارسی ترتیب کلمه‌ها برعکس دیده می‌شود («کیلوبایت 14»)، پس فقط خود عدد باید داخلش باشد. رقم
 * فارسی هم در همین بازه است: اگر سؤال باز «رقم لاتین یا فارسی» به فارسی رسید، این آگاهانه عوض
 * می‌شود.
 */
async function numbers(page: Page) {
  const texts = await page
    .locator('.num')
    .evaluateAll((elements) => elements.filter((el) => el.checkVisibility()).map((el) => el.textContent ?? ''));
  return { count: texts.length, persian: texts.filter((text) => /[؀-ۿ]/.test(text)) };
}

/** هیچ `.num` دیدنی حرف فارسی ندارد؛ و چیزی برای سنجیدن بود — وگرنه تست بی‌صدا سبز می‌شد. */
async function expectPlainNumbers(page: Page, atLeast: number) {
  const { count, persian } = await numbers(page);
  expect(persian).toEqual([]);
  expect(count).toBeGreaterThanOrEqual(atLeast);
}

/**
 * کارگر تحلیل بعد از `after` صفحه دیگر پیامی به صفحه نمی‌دهد: بررسی وسط راه می‌ماند و حالت
 * «در حال بررسی» پایدار است. شمارش و «تمام شد» فایل‌هایی که پیش از آن تمام شده‌اند می‌رسد.
 */
const holdAfter = (after: number) => `(() => {
  const Real = window.Worker;
  window.Worker = class extends Real {
    set onmessage(handler) {
      let pages = 0;
      super.onmessage = (event) => {
        const message = event.data;
        if (message && message.kind === 'page' && ++pages > ${after}) return;
        if (message && message.kind === 'done' && pages > ${after}) return;
        handler.call(this, event);
      };
    }
    get onmessage() {
      return super.onmessage;
    }
  };
})();`;

/**
 * سرور آپلود ساختگی: تکهٔ اول (۵ از ۱۲ مگابایت) رسیده و بقیه در راه‌اند و هیچ‌وقت نمی‌رسند —
 * «در حال ارسال فایل · 41%» ثابت می‌ماند.
 */
async function stalledUpload(page: Page) {
  const part = 5 * 1024 * 1024;
  await page.route('**/api/uploads', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { sizeBytes } = JSON.parse(route.request().postData() ?? '{}') as { sizeBytes: number };
    await route.fulfill({
      json: {
        documentId: 'card-1',
        status: 'uploading',
        partSizeBytes: part,
        partCount: Math.ceil(sizeBytes / part),
        receivedParts: [1],
      },
    });
  });
  await page.route('**/api/uploads/card-1/parts', async (route) => {
    const { partNumbers } = JSON.parse(route.request().postData() ?? '{}') as { partNumbers: number[] };
    await route.fulfill({
      json: { urls: partNumbers.map((n) => ({ partNumber: n, url: `/card-part/${n}` })), expiresInSeconds: 3600 },
    });
  });
  await page.route('**/card-part/**', () => undefined);
  await page.route('**/api/uploads/card-1/browser-analysis', (route) => route.fulfill({ json: {} }));
  const pdf = readFileSync(fixture('plain-bw-10.pdf'));
  const size = 12 * 1024 * 1024;
  return { name: 'jozve-big.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([pdf, Buffer.alloc(size - pdf.length, '%')]) };
}

test.describe('عدد کنار متن فارسی', () => {
  for (const [label, files, atLeast] of [
    ['تک‌فایل', ['plain-bw-10.pdf'], 10],
    ['چند اندازهٔ کاغذ', ['sizes-7.pdf'], 10],
    ['اندازهٔ بی‌نام', ['odd-size-2.pdf'], 10],
    ['جزوهٔ سه‌فایلی', ['plain-bw-10.pdf', 'image-scan-6.pdf', 'mixed-color-10.pdf'], 15],
  ] as const) {
    test(`${label}: هیچ .num دیدنی حرف فارسی ندارد`, async ({ page }) => {
      await page.goto('/');
      await page.setInputFiles('#jozve-file', files.map(fixture));
      await ready(page);
      // کارت، راهنمای کاشی‌های رنگ، و ریز قیمت و وزن (دسکتاپ) — همه با هم.
      await expectPlainNumbers(page, atLeast);
    });
  }

  test('در حال بررسی: «60 / 147» عدد است و راهنمای رنگ «تماماً» نمی‌گوید', async ({ page }) => {
    await page.addInitScript(holdAfter(60));
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('yellow-scan-147.pdf'));
    await expect(card(page).getByText('60 / 147', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(card(page).getByText('در حال بررسی صفحه‌ها…')).toBeVisible();
    // ۶۰ صفحه از ۱۴۷ دیده شده: هنوز حکم «تماماً سیاه‌سفید» نمی‌شود داد.
    await expect(colorHint(page)).toHaveText('تا اینجا صفحهٔ رنگی‌ای پیدا نشد.');
    await expect(card(page).getByText('همهٔ صفحه‌ها بررسی شد')).toHaveCount(0);
    await expectPlainNumbers(page, 8);
  });

  test('جزوه در حال بررسی: صفحهٔ رنگی پیداشده «تا اینجا» است، نه حکم نهایی', async ({ page }) => {
    // جلسه ۱ هایلایت قرمز صفحهٔ ۳ را دیده و در صفحهٔ ۴ مانده؛ جلسه ۲ هنوز در صف است.
    await page.addInitScript(holdAfter(4));
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [
      renamed('mixed-color-10.pdf', 'جلسه 1.pdf'),
      renamed('plain-bw-10.pdf', 'جلسه 2.pdf'),
    ]);
    await expect(colorHint(page)).toHaveText('تا اینجا 1 صفحهٔ رنگی در فایل‌های این جزوه پیدا شد.', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('section-status').first()).toContainText('در حال بررسی صفحه‌ها 4 / 10');
    await expect(card(page).getByText('همهٔ صفحه‌ها بررسی شد')).toHaveCount(0);
    await expectPlainNumbers(page, 8);
  });

  test('در حال ارسال: فقط درصد عدد است — «در حال ارسال فایل · 41%»', async ({ page }) => {
    const big = await stalledUpload(page);
    await page.goto('/');
    await page.setInputFiles('#jozve-file', big);
    const status = page.getByTestId('upload-status');
    await expect(status).toHaveText('در حال ارسال فایل · 41%', { timeout: 30_000 });
    await expect(status.locator('.num')).toHaveText('41%');
    await expectPlainNumbers(page, 10);
  });
});

test.describe('خط اطلاعات فایل', () => {
  test('چند اندازه: نام‌ها با «،» و «و»، هر کدام جدا از متن فارسی', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('sizes-7.pdf'));
    await ready(page);
    await expect(fileInfo(page)).toContainText('7 صفحه · A4، A3 و Letter · ');
    await expect(fileInfo(page).locator('bdi')).toHaveText(['A4', 'A3', 'Letter']);
  });

  test('اندازهٔ بی‌نام به میلی‌متر، نه پوینت', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('odd-size-2.pdf'));
    await ready(page);
    // ۴۸۲×۶۸۰ پوینت همان ۱۷۰×۲۴۰ میلی‌متر است؛ پوینت برای کاربر معنایی ندارد.
    await expect(fileInfo(page)).toContainText('2 صفحه · 170×240 میلی‌متر · ');
    await expect(fileInfo(page).locator('.num').nth(1)).toHaveText('170×240');
    await expect(card(page)).not.toContainText('482');
    await expect(card(page)).not.toContainText('pt');
  });
});

test.describe('دکمه‌های کارت', () => {
  test('✕ ته ردیف «فایل دیگری بینداز» است: فقط آیکون، با نام و راهنما، و برمی‌گرداند به انداختن', async ({
    page,
  }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await ready(page);
    const another = card(page).getByRole('button', { name: 'فایل دیگری بینداز', exact: true });
    await expect(another).toHaveAttribute('title', 'فایل دیگری بینداز');
    await expect(another).toHaveText('');
    await expect(another.locator('.jy-icon-close')).toHaveCount(1);
    await another.click();
    await expect(page.getByText('جزوه‌ات را همین‌جا بینداز')).toBeVisible();
  });
});

test.describe('رنگ (قاعدهٔ رنگ در docs/UI.md)', () => {
  test('نوار پیشرفت بررسی سبزآبی است و پُرش روی خط خودش و روی کارت دیده می‌شود', async ({ page }) => {
    await page.addInitScript(holdAfter(60));
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('yellow-scan-147.pdf'));
    await expect(card(page).getByText('60 / 147', { exact: true })).toBeVisible({ timeout: 30_000 });
    const [fill, track, surface] = await card(page)
      .locator('.jy-progress__bar')
      .evaluate((bar) =>
        [bar, bar.parentElement!, bar.closest('.jy-card')!].map((el) => getComputedStyle(el).backgroundColor),
      );
    // تنها جای tetrad در رابط (تصمیم ۱۴۰۵/۰۷/۰۳)؛ بقیهٔ رابط سبز برند است.
    expect(channels(fill!)).toEqual(brandChannels('teal-500'));
    expect(channels(track!)).toEqual(brandChannels('teal-100'));
    // WCAG 1.4.11: پُر نوار دست‌کم ۳ به ۱، هم روی خط خودش و هم روی کارت.
    expect(contrast(channels(fill!), channels(track!))).toBeGreaterThanOrEqual(3);
    expect(contrast(channels(fill!), channels(surface!))).toBeGreaterThanOrEqual(3);
  });

  test('متن «در حال بررسی…» دکمهٔ بسته خوانده می‌شود: دست‌کم ۴٫۵ به ۱', async ({ page }) => {
    await page.addInitScript(holdAfter(60));
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('yellow-scan-147.pdf'));
    const busy = page.getByRole('button', { name: 'در حال بررسی…' });
    // واقعاً همان دکمهٔ «ادامه» است، بسته و در حال کار؛ وگرنه تست چیز دیگری را می‌سنجید.
    await expect(busy).toBeDisabled({ timeout: 30_000 });
    await expect(busy).toHaveClass(/\bis-loading\b/);
    const [text, background] = await busy.evaluate((button) => {
      const style = getComputedStyle(button);
      return [style.color, style.backgroundColor];
    });
    expect(contrast(channels(text!), channels(background!))).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('هدف لمس روی موبایل', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectTarget(target: Locator, name: string) {
    const box = await target.boundingBox();
    expect(box, `${name} دیده نمی‌شود`).not.toBeNull();
    expect(box!.width, `پهنای ${name}`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `بلندی ${name}`).toBeGreaterThanOrEqual(44);
  }

  test('تک‌فایل: ✕ و «افزودن فایل به همین جزوه» حداقل ۴۴×۴۴', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await ready(page);
    await expectTarget(card(page).getByRole('button', { name: 'فایل دیگری بینداز' }), '✕');
    await expectTarget(card(page).locator('label.jy-add'), 'افزودن فایل');
    await expect(card(page).locator('label.jy-add')).toHaveText('افزودن فایل به همین جزوه');
  });

  test('جزوه: ↑↓✕ هر فایل، «افزودن فایل» و «از اول» حداقل ۴۴×۴۴', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await ready(page);
    const rowButtons = page.getByTestId('section').getByRole('button');
    await expect(rowButtons).toHaveCount(6);
    for (const button of await rowButtons.all()) {
      await expectTarget(button, (await button.getAttribute('aria-label')) ?? 'دکمهٔ ردیف');
    }
    await expectTarget(card(page).locator('label.jy-add'), 'افزودن فایل');
    await expectTarget(card(page).getByRole('button', { name: 'از اول' }), 'از اول');
  });
});
