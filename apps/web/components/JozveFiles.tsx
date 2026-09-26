'use client';

import { useRef, type ReactNode } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatNumber } from '@jozveyar/text';
import type { JozveView, SectionView } from '../lib/jozveView';
import { AddFiles } from './AddFiles';
import { CardHead, DoneBadge, FileInfo, FileName, Names, Note, WaitingNote, Warnings, uploadLine } from './AnalysisCard';
import { ACCEPT } from './DropZone';
import { Inline } from './Inline';

interface Props {
  view: JozveView;
  /** فایل‌هایی که از سقف جزوه بیشتر بودند و اضافه نشدند. */
  overflow: readonly string[];
  onAdd: (files: File[]) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
  onReplace: (key: string, file: File) => void;
  onReset: () => void;
}

/**
 * جزوهٔ چندفایلی در کارت «جزوهٔ تو»: فایل‌ها به ترتیب صحافی، هر کدام با وضع و هشدارهای خودش
 * (ADR-030).
 *
 * هشدار زیر همان فایل می‌آید و شمارهٔ صفحهٔ **خود آن فایل** را می‌گوید: کاربر فایل خودش
 * را باز می‌کند و «صفحهٔ 3» را پیدا می‌کند؛ «صفحهٔ 51 جزوه» را در هیچ فایلی نمی‌بیند.
 */
export function JozveFiles({ view, overflow, onAdd, onMove, onRemove, onReplace, onReset }: Props) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const count = view.sections.length;

  const askReplace = (key: string) => {
    replaceTarget.current = key;
    replaceInput.current?.click();
  };

  return (
    <section data-testid="jozve" className="jy-card" aria-labelledby="jozve-title">
      <CardHead files={count} pages={view.pageCount} />
      <p className="mt-1 text-small text-muted">به همین ترتیب، پشت‌سرهم در یک جزوه صحافی می‌شوند.</p>

      {/* جزوهٔ برگشته بعد از رفرش (۳د): چرا و چه کنی، یک بار برای همه؛ هر ردیف فقط دکمهٔ خودش را دارد */}
      {view.waiting.length > 0 ? (
        <div className="mt-3">
          <WaitingNote names={view.waiting.map((s) => s.name)} />
        </div>
      ) : null}

      <ol className="mt-3">
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

      {/* یک نشان برای کل جزوه: همهٔ فایل‌ها قطعی، هیچ‌کدام برآوردی یا خوانده‌نشده. */}
      {!view.provisional && view.blocked.length === 0 && !view.summary.estimated ? <DoneBadge className="mt-3" /> : null}

      {overflow.length > 0 ? (
        <div className="mt-4">
          <Note tone="warning" testId="jozve-overflow">
            جزوه بیش از <span className="num">{formatNumber(MAX_SECTIONS_PER_ITEM)}</span> فایل نمی‌گیرد؛ این‌ها اضافه
            نشدند: <Names names={overflow} />. چند فایل را از برنامهٔ خودشان یک PDF کن و همان را بینداز.
          </Note>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <AddFiles onFiles={onAdd} room={MAX_SECTIONS_PER_ITEM - count} label="افزودن فایل" className="min-w-0 flex-1" />
        <button type="button" onClick={onReset} className="jy-btn jy-btn--text shrink-0">
          از اول
        </button>
      </div>

      <input
        ref={replaceInput}
        id="jozve-replace"
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
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
  const { key, name, blocked, waiting, summary, state } = section;
  const program = section.kind === 'slides' ? 'پاورپوینت' : 'Word';
  const upload = blocked || waiting ? null : uploadLine(section.upload);
  const now = sectionState(section);

  return (
    <li data-testid="section" className="border-t border-green-100 py-3 first:border-t-0 first:pt-1">
      <div className="flex items-start gap-3">
        <span className="num w-6 shrink-0 text-center font-semibold text-muted">{formatNumber(index + 1)}</span>
        <div className="min-w-0 flex-1">
          <FileName name={name} testId="section-name" />
          <div data-testid="section-status" className="text-small text-muted">
            <p data-testid="file-info">
              <FileInfo pages={section.pageCount} sizes={summary.pageSizes} size={section.size} />
            </p>
            {now ? <p>{now}</p> : null}
          </div>
          {upload ? (
            <p data-testid="section-upload" className="text-small text-muted">
              {upload}
            </p>
          ) : null}
        </div>
        <div className="-me-2.5 -mt-2 flex shrink-0">
          <RowButton label={`«${name}» یکی بالاتر`} disabled={index === 0} onClick={() => onMove(key, -1)}>
            <span className="jy-icon jy-icon-arrow jy-icon--up" aria-hidden="true" />
          </RowButton>
          <RowButton label={`«${name}» یکی پایین‌تر`} disabled={last} onClick={() => onMove(key, 1)}>
            <span className="jy-icon jy-icon-arrow jy-icon--down" aria-hidden="true" />
          </RowButton>
          <RowButton label={`«${name}» را از جزوه بردار`} onClick={() => onRemove(key)}>
            <span className="jy-icon jy-icon-close" aria-hidden="true" />
          </RowButton>
        </div>
      </div>

      <div className="ms-9 mt-3 flex flex-col gap-2 empty:hidden">
        {blocked ? (
          <Note tone="error" testId="section-blocked">
            <p className="font-semibold">
              <Inline text={blocked.title} />
            </p>
            <p className="mt-1">
              <Inline text={blocked.hint} />
            </p>
            <p className="mt-1">تا تکلیف این فایل روشن نشود، قیمت بدون آن است.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => onReplace(key)} className="jy-btn jy-btn--primary">
                جایگزین کن
              </button>
              <button type="button" onClick={() => onRemove(key)} className="jy-btn jy-btn--secondary">
                حذف از جزوه
              </button>
            </div>
          </Note>
        ) : null}

        {waiting ? (
          <div>
            <button type="button" onClick={() => onReplace(key)} className="jy-btn jy-btn--secondary" data-testid="section-waiting">
              همان فایل را انتخاب کن
            </button>
          </div>
        ) : null}

        {!blocked && section.estimate && !section.serverReady && section.uploadRefused ? (
          <Note tone="warning" testId="section-unconfirmed">
            الان نمی‌توانیم این فایل را بگیریم، پس عددش تقریبی می‌ماند. چند دقیقهٔ دیگر با «جایگزین کن» دوباره
            بگذارش
            {state.estimatedFrom === 'office' ? ` — یا از خود ${program} خروجی PDF بگیر و همان را.` : '.'}
          </Note>
        ) : null}

        {section.correctedFrom ? (
          <Note tone="info" testId="section-corrected">
            بررسی کامل روی سرور <span className="num font-semibold text-ink">{formatNumber(section.pageCount)}</span>{' '}
            صفحه دید ({section.kind === 'word' || section.kind === 'slides' ? `خود فایل ${program}` : 'مرورگر'}{' '}
            <span className="num">{formatNumber(section.correctedFrom)}</span>{' '}
            {section.kind === 'word' || section.kind === 'slides' ? 'نوشته' : 'دیده'} بود).
          </Note>
        ) : null}

        {!blocked && summary.estimated ? (
          <Note tone="info">
            فایل بزرگ است، پس برای سرعت یکی از هر <span className="num">{formatNumber(state.sampleStride)}</span> صفحه
            بررسی شد؛ همهٔ صفحه‌ها بعد از آپلود دقیق بررسی می‌شوند.
          </Note>
        ) : null}

        {blocked || waiting ? null : (
          <Warnings
            summary={summary}
            program={program}
            fontsAdvice={
              <>
                با{' '}
                <button type="button" onClick={() => onReplace(key)} className="jy-link">
                  جایگزین کن
                </button>{' '}
                جای همین بگذار.
              </>
            }
          />
        )}
      </div>
    </li>
  );
}

/**
 * این فایل الان کجای کار است، اگر هنوز قطعی نیست. تعداد صفحه و حجمش در خط اطلاعات بالای همین
 * است؛ اینجا فقط وضع.
 */
function sectionState(section: SectionView): ReactNode {
  const { state, pageCount } = section;
  if (section.blocked) return 'در قیمت نیست';
  if (section.waiting) return 'منتظر همان فایل';
  if (section.serverReady) return null;
  if (section.serverPath) {
    if (section.estimate) {
      if (state.estimatedFrom === 'office') {
        return `تعداد صفحه به گفتهٔ خود فایل ${section.kind === 'slides' ? 'پاورپوینت' : 'Word'}`;
      }
      return 'رنگ و کیفیت بعد از بررسی روی سرور';
    }
    return 'قیمتش بعد از بررسی روی سرور می‌آید';
  }
  switch (state.phase) {
    case 'queued':
      return pageCount > 0 ? 'بررسی رنگ و کیفیت در صف' : 'در صف شمارش';
    case 'reading':
      return pageCount > 0 ? 'در حال بررسی…' : 'در حال باز کردن…';
    case 'analyzing': {
      const target = state.sampleStride > 1 ? Math.ceil(pageCount / state.sampleStride) : pageCount;
      return (
        <>
          در حال بررسی صفحه‌ها{' '}
          <span className="num whitespace-nowrap">
            {formatNumber(state.analyzedCount)} / {formatNumber(target)}
          </span>
        </>
      );
    }
    default:
      return null;
  }
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
      className="jy-btn jy-btn--text jy-btn--icon"
    >
      {children}
    </button>
  );
}
