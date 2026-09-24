'use client';

import { Fragment, type ReactNode } from 'react';
import { formatBytes, formatNumber, formatPages } from '@jozveyar/text';
import type { FileKind } from '../lib/analysis-protocol';
import type { AnalysisState, AnalysisSummaryView } from '../lib/fileAnalysis';
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
    // «شروع شد» فقط نوبت صف است (ADR-030)؛ تا سرور آپلود را نپذیرفته، حرفی از ارسال نیست.
    case 'starting':
      return null;
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

export function Stat({
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
      <span className="text-xs text-muted">{label}</span>
      <span data-testid={testId} className="num text-lg font-semibold text-ink">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
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
  const analyzing = phase === 'analyzing' || phase === 'reading' || phase === 'queued';
  const program = kind === 'slides' ? 'پاورپوینت' : 'Word';
  /** عدد قبلی را خود فایل Word یا پاورپوینت گفته بود، نه مرورگر. */
  const fromOffice = kind === 'word' || kind === 'slides';

  // درصد پیشرفت بر اساس صفحاتی که قرار است تحلیل شوند، نه کل صفحات سند.
  const target = sampleStride > 1 ? Math.ceil(pageCount / sampleStride) : pageCount;
  const progress = target > 0 ? Math.min(100, Math.round((analyzedCount / target) * 100)) : 0;

  return (
    <section className="jy-card">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-ink" title={fileName ?? ''}>
            {fileName}
          </h2>
          <p className="num mt-1 text-sm text-muted">
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
          className="jy-btn jy-btn--text shrink-0 text-sm"
        >
          فایل دیگری بینداز
        </button>
      </header>

      {analyzing ? (
        <div className="pt-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">
              {pageCount > 0 ? 'در حال بررسی صفحات…' : 'در حال باز کردن فایل…'}
            </span>
            <span className="num text-muted">
              {pageCount > 0 ? `${formatNumber(analyzedCount)} / ${formatNumber(target)}` : ''}
            </span>
          </div>
          <div
            className="jy-progress mt-2"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="jy-progress__bar" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted">
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
        <p data-testid="office-estimate" className="jy-note mt-4">
          این تعداد را خود فایل {program} نوشته. فایل روی سرور به PDF تبدیل می‌شود و قیمت با
          شمارش دقیق همان به‌روز می‌شود.
        </p>
      ) : null}

      {estimatedFrom === 'image' ? (
        <p className="jy-note mt-4">
          هر عکس یک صفحهٔ A4 می‌شود. رنگی بودن و کیفیتش بعد از بررسی روی سرور معلوم می‌شود.
        </p>
      ) : null}

      {serverUnavailable ? (
        <p data-testid="estimate-unconfirmed" className="jy-note mt-4">
          الان نمی‌توانیم این فایل را بگیریم، پس این قیمت تقریبی می‌ماند. چند دقیقهٔ دیگر
          دوباره بینداز
          {estimatedFrom === 'office'
            ? ` — یا از خود ${program} خروجی PDF بگیر؛ PDF همین‌جا فوری و دقیق خوانده می‌شود.`
            : '.'}
        </p>
      ) : null}

      {correctedFrom ? (
        <p data-testid="server-corrected" className="jy-note mt-4">
          بررسی کامل روی سرور{' '}
          <span className="num font-semibold text-ink">{formatNumber(state.pageCount)}</span> صفحه
          دید ({fromOffice ? `خود فایل ${program}` : 'مرورگر'}{' '}
          <span className="num">{formatNumber(correctedFrom)}</span> {fromOffice ? 'نوشته' : 'دیده'}{' '}
          بود). قیمت با عدد سرور حساب شد.
        </p>
      ) : null}

      {summary.estimated ? (
        <p className="jy-note mt-4">
          سند بزرگ است، پس برای سرعت یکی از هر{' '}
          <span className="num">{formatNumber(sampleStride)}</span> صفحه بررسی شد. همهٔ صفحات پس
          از آپلود دقیق بررسی می‌شوند و قیمت نهایی از آن می‌آید.
        </p>
      ) : null}

      {phase === 'ready' && summary.colorPageCount > 0 ? (
        <p className="jy-note mt-4">
          <span className="num font-semibold text-ink">
            {formatNumber(summary.colorPageCount)}
          </span>{' '}
          صفحه رنگی تشخیص داده شد. اگر سیاه‌سفید انتخاب کنی، این صفحات هم سیاه‌سفید چاپ می‌شوند.
        </p>
      ) : null}

      {summary.mismatchedFonts.length > 0 ||
      summary.lowDpiPageCount > 0 ||
      summary.tightMarginPageCount > 0 ||
      summary.blankPageCount > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm text-muted">
          {summary.mismatchedFonts.length > 0 ? (
            <li data-testid="warning-fonts">
              {summary.mismatchedFonts.length === 1 ? 'فونت' : 'فونت‌های'}{' '}
              <FontNames fonts={summary.mismatchedFonts} /> روی سرور ما نیست و با فونت مشابه
              چاپ می‌شود؛ ظاهر و تعداد صفحه ممکن است فرق کند. برای چاپ دقیقاً مثل فایل خودت، از{' '}
              {program} خروجی PDF بگیر و همان را بینداز.
            </li>
          ) : null}
          <PageWarning
            testId="warning-low-dpi"
            pages={summary.lowDpiPages}
            count={summary.lowDpiPageCount}
            estimated={summary.estimated}
            text="کیفیت اسکن یا عکس پایینی دارد و کمی مات چاپ می‌شود"
          />
          <PageWarning
            testId="warning-tight-margin"
            pages={summary.tightMarginPages}
            count={summary.tightMarginPageCount}
            estimated={summary.estimated}
            text="حاشیهٔ کمی دارد — صحافی ممکن است لبهٔ متن را بگیرد"
          />
          <PageWarning
            testId="warning-blank"
            pages={summary.blankPages}
            count={summary.blankPageCount}
            estimated={summary.estimated}
            text="خالی است و هزینهٔ چاپ می‌گیرد"
          />
        </ul>
      ) : null}
    </section>
  );
}

/**
 * یک هشدار با جایش روی سند (ADR-029): «صفحه‌های 3، 7 و 12 …». سند بزرگ فقط نمونه‌ای
 * بررسی شده، پس عدد برآوردی می‌آید و چند صفحهٔ نمونه با «مثلاً».
 */
export function PageWarning({
  pages,
  count,
  estimated,
  text,
  testId,
}: {
  pages: readonly number[];
  count: number;
  estimated: boolean;
  text: string;
  testId: string;
}) {
  if (count === 0 || pages.length === 0) return null;
  return (
    <li data-testid={testId}>
      <span className="font-semibold text-ink">
        {estimated ? `حدود ${formatNumber(count)} صفحه` : formatPages(pages)}
      </span>{' '}
      {text}
      {estimated ? `، مثلاً ${formatPages(pages.slice(0, 3))}` : ''}.
    </li>
  );
}

const MAX_FONT_NAMES = 3;

/** «B Nazanin، B Titr و 2 فونت دیگر» — نام لاتین جدا، تا جهت متن فارسی را به هم نریزد. */
export function FontNames({ fonts }: { fonts: readonly string[] }) {
  const parts: ReactNode[] = fonts.slice(0, MAX_FONT_NAMES).map((name) => (
    <bdi key={name} className="font-semibold text-ink">
      {name}
    </bdi>
  ));
  if (fonts.length > MAX_FONT_NAMES) {
    parts.push(`${formatNumber(fonts.length - MAX_FONT_NAMES)} فونت دیگر`);
  }
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i === 0 ? null : i === parts.length - 1 ? ' و ' : '، '}
          {part}
        </Fragment>
      ))}
    </>
  );
}
