'use client';

import { useCallback, useMemo, useState } from 'react';
import type { OrderSpec } from '@jozveyar/contracts';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatBytes } from '@jozveyar/text';
import {
  FIRST_PRICE_AFTER_PAGES,
  serverFailureMessage,
  type AnalysisErrorCode,
} from '../lib/analysis-protocol';
import { useDocumentAnalysis, type AnalysisSummaryView } from '../lib/useDocumentAnalysis';
import { useUpload } from '../lib/useUpload';
import type { ServerAnalysisView } from '../lib/server/uploads';
import { AnalysisCard, uploadLine } from './AnalysisCard';
import { ConfigPanel, type OrderConfig } from './ConfigPanel';
import { DropZone } from './DropZone';
import { PriceBar } from './PriceBar';

const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  paperTypeId: DEFAULT_PAPER_TYPE_ID,
  copies: 1,
};

/** خطاهای مرورگر که یعنی «مرورگر کم آورد»، نه «فایل خراب است». */
const BROWSER_GAVE_UP: AnalysisErrorCode[] = ['render_failed', 'unknown'];

/** تحلیل سرور به همان شکلی که کارت تحلیل نشان می‌دهد. */
function serverSummary(server: ServerAnalysisView): AnalysisSummaryView {
  return {
    pageCount: server.pageCount ?? 0,
    colorPageCount: server.colorPageCount ?? 0,
    blankPageCount: server.blankPageCount ?? 0,
    lowDpiPageCount: server.lowDpiPageCount ?? 0,
    tightMarginPageCount: server.tightMarginPageCount ?? 0,
    pageSizes: server.pageSizes ?? [],
    colorPages: server.colorPages ?? [],
    estimated: false,
  };
}

export function OrderFlow() {
  const { state, analyzeFile, reset, summary: browserSummary } = useDocumentAnalysis();
  const [config, setConfig] = useState<OrderConfig>(INITIAL_CONFIG);
  const [file, setFile] = useState<File | null>(null);

  const isPdf = file !== null && /\.pdf$/i.test(file.name);
  /**
   * مسیر سرور برای PDF: یا برای مرورگر بزرگ بود، یا مرورگر وسط راه کم آورد.
   * قاعدهٔ محصول: «مرورگر کم آورد ← بی‌صدا مسیر سرور». Word و عکس هنوز نه (۲ب).
   */
  const serverPath =
    isPdf &&
    (state.phase === 'needs_server' ||
      (state.phase === 'error' && state.error !== null && BROWSER_GAVE_UP.includes(state.error.code)));

  const browserPriceReady =
    state.pageCount > 0 &&
    (state.phase === 'ready' || state.analyzedCount >= FIRST_PRICE_AFTER_PAGES);

  /**
   * آپلود در پس‌زمینه. در مسیر مرورگر **بعد از نمایش اولین قیمت** — تا با لحظهٔ
   * جادو سر پردازنده و شبکه رقابت نکند؛ در مسیر سرور همان لحظه، چون قیمت
   * بدون آن نمی‌آید.
   */
  const { upload, discard } = useUpload(
    file,
    (browserPriceReady && state.phase !== 'error') || serverPath,
    state.analysis,
  );

  const server = upload?.analysis;
  const serverReady = server?.state === 'ready' && (server.pageCount ?? 0) > 0;

  /**
   * منبع حقیقت: وقتی سرور همهٔ صفحات را دید، عدد او جای عدد مرورگر می‌نشیند —
   * قیمت با همان `quote()` دوباره حساب می‌شود. تا آن موقع قیمت مرورگر
   * پیش‌فاکتور است.
   */
  const pageCount = serverReady ? server!.pageCount! : state.pageCount;
  const summary = serverReady ? serverSummary(server!) : browserSummary;
  /** سرور تعداد دیگری دید — کاربر باید بداند چرا عدد عوض شد. */
  const corrected = serverReady && state.pageCount > 0 && server!.pageCount !== state.pageCount;

  const breakdown = useMemo(() => {
    if (pageCount === 0) return null;
    const spec: OrderSpec = {
      items: [
        {
          documentId: upload?.documentId ?? 'draft',
          pageCount,
          rules: wholeDocumentRule(pageCount, config.colorMode, config.paperTypeId),
          copies: config.copies,
          sidesMode: config.sidesMode,
          bindingTypeId: config.bindingTypeId,
        },
      ],
      // شهر در مرحلهٔ آدرس گرفته می‌شود؛ تا آن موقع «ارسال از X تومان».
      shipping: null,
    };
    return quote(spec, SEED_PRICE_LIST);
  }, [pageCount, config, upload?.documentId]);

  const hasFile = state.phase !== 'idle';
  const analyzing = !serverReady && (state.phase === 'reading' || state.phase === 'analyzing');
  const priceReady = serverReady || (browserPriceReady && !serverPath);

  const takeFile = useCallback(
    (next: File) => {
      discard();
      setFile(next);
      analyzeFile(next);
    },
    [analyzeFile, discard],
  );

  const startOver = useCallback(() => {
    discard();
    setFile(null);
    reset();
  }, [discard, reset]);

  if (!hasFile) {
    return <DropZone onFile={takeFile} busy={false} />;
  }

  const anotherFile = (
    <button
      type="button"
      onClick={startOver}
      className="mt-5 rounded-lg bg-sage-button px-6 py-2.5 font-semibold text-ink"
    >
      فایل دیگری بینداز
    </button>
  );

  // Word، پاورپوینت و عکس — تبدیلشان با LibreOffice در برش ۲ب.
  if (state.phase === 'needs_server' && !serverPath) {
    return (
      <div className="rounded-card border border-hairline bg-card p-6">
        <h2 className="font-semibold text-ink">این فایل سمت سرور بررسی می‌شود</h2>
        <p className="mt-2 text-ink-2">
          فایل‌های Word، پاورپوینت و عکس هنوز در سرور تبدیل نمی‌شوند؛ این در دست ساخت است. تا آن
          موقع اگر همین جزوه را PDF کنی و بیندازی، قیمت را فوری می‌بینی.
        </p>
        {anotherFile}
      </div>
    );
  }

  // مسیر سرور، تا وقتی قیمت سرور نیامده.
  if (serverPath && !serverReady) {
    const unavailable = upload?.phase === 'unavailable' || upload?.phase === 'failed';
    const failed = server?.state === 'failed';
    const message = failed ? serverFailureMessage(server?.failureReason) : null;
    return (
      <div className="rounded-card border border-hairline bg-card p-6" data-testid="server-path">
        <h2 className="truncate font-semibold text-ink" title={file?.name ?? ''}>
          {file?.name}
        </h2>
        <p className="num mt-1 text-sm text-ink-2">{formatBytes(file?.size ?? 0)}</p>
        {message ? (
          <>
            <p className="mt-4 font-semibold text-ink">{message.title}</p>
            <p className="mt-2 text-ink-2">{message.hint}</p>
          </>
        ) : unavailable ? (
          <p className="mt-4 text-ink-2">
            الان نمی‌توانیم این فایل را بگیریم. چند دقیقهٔ دیگر دوباره بینداز؛ یا اگر فایل کوچک‌تری
            از همین جزوه داری، همان را امتحان کن.
          </p>
        ) : (
          <>
            <p className="mt-4 text-ink-2">
              این فایل را سرور کامل می‌خواند و قیمت را همین‌جا نشان می‌دهد.
            </p>
            <p data-testid="upload-status" className="num mt-3 text-sm text-ink">
              {uploadLine(upload) ?? 'در حال آماده‌سازی…'}
            </p>
          </>
        )}
        {message || unavailable ? anotherFile : null}
      </div>
    );
  }

  if (state.phase === 'error' && state.error && !serverReady) {
    return (
      <div className="rounded-card border border-hairline bg-card p-6">
        <h2 className="font-semibold text-ink">{state.error.title}</h2>
        <p className="mt-2 text-ink-2">{state.error.hint}</p>
        {anotherFile}
      </div>
    );
  }

  // کارت تحلیل با عدد سرور وقتی آمده؛ کارت مرورگر دست‌نخورده وقتی نه.
  const shownState = serverReady
    ? { ...state, phase: 'ready' as const, pageCount, analyzedCount: pageCount, sampleStride: 1 }
    : state;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <AnalysisCard
        state={shownState}
        summary={summary}
        upload={upload}
        correctedFrom={corrected ? state.pageCount : null}
        onReset={startOver}
      />

      {pageCount > 0 ? (
        <ConfigPanel
          config={config}
          onChange={setConfig}
          priceList={SEED_PRICE_LIST}
          colorPageCount={summary.colorPageCount}
        />
      ) : null}

      {/*
        یک نمونه، دو رفتار: در موبایل نوار ثابت پایین صفحه، در دسکتاپ داخل جریان.

        `fixed` است نه `sticky`: عنصر sticky فقط داخل مرزهای ظرف خودش می‌چسبد،
        و این نوار آخرین فرزند جریان سفارش است — یعنی وقتی کاربر تا پرسش‌های
        پرتکرار پایین می‌رود، با ظرفش از صفحه بیرون می‌رفت. اصل «قیمت همیشه روی
        صفحه» با sticky شکسته می‌شد.
      */}
      <div aria-hidden className="h-48 sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-page px-4 pb-3 pt-2 sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0">
        <PriceBar
          breakdown={breakdown}
          provisional={analyzing || !priceReady}
          onContinue={() => undefined}
        />
      </div>
    </div>
  );
}
