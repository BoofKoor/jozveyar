'use client';

import { Fragment, type ReactNode } from 'react';
import { bytesParts, formatNumber, formatPages } from '@jozveyar/text';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import type { AnalysisSummaryView } from '../lib/fileSummary';
import { paperSizeLabel } from '../lib/fileCard';
import type { SectionView } from '../lib/jozveView';
import { serverFailureMessage, uploadRefusalMessage } from '../lib/serverMessages';
import type { UploadSnapshot } from '../lib/upload/client';
import { AddFiles } from './AddFiles';
import { Inline } from './Inline';

/*
 * کارت «جزوهٔ تو» (docs/UI.md): سر کارت با تعداد فایل و صفحه، ردیف فایل با برگهٔ عمومی، نام و یک
 * خط اطلاعات، وضع بررسی زیرش، و یادداشت‌ها با رنگ وضعیت و آیکون. این فایل جزوهٔ تک‌فایلی است، در
 * هر حالتش (بررسی مرورگر، مسیر سرور، شکست)، و تکه‌های مشترک با فهرست جزوه (JozveFiles.tsx).
 *
 * `.num` فقط روی خود عدد: روی متن فارسی جهت را چپ‌به‌راست می‌کند و ترتیب به هم می‌ریزد.
 */

/**
 * یک خط آرام دربارهٔ ارسال فایل. در حالت «در دسترس نیست» یا «شکست» هیچ
 * نمی‌گوید: قیمت از تحلیل مرورگر می‌آید و آپلود نباید کاربر را نگران کند.
 */
export function uploadLine(upload: UploadSnapshot | null): ReactNode {
  if (!upload) return null;
  switch (upload.phase) {
    // «شروع شد» فقط نوبت صف است (ADR-030)؛ تا سرور آپلود را نپذیرفته، حرفی از ارسال نیست.
    case 'starting':
      return null;
    case 'uploading': {
      const percent = upload.totalBytes > 0 ? Math.floor((upload.sentBytes / upload.totalBytes) * 100) : 0;
      return (
        <>
          در حال ارسال فایل · <span className="num">{percent}%</span>
        </>
      );
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

/** «14 کیلوبایت»: عدد در span خودش، واحد بیرون. */
export function Bytes({ size }: { size: number }) {
  const { value, unit } = bytesParts(size);
  return (
    <>
      <span className="num">{value}</span> {unit}
    </>
  );
}

const MAX_SIZES = 3;

/**
 * «A4، A3 و Letter»؛ اندازهٔ بی‌نام به میلی‌متر («170×240 میلی‌متر»). نام لاتین در bdi، تا کنار
 * ویرگول فارسی برعکس دیده نشود.
 */
export function SizeNames({ sizes }: { sizes: readonly { name: string }[] }) {
  const parts: ReactNode[] = sizes.slice(0, MAX_SIZES).map(({ name }) => {
    const label = paperSizeLabel(name);
    return 'mm' in label ? (
      <>
        <span className="num">{label.mm}</span> میلی‌متر
      </>
    ) : (
      <bdi>{label.name}</bdi>
    );
  });
  if (sizes.length > MAX_SIZES) {
    parts.push(
      <>
        <span className="num">{formatNumber(sizes.length - MAX_SIZES)}</span> اندازهٔ دیگر
      </>,
    );
  }
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i === 0 ? null : i === parts.length - 1 ? ' و ' : '، '}
      {part}
    </Fragment>
  ));
}

/**
 * خط اطلاعات فایل: «10 صفحه · A4 · 14 کیلوبایت». هر تکه یک‌جا می‌ماند و خط فقط بعد از «·» می‌شکند؛
 * «·» با فاصلهٔ نشکن به تکهٔ پیش از خودش چسبیده، تا سر خط بعد نیفتد.
 */
export function FileInfo({ pages, sizes, size }: { pages: number; sizes: readonly { name: string }[]; size: number }) {
  const parts: ReactNode[] = [];
  if (pages > 0) {
    parts.push(
      <>
        <span className="num">{formatNumber(pages)}</span> صفحه
      </>,
    );
  }
  if (sizes.length > 0) parts.push(<SizeNames sizes={sizes} />);
  parts.push(<Bytes size={size} />);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i === 0 ? null : ' · '}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}

/** سر کارت: «جزوهٔ تو» و «2 فایل · 26 صفحه». */
export function CardHead({ files, pages }: { files: number; pages: number }) {
  return (
    <div className="jy-card__head">
      {/* برگشت از مسیر خرید به «جزوه و قیمت» فوکوس را اینجا می‌آورد (`OrderDesk`) */}
      <h2 id="jozve-title" className="jy-card__title" tabIndex={-1}>
        جزوهٔ تو
      </h2>
      <p className="jy-card__meta">
        <span className="num">{formatNumber(files)}</span> فایل
        {pages > 0 ? (
          <>
            {' · '}
            <span data-testid="stat-page-count" className="num">
              {formatNumber(pages)}
            </span>{' '}
            صفحه
          </>
        ) : null}
      </p>
    </div>
  );
}

/** برگهٔ عمومی ۴۸×۶۴ طرح ز: فایل ایستا، نه SVG درون JSX، تا به باندل اولیه چیزی اضافه نشود. */
export function PageThumb() {
  return <img src="/img/page.svg" alt="" width={48} height={64} className="shrink-0" />;
}

/**
 * نام فایل، تا دو خط، و نام کامل در title. نام لاتین جهت خودش را می‌گیرد (`dir="auto"`)، تا «…» ته
 * خودش بنشیند؛ پهنای `fit-content` جعبه را، هر جهتی که داشته باشد، به لبهٔ راست ظرف راست‌به‌چپ
 * می‌چسباند (CSS 2.1، ۱۰.۳.۳) و با خط اطلاعات زیرش هم‌تراز می‌ماند.
 */
export function FileName({ name, testId }: { name: string; testId?: string }) {
  return (
    <p
      data-testid={testId}
      dir="auto"
      title={name}
      className="line-clamp-2 w-fit max-w-full font-semibold wrap-anywhere text-ink"
    >
      {name}
    </p>
  );
}

export function DoneBadge({ className = '' }: { className?: string }) {
  return (
    <p className={`jy-badge jy-badge--success ${className}`}>
      <span className="jy-icon jy-icon-success" aria-hidden="true" />
      <span>همهٔ صفحه‌ها بررسی شد</span>
    </p>
  );
}

const NOTE = {
  info: ['jy-note jy-note--info', 'jy-icon jy-icon-info'],
  warning: ['jy-note jy-note--warning', 'jy-icon jy-icon-warning'],
  error: ['jy-note jy-note--error', 'jy-icon jy-icon-error'],
} as const;

/** یادداشت با رنگ وضعیت و آیکون. متن در یک span، وگرنه flex تکه‌های متن و عدد را ستون می‌کند. */
export function Note({
  tone,
  testId,
  children,
}: {
  tone: keyof typeof NOTE;
  testId?: string;
  children: ReactNode;
}) {
  const [note, icon] = NOTE[tone];
  return (
    <div data-testid={testId} className={note}>
      <span className={icon} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** هشدارهای یک فایل (ADR-029): فونت، کیفیت، حاشیه، صفحهٔ خالی. */
export function Warnings({
  summary,
  program,
  fontsAdvice,
}: {
  summary: AnalysisSummaryView;
  program: string;
  /** پایان هشدار فونت: چه کند با PDF‌ای که از Word گرفت. */
  fontsAdvice: ReactNode;
}) {
  if (
    summary.mismatchedFonts.length === 0 &&
    summary.lowDpiPageCount === 0 &&
    summary.tightMarginPageCount === 0 &&
    summary.blankPageCount === 0
  ) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {summary.mismatchedFonts.length > 0 ? (
        <li data-testid="warning-fonts" className="jy-note jy-note--warning">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            {summary.mismatchedFonts.length === 1 ? 'فونت' : 'فونت‌های'} <FontNames fonts={summary.mismatchedFonts} />{' '}
            روی سرور ما نیست و با فونت مشابه چاپ می‌شود؛ ظاهر و تعداد صفحه ممکن است فرق کند. برای چاپ دقیقاً مثل
            فایل خودت، از {program} خروجی PDF بگیر و {fontsAdvice}
          </span>
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
  );
}

/** ✕ ته ردیف فایل: «فایل دیگری بینداز»، فقط آیکون، با نام و راهنما. */
function AnotherFileIcon({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label="فایل دیگری بینداز"
      title="فایل دیگری بینداز"
      className="jy-btn jy-btn--text jy-btn--icon -me-2.5 -mt-2 shrink-0"
    >
      <span className="jy-icon jy-icon-close" aria-hidden="true" />
    </button>
  );
}

/** شکست: تنها راه جلو همین دکمه است، پس با متن؛ در حالت عادی همین کار ✕ ته ردیف است. */
function AnotherFileButton({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" onClick={onReset} className="jy-btn jy-btn--primary mt-4">
      فایل دیگری بینداز
    </button>
  );
}

/** ردیف فایل: برگهٔ عمومی، نام، خط اطلاعات و وضعش، و ✕ وقتی راهی جز آن هم هست. */
function FileRow({
  section,
  pages,
  sizes,
  onReset,
  children,
}: {
  section: SectionView;
  pages: number;
  sizes: readonly { name: string }[];
  onReset?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 flex items-start gap-4">
      <PageThumb />
      <div className="min-w-0 flex-1">
        <FileName name={section.name} />
        <p data-testid="file-info" className="text-small text-muted">
          <FileInfo pages={pages} sizes={sizes} size={section.size} />
        </p>
        {children}
      </div>
      {onReset ? <AnotherFileIcon onReset={onReset} /> : null}
    </div>
  );
}

/** یادداشت خطا: عنوان پررنگ و راه جلو؛ نام لاتین و عدد درونش جدا از متن فارسی. */
function Failure({ title, hint, testId }: { title?: string; hint: string; testId?: string }) {
  return (
    <Note tone="error" testId={testId}>
      {title ? (
        <p className="font-semibold">
          <Inline text={title} />
        </p>
      ) : null}
      <p className={title ? 'mt-1' : undefined}>
        <Inline text={hint} />
      </p>
    </Note>
  );
}

interface Props {
  section: SectionView;
  onAdd: (files: File[]) => void;
  onReset: () => void;
}

/**
 * جزوهٔ تک‌فایلی، هر حالتی که باشد، با زبان کارت «جزوهٔ تو»: همان سر کارت و ردیف فایل.
 *  - مسیر سرور بی‌پیش‌فاکتور (PDF بزرگ، Word قدیمی) تا قیمت سرور بیاید؛ با ✕ و «افزودن فایل».
 *  - شکست سرور یا آپلود رد‌شدهٔ همان مسیر، و فایلی که خوانده نشد (رمز، خراب، نوع ناشناس): یادداشت
 *    خطا و «فایل دیگری بینداز» با متن، چون تنها راه جلوست. پیش‌فاکتوری که سرور نتوانست تأییدش
 *    کند دیگر معنا ندارد.
 *  - بقیه: بررسی مرورگر، یا پیش‌فاکتور مسیر سرور (`AnalysisCard`).
 */
export function SingleFileCard({ section, onAdd, onReset }: Props) {
  const { state, upload, kind, serverPath, serverReady, serverFailed, estimate, uploadRefused } = section;

  if (serverPath && !serverReady && (!estimate || serverFailed)) {
    const failure = serverFailed
      ? serverFailureMessage(upload?.analysis?.failureReason, kind)
      : uploadRefused
        ? { hint: uploadRefusalMessage(upload?.reason) }
        : null;
    return (
      <section data-testid="server-path" className="jy-card" aria-labelledby="jozve-title">
        <CardHead files={1} pages={0} />
        <FileRow section={section} pages={0} sizes={[]} onReset={failure ? undefined : onReset}>
          {failure ? null : (
            <p data-testid="upload-status" className="mt-1 text-small text-muted">
              {uploadLine(upload) ?? 'در حال آماده‌سازی…'}
            </p>
          )}
        </FileRow>
        <div className="mt-4">
          {failure ? (
            <Failure {...failure} />
          ) : (
            <Note tone="info">
              {kind === 'pdf'
                ? 'این فایل را سرور کامل می‌خواند و قیمت را همین‌جا نشان می‌دهد.'
                : 'این فایل روی سرور به PDF تبدیل و کامل خوانده می‌شود؛ قیمت همین‌جا می‌آید.'}
            </Note>
          )}
        </div>
        {failure ? (
          <AnotherFileButton onReset={onReset} />
        ) : (
          <AddFiles onFiles={onAdd} room={MAX_SECTIONS_PER_ITEM - 1} label="افزودن فایل به همین جزوه" className="mt-4" />
        )}
      </section>
    );
  }

  if (state.phase === 'error' && state.error && !serverReady) {
    return (
      <section className="jy-card" aria-labelledby="jozve-title">
        <CardHead files={1} pages={0} />
        <FileRow section={section} pages={0} sizes={[]} />
        <div className="mt-4">
          <Failure title={state.error.title} hint={state.error.hint} testId="file-error" />
        </div>
        <AnotherFileButton onReset={onReset} />
      </section>
    );
  }

  return <AnalysisCard section={section} serverUnavailable={estimate && uploadRefused} onAdd={onAdd} onReset={onReset} />;
}

/** بررسی مرورگر، یا پیش‌فاکتور مسیر سرور: کارت «جزوهٔ تو» با یک ردیف فایل و «افزودن فایل به همین جزوه». */
function AnalysisCard({
  section,
  serverUnavailable,
  onAdd,
  onReset,
}: Props & {
  /** پیش‌فاکتور Word یا عکس که سرور نمی‌تواند تأییدش کند (آپلود پذیرفته نشد). */
  serverUnavailable: boolean;
}) {
  const { state, summary, upload, kind, correctedFrom } = section;
  const { phase, pageCount, analyzedCount, sampleStride, estimatedFrom } = state;
  const analyzing = phase === 'analyzing' || phase === 'reading' || phase === 'queued';
  const program = kind === 'slides' ? 'پاورپوینت' : 'Word';
  /** عدد قبلی را خود فایل Word یا پاورپوینت گفته بود، نه مرورگر. */
  const fromOffice = kind === 'word' || kind === 'slides';
  const sending = uploadLine(upload);

  // درصد پیشرفت بر اساس صفحاتی که قرار است تحلیل شوند، نه کل صفحات سند.
  const target = sampleStride > 1 ? Math.ceil(pageCount / sampleStride) : pageCount;
  const progress = target > 0 ? Math.min(100, Math.round((analyzedCount / target) * 100)) : 0;

  return (
    <section className="jy-card" aria-labelledby="jozve-title">
      <CardHead files={1} pages={pageCount} />

      <FileRow section={section} pages={pageCount} sizes={summary.pageSizes} onReset={onReset}>
        {analyzing ? (
          <div className="mt-2.5">
            <div className="mb-1.5 flex justify-between gap-3 text-small text-muted">
              <span>{pageCount > 0 ? 'در حال بررسی صفحه‌ها…' : 'در حال باز کردن فایل…'}</span>
              {pageCount > 0 ? (
                <span className="num shrink-0 whitespace-nowrap">
                  {formatNumber(analyzedCount)} / {formatNumber(target)}
                </span>
              ) : null}
            </div>
            <div
              className="jy-progress"
              role="progressbar"
              aria-label="بررسی صفحه‌ها"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className="jy-progress__bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-small text-muted">
              قیمت از همان اولین صفحه‌ها نشان داده می‌شود و تا آخر بررسی دقیق‌تر می‌شود.
            </p>
          </div>
        ) : section.settled && !summary.estimated ? (
          <DoneBadge className="mt-2" />
        ) : null}

        {sending ? (
          <p data-testid="upload-status" className="mt-1 text-small text-muted">
            {sending}
          </p>
        ) : null}
      </FileRow>

      <div className="mt-4 flex flex-col gap-2 empty:hidden">
        {estimatedFrom === 'office' ? (
          <Note tone="info" testId="office-estimate">
            این تعداد را خود فایل {program} نوشته. فایل روی سرور به PDF تبدیل می‌شود و قیمت با شمارش دقیق همان
            به‌روز می‌شود.
          </Note>
        ) : null}

        {estimatedFrom === 'image' ? (
          <Note tone="info">
            هر عکس یک صفحهٔ A4 می‌شود. رنگی بودن و کیفیتش بعد از بررسی روی سرور معلوم می‌شود.
          </Note>
        ) : null}

        {serverUnavailable ? (
          <Note tone="warning" testId="estimate-unconfirmed">
            الان نمی‌توانیم این فایل را بگیریم، پس این قیمت تقریبی می‌ماند. چند دقیقهٔ دیگر دوباره بینداز
            {estimatedFrom === 'office'
              ? ` — یا از خود ${program} خروجی PDF بگیر؛ PDF همین‌جا فوری و دقیق خوانده می‌شود.`
              : '.'}
          </Note>
        ) : null}

        {correctedFrom ? (
          <Note tone="info" testId="server-corrected">
            بررسی کامل روی سرور <span className="num font-semibold text-ink">{formatNumber(pageCount)}</span> صفحه
            دید ({fromOffice ? `خود فایل ${program}` : 'مرورگر'} <span className="num">{formatNumber(correctedFrom)}</span>{' '}
            {fromOffice ? 'نوشته' : 'دیده'} بود). قیمت با عدد سرور حساب شد.
          </Note>
        ) : null}

        {summary.estimated ? (
          <Note tone="info">
            سند بزرگ است، پس برای سرعت یکی از هر <span className="num">{formatNumber(sampleStride)}</span> صفحه بررسی
            شد. همهٔ صفحات پس از آپلود دقیق بررسی می‌شوند و قیمت نهایی از آن می‌آید.
          </Note>
        ) : null}

        <Warnings summary={summary} program={program} fontsAdvice="همان را بینداز." />
      </div>

      <AddFiles onFiles={onAdd} room={MAX_SECTIONS_PER_ITEM - 1} label="افزودن فایل به همین جزوه" className="mt-4" />
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
    <li data-testid={testId} className="jy-note jy-note--warning">
      <span className="jy-icon jy-icon-warning" aria-hidden="true" />
      <span>
        <span className="font-semibold">{estimated ? `حدود ${formatNumber(count)} صفحه` : formatPages(pages)}</span>{' '}
        {text}
        {estimated ? `، مثلاً ${formatPages(pages.slice(0, 3))}` : ''}.
      </span>
    </li>
  );
}

const MAX_FONT_NAMES = 3;

/** «B Nazanin، B Titr و 2 فونت دیگر» — نام لاتین جدا، تا جهت متن فارسی را به هم نریزد. */
export function FontNames({ fonts }: { fonts: readonly string[] }) {
  const parts: ReactNode[] = fonts.slice(0, MAX_FONT_NAMES).map((name) => (
    <bdi key={name} className="font-semibold">
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
