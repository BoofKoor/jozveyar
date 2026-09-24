/**
 * نشانک، آیکون گوشی و تصویر اشتراک، از روی فایل‌های برند (docs/brand)، با Chromium.
 *
 * - `app/icon.svg`: خود favicon برند؛ مرورگرهای تازه همان را می‌گیرند.
 * - `app/favicon.ico`: برای مرورگر و جایی که SVG نمی‌گیرد؛ سه اندازهٔ ۱۶، ۳۲ و ۴۸ پیکسل، هر کدام
 *   PNG شفاف درون ICO، که همهٔ مرورگرها می‌خوانند.
 * - **آیکون گوشی:** نشان کامل (`jozveyar-mark.svg`) روی مربع سفید مات، ۵۸٪ ارتفاع و وسط. favicon
 *   برای ۲۴ پیکسل و کوچک‌تر است و کاشی‌اش را پر می‌کند، پس روی صفحهٔ گوشی تنگ است؛ و اپل گوشهٔ
 *   شفاف را توصیه نمی‌کند. `app/apple-icon.png` ۱۸۰ پیکسل، و `public/icons/icon-192.png` و
 *   `icon-512.png` برای manifest. همان ۵۱۲ «maskable» هم هست، چون کل نشان در دایرهٔ امن (قطر ۸۰٪)
 *   می‌ماند. هر اندازه جدا از خود SVG کشیده می‌شود، نه با کوچک کردن ۵۱۲.
 * - **تصویر اشتراک** (`app/opengraph-image.png`، ۱۲۰۰×۶۳۰): طرح الف (docs/UI.md، قدم ۳). لوگوی
 *   بی‌شعار، تیتر صفحهٔ اصلی و یک خط معرفی، همه وسط، روی green-50 با لبهٔ green-600 در پایین. متن
 *   جایگزینش `opengraph-image.alt.txt` است؛ Next آن را عیناً می‌خواند، پس خط تازه ندارد. کش build
 *   نکست این فایل را وابستگی نمی‌شمارد: اگر فقط متن جایگزین عوض شد، پیش از build محلی
 *   `apps/web/.next/cache` را پاک کنید. CI همیشه از صفر می‌سازد.
 *
 * رنگ فقط از `docs/brand/jozveyar-colors.css` و فونت فقط وزیرمتن لوکال (`public/fonts`)؛ هیچ
 * درخواست بیرونی. خروجی یک بار ساخته و در مخزن نگه داشته می‌شود؛ بیلد به Chromium بند نیست. برند
 * که عوض شد، دوباره اجرا کنید (از ریشهٔ مخزن):
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=/مسیر/chrome node apps/web/scripts/make-icons.mjs
 *
 * `lib/site-icons.test.ts` برابری icon.svg با برند، و اندازه و ماتی هر PNG، دایرهٔ امن و رنگ‌های
 * تصویر اشتراک را می‌سنجد. اینکه سرور همه را با نوع درست می‌دهد در tests/site.spec.ts است.
 */

import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const APP = `${REPO}apps/web/app/`;
const PUBLIC = `${REPO}apps/web/public/`;
const BRAND = `${REPO}docs/brand/`;
const ICO_SIZES = [16, 32, 48];

/** آیکون گوشی: ارتفاع نشان، سهمی از ضلع مربع. */
const PHONE_MARK_SHARE = 0.58;
/** تصویر اشتراک: اندازه، تیتر (همان صفحهٔ اصلی)، خط معرفی و متن جایگزین. */
const OG = { width: 1200, height: 630 };
const OG_TITLE = 'جزوه‌ات را بینداز، قیمت را <mark>همین حالا</mark> ببین';
const OG_LINE = 'چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران';
const OG_ALT = 'لوگوی جزوه‌یار و تیتر «جزوه‌ات را بینداز، قیمت را همین حالا ببین»؛ چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران';

const brandFile = (name) => readFileSync(`${BRAND}${name}`, 'utf8');
const colors = brandFile('jozveyar-colors.css');
const dataUri = (mime, content) => `data:${mime};base64,${Buffer.from(content).toString('base64')}`;

/** کد یک رنگ، از خود فایل برند؛ SVG درون `<img>` متغیر CSS نمی‌خواند. */
function brandColor(token) {
  const match = new RegExp(`--jy-${token}\\s*:\\s*(#[0-9A-Fa-f]{6})`).exec(colors);
  if (!match) throw new Error(`رنگ ${token} در فایل برند نیست`);
  return match[1];
}

/**
 * آیکون گوشی: مربع سفید ۵۱۲ و نشان کامل با ۵۸٪ ارتفاع، وسط (x=151.64، y=107.52، ۲۰۸٫۷۱ در
 * ۲۹۶٫۹۶). مسیر و رنگ نشان همان فایل برند است، درون یک svg تو در تو با viewBox خود نشان.
 */
function phoneIconSvg() {
  const mark = brandFile('jozveyar-mark.svg');
  const viewBox = /viewBox="([^"]+)"/.exec(mark)?.[1];
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(mark)?.[1]?.replace(/<title>[\s\S]*?<\/title>/, '');
  if (!viewBox || !inner) throw new Error('viewBox یا مسیر jozveyar-mark.svg پیدا نشد');
  const [, , boxWidth, boxHeight] = viewBox.split(/\s+/).map(Number);
  const height = 512 * PHONE_MARK_SHARE;
  const width = (height * boxWidth) / boxHeight;
  const n = (value) => value.toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="${brandColor('paper')}"/>` +
    `<svg x="${n((512 - width) / 2)}" y="${n((512 - height) / 2)}" width="${n(width)}" height="${n(height)}" viewBox="${viewBox}">` +
    `${inner}</svg></svg>`
  );
}

/** HTML سازندهٔ تصویر اشتراک، طرح الف: رنگ از فایل برند، وزیرمتن از public/fonts. */
function ogHtml() {
  const font = (file, weight) =>
    `@font-face { font-family: Vazirmatn; font-weight: ${weight}; ` +
    `src: url(${dataUri('font/woff2', readFileSync(`${PUBLIC}fonts/${file}`))}) format('woff2'); }`;
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
${colors}
${font('Vazirmatn-Regular.woff2', 400)}
${font('Vazirmatn-SemiBold.woff2', 600)}
html, body { margin: 0; }
body {
  box-sizing: border-box; width: ${OG.width}px; height: ${OG.height}px; padding-inline: 48px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  background: var(--jy-green-50); border-block-end: 12px solid var(--jy-green-600);
  font-family: Vazirmatn; line-height: 1.4; color: var(--jy-ink);
}
img { display: block; height: 212px; }
h1 { margin: 40px 0 0; font-size: 56px; font-weight: 600; line-height: 1.4; }
mark {
  padding-inline: 4px; color: inherit;
  background: linear-gradient(transparent 58%, var(--jy-green-200) 58%, var(--jy-green-200) 90%, transparent 90%);
}
p { margin: 14px 0 0; font-size: 28px; color: var(--jy-green-700); }
</style></head><body>
<img src="${dataUri('image/svg+xml', brandFile('jozveyar-logo-no-tagline.svg'))}" alt="">
<h1>${OG_TITLE}</h1>
<p>${OG_LINE}</p>
</body></html>`;
}

/** SVG در اندازهٔ داده‌شده به PNG؛ شفاف برای favicon، مات برای آیکون گوشی. */
async function renderPng(page, svg, size, { transparent }) {
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style>` +
      `<img src="${dataUri('image/svg+xml', svg)}" width="${size}" height="${size}" alt="">`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}

/** فایل ICO با PNG درونش: سرآیند ۶ بایتی، یک ردیف ۱۶ بایتی برای هر اندازه، بعد خود PNGها. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // رزرو
  header.writeUInt16LE(1, 2); // ۱ یعنی آیکون
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // صفحه‌های رنگ
    entry.writeUInt16LE(32, 6); // بیت در پیکسل
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ['--disable-background-networking'],
});
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  // همه‌چیز data URI است؛ اگر چیزی بیرون برود، شکست می‌خورد و بی‌صدا از قلم نمی‌افتد.
  await page.route(/^https?:/, (route) => route.abort());

  const favicon = brandFile('jozveyar-favicon.svg');
  copyFileSync(`${BRAND}jozveyar-favicon.svg`, `${APP}icon.svg`);
  const images = [];
  for (const size of ICO_SIZES) images.push({ size, png: await renderPng(page, favicon, size, { transparent: true }) });
  writeFileSync(`${APP}favicon.ico`, ico(images));

  const phone = phoneIconSvg();
  writeFileSync(`${APP}apple-icon.png`, await renderPng(page, phone, 180, { transparent: false }));
  mkdirSync(`${PUBLIC}icons`, { recursive: true });
  for (const size of [192, 512]) {
    writeFileSync(`${PUBLIC}icons/icon-${size}.png`, await renderPng(page, phone, size, { transparent: false }));
  }

  await page.setViewportSize(OG);
  await page.setContent(ogHtml());
  await page.locator('img').evaluate((img) => img.decode());
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').length);
  if (loaded !== 2) throw new Error(`وزیرمتن بار نشد (${loaded} از ۲ وزن)`);
  writeFileSync(`${APP}opengraph-image.png`, await page.screenshot({ clip: { x: 0, y: 0, ...OG } }));
  writeFileSync(`${APP}opengraph-image.alt.txt`, OG_ALT);

  console.log(
    `ساخته شد: app/icon.svg، app/favicon.ico (${ICO_SIZES.join('، ')} پیکسل)، app/apple-icon.png (180)، ` +
      'public/icons/icon-192.png و icon-512.png، و app/opengraph-image.png (1200×630) با متن جایگزینش.',
  );
} finally {
  await browser.close();
}
