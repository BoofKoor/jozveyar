import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

/**
 * عدد تنها وسط جعبه (docs/UI.md، «عدد وسط دایره»): دایرهٔ قدم‌های سفارش (`jy-flow__n`)، عدد
 * شمارندهٔ تعداد نسخه (`jy-stepper`) و دایره‌های «سه قدم» صفحهٔ اصلی (۴الف). وسط‌چینی خط متن را وسط
 * می‌گذارد، نه خود رقم را؛ با وزیرمتن رقم لاتین ۲ تا ۲٫۷ پیکسل بالاتر از وسط می‌افتاد.
 * `--jy-digit-rise` در packages/ui/src/base.css جبرانش می‌کند.
 *
 * جای جوهر رقم از خود پیکسل‌های صفحه سنجیده می‌شود، نه از فرمول؛ پس اگر فونت عوض شد (سؤال باز ۱) و
 * رقم دوباره کج افتاد، همین‌جا می‌افتد. تا یک پیکسل جا هست: مرورگر خط پایهٔ متن و لبهٔ جعبه را جدا به
 * پیکسل می‌چسباند و هر کدام تا نیم پیکسل جابه‌جا می‌شود. کج بودن پیش از این دست‌کم ۱٫۸ پیکسل بود.
 *
 * تا ۴ب قدم‌های سفارش و شمارنده در صفحه نبودند و تست نشانه‌گذاری کیت را خودش می‌گذاشت؛ از ۴ب همه روی
 * خود صفحهٔ سفارش سنجیده می‌شوند. شمارنده جای فیلد تعداد نسخهٔ پیشین را گرفت (همان `#copies`).
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

/**
 * صفحهٔ سفارش پس از پایان بررسی: قدم‌ها، تنظیمات و قیمت پیش از پایان بررسی رنگ می‌آیند، و با پایانش
 * کارت «جزوهٔ تو» کوتاه‌تر می‌شود و هرچه زیرش است جابه‌جا می‌شود (در ۳۹۰ پیکسل حدود ۶۰ پیکسل). نشانهٔ
 * پایان، حکم نهایی راهنمای رنگ است، نه قیمت.
 */
async function orderPage(page: Page) {
  await page.goto('/');
  await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
  await expect(page.getByTestId('color-hint')).toHaveText('فایل تماماً سیاه‌سفید است.', { timeout: 20_000 });
}

async function fontsReady(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 20px Vazirmatn'))).toBe(true);
}

interface Ink {
  /** فاصلهٔ وسط جوهر رقم از وسط جعبه، به پیکسل CSS؛ مثبت یعنی پایین‌تر. */
  dy: number;
  /** همان، افقی؛ مثبت یعنی راست‌تر. */
  dx: number;
  /** ارتفاع جوهر به em؛ رقم لاتین وزیرمتن 0.72 است، پس معلوم است خود رقم سنجیده شده. */
  heightEm: number;
}

/**
 * جوهر رقم از اسکرین‌شات خود جعبه: پیکسل‌هایی که به رنگ متن نزدیک‌ترند تا به زمینهٔ جعبه، فقط درون
 * لبه‌ها. در دایره فقط درون دایره؛ در جعبهٔ گوشه‌گرد گوشه‌ها بیرون می‌مانند، چون کمان لبه درون
 * مستطیل می‌افتد و green-500 به رنگ متن نزدیک‌تر است تا به سفید. برش به پیکسل درست تراز است، چون
 * اسکرین‌شات عنصر برش را گرد می‌کند و وسط را تا نیم پیکسل جابه‌جا می‌کند.
 */
async function ink(page: Page, target: Locator): Promise<Ink> {
  const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(scrollBehavior, 'اسکرول نرم در سنجش خاموش است («حرکت کمتر»)').toBe('auto');
  // وسط صفحه، نه لبه: در موبایل نوار قیمت ثابت پایین صفحه است و اسکرین‌شات آن را می‌گرفت، نه جعبه را
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  // سنجش وقتی جعبه ایستاده است: جای اسکرول و خود جعبه در دو فریم پشت‌سرهم همان‌اند (حداکثر ۱۲۰ فریم یا ۲ ثانیه؛ اگر
  // نایستاد، سنجش جابه‌جایی پایین همان را می‌گیرد).
  await target.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        let last = '';
        let same = 0;
        let frames = 0;
        const tick = () => {
          const r = el.getBoundingClientRect();
          const now = `${scrollX},${scrollY},${r.x},${r.y}`;
          same = now === last ? same + 1 : 0;
          last = now;
          if (same >= 2 || ++frames > 120) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(resolve, 2000);
      }),
  );
  const covered = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(hit && (hit === el || el.contains(hit)));
  });
  expect(covered, 'چیزی روی جعبه نیست').toBe(false);
  const box = (await target.boundingBox())!;
  const style = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    const radius = parseFloat(s.borderTopLeftRadius);
    return {
      color: s.color,
      background: s.backgroundColor,
      fontSize: parseFloat(s.fontSize),
      round: s.borderTopLeftRadius === '50%' || radius >= el.clientWidth / 2,
      radius,
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(parseFloat),
    };
  });
  const x = Math.floor(box.x) - 2;
  const y = Math.floor(box.y) - 2;
  const clip = { x, y, width: Math.ceil(box.x + box.width) + 2 - x, height: Math.ceil(box.y + box.height) + 2 - y };
  const png = (await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })).toString('base64');
  // اگر چیدمان وسط سنجش عوض شده باشد، برش جای دیگری از صفحه را گرفته و جوهری پیدا نمی‌شود. تا نیم
  // پیکسل جا هست: وقتی چیزی بالای جعبه قد عوض می‌کند، مرورگر جای اسکرول را نگه می‌دارد، ولی گردش می‌کند.
  const after = (await target.boundingBox())!;
  const shift = Math.hypot(after.x - box.x, after.y - box.y);
  expect(shift, `جعبه وسط سنجش ${shift.toFixed(2)} پیکسل جابه‌جا شد`).toBeLessThanOrEqual(0.5);
  const scale = await page.evaluate(() => devicePixelRatio);

  const bounds = await page.evaluate(
    async ({ png, style, box, scale }) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
      // کانال‌های رنگی که مرورگر حساب کرده؛ کد رنگ در تست نوشته نمی‌شود (نگهبان رنگ)
      const channels = (computed: string) => computed.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
      const text = channels(style.color);
      const ground = channels(style.background);
      const span = text.reduce((sum, c, i) => sum + (c - ground[i]!) ** 2, 0);
      const [top, right, bottom, left] = style.border as [number, number, number, number];
      const corner = style.round ? 0 : style.radius;
      const inside = {
        x0: (box.x + Math.max(left + 1, corner)) * scale,
        x1: (box.x + box.width - Math.max(right + 1, corner)) * scale,
        y0: (box.y + top + 1) * scale,
        y1: (box.y + box.height - bottom - 1) * scale,
      };
      const center = { x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale };
      const radius = (box.width / 2 - top - 1.5) * scale;
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const [cx, cy] = [px + 0.5, py + 0.5];
          if (cx < inside.x0 || cx > inside.x1 || cy < inside.y0 || cy > inside.y1) continue;
          if (style.round && Math.hypot(cx - center.x, cy - center.y) > radius) continue;
          const at = (py * width + px) * 4;
          // سهم رنگ متن در این پیکسل، از ۰ (زمینه) تا ۱ (متن)
          const share = text.reduce((sum, c, i) => sum + (data[at + i]! - ground[i]!) * (c - ground[i]!), 0) / span;
          if (share > 0.5) {
            [x0, x1, y0, y1] = [Math.min(x0, px), Math.max(x1, px + 1), Math.min(y0, py), Math.max(y1, py + 1)];
          }
        }
      }
      return { dx: ((x0 + x1) / 2 - center.x) / scale, dy: ((y0 + y1) / 2 - center.y) / scale, height: (y1 - y0) / scale };
    },
    { png, style, box: { x: box.x - clip.x, y: box.y - clip.y, width: box.width, height: box.height }, scale },
  );

  return { dx: bounds.dx, dy: bounds.dy, heightEm: bounds.height / style.fontSize };
}

/**
 * رقم وسط است، و چیزی که سنجیده شد به اندازهٔ یک رقم بود — وگرنه تست بی‌صدا سبز می‌شد. افقی فقط برای
 * رقم قرینه (مثل «8»): جعبهٔ جوهر «1» به‌خاطر پرچمش خودش حدود یک پیکسل چپ‌تر از وزنش است.
 */
async function expectCentered(page: Page, target: Locator, { horizontal = false } = {}) {
  const measured = await ink(page, target);
  const digit = await target.evaluate((el) => el.textContent || (el as HTMLInputElement).value);
  expect(measured.heightEm, 'ارتفاع جوهر به اندازهٔ رقم').toBeGreaterThan(0.6);
  expect(measured.heightEm, 'ارتفاع جوهر به اندازهٔ رقم').toBeLessThan(0.85);
  expect(Math.abs(measured.dy), `رقم «${digit}»: ${measured.dy.toFixed(2)} پیکسل از وسط، عمودی (منفی یعنی بالاتر)`).toBeLessThanOrEqual(1);
  if (horizontal) {
    expect(Math.abs(measured.dx), `رقم «${digit}»: ${measured.dx.toFixed(2)} پیکسل از وسط، افقی (منفی یعنی چپ‌تر)`).toBeLessThanOrEqual(1);
  }
}

/*
 * «حرکت کمتر»: صفحه اسکرول نرم دارد (`scroll-behavior: smooth` در globals.css، فقط بی این ترجیح)، پس اسکرولی که
 * Playwright پیش از `fill` می‌کند هم نرم است و با اسکرول یک‌بارهٔ سنجش کشمکش دارد: جای نهایی اسکرول هر بار جایی
 * بین ۵۷۱ و ۵۸۲ می‌نشست، نه ۵۵۹ که `scrollIntoView` می‌خواهد، و در اجرای main پس از #36 جعبه وسط سنجش ۳ پیکسل
 * جابه‌جا شد. با «حرکت کمتر» هر بار همان ۵۵۹. جای رقم به حرکت بند نیست.
 */
test.use({ deviceScaleFactor: 2, reducedMotion: 'reduce' });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`${viewport.width} پیکسل`, () => {
    test.use({ viewport });

    test('دایره‌های قدم‌های سفارش: رقم وسط دایره است، در قدم جاری و بقیه', async ({ page }) => {
      await orderPage(page);
      await fontsReady(page);
      const circles = page.locator('.home-flow .jy-flow__n');
      await expect(circles).toHaveText(['1', '2', '3']);
      for (const circle of await circles.all()) await expectCentered(page, circle);
    });

    test('«سه قدم» صفحهٔ اصلی: رقم وسط دایره است', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await fontsReady(page);
      const circles = page.locator('#how .home-how__n');
      await expect(circles).toHaveText(['1', '2', '3']);
      for (const circle of await circles.all()) await expectCentered(page, circle);
    });

    test('شمارندهٔ تعداد نسخه (jy-stepper): رقم وسط جعبه است، افقی و عمودی', async ({ page }) => {
      await orderPage(page);
      const copies = page.locator('.jy-stepper #copies');
      await copies.fill('8');
      await copies.blur();
      // ۸ نسخه: ۶۱,۰۰۰ × ۸؛ خلاصهٔ سفارش هم با خط «8 نسخه» عوض می‌شود
      await expect(page.getByTestId('price-total')).toContainText('488,000');
      await fontsReady(page);
      await expectCentered(page, copies, { horizontal: true });
    });
  });
}
