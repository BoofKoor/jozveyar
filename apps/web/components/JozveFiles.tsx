'use client';

import { memo, type ReactNode } from 'react';
import { formatNumber } from '@jozveyar/text';
import type { JozveView, SectionView } from '../lib/jozveView';
import { AddFiles } from './AddFiles';
import { CardHead, DoneBadge, FileInfo, FileName, Note, WaitingNote, Warnings, jozveTitleId, uploadLine } from './AnalysisCard';
import { RowMenu, type MenuItem } from './DeskParts';
import { Inline } from './Inline';

interface Props {
  /** شمارهٔ جزوه در سفارش، از صفر. */
  index: number;
  /** سفارش بیش از یک جزوه دارد: «جزوهٔ N» با قیمت خودش (سؤال ۲۱۷). */
  multi: boolean;
  view: JozveView;
  /** قیمت همین جزوه، از همان ریز قیمت سفارش؛ null تا وقتی هنوز صفحه‌ای شمرده نشده. */
  priceRials: number | null;
  /** کارهای منوی ردیف هر فایل (`OrderDesk`)، وقتی منویش باز می‌شود؛ پایدار، تا ردیف بی تغییر دوباره رسم نشود. */
  menuOf: (key: string) => MenuItem[];
  /** چند فایل دیگر در سفارش جا دارد. */
  room: number;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  /** فایل‌گزین جایگزین همین فایل (یکی برای کل میز، `OrderDesk`). */
  onPick: (key: string) => void;
  /** «تنظیمات چاپ» همین جزوه، ته کارت؛ تا قیمتی نیست، هیچ. */
  settings: ReactNode;
}

/**
 * کارت یک جزوه با چند فایل، یا هر جزوهٔ سفارش چندجزوه (ADR-030؛ برش ۸٫۲، سؤال‌های ۲۱۷ تا ۲۱۹): فایل‌ها به ترتیب صحافی،
 * هر کدام با وضع و هشدارهای خودش و منوی «جابه‌جایی»؛ «افزودن فایل به همین جزوه»؛ و «تنظیمات چاپ» همین جزوه.
 *
 * هشدار زیر همان فایل می‌آید و شمارهٔ صفحهٔ **خود آن فایل** را می‌گوید: کاربر فایل خودش
 * را باز می‌کند و «صفحهٔ 3» را پیدا می‌کند؛ «صفحهٔ 51 جزوه» را در هیچ فایلی نمی‌بیند.
 */
export function JozveFiles({ index, multi, view, priceRials, menuOf, room, onAdd, onRemove, onPick, settings }: Props) {
  const count = view.sections.length;

  return (
    <section data-testid="jozve" className="jy-card" aria-labelledby={jozveTitleId(index)}>
      <CardHead files={count} pages={view.pageCount} index={index} multi={multi} priceRials={priceRials} />
      {count > 1 ? <p className="mt-1 text-small text-muted">به همین ترتیب، پشت‌سرهم در یک جزوه صحافی می‌شوند.</p> : null}

      {/* جزوهٔ برگشته بعد از رفرش (۳د): چرا و چه کنی، یک بار برای همه؛ هر ردیف فقط دکمهٔ خودش را دارد */}
      {view.waiting.length > 0 ? (
        <div className="mt-3">
          <WaitingNote names={view.waiting.map((s) => s.name)} />
        </div>
      ) : null}

      <ol className="mt-3">
        {view.sections.map((section, i) => (
          <SectionRow key={section.key} section={section} index={i} menuOf={menuOf} onRemove={onRemove} onPick={onPick} />
        ))}
      </ol>

      {/* یک نشان برای کل جزوه: همهٔ فایل‌ها قطعی، هیچ‌کدام برآوردی یا خوانده‌نشده. */}
      {!view.provisional && view.blocked.length === 0 && !view.summary.estimated ? <DoneBadge className="mt-3" /> : null}

      <AddFiles
        id={index === 0 ? 'jozve-add' : `jozve-add-${index + 1}`}
        variant="text"
        onFiles={onAdd}
        room={room}
        label="افزودن فایل به همین جزوه"
        className="home-add--card"
      />
      {settings}
    </section>
  );
}

/**
 * یک ردیف فایل. فقط وقتی دوباره رسم می‌شود که خود فایل، جایش یا کارهای میز عوض شود: نمای هر فایل تا خود فایل عوض نشود همان
 * است (`jozveView`)، پس پیام‌های کارگر تحلیل برای یک فایل ردیف‌های دیگر را از نو نمی‌کشد.
 */
const SectionRow = memo(function SectionRow({
  section,
  index,
  menuOf,
  onRemove,
  onPick,
}: {
  section: SectionView;
  index: number;
  menuOf: (key: string) => MenuItem[];
  onRemove: (key: string) => void;
  onPick: (key: string) => void;
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
          <RowMenu name={name} items={() => menuOf(key)} />
          <button
            type="button"
            aria-label={`«${name}» را از جزوه بردار`}
            title={`«${name}» را از جزوه بردار`}
            onClick={() => onRemove(key)}
            className="jy-btn jy-btn--text jy-btn--icon"
          >
            <span className="jy-icon jy-icon-close" aria-hidden="true" />
          </button>
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
              <button type="button" onClick={() => onPick(key)} className="jy-btn jy-btn--primary">
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
            <button type="button" onClick={() => onPick(key)} className="jy-btn jy-btn--secondary" data-testid="section-waiting">
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
                <button type="button" onClick={() => onPick(key)} className="jy-link">
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
});

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
      return 'رنگ بعد از بررسی روی سرور';
    }
    return 'قیمتش بعد از بررسی روی سرور می‌آید';
  }
  switch (state.phase) {
    case 'queued':
      return pageCount > 0 ? 'بررسی رنگ در صف' : 'در صف شمارش';
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
