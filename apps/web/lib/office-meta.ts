/**
 * تعداد صفحه‌ای که خود Word — یا اسلایدی که پاورپوینت — موقع ذخیره در فایل
 * نوشته (`docProps/app.xml`)؛ پیش‌فاکتور فوری Word و پاورپوینت (ADR-028).
 *
 * فقط برآورد است: Word با فونت‌های خود کاربر صفحه‌بندی کرده و سرور با فونت‌های
 * خودش به PDF تبدیل می‌کند. قیمت قطعی از شمارش همان PDF می‌آید. همین قاعده در
 * کارگر هم هست (`formats.office_page_count`) و آنجا کنار تبدیل ذخیره می‌شود تا
 * اختلاف دو عدد سنجیده شود.
 *
 * کل فایل خوانده نمی‌شود: فقط فهرست انتهای zip و همان یک بخش — برای Word
 * ۲۰۰ مگابایتی هم چند کیلوبایت. با import پویا می‌آید، پس به باندل اولیه نمی‌خورد.
 * هر چیز غیرعادی (zip خراب، zip64، مرورگر بی DecompressionStream) یعنی «برآورد
 * نداریم»، نه خطا: سرور همان فایل را می‌خواند.
 */

export type OfficeKind = 'docx' | 'pptx';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;
/** رکورد پایانی zip، با بلندترین توضیح ممکن. */
const MAX_TAIL_BYTES = 22 + 0xffff;
const MAX_CENTRAL_DIRECTORY_BYTES = 8 * 1024 * 1024;
/** app.xml واقعی چند کیلوبایت است؛ بزرگ‌تر یعنی zip بمب یا فایل عجیب. */
const MAX_APP_XML_BYTES = 1024 * 1024;

export async function officePageCount(file: Blob, kind: OfficeKind): Promise<number | null> {
  try {
    const xml = await readZipMember(file, 'docProps/app.xml');
    return xml === null ? null : pagesFromAppXml(xml, kind);
  } catch {
    return null;
  }
}

/** پاورپوینت اسلاید مخفی را هم می‌شمارد؛ آن چاپ نمی‌شود و کم می‌شود. */
export function pagesFromAppXml(xml: string, kind: OfficeKind): number | null {
  const count = (tag: string) => {
    const match = new RegExp(`<(?:\\w+:)?${tag}>\\s*(\\d+)\\s*<`).exec(xml);
    return match ? Number(match[1]) : null;
  };
  let pages: number | null;
  if (kind === 'docx') {
    pages = count('Pages');
  } else {
    const slides = count('Slides');
    pages = slides === null ? null : slides - (count('HiddenSlides') ?? 0);
  }
  return pages !== null && pages > 0 ? pages : null;
}

async function view(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

export async function readZipMember(file: Blob, name: string): Promise<string | null> {
  const tailStart = Math.max(0, file.size - MAX_TAIL_BYTES);
  const tail = await view(file, tailStart, file.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;

  const directorySize = tail.getUint32(end + 12, true);
  const directoryOffset = tail.getUint32(end + 16, true);
  if (
    directoryOffset === 0xffffffff || // zip64 — Word و پاورپوینت برای فایل عادی نمی‌سازند
    directorySize > MAX_CENTRAL_DIRECTORY_BYTES ||
    directoryOffset + directorySize > file.size
  ) {
    return null;
  }

  const directory = await view(file, directoryOffset, directoryOffset + directorySize);
  const decoder = new TextDecoder();
  let p = 0;
  while (p + 46 <= directory.byteLength && directory.getUint32(p, true) === CENTRAL_ENTRY) {
    const method = directory.getUint16(p + 10, true);
    const compressedSize = directory.getUint32(p + 20, true);
    const size = directory.getUint32(p + 24, true);
    const nameLength = directory.getUint16(p + 28, true);
    const extraLength = directory.getUint16(p + 30, true);
    const commentLength = directory.getUint16(p + 32, true);
    const localOffset = directory.getUint32(p + 42, true);
    const entryName = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + p + 46, Math.min(nameLength, directory.byteLength - p - 46)),
    );
    if (entryName === name) {
      if (size > MAX_APP_XML_BYTES || compressedSize > MAX_APP_XML_BYTES) return null;
      const local = await view(file, localOffset, localOffset + 30);
      if (local.byteLength < 30 || local.getUint32(0, true) !== LOCAL_ENTRY) return null;
      const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      const data = file.slice(dataStart, dataStart + compressedSize);
      if (method === 0) return decoder.decode(await data.arrayBuffer());
      if (method !== 8 || typeof DecompressionStream === 'undefined') return null;
      const inflated = await inflate(data, MAX_APP_XML_BYTES);
      return inflated === null ? null : decoder.decode(inflated);
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** باز کردن deflate با سقف: اندازهٔ ادعاشده در zip دروغ هم می‌تواند باشد. */
async function inflate(data: Blob, limit: number): Promise<Uint8Array | null> {
  const reader = data.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      void reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
