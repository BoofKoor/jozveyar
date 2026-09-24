'use client';

import { useRef, type ReactNode } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatBytes, formatNumber } from '@jozveyar/text';
import type { JozveView, SectionView } from '../lib/jozve';
import { ACCEPT } from './DropZone';
import { FontNames, PageWarning, Stat, uploadLine } from './AnalysisCard';

interface Props {
  view: JozveView;
  /** فایل‌هایی که از سقف جزوه بیشتر بودند و اضافه نشدند. */
  overflow: readonly string[];
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
  onReplace: (key: string, file: File) => void;
  onReset: () => void;
}

/**
 * جزوهٔ چندفایلی: فایل‌ها به ترتیب صحافی، هر کدام با وضع و هشدارهای خودش (ADR-030).
 *
 * هشدار زیر همان فایل می‌آید و شمارهٔ صفحهٔ **خود آن فایل** را می‌گوید: کاربر فایل خودش
 * را باز می‌کند و «صفحهٔ 3» را پیدا می‌کند؛ «صفحهٔ 51 جزوه» را در هیچ فایلی نمی‌بیند.
 */
export function JozveFiles({ view, overflow, onMove, onRemove, onReplace, onReset }: Props) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const { summary } = view;
  const count = view.sections.length;

  const askReplace = (key: string) => {
    replaceTarget.current = key;
    replaceInput.current?.click();
  };

  return (
    <section data-testid="jozve" className="rounded-card border border-hairline bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">
            جزوهٔ تو · <span className="num">{formatNumber(count)}</span> فایل
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            به همین ترتیب، پشت‌سرهم در یک جزوه صحافی می‌شوند. ترتیب را با ↑ و ↓ عوض کن.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-sm text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          از اول
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5 sm:grid-cols-4">
        <Stat
          testId="stat-page-count"
          label="تعداد صفحه"
          value={formatNumber(view.pageCount)}
          hint={view.pending.length > 0 ? `+ ${formatNumber(view.pending.length)} فایل در راه` : undefined}
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
          value={summary.colorUnknown ? '—' : formatNumber(summary.colorPageCount)}
          hint={
            summary.colorUnknown
              ? 'پس از بررسی'
              : view.provisional
                ? 'تا اینجا'
                : summary.estimated
                  ? 'برآوردی'
                  : undefined
          }
        />
        <Stat testId="stat-file-count" label="فایل‌ها" value={formatNumber(count)} />
      </dl>

      <ol className="mt-5 border-t border-hairline">
        {view.sections.map((section, index) => (
          <SectionRow
            key={section.key}
            section={section}
            index={index}
            last={index === count - 1}
            onMove={onMove}
            onRemove={onRemove}
            onReplace={askReplace}
          />
        ))}
      </ol>

      {overflow.length > 0 ? (
        <p data-testid="jozve-overflow" className="mt-4 rounded-lg bg-chip px-4 py-3 text-sm text-ink-2">
          جزوه بیش از {formatNumber(MAX_SECTIONS_PER_ITEM)} فایل نمی‌گیرد؛ این‌ها اضافه نشدند:{' '}
          <Names names={overflow} />. چند فایل را از برنامهٔ خودشان یک PDF کن و همان را بینداز.
        </p>
      ) : null}

      <input
        ref={replaceInput}
        id="jozve-replace"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          const key = replaceTarget.current;
          replaceTarget.current = null;
          if (file && key) onReplace(key, file);
        }}
      />
    </section>
  );
}

function SectionRow({
  section,
  index,
  last,
  onMove,
  onRemove,
  onReplace,
}: {
  section: SectionView;
  index: number;
  last: boolean;
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
  onReplace: (key: string) => void;
}) {
  const { key, name, blocked, summary, state } = section;
  const program = section.kind === 'slides' ? 'پاورپوینت' : 'Word';
  const upload = blocked ? null : uploadLine(section.upload);
  const replace = (
    <button
      type="button"
      onClick={() => onReplace(key)}
      className="rounded-lg bg-sage-button px-4 py-2 font-semibold text-ink transition-opacity hover:opacity-90"
    >
      جایگزین کن
    </button>
  );

  return (
    <li data-testid="section" className="border-b border-hairline py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 w-6 shrink-0 text-center text-sm text-ink-2">{formatNumber(index + 1)}</span>
        <div className="min-w-0 flex-1">
          <p data-testid="section-name" className="truncate font-semibold text-ink" title={name}>
            <bdi>{name}</bdi>
          </p>
          <p data-testid="section-status" className="num mt-0.5 text-sm text-ink-2">
            {statusLine(section)} · {formatBytes(section.size)}
          </p>
          {upload ? (
            <p data-testid="section-upload" className="num mt-0.5 text-xs text-ink-2">
              {upload}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RowButton label={`«${name}» یکی بالاتر`} disabled={index === 0} onClick={() => onMove(key, -1)}>
            ↑
          </RowButton>
          <RowButton label={`«${name}» یکی پایین‌تر`} disabled={last} onClick={() => onMove(key, 1)}>
            ↓
          </RowButton>
          <RowButton label={`«${name}» را از جزوه بردار`} onClick={() => onRemove(key)}>
            ✕
          </RowButton>
        </div>
      </div>

      <div className="ms-9 flex flex-col gap-2 text-sm text-ink-2 empty:hidden">
        {blocked ? (
          <div data-testid="section-blocked" className="mt-3 rounded-lg bg-chip px-4 py-3">
            <p className="font-semibold text-ink">{blocked.title}</p>
            <p className="mt-1">{blocked.hint}</p>
            <p className="mt-1">تا تکلیف این فایل روشن نشود، قیمت بدون آن است.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {replace}
              <button
                type="button"
                onClick={() => onRemove(key)}
                className="rounded-lg border border-hairline px-4 py-2 font-semibold text-ink transition-colors hover:border-sage-mid"
              >
                حذف از جزوه
              </button>
            </div>
          </div>
        ) : null}

        {!blocked && section.estimate && !section.serverReady && section.uploadRefused ? (
          <Note testId="section-unconfirmed">
            الان نمی‌توانیم این فایل را بگیریم، پس عددش تقریبی می‌ماند. چند دقیقهٔ دیگر با «جایگزین
            کن» دوباره بگذارش
            {state.estimatedFrom === 'office' ? ` — یا از خود ${program} خروجی PDF بگیر و همان را.` : '.'}
          </Note>
        ) : null}

        {section.correctedFrom ? (
          <Note testId="section-corrected">
            بررسی کامل روی سرور <span className="num font-semibold text-ink">{formatNumber(section.pageCount)}</span>{' '}
            صفحه دید ({section.kind === 'word' || section.kind === 'slides' ? `خود فایل ${program}` : 'مرورگر'}{' '}
            <span className="num">{formatNumber(section.correctedFrom)}</span>{' '}
            {section.kind === 'word' || section.kind === 'slides' ? 'نوشته' : 'دیده'} بود).
          </Note>
        ) : null}

        {!blocked && summary.estimated ? (
          <Note>
            فایل بزرگ است، پس برای سرعت یکی از هر <span className="num">{formatNumber(state.sampleStride)}</span>{' '}
            صفحه بررسی شد؛ همهٔ صفحه‌ها بعد از آپلود دقیق بررسی می‌شوند.
          </Note>
        ) : null}

        {!blocked &&
        (summary.mismatchedFonts.length > 0 ||
          summary.lowDpiPageCount > 0 ||
          summary.tightMarginPageCount > 0 ||
          summary.blankPageCount > 0) ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {summary.mismatchedFonts.length > 0 ? (
              <li data-testid="warning-fonts">
                {summary.mismatchedFonts.length === 1 ? 'فونت' : 'فونت‌های'} <FontNames fonts={summary.mismatchedFonts} />{' '}
                روی سرور ما نیست و با فونت مشابه چاپ می‌شود؛ ظاهر و تعداد صفحه ممکن است فرق کند. برای
                چاپ دقیقاً مثل فایل خودت، از {program} خروجی PDF بگیر و با{' '}
                <button type="button" onClick={() => onReplace(key)} className="text-ink underline underline-offset-4">
                  جایگزین کن
                </button>{' '}
                جای همین بگذار.
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
      </div>
    </li>
  );
}

/** یک خط کوتاه: این فایل الان کجای کار است و چند صفحه در قیمت دارد. */
function statusLine(section: SectionView): string {
  const { state, pageCount } = section;
  const pages = `${formatNumber(pageCount)} صفحه`;
  if (section.blocked) return 'در قیمت نیست';
  if (section.serverReady) return pages;
  if (section.serverPath) {
    if (section.estimate) {
      if (state.estimatedFrom === 'office') {
        return `${pages} به گفتهٔ خود فایل ${section.kind === 'slides' ? 'پاورپوینت' : 'Word'}`;
      }
      return `${pages} · رنگ و کیفیت بعد از بررسی روی سرور`;
    }
    return 'قیمتش بعد از بررسی روی سرور می‌آید';
  }
  switch (state.phase) {
    case 'queued':
      return pageCount > 0 ? `${pages} · بررسی رنگ و کیفیت در صف` : 'در صف شمارش';
    case 'reading':
      return pageCount > 0 ? `${pages} · در حال بررسی…` : 'در حال باز کردن…';
    case 'analyzing': {
      const target = state.sampleStride > 1 ? Math.ceil(pageCount / state.sampleStride) : pageCount;
      return `${pages} · در حال بررسی ${formatNumber(state.analyzedCount)} / ${formatNumber(target)}`;
    }
    default:
      return pages;
  }
}

function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p data-testid={testId} className="mt-2 rounded-lg bg-chip px-3 py-2">
      {children}
    </p>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline text-ink transition-colors hover:border-sage-mid disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** «a.pdf»، «b.pdf» و 3 فایل دیگر — نام لاتین جدا، تا جهت متن فارسی به هم نریزد. */
export function Names({ names, max = 3 }: { names: readonly string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  // گیومه بیرون از نام: جهتش مال متن فارسی است، و نام لاتین داخل bdi جدا می‌ماند.
  const parts: ReactNode[] = shown.map((name) => (
    <span key={name} className="font-semibold text-ink">
      «<bdi>{name}</bdi>»
    </span>
  ));
  if (rest > 0) parts.push(`${formatNumber(rest)} فایل دیگر`);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i === 0 ? null : i === parts.length - 1 ? ' و ' : '، '}
          {part}
        </span>
      ))}
    </>
  );
}
