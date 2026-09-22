/// <reference lib="webworker" />

/**
 * کارگر تحلیل فایل — قلب تز محصول.
 *
 * فایل PDF را در مرورگر می‌خواند، هر صفحه را با DPI پایین رندر می‌کند، و آمار
 * رنگ و کیفیت را درمی‌آورد. نتیجه صفحه‌به‌صفحه پیام می‌شود تا صفحه بتواند
 * اولین قیمت را زیر دو ثانیه نشان بدهد و بقیه را در پس‌زمینه کامل کند.
 *
 * چرا کارگر جدا: pdf.js تجزیهٔ PDF را در کارگر خودش انجام می‌دهد، ولی رندر و
 * پیمایش پیکسل سنگین است. اگر روی رشتهٔ اصلی باشد، رابط کاربری روی گوشی ضعیف
 * قطع‌قطع می‌شود — همان چیزی که باید از آن پرهیز کنیم.
 */

import * as pdfjs from 'pdfjs-dist';
import {
  analyzePixels,
  buildPageAnalysis,
  estimatePaperCast,
  paperSizeName,
  ptToMm,
  sampleScaleFor,
  sampleStrideFor,
  type PageMeasurement,
} from '@jozveyar/analysis';
import type { DocumentAnalysis, PageAnalysis } from '@jozveyar/contracts';
import type { AnalyzeRequest, AnalysisErrorCode, WorkerResponse } from './analysis-protocol';

// pdf.js کارگر خودش را برای تجزیه بالا می‌آورد. کارگر تودرتو در همهٔ مرورگرهای
// هدف پشتیبانی می‌شود؛ اگر جایی نشود، pdf.js خودکار به حالت same-thread می‌افتد.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const post = (message: WorkerResponse) => self.postMessage(message);

/**
 * بوم کمکی pdf.js روی OffscreenCanvas.
 *
 * pdf.js برای کشیدن تصویر (یعنی هر صفحهٔ اسکن‌شده) یک بوم موقت می‌سازد، و
 * کارخانهٔ پیش‌فرضش `document.createElement('canvas')` است. این کد در کارگر
 * اجرا می‌شود و کارگر `document` ندارد — پس **هر اسکن واقعی** با «تحلیل در
 * مرورگر کامل نشد» می‌افتاد. نمونه‌های تست فقط مستطیل برداری داشتند و هیچ‌وقت
 * به این مسیر نمی‌رسیدند؛ `image-scan-6.pdf` حالا می‌رسد.
 */
class OffscreenCanvasFactory {
  constructor(_options?: unknown) {}

  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }

  reset(target: { canvas: OffscreenCanvas | null }, width: number, height: number) {
    if (!target.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (!target.canvas) throw new Error('Canvas is not specified');
    // صفر کردن اندازه حافظهٔ بیت‌مپ را همان لحظه آزاد می‌کند — روی گوشی مهم است.
    target.canvas.width = 0;
    target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}

/** خطای pdf.js را به کدی که پیام فارسی دارد نگاشت می‌کند. */
function classifyError(error: unknown): AnalysisErrorCode {
  const name = (error as { name?: string })?.name ?? '';
  const message = String((error as { message?: string })?.message ?? error ?? '');
  if (name === 'PasswordException' || /password/i.test(message)) return 'password_protected';
  if (name === 'InvalidPDFException' || /invalid|corrupt|structure/i.test(message)) {
    return 'corrupt_file';
  }
  return 'unknown';
}

/**
 * جعبهٔ محتوا و کوچک‌ترین حاشیه.
 *
 * از روی همان بیت‌مپ نمونه حساب می‌شود، نه از API پی‌دی‌اف: هر پیکسلی که به
 * اندازهٔ کافی از رنگ کاغذ فاصله دارد «محتوا» است. این روش روی اسکن هم کار
 * می‌کند، جایی که ساختار PDF چیزی جز یک تصویر بزرگ ندارد.
 */
function measureMinMargin(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paperCast: readonly [number, number, number],
  pageWidthPt: number,
  pageHeightPt: number,
): number | null {
  if (width === 0 || height === 0) return null;

  const tolerance = 28;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs(rgba[i]! - paperCast[0]) +
        Math.abs(rgba[i + 1]! - paperCast[1]) +
        Math.abs(rgba[i + 2]! - paperCast[2]);
      if (delta > tolerance) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // صفحهٔ خالی — حاشیه معنا ندارد

  const marginLeftPt = (minX / width) * pageWidthPt;
  const marginRightPt = ((width - 1 - maxX) / width) * pageWidthPt;
  const marginTopPt = (minY / height) * pageHeightPt;
  const marginBottomPt = ((height - 1 - maxY) / height) * pageHeightPt;

  return ptToMm(Math.min(marginLeftPt, marginRightPt, marginTopPt, marginBottomPt));
}

/**
 * برآورد DPI بزرگ‌ترین تصویر صفحه.
 *
 * فقط برای هشدار کیفیت است، نه برای قیمت — پس اگر درنیامد `null` برمی‌گردد و
 * هیچ‌چیز نمی‌شکند. pdf.js شکل داخلی اشیای تصویر را بین نسخه‌ها عوض می‌کند،
 * به همین دلیل کل کار داخل try نشسته.
 */
async function estimateDpi(
  page: pdfjs.PDFPageProxy,
  pageWidthPt: number,
  pageHeightPt: number,
): Promise<number | null> {
  try {
    const opList = await page.getOperatorList();
    let bestPixels = 0;
    let bestWidth = 0;
    let bestHeight = 0;

    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i];
      if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintInlineImageXObject) {
        continue;
      }
      const args = opList.argsArray[i] as unknown[];
      let image: { width?: number; height?: number } | null = null;

      if (typeof args[0] === 'string') {
        // تصویر نام‌دار: در objs یا commonObjs صفحه نشسته.
        const name = args[0];
        image =
          (tryGet(page.objs, name) as { width?: number; height?: number } | null) ??
          (tryGet(page.commonObjs, name) as { width?: number; height?: number } | null);
      } else if (args[0] && typeof args[0] === 'object') {
        image = args[0] as { width?: number; height?: number };
      }

      const w = image?.width ?? 0;
      const h = image?.height ?? 0;
      if (w * h > bestPixels) {
        bestPixels = w * h;
        bestWidth = w;
        bestHeight = h;
      }
    }

    if (bestPixels === 0) return null; // صفحهٔ متنی — DPI معنا ندارد

    // پوینت ۱/۷۲ اینچ است، پس پیکسل بر اینچ = پیکسل / (پوینت / ۷۲).
    const dpiX = bestWidth / (pageWidthPt / 72);
    const dpiY = bestHeight / (pageHeightPt / 72);
    const dpi = Math.min(dpiX, dpiY);
    return Number.isFinite(dpi) && dpi > 0 ? Math.round(dpi) : null;
  } catch {
    return null;
  }
}

function tryGet(store: { get(name: string): unknown } | undefined, name: string): unknown {
  try {
    return store?.get(name) ?? null;
  } catch {
    return null; // هنوز حل نشده — برای هشدار کیفیت مهم نیست
  }
}

async function analyze(request: AnalyzeRequest): Promise<void> {
  const startedAt = Date.now();
  const { thresholds } = request;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(request.buffer),
    // فایل لوکال است؛ واکشی تدریجی معنا ندارد و فقط سرباره اضافه می‌کند.
    disableAutoFetch: true,
    disableStream: true,
    // قلم‌های استاندارد را لوکال نداریم و برای تحلیل رنگ لازم نیست.
    useSystemFonts: false,
    CanvasFactory: OffscreenCanvasFactory,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise;

  const pageCount = doc.numPages;
  if (pageCount === 0) {
    post({ kind: 'error', code: 'no_pages', message: 'سند صفحه‌ای ندارد' });
    return;
  }

  const sampleStride = sampleStrideFor(pageCount, request.maxPagesToAnalyze);
  post({ kind: 'meta', pageCount, sampleStride });

  const pages: PageAnalysis[] = [];
  const sizeCounts: Record<string, number> = {};
  let analyzedCount = 0;
  let renderFailures = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += sampleStride) {
    let page: pdfjs.PDFPageProxy | null = null;
    try {
      page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const widthPt = unscaled.width;
      const heightPt = unscaled.height;

      sizeCounts[paperSizeName(widthPt, heightPt)] =
        (sizeCounts[paperSizeName(widthPt, heightPt)] ?? 0) + 1;

      const scale = sampleScaleFor(widthPt, heightPt, thresholds.sampleMaxDimension);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));

      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('OffscreenCanvas 2d context unavailable');

      // زمینهٔ سفید لازم است: PDF پس‌زمینهٔ شفاف دارد و بدون این، پیکسل‌های
      // کاغذ آلفا صفر می‌شوند و برآورد ته‌رنگ بی‌معنا می‌شود.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const { data } = context.getImageData(0, 0, width, height);
      const stats = analyzePixels(data, thresholds);
      const paperCast = stats.paperCast ?? estimatePaperCast(data, thresholds.paperSampleRatio);

      const measurement: PageMeasurement = {
        n: pageNumber,
        widthPt,
        heightPt,
        rotation: unscaled.rotation,
        estimatedDpi: await estimateDpi(page, widthPt, heightPt),
        minMarginMm: measureMinMargin(data, width, height, paperCast, widthPt, heightPt),
      };

      const analysis = buildPageAnalysis(measurement, stats, thresholds);
      pages.push(analysis);
      analyzedCount += 1;
      post({ kind: 'page', page: analysis, analyzedCount });
    } catch (error) {
      renderFailures += 1;
      // یک صفحهٔ خراب کل سند را از دست نمی‌دهد. ولی اگر همه‌شان بشکنند،
      // نتیجه بی‌معناست و باید صادقانه به مسیر سرور بیفتیم.
      if (renderFailures > 3 && renderFailures >= analyzedCount) {
        post({ kind: 'error', code: 'render_failed', message: String(error) });
        return;
      }
    } finally {
      page?.cleanup();
    }
  }

  if (pages.length === 0) {
    post({ kind: 'error', code: 'render_failed', message: 'هیچ صفحه‌ای تحلیل نشد' });
    return;
  }

  const analysis: DocumentAnalysis = {
    engine: `browser-pdfjs-${pdfjs.version}`,
    thresholds,
    pageCount,
    pages,
    sampled: sampleStride > 1,
    sampleStride,
    elapsedMs: Date.now() - startedAt,
  };

  post({ kind: 'done', analysis });
  await doc.destroy();
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  if (event.data?.kind !== 'analyze') return;
  analyze(event.data).catch((error: unknown) => {
    post({ kind: 'error', code: classifyError(error), message: String(error) });
  });
};
