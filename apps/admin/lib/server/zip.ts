import * as zlib from 'node:zlib';

/**
 * zip جریانی «همهٔ فایل‌ها»ی یک سفارش (برش ۹٫۱، ADR-056)، دست‌نویس و بی وابستگی. PDF خودش فشرده است، پس هر فایل بی فشرده‌سازی
 * دوباره می‌رود (روش ۰، stored)، با data descriptor: CRC هر فایل هنگام فرستادنش حساب می‌شود و پس از خودش می‌آید، پس هیچ فایل موقتی
 * نه روی دیسک است و نه یک‌جا در حافظه. اندازهٔ هر فایل از پیش معلوم است، پس طول کل پاسخ هم (`zipSize`)، و Content-Length درست.
 *
 * ZIP64 فقط جایی که لازم است: فایلی که به ۴ گیگابایت می‌رسد، شروع فایل یا فهرست مرکزی بالای آن، یا بیش از ۶۵٬۵۳۴ فایل. نام‌ها ASCII‌اند
 * (`jozve-10027-1.pdf`)، پس پرچم UTF-8 لازم نیست.
 */

/** یک فایل zip: نام ASCII، اندازهٔ دقیق، و بدنه‌ای که دقیقاً همین اندازه را می‌دهد. */
export interface ZipEntry {
  name: string;
  size: number;
  modifiedAt: Date;
  open(): Promise<ReadableStream<Uint8Array>>;
}

export interface ZipOptions {
  /** مرز ZIP64؛ فقط تست کوچکش می‌کند تا همان راه بی چهار گیگابایت داده سنجیده شود. */
  zip64Threshold?: number;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const LOCAL = 30;
const CENTRAL = 46;
const DESCRIPTOR = 16;
const DESCRIPTOR64 = 24;
const ZIP64_EXTRA_LOCAL = 20;
const ZIP64_END = 56;
const ZIP64_LOCATOR = 20;
const END = 22;
/** بیت ۳: CRC و اندازه‌ها در data descriptor پس از داده. */
const FLAG_DESCRIPTOR = 0x0008;

/** CRC-32 فایل؛ `zlib.crc32` نود از ۲۲٫۲، و جدول خودش برای نودی که ندارد. */
const crc32: (data: Uint8Array, value: number) => number =
  typeof (zlib as { crc32?: unknown }).crc32 === 'function'
    ? (data, value) => (zlib as unknown as { crc32(data: Uint8Array, value: number): number }).crc32(data, value)
    : tableCrc32();

function tableCrc32() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (data: Uint8Array, value: number) => {
    let c = (value ^ MAX32) >>> 0;
    for (let i = 0; i < data.length; i += 1) c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ MAX32) >>> 0;
  };
}

/** زمان DOS فایل به ساعت دیواری تهران، چون zip منطقهٔ زمانی ندارد و هر خوانندهٔ ایرانی همان را می‌بیند. */
function dosTime(at: Date): { time: number; date: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const year = Math.min(Math.max(parts.year! - 1980, 0), 127);
  return {
    time: (parts.hour! << 11) | (parts.minute! << 5) | Math.floor(parts.second! / 2),
    date: (year << 9) | (parts.month! << 5) | parts.day!,
  };
}

function checkName(name: string) {
  if (!/^[\x21-\x7e][\x20-\x7e]*$/.test(name) || name.length > MAX16) throw new Error(`zip: نام نادرست ${JSON.stringify(name)}`);
}

/** چیدمان هر فایل: کجا شروع می‌شود و کدام قسمت‌هایش ZIP64 می‌خواهند. */
interface Placed {
  name: Uint8Array;
  size: number;
  offset: number;
  /** اندازه به مرز رسید: سرآیند محلی با extra و descriptor با اندازهٔ ۸ بایتی. */
  big: boolean;
}

function place(entries: readonly { name: string; size: number }[], limit: number) {
  const placed: Placed[] = [];
  let offset = 0;
  for (const entry of entries) {
    checkName(entry.name);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`zip: اندازهٔ نادرست ${entry.name}`);
    const big = entry.size >= limit;
    const name = new TextEncoder().encode(entry.name);
    placed.push({ name, size: entry.size, offset, big });
    offset += LOCAL + name.length + (big ? ZIP64_EXTRA_LOCAL : 0) + entry.size + (big ? DESCRIPTOR64 : DESCRIPTOR);
  }
  const central = placed.reduce((sum, p) => sum + CENTRAL + p.name.length + centralExtraSize(p, limit), 0);
  const zip64 =
    placed.some((p) => p.big || p.offset >= limit) || offset >= limit || central >= limit || placed.length >= MAX16;
  return { placed, centralOffset: offset, centralSize: central, zip64 };
}

function centralExtraSize(p: Placed, limit: number) {
  const fields = (p.big ? 2 : 0) + (p.offset >= limit ? 1 : 0);
  return fields === 0 ? 0 : 4 + 8 * fields;
}

/** طول دقیق zip همین فایل‌ها، همان که `zipStream` می‌فرستد. */
export function zipSize(entries: readonly { name: string; size: number }[], options: ZipOptions = {}): number {
  const { centralOffset, centralSize, zip64 } = place(entries, options.zip64Threshold ?? MAX32);
  return centralOffset + centralSize + (zip64 ? ZIP64_END + ZIP64_LOCATOR : 0) + END;
}

function localHeader(p: Placed, at: Date) {
  const out = new DataView(new ArrayBuffer(LOCAL + p.name.length + (p.big ? ZIP64_EXTRA_LOCAL : 0)));
  const { time, date } = dosTime(at);
  out.setUint32(0, 0x04034b50, true);
  out.setUint16(4, p.big ? 45 : 20, true);
  out.setUint16(6, FLAG_DESCRIPTOR, true);
  out.setUint16(8, 0, true);
  out.setUint16(10, time, true);
  out.setUint16(12, date, true);
  // CRC و اندازه‌ها در descriptor؛ با ZIP64 اندازه‌ها 0xFFFFFFFF و extra با صفر، تا خواننده descriptor را ۸ بایتی بخواند.
  out.setUint32(14, 0, true);
  out.setUint32(18, p.big ? MAX32 : 0, true);
  out.setUint32(22, p.big ? MAX32 : 0, true);
  out.setUint16(26, p.name.length, true);
  out.setUint16(28, p.big ? ZIP64_EXTRA_LOCAL : 0, true);
  new Uint8Array(out.buffer).set(p.name, LOCAL);
  if (p.big) {
    const extra = LOCAL + p.name.length;
    out.setUint16(extra, 0x0001, true);
    out.setUint16(extra + 2, 16, true);
  }
  return new Uint8Array(out.buffer);
}

function descriptor(p: Placed, crc: number) {
  const out = new DataView(new ArrayBuffer(p.big ? DESCRIPTOR64 : DESCRIPTOR));
  out.setUint32(0, 0x08074b50, true);
  out.setUint32(4, crc, true);
  if (p.big) {
    out.setBigUint64(8, BigInt(p.size), true);
    out.setBigUint64(16, BigInt(p.size), true);
  } else {
    out.setUint32(8, p.size, true);
    out.setUint32(12, p.size, true);
  }
  return new Uint8Array(out.buffer);
}

function centralDirectory(placed: readonly Placed[], crcs: readonly number[], times: readonly Date[], limit: number) {
  const size = placed.reduce((sum, p) => sum + CENTRAL + p.name.length + centralExtraSize(p, limit), 0);
  const out = new DataView(new ArrayBuffer(size));
  const bytes = new Uint8Array(out.buffer);
  let at = 0;
  placed.forEach((p, i) => {
    const extra = centralExtraSize(p, limit);
    const far = p.offset >= limit;
    const { time, date } = dosTime(times[i]!);
    out.setUint32(at, 0x02014b50, true);
    out.setUint16(at + 4, 45, true);
    out.setUint16(at + 6, p.big || far ? 45 : 20, true);
    out.setUint16(at + 8, FLAG_DESCRIPTOR, true);
    out.setUint16(at + 10, 0, true);
    out.setUint16(at + 12, time, true);
    out.setUint16(at + 14, date, true);
    out.setUint32(at + 16, crcs[i]!, true);
    out.setUint32(at + 20, p.big ? MAX32 : p.size, true);
    out.setUint32(at + 24, p.big ? MAX32 : p.size, true);
    out.setUint16(at + 28, p.name.length, true);
    out.setUint16(at + 30, extra, true);
    out.setUint16(at + 32, 0, true);
    out.setUint16(at + 34, 0, true);
    out.setUint16(at + 36, 0, true);
    out.setUint32(at + 38, 0, true);
    out.setUint32(at + 42, far ? MAX32 : p.offset, true);
    bytes.set(p.name, at + CENTRAL);
    let field = at + CENTRAL + p.name.length;
    if (extra > 0) {
      // ترتیب ZIP64: اندازهٔ اصلی، اندازهٔ فشرده، و شروع سرآیند محلی؛ فقط آنچه در فیلد ۴ بایتی جا نشد.
      out.setUint16(field, 0x0001, true);
      out.setUint16(field + 2, extra - 4, true);
      field += 4;
      if (p.big) {
        out.setBigUint64(field, BigInt(p.size), true);
        out.setBigUint64(field + 8, BigInt(p.size), true);
        field += 16;
      }
      if (far) out.setBigUint64(field, BigInt(p.offset), true);
    }
    at += CENTRAL + p.name.length + extra;
  });
  return bytes;
}

function endRecords(count: number, centralOffset: number, centralSize: number, zip64: boolean, limit: number) {
  const out = new DataView(new ArrayBuffer((zip64 ? ZIP64_END + ZIP64_LOCATOR : 0) + END));
  let at = 0;
  if (zip64) {
    out.setUint32(0, 0x06064b50, true);
    out.setBigUint64(4, BigInt(ZIP64_END - 12), true);
    out.setUint16(12, 45, true);
    out.setUint16(14, 45, true);
    out.setUint32(16, 0, true);
    out.setUint32(20, 0, true);
    out.setBigUint64(24, BigInt(count), true);
    out.setBigUint64(32, BigInt(count), true);
    out.setBigUint64(40, BigInt(centralSize), true);
    out.setBigUint64(48, BigInt(centralOffset), true);
    out.setUint32(56, 0x07064b50, true);
    out.setUint32(60, 0, true);
    out.setBigUint64(64, BigInt(centralOffset + centralSize), true);
    out.setUint32(72, 1, true);
    at = ZIP64_END + ZIP64_LOCATOR;
  }
  out.setUint32(at, 0x06054b50, true);
  out.setUint16(at + 4, 0, true);
  out.setUint16(at + 6, 0, true);
  out.setUint16(at + 8, zip64 && count >= MAX16 ? MAX16 : count, true);
  out.setUint16(at + 10, zip64 && count >= MAX16 ? MAX16 : count, true);
  out.setUint32(at + 12, zip64 && centralSize >= limit ? MAX32 : centralSize, true);
  out.setUint32(at + 16, zip64 && centralOffset >= limit ? MAX32 : centralOffset, true);
  out.setUint16(at + 20, 0, true);
  return new Uint8Array(out.buffer);
}

/**
 * بدنهٔ zip، فایل به فایل: سرآیند محلی، بایت‌های خود فایل همان‌طور که از `open` می‌رسد، descriptor، و در پایان فهرست مرکزی.
 * فایلی که بیشتر یا کمتر از اندازه‌اش بدهد جریان را با خطا می‌بندد، نه zip خراب؛ بستن جریان از سوی گیرنده بدنهٔ فایل باز را هم
 * می‌بندد.
 */
export function zipStream(entries: readonly ZipEntry[], options: ZipOptions = {}): ReadableStream<Uint8Array> {
  const limit = options.zip64Threshold ?? MAX32;
  const { placed, centralOffset, centralSize, zip64 } = place(entries, limit);
  const crcs: number[] = [];
  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let crc = 0;
  let seen = 0;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      if (!reader) {
        if (index === entries.length) {
          controller.enqueue(centralDirectory(placed, crcs, entries.map((e) => e.modifiedAt), limit));
          controller.enqueue(endRecords(entries.length, centralOffset, centralSize, zip64, limit));
          finished = true;
          controller.close();
          return;
        }
        const entry = entries[index]!;
        controller.enqueue(localHeader(placed[index]!, entry.modifiedAt));
        reader = (await entry.open()).getReader();
        crc = 0;
        seen = 0;
        return;
      }
      const p = placed[index]!;
      const { done, value } = await reader.read();
      if (done) {
        reader = null;
        if (seen !== p.size) throw new Error(`zip: ${entries[index]!.name} ${seen} بایت داد، نه ${p.size}`);
        crcs.push(crc);
        controller.enqueue(descriptor(p, crc));
        index += 1;
        return;
      }
      seen += value.byteLength;
      if (seen > p.size) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`zip: ${entries[index]!.name} بیش از ${p.size} بایت داد`);
      }
      crc = crc32(value, crc);
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader?.cancel(reason).catch(() => undefined);
    },
  });
}
