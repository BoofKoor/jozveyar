/**
 * خواندن تعداد صفحهٔ Word و پاورپوینت از خود فایل، در مرورگر (ADR-028).
 *
 * zip همین‌جا ساخته می‌شود — با همان قالبی که Word و LibreOffice می‌نویسند:
 * بخش‌های deflate و فهرست مرکزی انتهای فایل.
 */

import { crc32, deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { officePageCount, pagesFromAppXml, readZipMember } from './office-meta';

type Entry = [name: string, content: string | Uint8Array, method?: 0 | 8];

function zip(entries: Entry[], comment = ''): Blob {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content, method = 8] of entries) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const commentBytes = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  return new Blob([new Uint8Array(Buffer.concat([...locals, directory, end, commentBytes]))]);
}

const app = (fields: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
  `<Application>Microsoft Office Word</Application>${fields}</Properties>`;

const word = (fields: string, extra: Entry[] = []) =>
  zip([
    ['[Content_Types].xml', '<Types/>'],
    ['word/document.xml', '<w:document/>'],
    ...extra,
    ['docProps/app.xml', app(fields)],
  ]);

describe('تعداد صفحهٔ ذخیره‌شده در Word و پاورپوینت', () => {
  it('Word: همان که Word نوشته', async () => {
    expect(await officePageCount(word('<Pages>37</Pages><Words>9000</Words>'), 'docx')).toBe(37);
  });

  it('پاورپوینت: اسلاید مخفی چاپ نمی‌شود', async () => {
    const deck = zip([
      ['ppt/presentation.xml', '<p/>'],
      ['docProps/app.xml', app('<Slides>24</Slides><HiddenSlides>3</HiddenSlides>')],
    ]);
    expect(await officePageCount(deck, 'pptx')).toBe(21);
  });

  it('بخش ذخیره‌شده بدون فشرده‌سازی و zip با توضیح انتهایی', async () => {
    const stored = zip([['docProps/app.xml', app('<Pages>5</Pages>'), 0]], 'ساخته‌شده با برنامهٔ دیگر');
    expect(await officePageCount(stored, 'docx')).toBe(5);
  });

  it('فایل بدون شمارهٔ صفحه — مثل خروجی بعضی برنامه‌ها — برآورد ندارد', async () => {
    expect(await officePageCount(word('<Words>10</Words>'), 'docx')).toBeNull();
    expect(await officePageCount(zip([['word/document.xml', '<w/>']]), 'docx')).toBeNull();
    expect(await officePageCount(word('<Pages>0</Pages>'), 'docx')).toBeNull();
  });

  it('فایل خراب یا غیر zip خطا نمی‌دهد، فقط برآورد ندارد', async () => {
    expect(await officePageCount(new Blob(['PK not a real docx']), 'docx')).toBeNull();
    expect(await officePageCount(new Blob([]), 'docx')).toBeNull();
    const cut = word('<Pages>3</Pages>');
    expect(await officePageCount(cut.slice(0, cut.size - 30), 'docx')).toBeNull();
  });

  it('zip بمب: app.xml غول‌آسا باز نمی‌شود', async () => {
    const bomb = word(`<Pages>4</Pages>${' '.repeat(2 * 1024 * 1024)}`);
    expect(bomb.size).toBeLessThan(100 * 1024);
    expect(await officePageCount(bomb, 'docx')).toBeNull();

    // همان بمب، با اندازهٔ دروغ در فهرست zip: سقف باز کردن باز هم نگهش می‌دارد.
    const bytes = new Uint8Array(await bomb.arrayBuffer());
    const data = new DataView(bytes.buffer);
    const name = (i: number) => new TextDecoder().decode(bytes.subarray(i + 46, i + 62));
    for (let i = bytes.length - 22; i >= 0; i -= 1) {
      if (data.getUint32(i, true) === 0x02014b50 && name(i) === 'docProps/app.xml') {
        data.setUint32(i + 24, 100, true);
        break;
      }
    }
    expect(await officePageCount(new Blob([bytes]), 'docx')).toBeNull();
  });

  it('فقط انتهای فایل و همان یک بخش خوانده می‌شود', async () => {
    const big = new Uint8Array(4 * 1024 * 1024).map((_, i) => (i * 7919) % 251);
    const blob = word('<Pages>12</Pages>', [['word/media/image1.png', big, 0]]);
    const read: number[] = [];
    const tracked = {
      size: blob.size,
      slice(start?: number, end?: number) {
        read.push((end ?? blob.size) - (start ?? 0));
        return blob.slice(start, end);
      },
    } as unknown as Blob;
    expect(await readZipMember(tracked, 'docProps/app.xml')).toContain('<Pages>12</Pages>');
    expect(read.reduce((a, b) => a + b, 0)).toBeLessThan(100 * 1024);
  });

  it('برچسب با پیشوند فضای نام هم خوانده می‌شود', () => {
    expect(pagesFromAppXml('<ep:Properties><ep:Pages>8</ep:Pages></ep:Properties>', 'docx')).toBe(8);
    expect(pagesFromAppXml('<Slides>2</Slides><HiddenSlides>2</HiddenSlides>', 'pptx')).toBeNull();
  });
});
