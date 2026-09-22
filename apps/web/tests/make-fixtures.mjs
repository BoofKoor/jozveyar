/**
 * ساخت PDF نمونه برای تست.
 *
 * PDF خام نوشته می‌شود، نه با کتابخانه: نمونه‌ها باید دقیقاً همان چیزی باشند که
 * می‌خواهیم آزمایش کنیم — یک صفحهٔ یکدستِ زرد که ادای اسکن دست‌نویس را درمی‌آورد،
 * و یک صفحهٔ واقعاً رنگی. هر کتابخانه‌ای بین ما و بایت‌ها، چیزی را عوض می‌کند.
 *
 * اجرا: node tests/make-fixtures.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const A4 = [595, 842];

/** رنگ پر، به شکل عملگر `rg` پی‌دی‌اف (۰ تا ۱). */
const rg = (r, g, b) => `${r} ${g} ${b} rg`;

/**
 * محتوای یک صفحه: زمینهٔ یکدست + چند خط «متن» به شکل نوارهای نازک.
 *
 * از نوار مستطیلی استفاده می‌شود نه قلم واقعی، چون نسبت پیکسل مرکب باید
 * قابل پیش‌بینی باشد — با قلم، رندر هر مرورگر کمی فرق می‌کند.
 */
function pageContent({ paper, ink, inkLines = 28, accent = null }) {
  const [w, h] = A4;
  const parts = [`${rg(...paper)} 0 0 ${w} ${h} re f`];

  const lineHeight = 4;
  const gap = (h - 120) / inkLines;
  for (let i = 0; i < inkLines; i += 1) {
    const y = h - 60 - i * gap;
    // طول خط کمی متفاوت، شبیه متن واقعی
    const lineWidth = (w - 120) * (0.55 + ((i * 37) % 45) / 100);
    parts.push(`${rg(...ink)} 60 ${y.toFixed(1)} ${lineWidth.toFixed(1)} ${lineHeight} re f`);
  }

  if (accent) {
    parts.push(`${rg(...accent.color)} ${accent.x} ${accent.y} ${accent.w} ${accent.h} re f`);
  }

  return parts.join('\n');
}

/**
 * صفحهٔ اسکن واقعی: یک تصویر RGB تمام‌صفحه، نه مستطیل برداری.
 *
 * اسکن واقعی همین است — PDFی که هر صفحه‌اش فقط یک عکس است. رندرش در pdf.js
 * مسیر دیگری از مستطیل می‌رود (بوم کمکی)، و همین مسیر بود که در کارگر
 * می‌شکست و هیچ نمونه‌ای آن را نمی‌سنجید.
 */
function scanImage({ paper, ink, w = 150, h = 212 }) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    const isLine = y > 15 && y < h - 15 && y % 7 < 2;
    for (let x = 0; x < w; x += 1) {
      const color = isLine && x > 12 && x < w - 12 - ((y * 13) % 30) ? ink : paper;
      rgb.set(color.map((c) => Math.round(c * 255)), (y * w + x) * 3);
    }
  }
  return { w, h, data: deflateSync(rgb) };
}

/** ساخت یک PDF کامل با xref درست. هر صفحه یا محتوای برداری است یا تصویر. */
function buildPdf(pageContents) {
  const objects = [];
  const pageCount = pageContents.length;

  // ۱: Catalog، ۲: Pages، سپس به‌ازای هر صفحه Page، Contents و (اختیاری) Image.
  const pageObjIds = pageContents.map((_, i) => 3 + i * 3);
  const contentObjIds = pageContents.map((_, i) => 4 + i * 3);
  const imageObjIds = pageContents.map((_, i) => 5 + i * 3);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] =
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] ` +
    `/Count ${pageCount} >>`;

  pageContents.forEach((page, i) => {
    let content = page;
    let resources = '<< >>';
    if (typeof page === 'object') {
      const { w, h, data } = page.image;
      objects[imageObjIds[i]] =
        `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n` +
        `${data.toString('latin1')}\nendstream`;
      resources = `<< /XObject << /Im0 ${imageObjIds[i]} 0 R >> >>`;
      content = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
    }
    objects[pageObjIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] ` +
      `/Resources ${resources} /Contents ${contentObjIds[i]} 0 R >>`;
    objects[contentObjIds[i]] =
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  const maxId = objects.length;
  pdf += `xref\n0 ${maxId}\n0000000000 65535 f \n`;
  for (let id = 1; id < maxId; id += 1) {
    const offset = offsets[id] ?? 0;
    const type = offsets[id] === undefined ? 'f' : 'n';
    pdf += `${String(offset).padStart(10, '0')} 00000 ${type} \n`;
  }
  pdf += `trailer\n<< /Size ${maxId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

const WHITE = [1, 1, 1];
const YELLOW_SCAN = [0.98, 0.94, 0.78]; // ته‌رنگ زرد اسکن
const GRAPHITE = [0.18, 0.18, 0.19];

const fixtures = {
  /**
   * تلهٔ اصلی: ۱۴۷ صفحهٔ اسکن زرد با خط مشکی.
   *
   * اگر تشخیص رنگ کار کند، همه سیاه‌سفید اعلام می‌شوند و قیمت ۲۳۵,۲۰۰ تومان
   * می‌شود. اگر کار نکند، همه رنگی اعلام می‌شوند و قیمت ۲۹۴,۰۰۰ می‌شود.
   */
  'yellow-scan-147.pdf': Array.from({ length: 147 }, () =>
    pageContent({ paper: YELLOW_SCAN, ink: GRAPHITE }),
  ),

  /**
   * اسکن واقعی: هر صفحه یک تصویر زرد با خط مشکی. هم مسیر رندر تصویر در
   * کارگر را می‌سنجد و هم تلهٔ (الف) را روی پیکسل واقعی اسکن.
   */
  'image-scan-6.pdf': Array.from({ length: 6 }, () => ({
    image: scanImage({ paper: YELLOW_SCAN, ink: GRAPHITE }),
  })),

  /** صفحهٔ سفید ساده — مبنای مقایسه. */
  'plain-bw-10.pdf': Array.from({ length: 10 }, () =>
    pageContent({ paper: WHITE, ink: GRAPHITE }),
  ),

  /** ۱۰ صفحه که ۳ صفحه‌اش هایلایت رنگی واقعی دارد. */
  'mixed-color-10.pdf': Array.from({ length: 10 }, (_, i) =>
    pageContent({
      paper: WHITE,
      ink: GRAPHITE,
      accent:
        i === 2 || i === 5 || i === 8
          ? { color: [0.9, 0.15, 0.15], x: 60, y: 300, w: 400, h: 180 }
          : null,
    }),
  ),
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, pages] of Object.entries(fixtures)) {
  const bytes = buildPdf(pages);
  writeFileSync(join(OUT_DIR, name), bytes);
  console.log(`${name}  ${pages.length} صفحه  ${(bytes.length / 1024).toFixed(0)} KB`);
}
