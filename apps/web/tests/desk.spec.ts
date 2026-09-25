import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { formatNumber, formatTomans } from '@jozveyar/text';

/**
 * صفحهٔ اصلی پس از فایل (docs/UI.md، ۴ب): قدم‌های سفارش، «تنظیمات چاپ» با کاشی‌های رادیو و اثر هر
 * گزینه روی قیمت، کلید جهت، خلاصهٔ سفارش که قیمت را همیشه روی صفحه نگه می‌دارد، ترتیب Tab و هدف
 * لمسی، انتخاب‌هایی که با «فایل دیگری بینداز» نمی‌روند، و رابط پس از فایل که تکهٔ جدای JS است.
 *
 * مثل `flow.spec.ts` روی build تولیدی و بی استوریج. `price-total` جمع نوار قیمت موبایل است (در
 * دسکتاپ پنهان، با همان عدد)؛ جمع دیدنی دسکتاپ `summary-total` خلاصهٔ سفارش است.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);
/** همان بایت‌های یک نمونه، با نام دیگر. */
const renamed = (source: string, name: string) => ({ name, mimeType: 'application/pdf', buffer: readFileSync(fixture(source)) });
const summaryTotal = (page: Page) => page.getByTestId('summary-total');
const colorHint = (page: Page) => page.getByTestId('color-hint');
const ALL_BW = 'فایل تماماً سیاه‌سفید است.';
const toman = (rials: number) => formatTomans(rials, false);
const tile = (page: Page, title: string) => page.locator('label.jy-tile').filter({ has: page.getByText(title, { exact: true }) });

/** قیمت یک جزوهٔ `pages` صفحه‌ای با همان `quote()` فلوی سفارش؛ بی ارسال. */
function quoteFor(
  pages: number,
  { colorMode = 'bw', sidesMode = 'double', copies = 1 }: { colorMode?: 'bw' | 'color'; sidesMode?: 'single' | 'double'; copies?: number } = {},
) {
  return quote(
    {
      items: [
        {
          sections: [{ documentId: 'test', pageCount: pages }],
          rules: wholeDocumentRule(pages, colorMode, DEFAULT_PAPER_TYPE_ID),
          copies,
          sidesMode,
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: null,
    },
    SEED_PRICE_LIST,
  );
}

/** «+65,200 تومان»، «−5,000 تومان»، «همان قیمت». */
function effect(fromRials: number, toRials: number) {
  const delta = toRials - fromRials;
  if (delta === 0) return 'همان قیمت';
  return `${delta > 0 ? '+' : '−'}${toman(Math.abs(delta))} تومان`;
}

/** یک فایل ساده، تا پایان بررسی (حکم نهایی راهنمای رنگ): چیدمان دیگر جابه‌جا نمی‌شود. */
async function dropReady(page: Page) {
  await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
  await expect(colorHint(page)).toHaveText(ALL_BW, { timeout: 20_000 });
}

test.describe('قدم‌های سفارش', () => {
  test('«جزوه و قیمت» قدم جاری است، بعد «آدرس» و «پرداخت»', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    const steps = page.getByRole('navigation', { name: 'قدم‌های سفارش' }).getByRole('listitem');
    await expect(steps).toHaveText(['1جزوه و قیمت', '2آدرس', '3پرداخت']);
    await expect(steps.first()).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('[aria-current]')).toHaveCount(1);
  });
});

test.describe('تنظیمات چاپ', () => {
  /**
   * جزوهٔ ۱۶۳ صفحه‌ای (سه فایل): دورو ۸۲ برگ است و یکرو ۱۶۳، که بازهٔ صحافی را عوض می‌کند؛ پس اثر
   * یکرو و دورو هم صفر نیست. همهٔ عددهای انتظار از همان `quote()` است.
   */
  test('اثر هر گزینه روی قیمت همان quote() است، پیش و پس از هر انتخاب', async ({ page }) => {
    const pages = 163;
    await page.goto('/');
    await page.setInputFiles('#jozve-file', [fixture('yellow-scan-147.pdf'), fixture('plain-bw-10.pdf'), fixture('image-scan-6.pdf')]);
    await expect(page.getByTestId('stat-page-count')).toHaveText(String(pages), { timeout: 20_000 });

    const base = quoteFor(pages).totalWithoutShippingRials;
    const color = quoteFor(pages, { colorMode: 'color' }).totalWithoutShippingRials;
    const single = quoteFor(pages, { sidesMode: 'single' }).totalWithoutShippingRials;
    const sheets = (sidesMode: 'single' | 'double') => formatNumber(quoteFor(pages, { sidesMode }).items[0]!.sheets);
    expect(single).not.toBe(base); // وگرنه اثر یکرو و دورو «همان قیمت» می‌ماند و چیزی سنجیده نمی‌شد
    await expect(summaryTotal(page)).toHaveText(toman(base));

    // گزینهٔ انتخاب‌شده اثری ندارد؛ گزینهٔ دیگر اثرش را دارد
    await expect(tile(page, 'سیاه‌سفید').locator('.jy-tile__delta')).toHaveCount(0);
    await expect(tile(page, 'رنگی').locator('.jy-tile__delta')).toHaveText(effect(base, color));
    await expect(tile(page, 'دورو').locator('.jy-tile__note')).toHaveText(`${sheets('double')} برگ، جزوهٔ نازک‌تر`);
    await expect(tile(page, 'یکرو').locator('.jy-tile__note')).toHaveText(`${sheets('single')} برگ، ${effect(base, single)}`);

    await tile(page, 'رنگی').click();
    await expect(summaryTotal(page)).toHaveText(toman(color));
    await expect(tile(page, 'سیاه‌سفید').locator('.jy-tile__delta')).toHaveText(effect(color, base));
    await expect(tile(page, 'رنگی').locator('.jy-tile__delta')).toHaveCount(0);

    const colorSingle = quoteFor(pages, { colorMode: 'color', sidesMode: 'single' }).totalWithoutShippingRials;
    await expect(tile(page, 'یکرو').locator('.jy-tile__note')).toHaveText(`${sheets('single')} برگ، ${effect(color, colorSingle)}`);
    await tile(page, 'یکرو').click();
    await expect(summaryTotal(page)).toHaveText(toman(colorSingle));
    await expect(tile(page, 'دورو').locator('.jy-tile__note')).toHaveText(`${sheets('double')} برگ، ${effect(colorSingle, color)}`);
    await expect(tile(page, 'یکرو').locator('.jy-tile__note')).toHaveText(`${sheets('single')} برگ`);

    await page.getByRole('button', { name: 'یکی بیشتر' }).click();
    await expect(summaryTotal(page)).toHaveText(toman(quoteFor(pages, { colorMode: 'color', sidesMode: 'single', copies: 2 }).totalWithoutShippingRials));
  });

  test('کلید جهت بین گزینه‌ها می‌رود و قیمت با آن', async ({ page }) => {
    await page.goto('/');
    await dropReady(page);
    const bw = page.getByRole('radio', { name: 'سیاه‌سفید' });
    const color = page.getByRole('radio', { name: 'رنگی' });
    await expect(bw).toBeChecked();

    await bw.focus();
    await page.keyboard.press('ArrowDown');
    await expect(color).toBeChecked();
    await expect(color).toBeFocused();
    await expect(summaryTotal(page)).toHaveText(toman(quoteFor(10, { colorMode: 'color' }).totalWithoutShippingRials));
    await page.keyboard.press('ArrowUp');
    await expect(bw).toBeChecked();

    const double = page.getByRole('radio', { name: 'دورو' });
    const single = page.getByRole('radio', { name: 'یکرو' });
    await double.focus();
    await page.keyboard.press('ArrowDown');
    await expect(single).toBeChecked();
    await expect(tile(page, 'دورو').locator('.jy-tile__note')).toContainText('همان قیمت');
  });

  test('شمارندهٔ نسخه: − و + و تایپ عدد؛ − در یک بسته است ولی فوکوس را نگه می‌دارد', async ({ page }) => {
    await page.goto('/');
    await dropReady(page);
    const copies = page.getByRole('spinbutton', { name: 'تعداد نسخه' });
    const less = page.getByRole('button', { name: 'یکی کمتر' });
    const more = page.getByRole('button', { name: 'یکی بیشتر' });
    await expect(page.getByRole('group', { name: 'تعداد نسخه' })).toHaveClass(/\bjy-stepper\b/);
    await expect(copies).toHaveValue('1');
    await expect(less).toHaveAttribute('aria-disabled', 'true');

    await more.click();
    await expect(copies).toHaveValue('2');
    await expect(less).toHaveAttribute('aria-disabled', 'false');
    await less.focus();
    await page.keyboard.press('Enter');
    await expect(copies).toHaveValue('1');
    // بسته شد، ولی فوکوس همان‌جاست: کلید پشت‌سرهم تا ۱ فوکوس را به ته صفحه نمی‌فرستد
    await expect(less).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(copies).toHaveValue('1');

    await copies.fill('12');
    await expect(summaryTotal(page)).toHaveText(toman(quoteFor(10, { copies: 12 }).totalWithoutShippingRials));
    await expect(page.locator('.home-sum__lines')).toContainText('تعداد12 نسخه');
  });

  test('انتخاب‌ها با «فایل دیگری بینداز» نمی‌روند', async ({ page }) => {
    await page.goto('/');
    await dropReady(page);
    await tile(page, 'رنگی').click();
    await page.getByRole('button', { name: 'یکی بیشتر' }).click();
    await page.getByRole('button', { name: 'یکی بیشتر' }).click();
    await page.getByRole('button', { name: 'فایل دیگری بینداز' }).click();
    await expect(page.locator('label.jy-upload')).toBeVisible();

    await dropReady(page);
    await expect(page.getByRole('radio', { name: 'رنگی' })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'تعداد نسخه' })).toHaveValue('3');
    await expect(summaryTotal(page)).toHaveText(toman(quoteFor(10, { colorMode: 'color', copies: 3 }).totalWithoutShippingRials));
  });
});

test.describe('قیمت همیشه روی صفحه', () => {
  /** بالا، وسط و ته صفحه؛ اسکرول آنی، چون صفحه `scroll-behavior: smooth` دارد. */
  async function atEachScroll(page: Page, check: (where: string) => Promise<void>) {
    for (const [where, fraction] of [
      ['بالا', 0],
      ['وسط', 0.5],
      ['ته', 1],
    ] as const) {
      await page.evaluate((f) => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo({ top: max * f, behavior: 'instant' });
      }, fraction);
      await check(where);
    }
  }

  test('دسکتاپ: جمع و «ادامه» خلاصهٔ سفارش در بالا، وسط و ته صفحه دیده می‌شوند', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await dropReady(page);
    const go = page.getByRole('button', { name: 'ادامه — آدرس و تحویل' });
    await expect(go).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(400);
    await atEachScroll(page, async (where) => {
      await expect(summaryTotal(page), `جمع، ${where}`).toBeInViewport();
      await expect(go, `«ادامه»، ${where}`).toBeInViewport();
    });
    // نوار موبایل در دسکتاپ نیست
    await expect(page.getByRole('region', { name: 'قیمت' })).toBeHidden();

    // شاهد ۱: بی چسبیدن خلاصه، در ته صفحه جمع از صفحه بیرون می‌رود
    const bottom = () => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.locator('.home-side').evaluate((side) => side.style.setProperty('position', 'static'));
    await bottom();
    await expect(summaryTotal(page)).not.toBeInViewport();
    // شاهد ۲: خلاصه می‌چسبد، ولی سؤال‌ها بیرون شبکه‌اند؛ sticky فقط تا ته ظرف خودش می‌چسبد
    await page.locator('.home-side').evaluate((side) => side.style.removeProperty('position'));
    await bottom();
    await expect(summaryTotal(page)).toBeInViewport();
    await page.evaluate(() => document.querySelector('.home-more')!.after(document.getElementById('faq')!));
    await bottom();
    await expect(summaryTotal(page)).not.toBeInViewport();
  });

  test('موبایل: جمع و «ادامه» در نوار پایین، در بالا، وسط و ته صفحه', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dropReady(page);
    const dock = page.getByRole('region', { name: 'قیمت' });
    const go = dock.getByRole('button', { name: 'ادامه — آدرس و تحویل' });
    await expect(go).toBeEnabled();
    await expect(go).toHaveText('ادامه');
    await atEachScroll(page, async (where) => {
      await expect(dock.getByTestId('price-total'), `جمع، ${where}`).toBeInViewport();
      await expect(go, `«ادامه»، ${where}`).toBeInViewport();
    });
    // «ادامه» خلاصهٔ درون صفحه تا ۸۶۰ پیکسل پنهان است؛ یکی کافی است
    await expect(page.locator('.home-sum__go')).toBeHidden();
  });
});

test.describe('دسترس‌پذیری پس از فایل', () => {
  /** نام هر چیزی که فوکوس گرفت: رادیو با گروه و مقدارش. */
  const focused = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement!;
      if (el instanceof HTMLInputElement && el.type === 'radio') return `${el.name}:${el.value}`;
      return el.id || el.getAttribute('aria-label') || el.textContent!.trim();
    });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`ترتیب Tab در ${viewport.width}: ✕، افزودن فایل، رنگ، دورو، شمارنده، «ادامه» و سؤال‌ها`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await dropReady(page);
      const questions = await page.locator('#faq summary').allTextContents();
      expect(questions).toHaveLength(6);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const order: string[] = [];
      for (let i = 0; i < 8 + questions.length; i++) {
        await page.keyboard.press('Tab');
        order.push(await focused(page));
      }
      expect(order).toEqual([
        'فایل دیگری بینداز',
        'jozve-add',
        'jozve-color:bw',
        'jozve-sides:double',
        'یکی کمتر',
        'copies',
        'یکی بیشتر',
        'ادامه — آدرس و تحویل',
        ...questions.map((q) => q.trim()),
      ]);
    });

    test(`هدف لمسی دست‌کم ۴۴ پیکسل در ${viewport.width}: کارت، کاشی‌ها، شمارنده، «ادامه» و سؤال‌ها`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await dropReady(page);
      const targets = await page
        .locator('a, button, summary, label.jy-tile, label.jy-add, input[type="number"]')
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.checkVisibility())
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { name: el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30) || el.id, width: r.width, height: r.height };
            }),
        );
      // ✕، افزودن فایل، چهار کاشی، − عدد +، «ادامه» و شش سؤال
      expect(targets.length).toBeGreaterThanOrEqual(15);
      for (const { name, width, height } of targets) {
        expect(Math.min(width, height), name).toBeGreaterThanOrEqual(44);
      }
    });
  }
});

test.describe('رابط پس از فایل، تکهٔ جدا', () => {
  /** اسکریپتی که رابط پس از فایل را دارد: نام کلاسش در کد کوچک‌شده هم می‌ماند. */
  const DESK = 'home-sum__total';

  test('پیش از نشانهٔ قصد بار نمی‌شود؛ با اشاره‌گر روی کارت بارگذاری، پیش از هر فایلی بار می‌شود', async ({ page }) => {
    const desk: string[] = [];
    page.on('response', async (response) => {
      if (response.request().resourceType() !== 'script') return;
      const body = await response.body().catch(() => null);
      if (body?.toString('latin1').includes(DESK)) desk.push(response.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(desk).toEqual([]);

    await page.locator('label.jy-upload').hover();
    await expect.poll(() => desk.length).toBe(1);
    // و فایل بعدی همان تکه را دوباره نمی‌خواهد
    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(page.getByTestId('price-total')).toContainText('61,000', { timeout: 20_000 });
    expect(desk).toHaveLength(1);
  });

  test('بار نشدنش بن‌بست نیست: پیام و «دوباره تلاش کن»، و فایل همان‌جا می‌ماند', async ({ page }) => {
    let fail = true;
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.route('**/_next/static/chunks/**', async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      if (fail && body.toString('latin1').includes(DESK)) return route.abort('failed');
      return route.fulfill({ response, body });
    });

    await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
    await expect(page.getByText('بخش سفارش کامل بار نشد')).toBeVisible({ timeout: 20_000 });
    const retry = page.getByRole('button', { name: 'دوباره تلاش کن' });
    await expect(retry).toBeVisible();

    fail = false;
    await retry.click();
    await expect(page.getByTestId('price-total')).toContainText('61,000', { timeout: 20_000 });
    await expect(page.getByTestId('stat-page-count')).toHaveText('10');
    await expect(retry).toHaveCount(0);
  });
});

test.describe('بی اسکرول افقی پس از فایل', () => {
  for (const width of [320, 390, 1280]) {
    test(`جزوهٔ چندفایلی با نام بلند لاتین، در ${width} پیکسل`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1000 ? 844 : 800 });
      await page.goto('/');
      await page.setInputFiles('#jozve-file', [
        renamed('plain-bw-10.pdf', 'Thermodynamics lecture 01 - introduction and first law of thermodynamics.pdf'),
        renamed('dpi-mix-4.pdf', 'dpi-mix-4.pdf'),
        renamed('mixed-color-10.pdf', 'mixed-color-10.pdf'),
      ]);
      await expect(colorHint(page)).toContainText('3 صفحهٔ رنگی', { timeout: 20_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

