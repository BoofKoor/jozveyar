import { expect, test, type FileChooser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  DEFAULT_SHIPPING_METHOD_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatNumber, formatTomans, toLatinDigits } from '@jozveyar/text';

/**
 * صفحهٔ اصلی پیش از فایل (docs/UI.md، ۴الف): طرح ز روی سایت. قهرمان با کارت بارگذاری، سه قدم،
 * تعرفه و سؤال‌ها؛ و اینکه پس از فایل همه کنار می‌روند و با «فایل دیگری بینداز» برمی‌گردند.
 *
 * مثل `flow.spec.ts` روی build تولیدی و بی استوریج. سربرگ و پیوندهایش در `site.spec.ts` است، و
 * رقم دایره‌های «سه قدم» در `digits.spec.ts`.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);
const price = (page: Page) => page.getByTestId('price-total');
const uploadCard = (page: Page) => page.locator('label.jy-upload');

async function dropFile(page: Page) {
  await page.setInputFiles('#jozve-file', fixture('plain-bw-10.pdf'));
  await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
}

/** «1,600»: همان نمایش تومان فلوی سفارش، بی واحد. */
const toman = (rials: number) => formatTomans(rials, false);

/** کانال‌های یک رنگ برند، از خود فایل برند؛ کد رنگ در تست نوشته نمی‌شود (نگهبان رنگ). */
const BRAND = readFileSync(join(process.cwd(), '..', '..', 'docs', 'brand', 'jozveyar-colors.css'), 'utf8');
function brandChannels(name: string): number[] {
  const digits = new RegExp(`--jy-${name}:\\s*#([0-9a-fA-F]{6})`).exec(BRAND)?.[1];
  if (!digits) throw new Error(`${name} در فایل برند نیست`);
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
}
/** کانال‌های رنگی که مرورگر حساب کرده (`getComputedStyle`). */
const channels = (computed: string) => computed.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
const background = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('تعرفه: همان عددهای فلوی سفارش', () => {
  const list = SEED_PRICE_LIST;

  test('نرخ چاپ هر رو، کاغذ، بازه‌های صحافی و کمترین کرایهٔ هر منطقه از خود تعرفه است', async ({ page }) => {
    await page.goto('/');

    const print = page.getByTestId('tariff-print');
    await expect(print.locator('dt')).toHaveText(['سیاه‌سفید', 'رنگی']);
    await expect(print.locator('dd')).toHaveText([`${toman(list.clickRates.bw!)} تومان`, `${toman(list.clickRates.color!)} تومان`]);
    await expect(print.locator('.home-price__note')).toHaveText(
      `کاغذ ${toLatinDigits(list.paperTypes[DEFAULT_PAPER_TYPE_ID]!.nameFa)}. هر برگ در چاپ دورو دو صفحه است.`,
    );

    const binding = list.bindingTypes[DEFAULT_BINDING_TYPE_ID]!;
    const card = page.getByTestId('tariff-binding');
    await expect(card.getByRole('heading')).toHaveText(`صحافی ${binding.nameFa}`);
    await expect(card.locator('.home-price__big')).toHaveText(
      `از ${toman(Math.min(...binding.bands.map((band) => band.priceRials)))} تومان`,
    );
    // ریز بازه‌ها، بر حسب برگ؛ اولی «تا ۱۵۰ برگ»
    await card.getByText('بر اساس تعداد برگ').click();
    const rows = card.locator('tr');
    await expect(rows).toHaveCount(binding.bands.length);
    for (const [i, band] of binding.bands.entries()) {
      const label = i === 0 ? `تا ${formatNumber(band.maxSheets)} برگ` : `${formatNumber(band.minSheets)} تا ${formatNumber(band.maxSheets)}`;
      await expect(rows.nth(i).locator('td')).toHaveText([label, toman(band.priceRials)]);
    }
    await expect(card.locator('.home-price__note')).toHaveText(
      `بالای ${formatNumber(binding.maxSheetsPerVolume)} برگ خودکار چند جلد می‌شود.`,
    );

    const lowest = (zoneId: string) =>
      Math.min(
        ...list.shippingRates
          .filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID && rate.zoneId === zoneId)
          .map((rate) => rate.priceRials),
      );
    const shipping = page.getByTestId('tariff-shipping');
    await expect(shipping.getByRole('heading')).toHaveText(`ارسال با ${list.shippingMethods[DEFAULT_SHIPPING_METHOD_ID]!.nameFa}`);
    await expect(shipping.locator('dt')).toHaveText(['تهران', 'شهرهای دیگر']);
    await expect(shipping.locator('dd')).toHaveText([`از ${toman(lowest('tehran'))} تومان`, `از ${toman(lowest('other'))} تومان`]);
  });

  test('مثال همان quote() فلوی سفارش است: ۱۲۰ صفحهٔ سیاه‌سفید دورو، یک نسخه', async ({ page }) => {
    const breakdown = quote(
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
      SEED_PRICE_LIST,
    );
    const item = breakdown.items[0]!;
    // «روی هم» راست می‌گوید: جمع بی ارسال همان چاپ به‌علاوهٔ صحافی است
    expect(item.printRials + item.bindingRials).toBe(breakdown.totalWithoutShippingRials);

    await page.goto('/');
    await expect(page.getByTestId('tariff-example')).toHaveText(
      `مثال: جزوهٔ 120 صفحه‌ای، سیاه‌سفید و دورو (${formatNumber(item.sheets)} برگ): چاپ ${toman(item.printRials)} و صحافی ${toman(item.bindingRials)}، روی هم ${toman(breakdown.totalWithoutShippingRials)} تومان به‌علاوهٔ ارسال.`,
    );
  });
});

test.describe('کارت بارگذاری', () => {
  test('کل کارت برچسب ورودی فایل است: کلیک هر جایش و کلید، فایل‌گزین چندفایلی را باز می‌کنند', async ({ page }) => {
    // شنوندهٔ پیوسته، پیش از بار صفحه: رهگیری فایل‌گزین از اول روشن است، نه اینکه با هر waitForEvent
    // روشن شود و کلیدی که زودتر برسد، فایل‌گزین واقعی (در مرورگر بی‌سر، هیچ) باز کند.
    const choosers: FileChooser[] = [];
    page.on('filechooser', (chooser) => choosers.push(chooser));
    await page.goto('/');
    const input = page.locator('#jozve-file');
    await expect(input).toHaveAccessibleName('جزوه‌ات را همین‌جا بینداز انتخاب فایل');
    await expect(input).toHaveAccessibleDescription('PDF Word پاورپوینت عکس چند فایل هم می‌شود؛ پشت‌سرهم در یک جزوه صحافی می‌شوند.');

    for (const target of [page.getByText('انتخاب فایل', { exact: true }), page.locator('#upload-title'), page.locator('.home-art')]) {
      const before = choosers.length;
      await target.click();
      await expect.poll(() => choosers.length).toBe(before + 1);
      expect(choosers.at(-1)!.isMultiple()).toBe(true);
    }

    // با صفحه‌کلید: فوکوس روی ورودی پنهان، و حلقهٔ فوکوس دولایه روی خود کارت دیده می‌شود
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    const ring = await uploadCard(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('2px');
    expect(channels(ring.color)).toEqual(brandChannels('green-700'));
    const before = choosers.length;
    await page.keyboard.press('Enter');
    await expect.poll(() => choosers.length).toBe(before + 1);
  });

  test('فایلی که روی کارت کشیده می‌شود کارت را روشن می‌کند، و رها کردنش قیمت می‌دهد', async ({ page }) => {
    await page.goto('/');
    const card = uploadCard(page);
    const dataTransfer = await page.evaluateHandle((base64) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], 'plain-bw-10.pdf', { type: 'application/pdf' }));
      return transfer;
    }, readFileSync(fixture('plain-bw-10.pdf')).toString('base64'));

    // رنگ با transition کیت عوض می‌شود؛ پس تا آرام گرفتن صبر
    const drop = () => background(page, '.jy-drop').then(channels);
    await expect.poll(drop).toEqual(brandChannels('green-50'));
    await card.dispatchEvent('dragover', { dataTransfer });
    await expect(card).toHaveClass(/is-dragover/);
    // همان رنگ hover محل انداختن (green-100)، با لبهٔ پر
    await expect.poll(drop).toEqual(brandChannels('green-100'));
    await card.dispatchEvent('dragleave', { dataTransfer });
    await expect(card).not.toHaveClass(/is-dragover/);
    await expect.poll(drop).toEqual(brandChannels('green-50'));

    await card.dispatchEvent('drop', { dataTransfer });
    await expect(price(page)).toContainText('61,000', { timeout: 20_000 });
  });
});

test.describe('دسترس‌پذیری پیش از فایل', () => {
  test('ترتیب Tab: لوگو، سه پیوند، کارت بارگذاری، ریز تعرفه و سؤال‌ها', async ({ page }) => {
    await page.goto('/');
    const questions = await page.locator('#faq summary').allTextContents();
    expect(questions).toHaveLength(6);
    const order: string[] = [];
    for (let i = 0; i < 6 + questions.length; i++) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement!;
          return el.id || el.getAttribute('aria-label') || el.textContent!.trim();
        }),
      );
    }
    expect(order).toEqual([
      'جزوه‌یار، صفحهٔ اصلی',
      'چطور کار می‌کند',
      'تعرفه',
      'سؤال‌ها',
      'jozve-file',
      'بر اساس تعداد برگ',
      ...questions.map((q) => q.trim()),
    ]);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`هدف لمسی دست‌کم ۴۴ پیکسل در ${viewport.width}: پیوندها، کارت بارگذاری، ریز تعرفه و سؤال‌ها`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const targets = await page
        .locator('a, summary, button, label.jy-upload')
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.checkVisibility())
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { name: el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30), width: r.width, height: r.height };
            }),
        );
      // سربرگ (لوگو و پیوندها)، کارت، ریز تعرفه و شش سؤال
      expect(targets.length).toBeGreaterThanOrEqual(viewport.width < 521 ? 10 : 11);
      for (const { name, width, height } of targets) {
        expect(Math.min(width, height), name).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('هیچ .num دیدنی حرف فارسی ندارد: اطمینان، سه قدم، تعرفه و سؤال‌ها', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.querySelectorAll('details').forEach((details) => (details.open = true)));
    const texts = await page
      .locator('.num')
      .evaluateAll((elements) => elements.filter((el) => el.checkVisibility()).map((el) => el.textContent ?? ''));
    expect(texts.filter((text) => /[؀-ۿ]/.test(text))).toEqual([]);
    // دو «2» اطمینان، سه دایره و یک «2» سه قدم، نرخ‌ها، بازه‌ها، مثال و نرخ‌های سؤال اول
    expect(texts.length).toBeGreaterThanOrEqual(30);
  });
});

test.describe('تیتر', () => {
  for (const width of [320, 390, 1280]) {
    test(`«همین حالا» تأکید دارد و تیتر فقط سر ویرگول می‌شکند، در ${width} پیکسل`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const title = page.getByRole('heading', { level: 1 });
      await expect(title).toHaveText('جزوه‌ات را بینداز، قیمت را همین حالا ببین');
      await expect(title.locator('mark')).toHaveText('همین حالا');
      const clauses = await title.locator('.home-clause').evaluateAll((elements) =>
        elements.map((el) => {
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
          return { text: el.textContent, lines: Math.round(el.getBoundingClientRect().height / lineHeight) };
        }),
      );
      expect(clauses).toEqual([
        { text: 'جزوه‌ات را بینداز،', lines: 1 },
        { text: 'قیمت را همین حالا ببین', lines: 1 },
      ]);
    });
  }
});

test.describe('زمینه و حالت سفارش', () => {
  test('پیش از فایل صفحه سفید است و نوار بالا و پاورقی green-50؛ پس از فایل کل صفحه green-50', async ({ page }) => {
    await page.goto('/');
    expect(channels(await background(page, 'body'))).toEqual(brandChannels('paper'));
    for (const band of ['.site-top', '.home-top', 'footer']) {
      expect(channels(await background(page, band)), band).toEqual(brandChannels('green-50'));
    }
    await dropFile(page);
    expect(channels(await background(page, 'body'))).toEqual(brandChannels('green-50'));
  });

  test('پس از فایل قهرمان، سه قدم و تعرفه کنار می‌روند و تیتر فقط برای صفحه‌خوان می‌ماند؛ با «فایل دیگری بینداز» برمی‌گردند', async ({
    page,
  }) => {
    const hero = ['.home-eyebrow', '.home-lead', '.home-trust', '#how', '#tariff'];
    await page.goto('/');
    for (const selector of hero) await expect(page.locator(selector), selector).toBeVisible();

    await dropFile(page);
    for (const selector of hero) await expect(page.locator(selector), selector).toBeHidden();
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('جزوه‌ات را بینداز، قیمت را همین حالا ببین');
    const box = (await title.boundingBox())!;
    expect(box.width * box.height).toBeLessThanOrEqual(1);
    await expect(page.locator('#faq')).toBeVisible();

    await page.getByRole('button', { name: 'فایل دیگری بینداز' }).click();
    for (const selector of hero) await expect(page.locator(selector), selector).toBeVisible();
    expect((await title.boundingBox())!.height).toBeGreaterThan(40);
    await expect(uploadCard(page)).toBeVisible();
  });
});
