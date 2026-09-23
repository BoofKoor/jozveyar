/**
 * بردارهای هم‌ارزی: مرورگر و کارگر پایتون باید دقیقاً همان عدد را بدهند.
 *
 * الگوریتم تشخیص رنگ دو پیاده‌سازی دارد — این فایل (مرورگر) و
 * `services/docworker/docworker/analysis.py` (سرور، ADR-005). دو پیاده‌سازی
 * دیر یا زود واگرا می‌شوند مگر اینکه چیزی جلویشان را بگیرد؛ این همان چیز است.
 *
 * `parity/vectors.json` برای چند تصویر ساختگی قطعی، خروجی دقیق این فایل را
 * نگه می‌دارد. این تست ثابت می‌کند TS هنوز همان را می‌دهد، و تست پایتون ثابت
 * می‌کند پایتون هم. برابری **دقیق** است، نه تقریبی: همان عملیات اعشاری به همان
 * ترتیب، همان عدد می‌دهد، و هر اختلافی یعنی یکی از دو طرف فرق کرده.
 *
 * تغییر عمدی الگوریتم: `UPDATE_PARITY=1 pnpm test` فایل را بازنویسی می‌کند، و
 * بعد پیاده‌سازی پایتون باید همراهش عوض شود تا تستش سبز شود.
 *
 * تولیدکنندهٔ تصویر عمداً ساده و با حساب صحیح است (MINSTD) تا در هر دو زبان
 * بیت‌به‌بیت یکی باشد.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, type DetectionThresholds } from '@jozveyar/contracts';

import {
  ANALYSIS_REVISION,
  analyzePixels,
  isBlankPage,
  isColorPage,
  pageDpi,
  type ImagePlacement,
  type PixelStats,
} from './index.js';

type RGB = [number, number, number];

export interface ImageSpec {
  name: string;
  width: number;
  height: number;
  seed: number;
  paper: RGB;
  ink: RGB;
  /** هر چند ردیف یک خط؛ صفر یعنی بدون خط. */
  lineEvery: number;
  lineHeight: number;
  /** دامنهٔ نویز صحیح؛ هر کانال ± این مقدار. */
  noise: number;
  highlight?: { x0: number; y0: number; x1: number; y1: number; color: RGB };
}

/** همان تولیدکننده در `services/docworker/tests/test_parity.py`. */
export function renderSpec(spec: ImageSpec): Uint8ClampedArray {
  const { width, height, noise } = spec;
  const out = new Uint8ClampedArray(width * height * 4);
  let state = spec.seed;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let c = spec.paper;
      if (spec.lineEvery > 0 && y % spec.lineEvery < spec.lineHeight && x >= 4 && x < width - 4) {
        c = spec.ink;
      }
      const h = spec.highlight;
      if (h && x >= h.x0 && x < h.x1 && y >= h.y0 && y < h.y1) c = h.color;

      const i = (y * width + x) * 4;
      for (let k = 0; k < 3; k += 1) {
        const jitter = noise > 0 ? (next() % (2 * noise + 1)) - noise : 0;
        out[i + k] = Math.max(0, Math.min(255, c[k]! + jitter));
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

export const SPECS: ImageSpec[] = [
  { name: 'yellow_scan', width: 120, height: 170, seed: 11, paper: [250, 240, 200], ink: [40, 40, 42], lineEvery: 9, lineHeight: 2, noise: 3 },
  { name: 'white_bw', width: 120, height: 170, seed: 12, paper: [255, 255, 255], ink: [30, 30, 30], lineEvery: 8, lineHeight: 2, noise: 2 },
  {
    name: 'red_highlight',
    width: 120, height: 170, seed: 13, paper: [255, 255, 255], ink: [30, 30, 30], lineEvery: 8, lineHeight: 2, noise: 2,
    highlight: { x0: 20, y0: 40, x1: 90, y1: 70, color: [230, 40, 40] },
  },
  {
    name: 'green_marker_on_yellow',
    width: 120, height: 170, seed: 14, paper: [248, 236, 196], ink: [45, 42, 40], lineEvery: 9, lineHeight: 2, noise: 3,
    highlight: { x0: 10, y0: 100, x1: 60, y1: 108, color: [120, 220, 90] },
  },
  { name: 'blank_white', width: 120, height: 170, seed: 15, paper: [255, 255, 255], ink: [0, 0, 0], lineEvery: 0, lineHeight: 0, noise: 1 },
  { name: 'gray_scan', width: 120, height: 170, seed: 16, paper: [200, 200, 202], ink: [60, 60, 60], lineEvery: 7, lineHeight: 3, noise: 4 },
  { name: 'noisy_photo', width: 90, height: 130, seed: 17, paper: [128, 128, 128], ink: [0, 0, 0], lineEvery: 0, lineHeight: 0, noise: 100 },
  { name: 'dark_page', width: 60, height: 80, seed: 18, paper: [18, 18, 20], ink: [240, 240, 240], lineEvery: 6, lineHeight: 1, noise: 2 },
];

interface Vector {
  spec: ImageSpec;
  stats: PixelStats;
  color: boolean;
  blank: boolean;
}

/** صفحه‌ای با تصویرهایش — ورودی `pageDpi`، با همان ماتریس‌هایی که pdf.js و PyMuPDF می‌دهند. */
export interface DpiCase {
  name: string;
  pageWidthPt: number;
  pageHeightPt: number;
  placements: ImagePlacement[];
}

const A4: [number, number] = [595, 842];

export const DPI_CASES: DpiCase[] = [
  { name: 'full_page_scan_300', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 2480, heightPx: 3508, matrix: [595, 0, 0, 842, 0, 0] }] },
  { name: 'full_page_scan_150', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 1240, heightPx: 1754, matrix: [595, 0, 0, 842, 0, 0] }] },
  // باگ نسخهٔ ۱: همین لوگو «۴ DPI» و هشدار کیفیت می‌گرفت.
  { name: 'logo_on_text_page', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 200, heightPx: 50, matrix: [144, 0, 0, 36, 50, 50] }] },
  { name: 'half_page_low_res_photo', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 400, heightPx: 300, matrix: [595, 0, 0, 446, 0, 200] }] },
  // عکس گوشی، چرخیده: محور x تصویر روی محور y صفحه می‌افتد (همان ماتریس PyMuPDF).
  { name: 'rotated_phone_photo', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 4000, heightPx: 3000, matrix: [0, -793, 595, 0, 0, 817] }] },
  // تصویر بزرگ کم‌کیفیت و تصویر کوچک پرکیفیت: بزرگ‌تر بر صفحه حاکم است.
  {
    name: 'largest_area_wins',
    pageWidthPt: A4[0],
    pageHeightPt: A4[1],
    placements: [
      { widthPx: 2000, heightPx: 2000, matrix: [100, 0, 0, 100, 20, 20] },
      { widthPx: 600, heightPx: 850, matrix: [595, 0, 0, 842, 0, 0] },
    ],
  },
  { name: 'just_below_coverage', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 1000, heightPx: 1000, matrix: [316, 0, 0, 316, 0, 0] }] },
  { name: 'just_above_coverage', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 1000, heightPx: 1000, matrix: [318, 0, 0, 318, 0, 0] }] },
  { name: 'landscape_slide_background', pageWidthPt: 720, pageHeightPt: 405, placements: [{ widthPx: 1920, heightPx: 1080, matrix: [720, 0, 0, 405, 0, 0] }] },
  { name: 'text_page_no_images', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [] },
  { name: 'degenerate_matrix', pageWidthPt: A4[0], pageHeightPt: A4[1], placements: [{ widthPx: 100, heightPx: 100, matrix: [0, 0, 0, 0, 0, 0] }] },
];

interface DpiVector extends DpiCase {
  dpi: number | null;
}

interface VectorsFile {
  revision: number;
  thresholds: DetectionThresholds;
  vectors: Vector[];
  dpi: DpiVector[];
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'parity', 'vectors.json');

function compute(): VectorsFile {
  return {
    revision: ANALYSIS_REVISION,
    thresholds: DEFAULT_THRESHOLDS,
    vectors: SPECS.map((spec) => {
      const stats = analyzePixels(renderSpec(spec), DEFAULT_THRESHOLDS);
      return {
        spec,
        stats,
        color: !isBlankPage(stats) && isColorPage(stats, DEFAULT_THRESHOLDS),
        blank: isBlankPage(stats),
      };
    }),
    dpi: DPI_CASES.map((c) => ({ ...c, dpi: pageDpi(c.placements, c.pageWidthPt, c.pageHeightPt) })),
  };
}

describe('بردارهای هم‌ارزی مرورگر و کارگر', () => {
  it('خروجی الگوریتم با فایل مشترک دقیقاً یکی است', () => {
    const actual = compute();
    if (process.env.UPDATE_PARITY === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, `${JSON.stringify(actual, null, 1)}\n`);
    }
    const expected = JSON.parse(readFileSync(FILE, 'utf8')) as VectorsFile;
    expect(actual).toEqual(expected);
  });

  it('بردارها همان تله‌هایی را می‌پوشانند که محصول به آنها بند است', () => {
    const byName = Object.fromEntries(compute().vectors.map((v) => [v.spec.name, v]));
    // تلهٔ (الف): ته‌رنگ زرد اسکن رنگی نیست.
    expect(byName.yellow_scan!.color).toBe(false);
    expect(byName.gray_scan!.color).toBe(false);
    // ولی هایلایت واقعی هست — حتی روی کاغذ زرد.
    expect(byName.red_highlight!.color).toBe(true);
    expect(byName.green_marker_on_yellow!.color).toBe(true);
    expect(byName.blank_white!.blank).toBe(true);
  });

  it('DPI از جای واقعی تصویر؛ لوگوی کوچک هشدار کیفیت نمی‌سازد', () => {
    const dpi = Object.fromEntries(compute().dpi.map((v) => [v.name, v.dpi]));
    expect(dpi.full_page_scan_300).toBe(300);
    expect(dpi.full_page_scan_150).toBe(150);
    expect(dpi.logo_on_text_page).toBeNull();
    expect(dpi.half_page_low_res_photo).toBe(48);
    expect(dpi.rotated_phone_photo).toBe(363);
    expect(dpi.largest_area_wins).toBe(73);
    expect(dpi.just_below_coverage).toBeNull();
    expect(dpi.just_above_coverage).toBe(226);
    expect(dpi.text_page_no_images).toBeNull();
    expect(dpi.degenerate_matrix).toBeNull();
  });
});
