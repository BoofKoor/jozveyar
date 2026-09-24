/**
 * favicon.ico از روی favicon برند (docs/brand/jozveyar-favicon.svg)، با Chromium.
 *
 * `app/icon.svg` خود فایل برند است و مرورگرهای تازه همان را می‌گیرند. `app/favicon.ico` برای
 * مرورگر و جایی است که SVG نمی‌گیرد: سه اندازهٔ ۱۶، ۳۲ و ۴۸ پیکسل، هر کدام PNG درون ICO، که
 * همهٔ مرورگرها می‌خوانند. خروجی یک بار ساخته و در مخزن نگه داشته می‌شود؛ بیلد به Chromium بند
 * نیست. برند که عوض شد، دوباره اجرا کنید (از ریشهٔ مخزن):
 *
 *   PLAYWRIGHT_CHROMIUM_PATH=/مسیر/chrome node apps/web/scripts/make-icons.mjs
 *
 * `lib/site-icons.test.ts` برابری icon.svg با برند و اندازه‌های ICO را می‌سنجد.
 */

import { chromium } from '@playwright/test';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const APP = `${REPO}apps/web/app/`;
const FAVICON = `${REPO}docs/brand/jozveyar-favicon.svg`;
const ICO_SIZES = [16, 32, 48];

/** SVG در اندازهٔ داده‌شده، با زمینهٔ شفاف، به PNG. */
async function renderPng(page, svg, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block}</style>` +
      `<img src="${src}" width="${size}" height="${size}" alt="">`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
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
  const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  const favicon = readFileSync(FAVICON, 'utf8');

  copyFileSync(FAVICON, `${APP}icon.svg`);
  const images = [];
  for (const size of ICO_SIZES) images.push({ size, png: await renderPng(page, favicon, size) });
  writeFileSync(`${APP}favicon.ico`, ico(images));

  console.log(`app/icon.svg و app/favicon.ico (${ICO_SIZES.join('، ')} پیکسل) ساخته شد.`);
} finally {
  await browser.close();
}
