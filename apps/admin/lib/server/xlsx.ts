import * as zlib from 'node:zlib';

import type { ReportCell, Sheet } from '../reportDocument';

/**
 * کتاب اکسل (XLSX) خروجی گزارش‌ها (برش ۱۰٫۲، ADR-061، سؤال ۲۰۲)، دست‌نویس و بی وابستگی، مثل SigV4 و zip «همهٔ فایل‌ها» (۹٫۱): کمترین
 * بخش‌های SpreadsheetML که اکسل و LibreOffice باز می‌کنند، با DEFLATE خود نود (`node:zlib`).
 *
 * - **عدد به شکل عدد** (`<v>`)، با قالب `#,##0` (شمارهٔ ۳ ساخته‌شدهٔ اکسل): جمع و مرتب کردن در خود اکسل کار می‌کند؛ متن درون‌خطی
 *   (`inlineStr`)، بی جدول متن مشترک، تا هر برگه خودبسنده باشد. خوانندهٔ XLSX کارگر (فایل پست، ۶٫۱) هر دو را می‌خواند، و تست هم‌ارزی
 *   همین را می‌سنجد (`parity/report.xlsx`، و `test_report_xlsx.py` کارگر).
 * - **راست‌به‌چپ:** هر برگه `rightToLeft`، و قلم Tahoma که فارسی را روی هر ویندوزی دارد.
 * - **پررنگ** فقط برای عنوان، سرستون و جمع.
 * - **تکرارپذیر:** بخش‌ها همیشه همان متن‌اند (`xlsxParts`)، و زمان فایل‌های zip از ورودی؛ تست هم‌ارزی بخش‌ها را می‌سنجد، نه بایت‌های
 *   فشرده، که با نسخهٔ zlib فرق می‌کنند.
 */

/** یک بخش کتاب: مسیرش درون zip و متن XMLش. */
export interface XlsxPart {
  name: string;
  xml: string;
}

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** شمارهٔ قالب هر خانه در `styles.xml`: ساده، عدد، متن پررنگ، عدد پررنگ. */
const STYLE = { text: 0, number: 1, boldText: 2, boldNumber: 3 } as const;

/** متن امن XML 1.0: نویسه‌های کنترلی که XML نمی‌پذیرد برداشته، و پنج نویسهٔ ویژه escape. */
export function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** نام ستون: ۰ ← A، ۲۵ ← Z، ۲۶ ← AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** نام برگه: بی نویسه‌های ممنوع اکسل، تا ۳۱ نویسه، و نه خالی. */
export function sheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return clean || 'برگه';
}

function cellXml(cell: ReportCell, ref: string, bold: boolean, plain: boolean): string {
  if (cell === null || cell === '') return '';
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return '';
    // قالب هزارگان فقط برای عدد درستی که شناسه نیست: شمارهٔ سفارش «10027» می‌ماند، و اعشاری گرد نمی‌شود.
    const grouped = Number.isInteger(cell) && !plain;
    const style = grouped ? (bold ? STYLE.boldNumber : STYLE.number) : bold ? STYLE.boldText : STYLE.text;
    return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${cell}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${bold ? ` s="${STYLE.boldText}"` : ''}><is><t xml:space="preserve">${xmlText(cell)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths.length
    ? `<cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.cells
        .map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, row.bold === true, sheet.plainColumns?.includes(c) === true))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    `${HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `${cols}<sheetData>${rows}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  `${HEAD}<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** بخش‌های کتاب، به ترتیب درون zip. نام برگه‌های تکراری با شماره جدا می‌شوند، چون اکسل دو برگهٔ هم‌نام را باز نمی‌کند. */
export function xlsxParts(sheets: readonly Sheet[]): XlsxPart[] {
  const names: string[] = [];
  for (const sheet of sheets) {
    const base = sheetName(sheet.name);
    let name = base;
    for (let n = 2; names.includes(name); n += 1) name = `${base.slice(0, 28)} ${n}`;
    names.push(name);
  }
  const overrides = sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  return [
    {
      name: '[Content_Types].xml',
      xml:
        `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        `${overrides}</Types>`,
    },
    {
      name: '_rels/.rels',
      xml: `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      xml:
        `${HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>` +
        names.map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml:
        `${HEAD}<Relationships xmlns="${PKG_REL_NS}">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', xml: STYLES_XML },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: sheetXml(sheet) })),
  ];
}

/* ───────────────────────── zip ───────────────────────── */

const crc32: (data: Uint8Array) => number =
  typeof (zlib as { crc32?: unknown }).crc32 === 'function'
    ? (data) => (zlib as unknown as { crc32(data: Uint8Array): number }).crc32(data)
    : tableCrc32();

function tableCrc32() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (data: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
}

/** زمان DOS فایل‌ها به ساعت دیواری تهران، مثل zip «همهٔ فایل‌ها» (۹٫۱). */
function dosTime(at: Date): { time: number; date: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    time: (parts.hour! << 11) | (parts.minute! << 5) | Math.floor(parts.second! / 2),
    date: ((Math.max(parts.year!, 1980) - 1980) << 9) | (parts.month! << 5) | parts.day!,
  };
}

/**
 * کتاب اکسل برگه‌ها، یک‌جا در حافظه: گزارش چند صد کیلوبایت بیشتر نیست. هر بخش DEFLATE (روش ۸) با CRC و اندازه‌ها در سرآیند محلی، بی
 * data descriptor؛ نام‌ها ASCII‌اند.
 */
export function xlsxBytes(sheets: readonly Sheet[], modifiedAt: Date): Uint8Array {
  const { time, date } = dosTime(modifiedAt);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const part of xlsxParts(sheets)) {
    const name = Buffer.from(part.name, 'ascii');
    const data = Buffer.from(part.xml, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

/** کتاب اکسل یک فایل: `gozaresh-tolid-1405-07-22.xlsx`. */
export const xlsxFileName = (base: string) => `${base}.xlsx`;
