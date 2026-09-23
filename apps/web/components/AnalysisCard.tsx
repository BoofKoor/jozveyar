'use client';

import { formatBytes, formatNumber } from '@jozveyar/text';
import type { FileKind } from '../lib/analysis-protocol';
import type { AnalysisState, AnalysisSummaryView } from '../lib/useDocumentAnalysis';
import type { UploadSnapshot } from '../lib/upload/client';

interface Props {
  state: AnalysisState;
  summary: AnalysisSummaryView;
  upload: UploadSnapshot | null;
  /** سرور تعداد دیگری دید؛ این عددی است که مرورگر (یا خود فایل Word) گفته بود. */
  correctedFrom?: number | null;
  kind?: FileKind | null;
  /** پیش‌فاکتور Word یا عکس که سرور نمی‌تواند تأییدش کند (آپلود پذیرفته نشد). */
  serverUnavailable?: boolean;
  onReset: () => void;
}

/**
 * یک خط آرام دربارهٔ ارسال فایل. در حالت «در دسترس نیست» یا «شکست» هیچ
 * نمی‌گوید: قیمت از تحلیل مرورگر می‌آید و آپلود نباید کاربر را نگران کند.
 */
export function uploadLine(upload: UploadSnapshot | null): string | null {
  if (!upload) return null;
  switch (upload.phase) {
    case 'starting':
    case 'uploading': {
      const percent = upload.totalBytes > 0 ? Math.floor((upload.sentBytes / upload.totalBytes) * 100) : 0;
      return `در حال ارسال فایل · ${percent}%`;
    }
    case 'offline':
      return 'اینترنت قطع شد — با وصل شدن، ارسال از همان‌جا ادامه پیدا می‌کند';
    case 'done':
      switch (upload.analysis?.state) {
        case 'converting':
          return 'فایل رسید · تبدیل به PDF روی سرور…';
        case 'pending':
        case 'running':
          return 'فایل رسید · بررسی کامل صفحات روی سرور…';
        case 'ready':
          return 'فایل رسید · همهٔ صفحات بررسی شد';
        default:
          return 'فایل رسید';
      }
    default:
      return null;
  }
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-2">{label}</span>
      <span data-testid={testId} className="num text-lg font-semibold text-ink">
        {value}
      </span>
      {hint ? <span className="text-xs text-ink-2">{hint}</span> : null}
    </div>
  );
}

export function AnalysisCard({
  state,
  summary,
  upload,
  correctedFrom,
  kind,
  serverUnavailable,
  onReset,
}: Props) {
  const { phase, fileName, fileSize, pageCount, analyzedCount, sampleStride, elapsedMs, estimatedFrom } =
    state;
  const analyzing = phase === 'analyzing' || phase === 'reading';
  const program = kind === 'slides' ? 'پاورپوینت' : 'Word';
  /** عدد قبلی را خود فایل Word یا پاورپوینت گفته بود، نه مرورگر. */
  const fromOffice = kind === 'word' || kind === 'slides';

  // درصد پیشرفت بر اساس صفحاتی که قرار است تحلیل شوند، نه کل صفحات سند.
  const target = sampleStride > 1 ? Math.ceil(pageCount / sampleStride) : pageCount;
  const progress = target > 0 ? Math.min(100, Math.round((analyzedCount / target) * 100)) : 0;

  return (
    <section className="rounded-card border border-hairline bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-ink" title={fileName ?? ''}>
            {fileName}
          </h2>
          <p className="num mt-1 text-sm text-ink-2">
            {formatBytes(fileSize)}
            {uploadLine(upload) ? (
              <span data-testid="upload-status">
                {' · '}
                {uploadLine(upload)}
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-sm text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          فایل دیگری بینداز
        </button>
      </header>

      {analyzing ? (
        <div className="pt-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-2">
              {pageCount > 0 ? 'در حال بررسی صفحات…' : 'در حال باز کردن فایل…'}
            </span>
            <span className="num text-ink-2">
              {pageCount > 0 ? `${formatNumber(analyzedCount)} / ${formatNumber(target)}` : ''}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-sage-deep transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-ink-2">
            قیمت از همان اولین صفحات نشان داده می‌شود و تا آخر بررسی دقیق‌تر می‌شود.
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5 sm:grid-cols-4">
        <Stat
          testId="stat-page-count"
          label="تعداد صفحه"
          value={formatNumber(pageCount)}
        />
        <Stat
          label="اندازه"
          value={summary.pageSizes[0]?.name ?? '—'}
          hint={
            summary.pageSizes.length > 1
              ? `و ${formatNumber(summary.pageSizes.length - 1)} اندازهٔ دیگر`
              : undefined
          }
        />
        <Stat
          testId="stat-color-pages"
          label="صفحات رنگی"
          value={estimatedFrom ? '—' : formatNumber(summary.colorPageCount)}
          hint={estimatedFrom ? 'پس از بررسی' : summary.estimated ? 'برآوردی' : undefined}
        />
        <Stat
          label="زمان بررسی"
          value={elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(1)}s` : '—'}
        />
      </dl>

      {estimatedFrom === 'office' ? (
        <p data-testid="office-estimate" className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          این تعداد را خود فایل {program} نوشته. فایل روی سرور به PDF تبدیل می‌شود و قیمت با
          شمارش دقیق همان به‌روز می‌شود.
        </p>
      ) : null}

      {estimatedFrom === 'image' ? (
        <p className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          هر عکس یک صفحهٔ A4 می‌شود. رنگی بودن و کیفیتش بعد از بررسی روی سرور معلوم می‌شود.
        </p>
      ) : null}

      {serverUnavailable ? (
        <p data-testid="estimate-unconfirmed" className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          الان نمی‌توانیم این فایل را بگیریم، پس این قیمت تقریبی می‌ماند. چند دقیقهٔ دیگر
          دوباره بینداز
          {estimatedFrom === 'office'
            ? ` — یا از خود ${program} خروجی PDF بگیر؛ PDF همین‌جا فوری و دقیق خوانده می‌شود.`
            : '.'}
        </p>
      ) : null}

      {correctedFrom ? (
        <p data-testid="server-corrected" className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          بررسی کامل روی سرور{' '}
          <span className="num font-semibold text-ink">{formatNumber(state.pageCount)}</span> صفحه
          دید ({fromOffice ? `خود فایل ${program}` : 'مرورگر'}{' '}
          <span className="num">{formatNumber(correctedFrom)}</span> {fromOffice ? 'نوشته' : 'دیده'}{' '}
          بود). قیمت با عدد سرور حساب شد.
        </p>
      ) : null}

      {summary.estimated ? (
        <p className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          سند بزرگ است، پس برای سرعت یکی از هر{' '}
          <span className="num">{formatNumber(sampleStride)}</span> صفحه بررسی شد. همهٔ صفحات پس
          از آپلود دقیق بررسی می‌شوند و قیمت نهایی از آن می‌آید.
        </p>
      ) : null}

      {phase === 'ready' && summary.colorPageCount > 0 ? (
        <p className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          <span className="num font-semibold text-ink">
            {formatNumber(summary.colorPageCount)}
          </span>{' '}
          صفحه رنگی تشخیص داده شد. اگر سیاه‌سفید انتخاب کنی، این صفحات هم سیاه‌سفید چاپ می‌شوند.
        </p>
      ) : null}

      {(summary.lowDpiPageCount > 0 ||
        summary.tightMarginPageCount > 0 ||
        summary.blankPageCount > 0) && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4 text-sm text-ink-2">
          {summary.lowDpiPageCount > 0 && (
            <li>
              <span className="num font-semibold text-ink">
                {formatNumber(summary.lowDpiPageCount)}
              </span>{' '}
              صفحه کیفیت اسکن پایینی دارد و چاپش کمی مات درمی‌آید.
            </li>
          )}
          {summary.tightMarginPageCount > 0 && (
            <li>
              <span className="num font-semibold text-ink">
                {formatNumber(summary.tightMarginPageCount)}
              </span>{' '}
              صفحه حاشیهٔ کمی دارد — صحافی ممکن است لبهٔ متن را بگیرد.
            </li>
          )}
          {summary.blankPageCount > 0 && (
            <li>
              <span className="num font-semibold text-ink">
                {formatNumber(summary.blankPageCount)}
              </span>{' '}
              صفحه خالی است و هزینهٔ چاپ می‌گیرد.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
