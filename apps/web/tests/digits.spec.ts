import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * عدد تنها وسط جعبه (docs/UI.md، «عدد وسط دایره»): دایرهٔ قدم‌های سفارش (`jy-flow__n`) و عدد
 * شمارندهٔ نسخه (`jy-stepper`). وسط‌چینی خط متن را وسط می‌گذارد، نه خود رقم را؛ با وزیرمتن رقم لاتین
 * ۲ تا ۲٫۷ پیکسل بالاتر از وسط می‌افتاد. `--jy-digit-rise` در packages/ui/src/base.css جبرانش می‌کند.
 *
 * جای جوهر رقم از خود پیکسل‌های صفحه سنجیده می‌شود، نه از فرمول؛ پس اگر فونت عوض شد (سؤال باز ۱) و
 * رقم دوباره کج افتاد، همین‌جا می‌افتد. تا یک پیکسل جا هست: مرورگر خط پایهٔ متن و لبهٔ جعبه را جدا به
 * پیکسل می‌چسباند و هر کدام تا نیم پیکسل جابه‌جا می‌شود. کج بودن پیش از این دست‌کم ۱٫۸ پیکسل بود.
 *
 * صفحه تا ۴ب این اجزا را ندارد، پس تست نشانه‌گذاری کیت را خودش در صفحهٔ اصلی می‌گذارد؛ CSS همان CSS
 * سایت است. ۴ب که آنها را واقعاً نشان داد، تست سراغ خود صفحه می‌رود.
 */

/** همان نشانه‌گذاری کیت، روی زمینهٔ کارت. */
const PROBE = `
<div id="digits-probe" style="padding: 24px; background: var(--color-card)">
  <ol class="jy-flow" aria-label="قدم‌های سفارش">
    <li aria-current="step"><span class="jy-flow__n num">1</span>جزوه و قیمت</li>
    <li><span class="jy-flow__n num">2</span>آدرس</li>
    <li><span class="jy-flow__n num">3</span>پرداخت</li>
  </ol>
  <div style="height: 24px"></div>
  <div class="jy-stepper" role="group" aria-label="تعداد نسخه، output">
    <button type="button" aria-label="یکی کمتر"><span class="jy-icon jy-icon-minus" aria-hidden="true"></span></button>
    <output class="num">1</output>
    <button type="button" aria-label="یکی بیشتر"><span class="jy-icon jy-icon-plus" aria-hidden="true"></span></button>
  </div>
  <div style="height: 24px"></div>
  <div class="jy-stepper" role="group" aria-label="تعداد نسخه، input">
    <button type="button" aria-label="یکی کمتر"><span class="jy-icon jy-icon-minus" aria-hidden="true"></span></button>
    <input class="num" type="number" value="7" aria-label="تعداد نسخه">
    <button type="button" aria-label="یکی بیشتر"><span class="jy-icon jy-icon-plus" aria-hidden="true"></span></button>
  </div>
</div>`;

/** بعد از hydrate، تا React نشانه‌گذاری افزوده را برندارد؛ و بعد از بار شدن وزیرمتن. */
async function mount(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate((html) => document.body.insertAdjacentHTML('afterbegin', html), PROBE);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 20px Vazirmatn'))).toBe(true);
}

interface Ink {
  /** فاصلهٔ وسط جوهر رقم از وسط جعبه، به پیکسل CSS؛ مثبت یعنی پایین‌تر. */
  dy: number;
  /** ارتفاع جوهر به em؛ رقم لاتین وزیرمتن 0.72 است، پس معلوم است خود رقم سنجیده شده. */
  heightEm: number;
}

/**
 * جوهر رقم از اسکرین‌شات خود جعبه: پیکسل‌هایی که به رنگ متن نزدیک‌ترند تا به زمینهٔ جعبه، فقط درون
 * لبه‌ها (و در دایره، درون دایره). برش به پیکسل درست تراز است، چون اسکرین‌شات عنصر برش را گرد
 * می‌کند و وسط را تا نیم پیکسل جابه‌جا می‌کند.
 */
async function ink(page: Page, target: Locator): Promise<Ink> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const style = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      background: s.backgroundColor,
      fontSize: parseFloat(s.fontSize),
      round: parseFloat(s.borderTopLeftRadius) >= el.clientWidth / 2 || s.borderTopLeftRadius === '50%',
      border: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(parseFloat),
    };
  });
  const x = Math.floor(box.x) - 2;
  const y = Math.floor(box.y) - 2;
  const clip = { x, y, width: Math.ceil(box.x + box.width) + 2 - x, height: Math.ceil(box.y + box.height) + 2 - y };
  const png = (await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })).toString('base64');
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
      const inside = {
        x0: (box.x + left + 1) * scale,
        x1: (box.x + box.width - right - 1) * scale,
        y0: (box.y + top + 1) * scale,
        y1: (box.y + box.height - bottom - 1) * scale,
      };
      const center = { x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale };
      const radius = (box.width / 2 - top - 1.5) * scale;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const [cx, cy] = [px + 0.5, py + 0.5];
          if (cx < inside.x0 || cx > inside.x1 || cy < inside.y0 || cy > inside.y1) continue;
          if (style.round && Math.hypot(cx - center.x, cy - center.y) > radius) continue;
          const at = (py * width + px) * 4;
          // سهم رنگ متن در این پیکسل، از ۰ (زمینه) تا ۱ (متن)
          const share = text.reduce((sum, c, i) => sum + (data[at + i]! - ground[i]!) * (c - ground[i]!), 0) / span;
          if (share > 0.5) {
            y0 = Math.min(y0, py);
            y1 = Math.max(y1, py + 1);
          }
        }
      }
      return { y0: y0 / scale, y1: y1 / scale, center: center.y / scale };
    },
    { png, style, box: { x: box.x - clip.x, y: box.y - clip.y, width: box.width, height: box.height }, scale },
  );

  return {
    dy: (bounds.y0 + bounds.y1) / 2 - bounds.center,
    heightEm: (bounds.y1 - bounds.y0) / style.fontSize,
  };
}

/** رقم وسط است، و چیزی که سنجیده شد به اندازهٔ یک رقم بود — وگرنه تست بی‌صدا سبز می‌شد. */
async function expectCentered(page: Page, target: Locator) {
  const measured = await ink(page, target);
  expect(measured.heightEm, 'ارتفاع جوهر به اندازهٔ رقم').toBeGreaterThan(0.6);
  expect(measured.heightEm, 'ارتفاع جوهر به اندازهٔ رقم').toBeLessThan(0.85);
  expect(Math.abs(measured.dy), `رقم «${await target.evaluate((el) => el.textContent || (el as HTMLInputElement).value)}» ${measured.dy.toFixed(2)} پیکسل از وسط`).toBeLessThanOrEqual(1);
}

test.use({ deviceScaleFactor: 2 });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`${viewport.width} پیکسل`, () => {
    test.use({ viewport });

    test('دایره‌های قدم‌های سفارش: رقم وسط دایره است، در قدم جاری و بقیه', async ({ page }) => {
      await mount(page);
      const circles = page.locator('#digits-probe .jy-flow__n');
      await expect(circles).toHaveCount(3);
      for (const circle of await circles.all()) await expectCentered(page, circle);
    });

    test('شمارندهٔ نسخه: رقم وسط جعبه است، هم output و هم input', async ({ page }) => {
      await mount(page);
      await expectCentered(page, page.locator('#digits-probe .jy-stepper output'));
      await expectCentered(page, page.locator('#digits-probe .jy-stepper input'));
    });
  });
}
