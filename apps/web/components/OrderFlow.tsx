'use client';

import { useMemo, useState } from 'react';
import type { OrderSpec } from '@jozveyar/contracts';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { FIRST_PRICE_AFTER_PAGES } from '../lib/analysis-protocol';
import { useDocumentAnalysis } from '../lib/useDocumentAnalysis';
import { AnalysisCard } from './AnalysisCard';
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

export function OrderFlow() {
  const { state, analyzeFile, reset, summary } = useDocumentAnalysis();
  const [config, setConfig] = useState<OrderConfig>(INITIAL_CONFIG);

  /**
   * قیمت زنده.
   *
   * به محض معلوم شدن تعداد صفحات حساب می‌شود — لازم نیست تحلیل تمام شود. همان
   * تابعی که سرور صدا می‌زند، پس وقتی سرور عدد قطعی را بدهد، همان عدد است.
   */
  const breakdown = useMemo(() => {
    if (state.pageCount === 0) return null;
    const spec: OrderSpec = {
      items: [
        {
          documentId: 'draft',
          pageCount: state.pageCount,
          rules: wholeDocumentRule(state.pageCount, config.colorMode, config.paperTypeId),
          copies: config.copies,
          sidesMode: config.sidesMode,
          bindingTypeId: config.bindingTypeId,
        },
      ],
      // شهر در مرحلهٔ آدرس گرفته می‌شود؛ تا آن موقع «ارسال از X تومان».
      shipping: null,
    };
    return quote(spec, SEED_PRICE_LIST);
  }, [state.pageCount, config]);

  const hasFile = state.phase !== 'idle';
  const analyzing = state.phase === 'reading' || state.phase === 'analyzing';
  // قیمت به محض هشت صفحهٔ اول نشان داده می‌شود، ولی «موقت» علامت می‌خورد.
  const priceReady =
    breakdown !== null &&
    (state.phase === 'ready' || state.analyzedCount >= FIRST_PRICE_AFTER_PAGES);

  if (!hasFile) {
    return <DropZone onFile={analyzeFile} busy={false} />;
  }

  if (state.phase === 'needs_server') {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-card border border-hairline bg-card p-6">
          <h2 className="font-semibold text-ink">این فایل سمت سرور بررسی می‌شود</h2>
          <p className="mt-2 text-ink-2">
            فایل‌های Word، پاورپوینت و عکس در مرورگر قابل تجزیه نیستند و فایل‌های بزرگ هم روی
            گوشی جا نمی‌شوند. مسیر سرور برایشان در دست ساخت است؛ تا آن موقع می‌توانی یک PDF
            بیندازی و قیمت را فوری ببینی.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-lg bg-sage-button px-6 py-2.5 font-semibold text-ink"
          >
            فایل دیگری بینداز
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'error' && state.error) {
    return (
      <div className="rounded-card border border-hairline bg-card p-6">
        <h2 className="font-semibold text-ink">{state.error.title}</h2>
        <p className="mt-2 text-ink-2">{state.error.hint}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-sage-button px-6 py-2.5 font-semibold text-ink"
        >
          فایل دیگری بینداز
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <AnalysisCard state={state} summary={summary} onReset={reset} />

      {state.pageCount > 0 ? (
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
