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
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';
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
function pageContent({ paper, ink, inkLines = 28, accent = null, size = A4 }) {
  const [w, h] = size;
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

/**
 * ساخت یک PDF کامل با xref درست. هر صفحه یا محتوای برداری است یا تصویر.
 *
 * صفحهٔ تصویری: `{ image }` تمام‌صفحه؛ با `matrix` در جای دلخواه (`cm`)، با `vector`
 * محتوای برداری زیرش، با `formMatrix` داخل یک Form XObject با همان ماتریس، و با
 * `stampRect` در ظاهر یک حاشیه‌نویسی مهر روی آن مستطیل — همان جاهایی که DPI واقعی
 * تصویر از اندازهٔ صفحه جدا می‌شود.
 */
function buildPdf(pageContents) {
  const objects = [];
  const pageCount = pageContents.length;

  // ۱: Catalog، ۲: Pages، سپس به‌ازای هر صفحه Page، Contents، و (اختیاری) Image، Form و Annot.
  const pageObjIds = pageContents.map((_, i) => 3 + i * 5);
  const contentObjIds = pageContents.map((_, i) => 4 + i * 5);
  const imageObjIds = pageContents.map((_, i) => 5 + i * 5);
  const formObjIds = pageContents.map((_, i) => 6 + i * 5);
  const annotObjIds = pageContents.map((_, i) => 7 + i * 5);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] =
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] ` +
    `/Count ${pageCount} >>`;

  pageContents.forEach((page, i) => {
    let content = page;
    let resources = '<< >>';
    let annots = '';
    // اندازهٔ کاغذ: پیش‌فرض A4؛ صفحهٔ برداری با اندازهٔ دیگر `{ size, vector }` است.
    const [pageW, pageH] = (typeof page === 'object' && page.size) || A4;
    if (typeof page === 'object' && !page.image) {
      content = page.vector ?? '';
    } else if (typeof page === 'object') {
      const { w, h, data } = page.image;
      objects[imageObjIds[i]] =
        `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n` +
        `${data.toString('latin1')}\nendstream`;
      const matrix = (page.matrix ?? [A4[0], 0, 0, A4[1], 0, 0]).join(' ');
      const draw = `q ${matrix} cm /Im0 Do Q`;
      if (page.stampRect) {
        // ظاهر مهر: تصویر در مربع واحد جعبه؛ خواننده جعبه را روی مستطیل مهر می‌کشد.
        const appearance = '/Im0 Do';
        objects[formObjIds[i]] =
          `<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] ` +
          `/Resources << /XObject << /Im0 ${imageObjIds[i]} 0 R >> >> /Length ${appearance.length} >>\n` +
          `stream\n${appearance}\nendstream`;
        objects[annotObjIds[i]] =
          `<< /Type /Annot /Subtype /Stamp /F 4 /Rect [${page.stampRect.join(' ')}] ` +
          `/AP << /N ${formObjIds[i]} 0 R >> >>`;
        annots = ` /Annots [${annotObjIds[i]} 0 R]`;
        content = page.vector ?? '';
      } else if (page.formMatrix) {
        const form = draw;
        objects[formObjIds[i]] =
          `<< /Type /XObject /Subtype /Form /BBox [0 0 ${A4[0]} ${A4[1]}] /Matrix [${page.formMatrix.join(' ')}] ` +
          `/Resources << /XObject << /Im0 ${imageObjIds[i]} 0 R >> >> /Length ${form.length} >>\nstream\n${form}\nendstream`;
        resources = `<< /XObject << /Fm0 ${formObjIds[i]} 0 R >> >>`;
        content = `${page.vector ?? ''}\n/Fm0 Do`;
      } else {
        resources = `<< /XObject << /Im0 ${imageObjIds[i]} 0 R >> >>`;
        content = `${page.vector ?? ''}\n${draw}`;
      }
    }
    objects[pageObjIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources ${resources} /Contents ${contentObjIds[i]} 0 R${annots} >>`;
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

  /**
   * DPI از جای واقعی تصویر (ADR-029). فقط صفحهٔ ۲ کیفیت پایین است:
   * ۱) صفحهٔ متنی با لوگوی ۲۰۰×۵۰ پیکسلی (فرمول قدیمی: «۴ DPI»)؛
   * ۲) اسکن تمام‌صفحهٔ ۱۵۰×۲۱۲ — ۱۸ DPI؛
   * ۳) اسکن ۱۳۰۰×۱۸۳۹ — ۱۵۷ DPI؛
   * ۴) تصویر ۹۰۰×۱۲۷۲ داخل Form XObject نیم‌مقیاس: یک‌چهارم صفحه، ۲۱۸ DPI
   *    (بدون دنبال کردن ماتریس فرم «۱۰۹»).
   */
  'dpi-mix-4.pdf': [
    { image: scanImage({ paper: WHITE, ink: GRAPHITE, w: 200, h: 50 }), matrix: [144, 0, 0, 36, 60, 760],
      vector: pageContent({ paper: WHITE, ink: GRAPHITE }) },
    { image: scanImage({ paper: YELLOW_SCAN, ink: GRAPHITE }) },
    { image: scanImage({ paper: WHITE, ink: GRAPHITE, w: 1300, h: 1839 }) },
    { image: scanImage({ paper: WHITE, ink: GRAPHITE, w: 900, h: 1272 }), formMatrix: [0.5, 0, 0, 0.5, 0, 0],
      vector: pageContent({ paper: WHITE, ink: GRAPHITE, inkLines: 6 }) },
  ],

  /**
   * اسکن کم‌کیفیت که در ظاهر یک حاشیه‌نویسی مهر نشسته، نه در محتوای صفحه — تصویر
   * ۱۵۰×۲۱۲ روی کل A4، ۱۸ DPI. سرور (PyMuPDF) آن را با همین جا می‌بیند؛ مرورگر هم باید.
   */
  'stamp-scan-1.pdf': [
    { image: scanImage({ paper: WHITE, ink: GRAPHITE }), stampRect: [0, 0, A4[0], A4[1]],
      vector: pageContent({ paper: WHITE, ink: GRAPHITE, inkLines: 4 }) },
  ],

  /**
   * چند اندازهٔ کاغذ در یک فایل: ۴ صفحهٔ A4، ۲ صفحهٔ A3 و یک Letter، درهم. کارت فایل اندازه‌ها را
   * به ترتیب تعداد نام می‌برد: «A4، A3 و Letter».
   */
  'sizes-7.pdf': [A4, [842, 1191], A4, [612, 792], A4, [842, 1191], A4].map((size) => ({
    size,
    vector: pageContent({ paper: WHITE, ink: GRAPHITE, size }),
  })),

  /** اندازهٔ نامعمول، ۴۸۲×۶۸۰ پوینت (۱۷۰×۲۴۰ میلی‌متر): کارت به میلی‌متر نشانش می‌دهد، نه به پوینت. */
  'odd-size-2.pdf': Array.from({ length: 2 }, () => ({
    size: [482, 680],
    vector: pageContent({ paper: WHITE, ink: GRAPHITE, size: [482, 680] }),
  })),

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

/* ── Word، پاورپوینت و عکس (ADR-028) ─────────────────────────────────────── */

/** zip با بخش‌های deflate و فهرست مرکزی — همان قالبی که Word می‌نویسد. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const body = deflateRawSync(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const appXml = (fields) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
  `<Application>Microsoft Office Word</Application>${fields}</Properties>`;

/** متن فارسی قطعی (MINSTD): همان ورودی، همان متن. */
function persianText(seed, words) {
  const vocabulary = 'دانشگاه جزوه درس فصل مسئله معادله انتگرال مشتق تابع پیوسته حد دنباله سری همگرا ماتریس بردار'.split(' ');
  let state = seed;
  const out = [];
  for (let i = 0; i < words; i += 1) {
    state = (state * 48271) % 2147483647;
    out.push(vocabulary[state % vocabulary.length]);
  }
  return `${out.join(' ')}.`;
}

/**
 * Word واقعی: ۶۰ پاراگراف فارسی با «B Nazanin»، و `docProps/app.xml` که می‌گوید
 * «۱۲ صفحه» — مثل Word کاربر با فونت‌های خودش. سرور با Nazli تبدیل می‌کند و عدد
 * خودش را می‌دهد.
 */
function wordDocument(paragraphs, pages) {
  const body = Array.from({ length: paragraphs }, (_, i) =>
    '<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="B Nazanin" w:hAnsi="B Nazanin" w:cs="B Nazanin"/>' +
    `<w:rtl/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${persianText(i + 1, 40)}</w:t></w:r></w:p>`,
  ).join('');
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}` +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" ' +
        'w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>',
    ],
    ['docProps/app.xml', appXml(`<Pages>${pages}</Pages>`)],
  ]);
}

/** PNG خاکستری، بدون کتابخانه — تک‌صفحهٔ عکس. */
function png(width, height, gray) {
  const chunk = (kind, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(kind, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, 'latin1'), data])), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // عمق بیت
  header[9] = 0; // خاکستری
  const rows = Buffer.alloc((width + 1) * height, gray);
  for (let y = 0; y < height; y += 1) rows[y * (width + 1)] = 0; // فیلتر هر سطر
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const others = {
  'jozve-12.docx': wordDocument(60, 12),
  /** پاورپوینت فقط برای برآورد مرورگر: ۲۴ اسلاید که ۳ تایش مخفی است. */
  'slides-21.pptx': zip([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p"/>'],
    ['docProps/app.xml', appXml('<Slides>24</Slides><HiddenSlides>3</HiddenSlides>')],
  ]),
  'scan-photo.png': png(1240, 1754, 235),
};
for (const [name, bytes] of Object.entries(others)) {
  writeFileSync(join(OUT_DIR, name), bytes);
  console.log(`${name}  ${(bytes.length / 1024).toFixed(0)} KB`);
}
