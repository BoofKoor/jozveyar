import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';

/**
 * عدد تنها وسط جعبه (docs/UI.md، «عدد وسط دایره»): دایرهٔ قدم‌های سفارش (`jy-flow__n`)، عدد
 * شمارندهٔ کیت (`jy-stepper`) و فیلد تعداد نسخهٔ امروز صفحه (`jy-input` عددی). وسط‌چینی خط متن را
 * وسط می‌گذارد، نه خود رقم را؛ با وزیرمتن رقم لاتین ۲ تا ۲٫۷ پیکسل بالاتر از وسط می‌افتاد.
 * `--jy-digit-rise` در packages/ui/src/base.css جبرانش می‌کند.
 *
 * جای جوهر رقم از خود پیکسل‌های صفحه سنجیده می‌شود، نه از فرمول؛ پس اگر فونت عوض شد (سؤال باز ۱) و
 * رقم دوباره کج افتاد، همین‌جا می‌افتد. تا یک پیکسل جا هست: مرورگر خط پایهٔ متن و لبهٔ جعبه را جدا به
 * پیکسل می‌چسباند و هر کدام تا نیم پیکسل جابه‌جا می‌شود. کج بودن پیش از این دست‌کم ۱٫۸ پیکسل بود.
 *
 * صفحه تا ۴ب دایره‌های قدم و `jy-stepper` را ندارد، پس تست نشانه‌گذاری کیت را خودش در صفحهٔ اصلی
 * می‌گذارد؛ CSS همان CSS سایت است. ۴ب که آنها را واقعاً نشان داد، تست سراغ خود صفحه می‌رود.
 */

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

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
  await fontsReady(page);
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
  // وسط صفحه، نه لبه: در موبایل نوار قیمت ثابت پایین صفحه است و اسکرین‌شات آن را می‌گرفت، نه جعبه را
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
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

    test('شمارندهٔ کیت: رقم وسط جعبه است، هم output و هم input', async ({ page }) => {
      await mount(page);
      await expectCentered(page, page.locator('#digits-probe .jy-stepper output'));
      await expectCentered(page, page.locator('#digits-probe .jy-stepper input'));
    });

    test('تعداد نسخهٔ صفحهٔ سفارش: رقم وسط فیلد است، افقی و عمودی', async ({ page }) => {
      await page.goto('/');
      await page.setInputFiles('#jozve-file', join(FIXTURES, 'plain-bw-10.pdf'));
      const copies = page.locator('#copies');
      await expect(copies).toBeVisible({ timeout: 20_000 });
      await copies.fill('8');
      await copies.blur();
      await fontsReady(page);
      await expectCentered(page, copies, { horizontal: true });
    });
  });
}
