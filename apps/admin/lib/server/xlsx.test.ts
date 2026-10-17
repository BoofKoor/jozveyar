/**
 * کتاب اکسل خروجی گزارش‌ها (`xlsx.ts`، برش ۱۰٫۲) با خوانندهٔ کوچک همین فایل: zip از ته فایل، هر بخش DEFLATE با CRC و اندازه، و همان
 * متن XML که `xlsxParts` می‌سازد.
 *
 * هم‌ارزی با خوانندهٔ XLSX کارگر (فایل پست، ۶٫۱؛ سؤال ۲۰۲): کتاب نمونهٔ همین تست در `parity/report.xlsx` است و تست کارگر
 * (`services/docworker/tests/test_report_xlsx.py`) همان را با `postfile._read_xlsx` می‌خواند. اینجا بخش‌های آن فایل با خروجی امروز
 * سنجیده می‌شوند (نه بایت‌های فشرده، که با نسخهٔ zlib فرق می‌کنند)؛ پس از تغییر عمدی: `UPDATE_XLSX_FIXTURE=1 pnpm test`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync, crc32 as nodeCrc32 } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { documentSheets, type ReportDocument } from '../reportDocument';
import { columnName, sheetName, xlsxBytes, xlsxParts, xmlText } from './xlsx';

const AT = new Date('2026-10-14T07:50:00Z'); // چهارشنبه 22 مهر 1405، ساعت 11:20 تهران
const FIXTURE = new URL('./parity/report.xlsx', import.meta.url);

/** سند نمونه: فارسی، عدد بزرگ و منفی و اعشاری، خانهٔ خالی، نویسه‌های ویژهٔ XML و نویسهٔ کنترلی، و نام برگهٔ بلند با نویسهٔ ممنوع. */
export const SAMPLE: ReportDocument = {
  title: 'گزارش تولید',
  subtitle: 'پرداخت سه‌شنبه 21 مهر · همهٔ چاپخانه‌ها',
  made: 'ساخته شده 22 مهر 1405، 11:20، الهام فرجی',
  notes: ['⏳ 1 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): 10031'],
  stats: [
    { label: 'سفارش', value: 3 },
    { label: 'برگ', value: 1_234_567 },
  ],
  tables: [
    {
      title: 'صحافی',
      columns: [{ label: 'صحافی' }, { label: 'نسخه', numeric: true }, { label: 'جلد', numeric: true }],
      rows: [
        ['طلق و سیم', 4, 5],
        ['منگنه <A5> & "گلاسه"', 1, null],
      ],
      total: ['جمع', 5, 5],
    },
  ],
  detail: {
    title: 'سفارش‌ها: فهرست کامل [همه] با نامی بلندتر از سی‌ویک نویسه',
    columns: [{ label: 'شماره', numeric: true, plain: true }, { label: 'وضعیت' }, { label: 'تغییر', numeric: true }],
    rows: [
      [10027, 'در صف چاپ', -5],
      [10031, 'در حال چاپ\u0001', 1.5],
    ],
  },
  fileBase: 'gozaresh-tolid-1405-07-21',
};

interface Entry {
  name: string;
  text: string;
}

/** خوانندهٔ zip کتاب: از ته فایل؛ هر بخش DEFLATE (روش ۸)، اندازه‌ها و CRC در فهرست مرکزی و سرآیند محلی یکی. */
function readXlsx(bytes: Uint8Array): Entry[] {
  const buf = Buffer.from(bytes);
  const end = buf.length - 22;
  expect(buf.readUInt32LE(end)).toBe(0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  const cdSize = buf.readUInt32LE(end + 12);
  const cdOffset = buf.readUInt32LE(end + 16);
  expect(cdOffset + cdSize).toBe(end);
  const out: Entry[] = [];
  let at = cdOffset;
  for (let i = 0; i < count; i += 1) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    expect(buf.readUInt16LE(at + 10)).toBe(8);
    const crc = buf.readUInt32LE(at + 16);
    const packed = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('ascii');
    expect(buf.readUInt32LE(offset)).toBe(0x04034b50);
    expect([buf.readUInt16LE(offset + 8), buf.readUInt32LE(offset + 14), buf.readUInt32LE(offset + 18), buf.readUInt32LE(offset + 22)]).toEqual([
      8,
      crc,
      packed,
      size,
    ]);
    const localName = buf.readUInt16LE(offset + 26);
    const dataAt = offset + 30 + localName + buf.readUInt16LE(offset + 28);
    const data = inflateRawSync(buf.subarray(dataAt, dataAt + packed));
    expect(data.length).toBe(size);
    expect(nodeCrc32(data) >>> 0).toBe(crc);
    out.push({ name, text: data.toString('utf8') });
    at += 46 + nameLength;
  }
  return out;
}

describe('کتاب اکسل گزارش‌ها (برش ۱۰٫۲)', () => {
  const sheets = documentSheets(SAMPLE);

  it('بخش‌های کتاب به ترتیب، و zip که با فهرست مرکزی، سرآیند محلی، CRC و DEFLATE می‌خواند', () => {
    const parts = xlsxParts(sheets);
    expect(parts.map((part) => part.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(readXlsx(xlsxBytes(sheets, AT))).toEqual(parts.map((part) => ({ name: part.name, text: part.xml })));
  });

  it('برگهٔ «خلاصه»: راست‌به‌چپ، عنوان و سرستون پررنگ، عدد به شکل عدد با جداکنندهٔ هزارگان، و متن درون‌خطی escape‌شده', () => {
    const summary = xlsxParts(sheets).find((part) => part.name === 'xl/worksheets/sheet1.xml')!.xml;
    expect(summary).toContain('<sheetView workbookViewId="0" rightToLeft="1"/>');
    expect(summary).toContain('<c r="A1" t="inlineStr" s="2"><is><t xml:space="preserve">گزارش تولید</t></is></c>');
    // کاشی: نام متن، عدد با قالب ۳ (`#,##0`).
    expect(summary).toContain('<c r="B7" s="1"><v>1234567</v></c>');
    // سرستون پررنگ، و ردیف جمع پررنگ با عدد پررنگ.
    expect(summary).toContain('<c r="B10" t="inlineStr" s="2"><is><t xml:space="preserve">نسخه</t></is></c>');
    expect(summary).toContain('<c r="B13" s="3"><v>5</v></c>');
    expect(summary).toContain('منگنه &lt;A5&gt; &amp; &quot;گلاسه&quot;');
    // خانهٔ خالی نوشته نمی‌شود.
    expect(summary).toContain('<row r="12"><c r="A12" t="inlineStr"><is><t xml:space="preserve">منگنه');
    expect(summary).not.toContain('C12');
  });

  it('فهرست سفارش‌ها: سرستون ردیف اول، منفی و اعشاری، نویسهٔ کنترلی برداشته، و نام برگه بی نویسهٔ ممنوع تا ۳۱ نویسه', () => {
    const parts = xlsxParts(sheets);
    const detail = parts.find((part) => part.name === 'xl/worksheets/sheet2.xml')!.xml;
    expect(detail).toContain('<row r="1"><c r="A1" t="inlineStr" s="2"><is><t xml:space="preserve">شماره</t></is></c>');
    // شمارهٔ سفارش عدد است ولی بی قالب هزارگان («10027»، نه «10,027»).
    expect(detail).toContain('<c r="A2"><v>10027</v></c>');
    expect(detail).toContain('<c r="C2" s="1"><v>-5</v></c>');
    // اعشاری عدد است، بی قالب هزارگان (که گردش می‌کرد).
    expect(detail).toContain('<c r="C3"><v>1.5</v></c>');
    expect(detail).toContain('در حال چاپ</t>');
    expect(detail).not.toContain('\u0001');
    const workbook = parts.find((part) => part.name === 'xl/workbook.xml')!.xml;
    expect(workbook).toContain('<sheet name="خلاصه" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain(`<sheet name="${sheetName(SAMPLE.detail!.title)}" sheetId="2" r:id="rId2"/>`);
    expect(sheetName(SAMPLE.detail!.title)).toBe('سفارش‌ها  فهرست کامل  همه  با ن');
    expect(sheetName(SAMPLE.detail!.title).length).toBe(31);
  });

  it('نام ستون، نام برگه و متن XML', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(sheetName('  ')).toBe('برگه');
    expect(sheetName('a/b\\c?d*e:f[g]h')).toBe('a b c d e f g h');
    expect(xmlText('<a href="x">&\u0000\u000b￿</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    // برگه‌های هم‌نام با شماره جدا، چون اکسل دو برگهٔ هم‌نام را باز نمی‌کند.
    const twin = xlsxParts([
      { name: 'سفارش‌ها', rows: [], widths: [] },
      { name: 'سفارش‌ها', rows: [], widths: [] },
    ]).find((part) => part.name === 'xl/workbook.xml')!.xml;
    expect(twin).toContain('<sheet name="سفارش‌ها" sheetId="1"');
    expect(twin).toContain('<sheet name="سفارش‌ها 2" sheetId="2"');
  });

  it('هم‌ارزی با کارگر: کتاب نمونهٔ `parity/report.xlsx` همان بخش‌های امروز است (بازسازی با UPDATE_XLSX_FIXTURE=1)', () => {
    if (process.env.UPDATE_XLSX_FIXTURE === '1') writeFileSync(FIXTURE, xlsxBytes(sheets, AT));
    expect(readXlsx(readFileSync(FIXTURE))).toEqual(xlsxParts(sheets).map((part) => ({ name: part.name, text: part.xml })));
  });
});
