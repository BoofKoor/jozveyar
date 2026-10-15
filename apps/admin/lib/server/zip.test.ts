/**
 * zip جریانی «همهٔ فایل‌ها» (`zip.ts`، برش ۹٫۱) با خوانندهٔ کوچک همین فایل، که ساختار را از ته فایل می‌خواند، مثل هر برنامهٔ
 * باز کردن zip: فهرست مرکزی، سرآیند محلی هر فایل، بایت‌ها، CRC و descriptor. راه ZIP64 با مرز کوچک سنجیده می‌شود، بی چهار گیگابایت.
 */

import { crc32 as nodeCrc32 } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { zipSize, zipStream, type ZipEntry } from './zip';

const AT = new Date('2026-10-05T07:50:00Z'); // دوشنبه 13 مهر 1405، ساعت 11:20 تهران

function bytesOf(n: number, seed: number) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = (i * 31 + seed * 7) & 0xff;
  return out;
}

/** فایلی که بایت‌هایش را تکه‌تکه می‌دهد، مثل بدنهٔ استوریج. */
function entry(name: string, data: Uint8Array, chunk = 7, at = AT): ZipEntry & { opened: number } {
  const e = {
    name,
    size: data.length,
    modifiedAt: at,
    opened: 0,
    async open() {
      e.opened += 1;
      let i = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i >= data.length) return controller.close();
          controller.enqueue(data.subarray(i, i + chunk));
          i += chunk;
        },
      });
    },
  };
  return e;
}

async function collect(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Read {
  name: string;
  data: Uint8Array;
  crc: number;
  offset: number;
  zip64Local: boolean;
  dos: { time: number; date: number };
}

/** خوانندهٔ zip: از ته فایل، با ZIP64؛ هر ناسازگاری میان فهرست مرکزی، سرآیند محلی و descriptor خطاست. */
function readZip(zip: Uint8Array): { entries: Read[]; zip64: boolean } {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const u64 = (at: number) => Number(view.getBigUint64(at, true));
  const end = zip.length - 22;
  expect(u32(end)).toBe(0x06054b50);
  expect(u16(end + 20)).toBe(0); // بی توضیح
  let count = u16(end + 10);
  let cdSize = u32(end + 12);
  let cdOffset = u32(end + 16);
  const zip64 = end >= 20 && u32(end - 20) === 0x07064b50;
  if (zip64) {
    const record = u64(end - 20 + 8);
    expect(u32(record)).toBe(0x06064b50);
    expect(record + 56).toBe(end - 20);
    count = u64(record + 32);
    cdSize = u64(record + 40);
    cdOffset = u64(record + 48);
  }
  expect(cdOffset + cdSize).toBe(zip64 ? u64(end - 20 + 8) : end);
  const entries: Read[] = [];
  let at = cdOffset;
  for (let i = 0; i < count; i += 1) {
    expect(u32(at)).toBe(0x02014b50);
    expect(u16(at + 8)).toBe(0x0008);
    expect(u16(at + 10)).toBe(0); // stored
    const crc = u32(at + 16);
    let compressed = u32(at + 20);
    let size = u32(at + 24);
    const nameLength = u16(at + 28);
    const extraLength = u16(at + 30);
    let offset = u32(at + 42);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    let field = at + 46 + nameLength;
    if (extraLength > 0) {
      expect(u16(field)).toBe(0x0001);
      field += 4;
      if (size === 0xffffffff) (size = u64(field)), (field += 8);
      if (compressed === 0xffffffff) (compressed = u64(field)), (field += 8);
      if (offset === 0xffffffff) offset = u64(field);
    }
    expect(compressed).toBe(size);
    const dos = { time: u16(at + 12), date: u16(at + 14) };
    // سرآیند محلی
    expect(u32(offset)).toBe(0x04034b50);
    expect(u16(offset + 6)).toBe(0x0008);
    expect([u16(offset + 10), u16(offset + 12)]).toEqual([dos.time, dos.date]);
    expect(u32(offset + 14)).toBe(0);
    const localName = u16(offset + 26);
    const localExtra = u16(offset + 28);
    expect(new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + localName))).toBe(name);
    const zip64Local = localExtra > 0;
    if (zip64Local) {
      expect([u32(offset + 18), u32(offset + 22)]).toEqual([0xffffffff, 0xffffffff]);
      expect(u16(offset + 30 + localName)).toBe(0x0001);
    } else expect([u32(offset + 18), u32(offset + 22)]).toEqual([0, 0]);
    const dataAt = offset + 30 + localName + localExtra;
    const data = zip.subarray(dataAt, dataAt + size);
    const d = dataAt + size;
    expect(u32(d)).toBe(0x08074b50);
    expect(u32(d + 4)).toBe(crc);
    if (zip64Local) expect([u64(d + 8), u64(d + 16)]).toEqual([size, size]);
    else expect([u32(d + 8), u32(d + 12)]).toEqual([size, size]);
    entries.push({ name, data, crc, offset, zip64Local, dos });
    at += 46 + nameLength + extraLength + u16(at + 32);
  }
  expect(at).toBe(cdOffset + cdSize);
  return { entries, zip64 };
}

describe('zip جریانی «همهٔ فایل‌ها» (برش ۹٫۱)', () => {
  it('هر فایل بی فشرده‌سازی، با CRC و اندازه‌اش؛ طول همان zipSize؛ ترتیب همان ترتیب فایل‌ها', async () => {
    const a = bytesOf(1_000, 1);
    const b = bytesOf(37, 2);
    const files = [entry('jozve-10027-1.pdf', a), entry('jozve-10027-2-jeld-1.pdf', b, 5), entry('barge-sefaresh-10027.pdf', new Uint8Array())];
    const zip = await collect(zipStream(files));
    expect(zip.length).toBe(zipSize(files));
    const { entries, zip64 } = readZip(zip);
    expect(zip64).toBe(false);
    expect(entries.map((e) => e.name)).toEqual(['jozve-10027-1.pdf', 'jozve-10027-2-jeld-1.pdf', 'barge-sefaresh-10027.pdf']);
    expect(entries.map((e) => [...e.data])).toEqual([[...a], [...b], []]);
    // CRC با zlib نود، مستقل از جدول خود zip.
    expect(entries.map((e) => e.crc)).toEqual([nodeCrc32(a), nodeCrc32(b), 0]);
    expect(entries.map((e) => e.zip64Local)).toEqual([false, false, false]);
    // هر فایل یک بار باز می‌شود، و فقط وقتی نوبتش رسید.
    expect(files.map((f) => f.opened)).toEqual([1, 1, 1]);
  });

  it('زمان هر فایل به ساعت دیواری تهران، در قالب DOS', async () => {
    const zip = await collect(zipStream([entry('a.pdf', bytesOf(3, 1))]));
    const [{ dos }] = readZip(zip).entries as [Read];
    // 1405/07/13 ساعت 11:20 تهران = 2026-10-05 11:20:00.
    expect(dos).toEqual({ time: (11 << 11) | (20 << 5), date: ((2026 - 1980) << 9) | (10 << 5) | 5 });
  });

  it('ZIP64 با مرز کوچک: فایل بزرگ extra و descriptor هشت‌بایتی دارد، شروع دور و فهرست مرکزی هم؛ همان بایت‌ها و همان طول', async () => {
    const small = bytesOf(4, 3);
    const big = bytesOf(64, 4);
    const files = [entry('jozve-10033-1.pdf', small), entry('jozve-10033-2.pdf', big), entry('barge-sefaresh-10033.pdf', bytesOf(5, 5))];
    const options = { zip64Threshold: 40 };
    const zip = await collect(zipStream(files, options));
    expect(zip.length).toBe(zipSize(files, options));
    const { entries, zip64 } = readZip(zip);
    expect(zip64).toBe(true);
    expect(entries.map((e) => e.zip64Local)).toEqual([false, true, false]);
    expect(entries.map((e) => e.data.length)).toEqual([4, 64, 5]);
    expect([...entries[1]!.data]).toEqual([...big]);
    // فایل سوم پس از مرز شروع می‌شود: شروعش فقط در extra فهرست مرکزی.
    expect(entries[2]!.offset).toBeGreaterThan(40);
    // بی مرز کوچک همان فایل‌ها ZIP64 نمی‌خواهند، و zip کوتاه‌تر است.
    expect(zipSize(files)).toBeLessThan(zipSize(files, options));
  });

  it('فایلی که کمتر یا بیشتر از اندازه‌اش بدهد جریان را با خطا می‌بندد، نه zip خراب', async () => {
    const short = { ...entry('a.pdf', bytesOf(10, 1)), size: 11 };
    await expect(collect(zipStream([short]))).rejects.toThrow('10 بایت داد، نه 11');
    const long = { ...entry('a.pdf', bytesOf(10, 1)), size: 9 };
    await expect(collect(zipStream([long]))).rejects.toThrow('بیش از 9 بایت داد');
    const missing: ZipEntry = { name: 'b.pdf', size: 3, modifiedAt: AT, open: () => Promise.reject(new Error('در استوریج نیست')) };
    await expect(collect(zipStream([missing]))).rejects.toThrow('در استوریج نیست');
  });

  it('بستن جریان از سوی گیرنده بدنهٔ فایل باز را هم می‌بندد', async () => {
    let cancelled: unknown = null;
    const file: ZipEntry = {
      name: 'a.pdf',
      size: 1_000,
      modifiedAt: AT,
      async open() {
        return new ReadableStream<Uint8Array>({
          pull: (controller) => controller.enqueue(new Uint8Array(10)),
          cancel: (reason) => void (cancelled = reason ?? 'cancelled'),
        });
      },
    };
    const reader = zipStream([file]).getReader();
    await reader.read(); // سرآیند محلی
    await reader.read(); // تکهٔ اول
    await reader.cancel('بسته شد');
    expect(cancelled).toBe('بسته شد');
  });

  it('نام فقط ASCII چاپ‌شدنی؛ اندازهٔ منفی یا اعشاری نه', () => {
    expect(() => zipSize([{ name: 'جزوه.pdf', size: 1 }])).toThrow('نام نادرست');
    expect(() => zipSize([{ name: '../a.pdf\n', size: 1 }])).toThrow('نام نادرست');
    expect(() => zipSize([{ name: 'a.pdf', size: -1 }])).toThrow('اندازهٔ نادرست');
    expect(() => zipSize([{ name: 'a.pdf', size: 1.5 }])).toThrow('اندازهٔ نادرست');
    expect(zipSize([])).toBe(22);
  });
});
