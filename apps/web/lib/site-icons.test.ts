/**
 * نشانک، آیکون گوشی و تصویر اشتراک، از روی فایل‌های برند (docs/UI.md، قدم ۳).
 *
 * icon.svg خود فایل برند است؛ بقیه را scripts/make-icons.mjs یک بار با Chromium از فایل‌های برند
 * می‌سازد. اینجا Chromium نیست، پس خود رندر سنجیده نمی‌شود؛ خروجی سنجیده می‌شود: برابری SVG، اندازه
 * و ماتی هر تصویر، اینکه نشان در دایرهٔ امن آیکون maskable است، و اینکه رنگ‌ها همان رنگ‌های امروز
 * برندند. برند که عوض شد و اسکریپت دوباره اجرا نشد، اینجا می‌افتد. اینکه سرور همه را با نوع درست
 * می‌دهد در tests/site.spec.ts است.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** یک رنگ برند، از خود فایل برند، به شکل [r, g, b]. */
function brand(token: string): [number, number, number] {
  const css = read('docs/brand/jozveyar-colors.css').toString('utf8');
  const hex = new RegExp(`--jy-${token}\\s*:\\s*#([0-9A-Fa-f]{6})`).exec(css)?.[1];
  if (!hex) throw new Error(`رنگ ${token} در فایل برند نیست`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

interface IcoImage {
  width: number;
  height: number;
  /** نوع رنگ PNG؛ ۶ یعنی RGBA، پس گوشهٔ گرد کاشی شفاف می‌ماند. */
  colorType: number;
}

/** تصویرهای درون یک فایل ICO که هر کدام PNG است؛ هر ناسازگاری خطا می‌دهد. */
function icoImages(ico: Buffer): IcoImage[] {
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) throw new Error('سرآیند ICO نیست');
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const entry = 6 + 16 * i;
    const size = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const png = ico.subarray(offset, offset + size);
    if (png.length !== size || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`تصویر ${i} PNG نیست`);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    // ردیف ICO همان اندازهٔ PNG را بگوید؛ ۰ در ردیف یعنی ۲۵۶.
    if ((ico[entry] || 256) !== width || (ico[entry + 1] || 256) !== height) throw new Error(`ردیف ${i} با PNG نمی‌خواند`);
    return { width, height, colorType: png[25]! };
  });
}

interface Png {
  width: number;
  height: number;
  /** ۳ برای RGB، ۴ برای RGBA. */
  channels: number;
  /** نام تکه‌ها به ترتیب؛ tRNS یعنی رنگی شفاف اعلام شده. */
  chunks: string[];
  /** پیکسل‌ها، ردیف‌به‌ردیف. */
  pixels: Buffer;
}

/** رمزگشای کوچک PNG: فقط ۸ بیتی RGB و RGBA بی درهم‌آمیختگی، همان که Chromium می‌سازد. */
function decodePng(file: Buffer): Png {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG نیست');
  const chunks: string[] = [];
  const data: Buffer[] = [];
  let header: Buffer | undefined;
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    chunks.push(type);
    if (type === 'IHDR') header = file.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT') data.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  if (!header) throw new Error('IHDR نیست');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = header[9] === 2 ? 3 : header[9] === 6 ? 4 : 0;
  if (header[8] !== 8 || header[12] !== 0 || !channels) throw new Error('فقط PNG هشت‌بیتی RGB یا RGBA');

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[y * stride + i - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
      const upLeft = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels]! : 0;
      let predictor: number;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = a <= b && a <= c ? left : b <= c ? up : upLeft;
      } else throw new Error(`فیلتر ناشناخته ${filter}`);
      pixels[y * stride + i] = (raw[y * (stride + 1) + 1 + i]! + predictor) & 0xff;
    }
  }
  return { width, height, channels, chunks, pixels };
}

const colorAt = (png: Png, x: number, y: number) => {
  const at = (y * png.width + x) * png.channels;
  return [png.pixels[at]!, png.pixels[at + 1]!, png.pixels[at + 2]!];
};
const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

/** مات: نه آلفا کمتر از ۲۵۵، نه رنگ شفاف اعلام‌شده (tRNS). */
function opaque(png: Png): boolean {
  if (png.chunks.includes('tRNS')) return false;
  for (let i = 3; png.channels === 4 && i < png.pixels.length; i += 4) if (png.pixels[i] !== 255) return false;
  return true;
}

/** هر پیکسل آیکون گوشی آمیزه‌ای از کاغذ و سبز نشان است (لبهٔ نرم)؛ شمار پیکسل‌هایی که نیست. */
function offPalette(png: Png, paper: number[], mark: number[]): number {
  let off = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const share = colorAt(png, x, y).map((v, i) => (paper[i]! - v) / (paper[i]! - mark[i]!));
      if (share.some((t) => t < -0.01 || t > 1.01) || Math.max(...share) - Math.min(...share) > 0.03) off++;
    }
  }
  return off;
}

/** پیکسل‌هایی که کاغذ نیستند ولی بیرون دایرهٔ امن maskable‌اند: دایره‌ای وسط، به قطر ۸۰٪ ضلع. */
function outsideSafeZone(png: Png, paper: number[]): number {
  const center = png.width / 2;
  const radius = 0.4 * png.width;
  let outside = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (Math.hypot(x + 0.5 - center, y + 0.5 - center) > radius && !same(colorAt(png, x, y), paper)) outside++;
    }
  }
  return outside;
}

describe('نشانک سایت', () => {
  it('app/icon.svg بایت‌به‌بایت همان favicon برند است', () => {
    expect(read('apps/web/app/icon.svg').equals(read('docs/brand/jozveyar-favicon.svg'))).toBe(true);
  });

  it('favicon.ico سه اندازهٔ ۱۶، ۳۲ و ۴۸ دارد، هر کدام PNG شفاف', () => {
    const images = icoImages(read('apps/web/app/favicon.ico'));
    expect(images.map(({ width, height }) => `${width}×${height}`)).toEqual(['16×16', '32×32', '48×48']);
    expect(images.every(({ colorType }) => colorType === 6)).toBe(true);
  });

  it('شاهد: ICO خراب یا ردیفی که با PNG نمی‌خواند دیده می‌شود', () => {
    const ico = Buffer.from(read('apps/web/app/favicon.ico'));
    const wrongSize = Buffer.from(ico);
    wrongSize[6] = 24; // ردیف اول می‌گوید ۲۴، PNG آن ۱۶ است
    expect(() => icoImages(wrongSize)).toThrow('ردیف 0');
    const notPng = Buffer.from(ico);
    notPng[ico.readUInt32LE(6 + 12)] = 0; // اولین بایت PNG اول
    expect(() => icoImages(notPng)).toThrow('PNG نیست');
  });
});

describe('آیکون گوشی: نشان کامل روی مربع سفید مات', () => {
  const PHONE = [
    ['apps/web/app/apple-icon.png', 180],
    ['apps/web/public/icons/icon-192.png', 192],
    ['apps/web/public/icons/icon-512.png', 512],
  ] as const;
  const paper = brand('paper');
  const mark = brand('green-500');

  it.each(PHONE)('%s: %i پیکسل، مات، و فقط کاغذ و سبز نشان', (path, size) => {
    const png = decodePng(read(path));
    expect(`${png.width}×${png.height}`).toBe(`${size}×${size}`);
    expect(opaque(png)).toBe(true);
    expect(offPalette(png, paper, mark)).toBe(0);
    // گوشه‌ها کاغذند و وسط ساقهٔ نشان خود سبز نشان است، نه فقط لبهٔ نرمش.
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]] as const) {
      expect(colorAt(png, x, y)).toEqual(paper);
    }
    expect(colorAt(png, Math.round(size * 0.64), Math.round(size * 0.5))).toEqual(mark);
  });

  it.each(PHONE)('%s: کل نشان در دایرهٔ امن maskable است', (path) => {
    expect(outsideSafeZone(decodePng(read(path)), paper)).toBe(0);
  });

  it('شاهد: آلفای ناقص، رنگ شفاف، لکه بیرون دایرهٔ امن و رنگ بیگانه دیده می‌شوند', () => {
    const png = decodePng(read('apps/web/public/icons/icon-512.png'));
    expect(opaque({ ...png, chunks: [...png.chunks, 'tRNS'] })).toBe(false);
    const rgba = Buffer.alloc(8, 255);
    rgba[7] = 254;
    expect(opaque({ width: 2, height: 1, channels: 4, chunks: [], pixels: rgba })).toBe(false);

    const spotted = { ...png, pixels: Buffer.from(png.pixels) };
    spotted.pixels.set(mark, (20 * png.width + 20) * 3); // لکه‌ای نزدیک گوشهٔ بالا
    expect(outsideSafeZone(spotted, paper)).toBe(1);
    spotted.pixels.set(brand('ink'), (256 * png.width + 256) * 3); // جوهر وسط نشان
    expect(offPalette(spotted, paper, mark)).toBe(1);
  });
});

describe('تصویر اشتراک: طرح الف', () => {
  it('۱۲۰۰×۶۳۰ و مات؛ زمینهٔ green-50 و لبهٔ ۱۲ پیکسلی green-600 در پایین', () => {
    const png = decodePng(read('apps/web/app/opengraph-image.png'));
    expect(`${png.width}×${png.height}`).toBe('1200×630');
    expect(opaque(png)).toBe(true);

    const [green50, green600] = [brand('green-50'), brand('green-600')];
    const edgeTop = png.height - 12;
    const wrong: string[] = [];
    for (let y = 0; y < png.height; y++) {
      const expected = y < edgeTop ? green50 : green600;
      // دو کنار هر ردیف، و کل ردیف‌های لبه و ردیف درست بالای آن: لبه دقیقاً ۱۲ پیکسل است.
      const xs = y >= edgeTop - 1 ? Array.from({ length: png.width }, (_, x) => x) : [0, png.width - 1];
      for (const x of xs) if (!same(colorAt(png, x, y), expected)) wrong.push(`(${x}, ${y})`);
    }
    expect(wrong).toEqual([]);
  });

  it('متن جایگزین تیتر را دارد؛ یک خط، بی فاصله در دو سر', () => {
    const alt = read('apps/web/app/opengraph-image.alt.txt').toString('utf8');
    expect(alt).toBe(alt.trim());
    expect(alt).not.toContain('\n');
    expect(alt).toContain('جزوه‌ات را بینداز، قیمت را همین حالا ببین');
  });
});
