'use client';

import { useMemo, useState } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { quote } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatBytes } from '@jozveyar/text';
import { serverFailureMessage, uploadRefusalMessage } from '../lib/analysis-protocol';
import { jozveSpec, jozveView, type SectionView } from '../lib/jozve';
import { useJozve } from '../lib/useJozve';
import { AddFiles } from './AddFiles';
import { AnalysisCard, uploadLine } from './AnalysisCard';
import { ConfigPanel, type OrderConfig } from './ConfigPanel';
import { DropZone } from './DropZone';
import { JozveFiles } from './JozveFiles';
import { PriceBar } from './PriceBar';

const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  paperTypeId: DEFAULT_PAPER_TYPE_ID,
  copies: 1,
};

/**
 * فلوی سفارش: یک جزوه از یک یا چند فایل (ADR-030).
 *
 * یک فایل همان کارت همیشگی را می‌گیرد؛ از دو فایل به بعد فهرست جزوه می‌آید. قیمت در هر
 * دو حالت یک قلم است — صفحه‌های همهٔ فایل‌ها جمع و یک صحافی — با همان `quote()`.
 */
export function OrderFlow() {
  const jozve = useJozve();
  const [config, setConfig] = useState<OrderConfig>(INITIAL_CONFIG);
  const view = useMemo(() => jozveView(jozve.sections), [jozve.sections]);

  const breakdown = useMemo(() => {
    const spec = jozveSpec(view, config);
    return spec ? quote(spec, SEED_PRICE_LIST) : null;
  }, [view, config]);

  if (view.sections.length === 0) {
    return <DropZone onFiles={jozve.add} busy={false} />;
  }

  const addFiles = (
    <AddFiles
      onFiles={jozve.add}
      room={MAX_SECTIONS_PER_ITEM - view.sections.length}
      count={view.sections.length}
    />
  );
  const pending = view.pending.filter((s) => s.serverPath).map((s) => s.name);
  const blocked = view.blocked.map((s) => s.name);

  const price = (
    <>
      {view.pageCount > 0 ? (
        <ConfigPanel
          config={config}
          onChange={setConfig}
          priceList={SEED_PRICE_LIST}
          colorPageCount={view.summary.colorPageCount}
          fileCount={view.sections.length}
        />
      ) : null}

      {/*
        یک نمونه، دو رفتار: در موبایل نوار ثابت پایین صفحه، در دسکتاپ داخل جریان.

        `fixed` است نه `sticky`: عنصر sticky فقط داخل مرزهای ظرف خودش می‌چسبد،
        و این نوار آخرین فرزند جریان سفارش است — یعنی وقتی کاربر تا پرسش‌های
        پرتکرار پایین می‌رود، با ظرفش از صفحه بیرون می‌رفت. اصل «قیمت همیشه روی
        صفحه» با sticky شکسته می‌شد.
      */}
      {/* جای نوار قیمت ثابت؛ با یادداشت فایل شمرده‌نشده یا خوانده‌نشده بلندتر است. */}
      <div aria-hidden className={`sm:hidden ${pending.length > 0 || blocked.length > 0 ? 'h-72' : 'h-48'}`} />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-page px-4 pb-3 pt-2 sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0">
        <PriceBar
          breakdown={breakdown}
          provisional={view.provisional}
          pending={pending}
          blocked={blocked}
          onContinue={() => undefined}
        />
      </div>
    </>
  );

  if (view.sections.length === 1) {
    return <SingleFile section={view.sections[0]!} onReset={jozve.reset} addFiles={addFiles} price={price} />;
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <JozveFiles
        view={view}
        overflow={jozve.overflow}
        onMove={jozve.move}
        onRemove={jozve.remove}
        onReplace={jozve.replace}
        onReset={jozve.reset}
      />
      {addFiles}
      {price}
    </div>
  );
}

/**
 * جزوهٔ تک‌فایلی: همان کارت‌هایی که پیش از چند فایل بود، رفتار به رفتار، به‌علاوهٔ «افزودن
 * فایل» زیرش.
 */
function SingleFile({
  section,
  onReset,
  addFiles,
  price,
}: {
  section: SectionView;
  onReset: () => void;
  addFiles: React.ReactNode;
  price: React.ReactNode;
}) {
  const { state, upload, kind, serverPath, serverReady, serverFailed, estimate, uploadRefused } = section;

  const anotherFile = (
    <button
      type="button"
      onClick={onReset}
      className="mt-5 rounded-lg bg-sage-button px-6 py-2.5 font-semibold text-ink"
    >
      فایل دیگری بینداز
    </button>
  );

  // مسیر سرور بی‌پیش‌فاکتور (PDF بزرگ، Word قدیمی)، تا وقتی قیمت سرور نیامده؛ و
  // هر شکست سرور — آنجا پیش‌فاکتور دیگر معنا ندارد.
  if (serverPath && !serverReady && (!estimate || serverFailed)) {
    const message = serverFailed ? serverFailureMessage(upload?.analysis?.failureReason, kind) : null;
    return (
      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="rounded-card border border-hairline bg-card p-6" data-testid="server-path">
          <h2 className="truncate font-semibold text-ink" title={section.name}>
            {section.name}
          </h2>
          <p className="num mt-1 text-sm text-ink-2">{formatBytes(section.size)}</p>
          {message ? (
            <>
              <p className="mt-4 font-semibold text-ink">{message.title}</p>
              <p className="mt-2 text-ink-2">{message.hint}</p>
            </>
          ) : uploadRefused ? (
            <p className="mt-4 text-ink-2">{uploadRefusalMessage(upload?.reason)}</p>
          ) : (
            <>
              <p className="mt-4 text-ink-2">
                {kind === 'pdf'
                  ? 'این فایل را سرور کامل می‌خواند و قیمت را همین‌جا نشان می‌دهد.'
                  : 'این فایل روی سرور به PDF تبدیل و کامل خوانده می‌شود؛ قیمت همین‌جا می‌آید.'}
              </p>
              <p data-testid="upload-status" className="num mt-3 text-sm text-ink">
                {uploadLine(upload) ?? 'در حال آماده‌سازی…'}
              </p>
            </>
          )}
          {message || uploadRefused ? anotherFile : null}
        </div>
        {message || uploadRefused ? null : addFiles}
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

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <AnalysisCard
        state={state}
        summary={section.summary}
        upload={upload}
        correctedFrom={section.correctedFrom}
        kind={kind}
        serverUnavailable={estimate && uploadRefused}
        onReset={onReset}
      />
      {addFiles}
      {price}
    </div>
  );
}
