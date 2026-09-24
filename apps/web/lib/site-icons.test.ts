/**
 * نشانک سایت: app/icon.svg و app/favicon.ico از روی favicon برند (docs/UI.md، قدم ۳).
 *
 * icon.svg خود فایل برند است؛ favicon.ico را scripts/make-icons.mjs یک بار با Chromium از همان
 * فایل می‌سازد. اینجا Chromium نیست، پس خود رندر سنجیده نمی‌شود؛ برابری SVG، و اینکه ICO همان
 * سه اندازه را با PNG شفاف دارد. اینکه سرور هر دو را با نوع درست می‌دهد در tests/site.spec.ts است.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(`${REPO}${path}`);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
