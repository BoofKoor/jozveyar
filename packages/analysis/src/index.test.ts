import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, type DetectionThresholds } from '@jozveyar/contracts';
import {
  analyzePixels,
  buildPageAnalysis,
  estimatePaperCast,
  isBlankPage,
  isColorPage,
  isSlidePage,
  paperSizeName,
  reclassify,
  sampleScaleFor,
  sampleStrideFor,
} from './index.js';

type RGB = [number, number, number];

/**
 * ساخت صفحهٔ مصنوعی: یک زمینهٔ کاغذ، به‌علاوهٔ لکه‌های مرکب با نسبت مشخص.
 *
 * پیکسل‌های مرکب پخش می‌شوند (هر n-اُمین پیکسل) نه پشت سر هم، تا شبیه متن باشد
 * و برآورد ته‌رنگ از روشن‌ترین دهک را به‌طور مصنوعی خراب نکند.
 */
function makePage(
  paper: RGB,
  inks: { color: RGB; ratio: number }[],
  size = 200 * 280,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * 4);
  for (let p = 0; p < size; p += 1) {
    buf[p * 4] = paper[0];
    buf[p * 4 + 1] = paper[1];
    buf[p * 4 + 2] = paper[2];
    buf[p * 4 + 3] = 255;
  }
  let cursor = 0;
  for (const ink of inks) {
    const count = Math.round(size * ink.ratio);
    const stride = Math.max(1, Math.floor(size / Math.max(1, count)));
    for (let i = 0; i < count; i += 1) {
      const p = (cursor + i * stride) % size;
      buf[p * 4] = ink.color[0];
      buf[p * 4 + 1] = ink.color[1];
      buf[p * 4 + 2] = ink.color[2];
      buf[p * 4 + 3] = 255;
    }
    cursor += 1;
  }
  return buf;
}

const WHITE: RGB = [255, 255, 255];
const YELLOW_SCAN: RGB = [250, 240, 200]; // اسکن با ته‌رنگ زرد
const GREY_SCAN: RGB = [232, 232, 230]; // اسکن با ته‌رنگ خاکستری
const GRAPHITE: RGB = [45, 45, 48]; // مداد و خودکار مشکی
const HIGHLIGHT_YELLOW: RGB = [255, 232, 60];
const RED_PEN: RGB = [200, 30, 30];

const T = DEFAULT_THRESHOLDS;

describe('estimatePaperCast', () => {
  it('کاغذ سفید را سفید می‌بیند', () => {
    const cast = estimatePaperCast(makePage(WHITE, [{ color: GRAPHITE, ratio: 0.08 }]), 0.1);
    expect(cast[0]).toBeGreaterThan(250);
    expect(cast[2]).toBeGreaterThan(250);
  });

  it('ته‌رنگ زرد اسکن را پیدا می‌کند — کانال آبی ضعیف‌تر است', () => {
    const cast = estimatePaperCast(
      makePage(YELLOW_SCAN, [{ color: GRAPHITE, ratio: 0.08 }]),
      0.1,
    );
    expect(Math.round(cast[0])).toBe(250);
    expect(Math.round(cast[2])).toBe(200);
    expect(cast[0] - cast[2]).toBeGreaterThan(40);
  });

  it('روی تصویر خالی سفید برمی‌گرداند', () => {
    expect(estimatePaperCast(new Uint8ClampedArray(0), 0.1)).toEqual([255, 255, 255]);
  });
});

describe('تلهٔ (الف) — اسکن دست‌نویس با ته‌رنگ نباید رنگی اعلام شود', () => {
  it('کاغذ سفید با خط مشکی: سیاه‌سفید', () => {
    const stats = analyzePixels(makePage(WHITE, [{ color: GRAPHITE, ratio: 0.08 }]), T);
    expect(isColorPage(stats, T)).toBe(false);
  });

  it('اسکن زرد با خط مشکی: سیاه‌سفید — این همان تله است', () => {
    const stats = analyzePixels(makePage(YELLOW_SCAN, [{ color: GRAPHITE, ratio: 0.08 }]), T);
    expect(isColorPage(stats, T)).toBe(false);
    // ته‌رنگ شناسایی شده، ولی بعد از تعادل سفیدی کروما زیر آستانه مانده.
    expect(stats.paperCast[0] - stats.paperCast[2]).toBeGreaterThan(40);
    expect(stats.chromaP95).toBeLessThan(T.chromaMin);
  });

  it('اسکن خاکستری با خط مشکی: سیاه‌سفید', () => {
    const stats = analyzePixels(makePage(GREY_SCAN, [{ color: GRAPHITE, ratio: 0.12 }]), T);
    expect(isColorPage(stats, T)).toBe(false);
  });

  it('بدون تعادل سفیدی، همین صفحه رنگی اعلام می‌شد', () => {
    // آستانهٔ کروما را روی صفر می‌گذاریم تا اثر تعادل سفیدی دیده شود:
    // اگر ته‌رنگ خنثی نشده بود، کروماى خودِ کاغذ ۵۰ واحد بود.
    const raw = YELLOW_SCAN[0] - YELLOW_SCAN[2];
    expect(raw).toBe(50);
    const stats = analyzePixels(makePage(YELLOW_SCAN, [{ color: GRAPHITE, ratio: 0.08 }]), T);
    expect(stats.chromaP95).toBeLessThan(raw);
  });

  it('اثر ده‌برابری قیمت واقعاً حذف می‌شود', () => {
    // ۱۴۷ صفحهٔ اسکن زرد: اگر همه رنگی اعلام شوند قیمت ۲۹۴,۰۰۰ می‌شود
    // به‌جای ۲۳۵,۲۰۰. این تست همان تفاوت را نگه می‌دارد.
    const pages = Array.from({ length: 20 }, () =>
      analyzePixels(makePage(YELLOW_SCAN, [{ color: GRAPHITE, ratio: 0.05 + Math.random() * 0.1 }]), T),
    );
    expect(pages.filter((s) => isColorPage(s, T))).toHaveLength(0);
  });
});

describe('صفحهٔ واقعاً رنگی باید رنگی اعلام شود', () => {
  it('هایلایت زرد روی ۳٪ صفحه: رنگی', () => {
    const stats = analyzePixels(
      makePage(WHITE, [
        { color: GRAPHITE, ratio: 0.08 },
        { color: HIGHLIGHT_YELLOW, ratio: 0.03 },
      ]),
      T,
    );
    expect(isColorPage(stats, T)).toBe(true);
  });

  it('صفحهٔ کم‌مرکب با خط قرمز: رنگی — نقش آستانهٔ دوم', () => {
    // فقط ۰٫۳٪ صفحه مرکب دارد و همه‌اش قرمز است.
    // colorRatio زیر آستانه می‌افتد، ولی coloredInkRatio نجاتش می‌دهد.
    const stats = analyzePixels(makePage(WHITE, [{ color: RED_PEN, ratio: 0.003 }]), T);
    expect(stats.colorRatio).toBeLessThan(T.colorPixelRatioMin);
    expect(stats.coloredInkRatio).toBeGreaterThan(T.coloredInkRatioMin);
    expect(isColorPage(stats, T)).toBe(true);
  });

  it('صفحهٔ تماماً رنگی: رنگی', () => {
    const stats = analyzePixels(makePage([180, 60, 40], [], 200 * 280), T);
    expect(isColorPage(stats, T)).toBe(true);
  });

  it('هایلایت روی اسکن زرد هم رنگی می‌ماند — تعادل سفیدی رنگ واقعی را نمی‌خورد', () => {
    const stats = analyzePixels(
      makePage(YELLOW_SCAN, [
        { color: GRAPHITE, ratio: 0.08 },
        { color: [40, 120, 200], ratio: 0.02 },
      ]),
      T,
    );
    expect(isColorPage(stats, T)).toBe(true);
  });
});

describe('خطای ارزان: لکهٔ رنگی خیلی کوچک بین متن زیاد', () => {
  it('۰٫۲٪ قرمز در میان ۱۰٪ متن مشکی، سیاه‌سفید طبقه‌بندی می‌شود', () => {
    // این عمداً این‌طور است: در حالت ترکیبی، اشتباهِ ارزان بهتر از اشتباهِ گران
    // است — کاربر پول کمتری می‌دهد و یک لکهٔ ریز رنگ را از دست می‌دهد، نه اینکه
    // قیمت کل جزوه‌اش ده برابر شود. آستانه از پنل ادمین قابل سخت‌گیرتر شدن است.
    const stats = analyzePixels(
      makePage(WHITE, [
        { color: GRAPHITE, ratio: 0.1 },
        { color: RED_PEN, ratio: 0.002 },
      ]),
      T,
    );
    expect(isColorPage(stats, T)).toBe(false);
  });

  it('با آستانهٔ سخت‌گیرتر، همان صفحه رنگی می‌شود', () => {
    const strict: DetectionThresholds = {
      ...T,
      colorPixelRatioMin: 0.001,
      coloredInkRatioMin: 0.01,
    };
    const stats = analyzePixels(
      makePage(WHITE, [
        { color: GRAPHITE, ratio: 0.1 },
        { color: RED_PEN, ratio: 0.002 },
      ]),
      T,
    );
    expect(isColorPage(stats, strict)).toBe(true);
  });
});

describe('صفحهٔ خالی', () => {
  it('کاغذ بدون مرکب خالی است و رنگی نیست', () => {
    const stats = analyzePixels(makePage(WHITE, []), T);
    expect(isBlankPage(stats)).toBe(true);
    expect(isColorPage(stats, T)).toBe(false);
  });

  it('صفحهٔ خالی در تحلیل نهایی هشدار می‌گیرد و رنگی نمی‌شود', () => {
    const stats = analyzePixels(makePage(WHITE, []), T);
    const page = buildPageAnalysis(
      { n: 5, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: null, minMarginMm: null },
      stats,
      T,
    );
    expect(page.blank).toBe(true);
    expect(page.color).toBe(false);
    expect(page.warnings).toContain('blank_page');
  });
});

describe('بازطبقه‌بندی بدون فایل', () => {
  it('با آستانهٔ جدید نتیجه عوض می‌شود، بدون داشتن فایل', () => {
    const stats = analyzePixels(
      makePage(WHITE, [
        { color: GRAPHITE, ratio: 0.1 },
        { color: RED_PEN, ratio: 0.002 },
      ]),
      T,
    );
    const page = buildPageAnalysis(
      { n: 1, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: 300, minMarginMm: 15 },
      stats,
      T,
    );
    expect(page.color).toBe(false);
    // همان اعداد خام، آستانهٔ سخت‌گیرتر:
    expect(reclassify(page, { ...T, coloredInkRatioMin: 0.01 })).toBe(true);
  });

  it('صفحهٔ خالی هر آستانه‌ای بگیرد رنگی نمی‌شود', () => {
    const stats = analyzePixels(makePage(WHITE, []), T);
    const page = buildPageAnalysis(
      { n: 1, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: null, minMarginMm: null },
      stats,
      T,
    );
    expect(reclassify(page, { ...T, colorPixelRatioMin: 0, coloredInkRatioMin: 0 })).toBe(false);
  });
});

describe('هشدارهای کیفیت', () => {
  const stats = analyzePixels(makePage(WHITE, [{ color: GRAPHITE, ratio: 0.08 }]), T);

  it('DPI پایین هشدار می‌دهد', () => {
    const page = buildPageAnalysis(
      { n: 1, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: 96, minMarginMm: 20 },
      stats,
      T,
    );
    expect(page.warnings).toContain('low_dpi');
  });

  it('DPI کافی هشدار نمی‌دهد', () => {
    const page = buildPageAnalysis(
      { n: 1, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: 300, minMarginMm: 20 },
      stats,
      T,
    );
    expect(page.warnings).not.toContain('low_dpi');
  });

  it('حاشیهٔ کم هشدار می‌دهد — صحافی متن را می‌برد', () => {
    const page = buildPageAnalysis(
      { n: 1, widthPt: 595, heightPt: 842, rotation: 0, estimatedDpi: 300, minMarginMm: 4 },
      stats,
      T,
    );
    expect(page.warnings).toContain('tight_margin');
  });
});

describe('اندازه و مقیاس', () => {
  it('A4 را می‌شناسد', () => {
    expect(paperSizeName(595, 842)).toBe('A4');
    expect(paperSizeName(842, 595)).toBe('A4'); // افقی
  });

  it('A5 و A3 را می‌شناسد', () => {
    expect(paperSizeName(420, 595)).toBe('A5');
    expect(paperSizeName(842, 1191)).toBe('A3');
  });

  it('اندازهٔ ناشناس را با ابعاد گزارش می‌کند', () => {
    expect(paperSizeName(300, 500)).toBe('300×500pt');
  });

  it('اندازهٔ کمی خارج از استاندارد را هم A4 می‌شمارد', () => {
    expect(paperSizeName(596, 843)).toBe('A4');
  });

  it('اسلاید را از شکل صفحه می‌شناسد، نه کاغذ افقی را', () => {
    // پاورپوینت ۱۶:۹ و ۴:۳، Google Slides، LibreOffice (۲۸×۱۵٫۷۵ سانتی‌متر)، Beamer ۱۶:۱۰.
    for (const [w, h] of [[960, 540], [720, 540], [720, 405], [793.7, 446.5], [453.5, 283.5]] as const) {
      expect(isSlidePage(w, h)).toBe(true);
    }
    expect(isSlidePage(842, 595)).toBe(false); // A4 افقی: سند است
    expect(isSlidePage(792, 612)).toBe(false); // Letter افقی، نزدیک ۴:۳
    expect(isSlidePage(540, 960)).toBe(false); // عمودی
    expect(isSlidePage(595, 842)).toBe(false);
    expect(isSlidePage(0, 0)).toBe(false);
  });

  it('مقیاس نمونه بزرگ‌ترین بُعد را به سقف می‌رساند', () => {
    expect(sampleScaleFor(595, 842, 400)).toBeCloseTo(400 / 842, 5);
    expect(sampleScaleFor(842, 595, 400)).toBeCloseTo(400 / 842, 5);
  });

  it('صفحهٔ کوچک‌تر از سقف بزرگ‌نمایی نمی‌شود', () => {
    expect(sampleScaleFor(200, 300, 400)).toBe(1);
  });
});

describe('گام نمونه‌برداری', () => {
  it('سند کوچک کامل تحلیل می‌شود', () => {
    expect(sampleStrideFor(150, 200)).toBe(1);
  });

  it('سند بزرگ نمونه‌برداری می‌شود', () => {
    expect(sampleStrideFor(1500, 200)).toBe(8);
    expect(sampleStrideFor(400, 200)).toBe(2);
  });
});
