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
  ANALYSIS_REVISION,
  analyzePixels,
  buildPageAnalysis,
  estimatePaperCast,
  pageDpi,
  paperSizeName,
  ptToMm,
  sampleScaleFor,
  sampleStrideFor,
  type ImagePlacement,
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

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m × n` به قرارداد canvas — همان کاری که `ctx.transform` با ماتریس جاری می‌کند. */
function multiply(m: Matrix, n: readonly number[]): Matrix {
  return [
    m[0] * n[0]! + m[2] * n[1]!,
    m[1] * n[0]! + m[3] * n[1]!,
    m[0] * n[2]! + m[2] * n[3]!,
    m[1] * n[2]! + m[3] * n[3]!,
    m[0] * n[4]! + m[2] * n[5]! + m[4],
    m[1] * n[4]! + m[3] * n[5]! + m[5],
  ];
}

const isMatrix = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 6 && value.every((x) => typeof x === 'number');

/**
 * هر بار کشیده شدن یک تصویر روی صفحه، با ماتریسی که آن لحظه جاری بوده.
 *
 * pdf.js تصویر را در مربع واحد می‌کشد و ماتریس جاری آن را روی صفحه می‌نشاند؛ همان
 * ماتریسی که PyMuPDF در سرور می‌دهد. پس فهرست عملگرها با پشتهٔ ماتریس دنبال می‌شود،
 * درست مثل رندر خود pdf.js: `save`/`restore`، `transform`، ماتریس Form XObject، و جای
 * ظاهر حاشیه‌نویسی (مهر، امضا).
 * ماتریس گروه شفافیت فقط برای مرز گروه است و آن را همان `paintFormXObjectBegin`
 * بعدی اعمال می‌کند؛ اینجا دو بار حساب نمی‌شود.
 */
type OperatorList = Awaited<ReturnType<pdfjs.PDFPageProxy['getOperatorList']>>;

function collectPlacements(page: pdfjs.PDFPageProxy, opList: OperatorList): ImagePlacement[] {
  const OPS = pdfjs.OPS;
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const placements: ImagePlacement[] = [];
  const push = (widthPx: unknown, heightPx: unknown, matrix: Matrix) => {
    const w = Number(widthPx);
    const h = Number(heightPx);
    if (w > 0 && h > 0) placements.push({ widthPx: w, heightPx: h, matrix });
  };
  const dimensions = (name: unknown) => {
    if (typeof name !== 'string') return null;
    const image = tryGet(page.objs, name) ?? tryGet(page.commonObjs, name);
    return image as { width?: number; height?: number } | null;
  };

  for (let i = 0; i < opList.fnArray.length; i += 1) {
    const args = (opList.argsArray[i] ?? []) as unknown[];
    switch (opList.fnArray[i]) {
      case OPS.save:
      case OPS.beginGroup:
        stack.push(ctm);
        break;
      case OPS.restore:
      case OPS.endGroup:
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case OPS.transform:
        if (isMatrix(args)) ctm = multiply(ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (isMatrix(args[0])) ctm = multiply(ctm, args[0]);
        break;
      case OPS.beginAnnotation:
        // [id، مستطیل، جای جعبه روی مستطیل، ماتریس خود ظاهر، …]: pdf.js حالت را به
        // آغاز صفحه برمی‌گرداند و ظاهر را با این دو روی صفحه می‌نشاند. سرور هم
        // تصویر مهر و امضا را با همین جا می‌بیند.
        stack.length = 0;
        ctm = IDENTITY;
        if (isMatrix(args[2])) ctm = multiply(ctm, args[2]);
        if (isMatrix(args[3])) ctm = multiply(ctm, args[3]);
        break;
      case OPS.paintImageXObject: {
        // [objId, پهنا، بلندی] — پیکسل‌ها در خود آرگومان‌اند؛ شیء فقط اگر نبودند.
        const image = args[1] === undefined ? dimensions(args[0]) : null;
        push(args[1] ?? image?.width, args[2] ?? image?.height, ctm);
        break;
      }
      case OPS.paintInlineImageXObject: {
        const image = args[0] as { width?: number; height?: number } | undefined;
        push(image?.width, image?.height, ctm);
        break;
      }
      case OPS.paintImageXObjectRepeat: {
        // یک تصویر، چند بار: [objId، مقیاس x، مقیاس y، جای هر بار]
        const image = dimensions(args[0]);
        const positions = args[3] as ArrayLike<number> | undefined;
        for (let k = 0; positions && k + 1 < positions.length; k += 2) {
          const tile = [Number(args[1]), 0, 0, Number(args[2]), positions[k]!, positions[k + 1]!];
          push(image?.width, image?.height, multiply(ctm, tile));
        }
        break;
      }
      default:
        break;
    }
  }
  return placements;
}

/**
 * DPI صفحه برای هشدار کیفیت، از جای واقعی تصویرها (`pageDpi`، مشترک با سرور).
 *
 * فقط برای هشدار است، نه برای قیمت — پس اگر درنیامد `null` برمی‌گردد و هیچ‌چیز
 * نمی‌شکند. pdf.js شکل داخلی عملگرها را بین نسخه‌ها عوض می‌کند، به همین دلیل کل کار
 * داخل try نشسته.
 */
async function estimateDpi(
  page: pdfjs.PDFPageProxy,
  pageWidthPt: number,
  pageHeightPt: number,
): Promise<number | null> {
  try {
    const opList = await page.getOperatorList();
    return pageDpi(collectPlacements(page, opList), pageWidthPt, pageHeightPt);
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
    engine: `browser-pdfjs-${pdfjs.version}-r${ANALYSIS_REVISION}`,
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
