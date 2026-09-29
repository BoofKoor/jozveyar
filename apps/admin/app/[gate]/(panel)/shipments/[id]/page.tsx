import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { AutoRefresh } from '../../../../../components/AutoRefresh';
import { ImportBadge } from '../../../../../components/ImportBadge';
import { ImportRows } from '../../../../../components/ImportRows';
import { NoAccess } from '../../../../../components/NoAccess';
import { Segments } from '../../../../../components/Segments';
import { StatusButton } from '../../../../../components/StatusButton';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import type { Seg } from '../../../../../lib/orders';
import {
  COLUMN_NAMES,
  ROW_GROUPS,
  committedRows,
  committedTotals,
  countsOf,
  missingText,
  numbersText,
  postDaysText,
  previewRows,
  totalsText,
  unreadableText,
  type ImportRowView,
  type RowCounts,
} from '../../../../../lib/shipments';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import type { ImportPageView } from '../../../../../lib/server/shipments';
import { commitImportAction, discardImportAction } from '../../../actions';

export const metadata: Metadata = { title: 'فایل پست' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** خطاهایی که کارهای همین صفحه با برگشت به آن می‌گویند (`?e=`). */
const PAGE_ERRORS = new Set(['import_changed', 'import_closed', 'import_not_committed', 'import_not_found', 'forbidden']);

/** «سارا، امروز 11:05»؛ ورود چاپخانه «حسن، چاپ نور، …». */
const whoWhen = (view: ImportPageView) =>
  `${view.import.createdByName}${view.import.partner ? `، ${view.import.partner.name}` : ''}، ${whenText(view.import.createdAt, view.now)}`;

/** «امروز 11:05 · 16 کیلوبایت». */
function FileLine({ view, badge }: { view: ImportPageView; badge?: React.ReactNode }) {
  const kb = Math.max(1, Math.round(view.import.sizeBytes / 1024));
  return (
    <p className="ad-fileline">
      <span className="jy-icon jy-icon-file" aria-hidden="true" />
      <bdi className="ad-fileline__name">{view.import.filename}</bdi>
      <span className="ad-meta">
        <span className="num">{formatNumber(kb)}</span> کیلوبایت
      </span>
      {badge}
    </p>
  );
}

function AnotherFile({ gate }: { gate: string }) {
  return (
    <div className="ad-actions">
      <Link href={panelPath(gate, '/shipments')} className="jy-btn jy-btn--secondary">
        <span className="jy-icon jy-icon-upload" aria-hidden="true" />
        فایل دیگری بده
      </Link>
    </div>
  );
}

/**
 * کاشی‌های شمار (طرح): قطعی، صف تأیید، پیدا نشد و تکراری همیشه؛ خوانده نشد و غیرفعال فقط اگر هست. چاپخانه (۶٫۲) صف را «بررسی
 * جزوه‌یار» می‌بیند.
 */
function CountTiles({ counts, committed, partner }: { counts: RowCounts; committed: boolean; partner: boolean }) {
  const tiles: { id: string; n: number; badge: React.ReactNode; text: string; show: boolean }[] = [
    {
      id: 'ok',
      n: counts.matched,
      badge: (
        <span className="jy-badge jy-badge--success">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          قطعی
        </span>
      ),
      text: committed ? 'کد رهگیری نشست' : 'کد رهگیری، با «ثبت»',
      show: true,
    },
    {
      id: 'review',
      n: counts.review,
      badge: (
        <span className="jy-badge jy-badge--warning">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          {partner ? 'بررسی جزوه‌یار' : 'صف تأیید'}
        </span>
      ),
      text: partner ? 'جزوه‌یار تأیید یا کنار می‌گذارد' : 'تا تأیید مالک یا متصدی، بی کد',
      show: true,
    },
    {
      id: 'nf',
      n: counts.unmatched,
      badge: <span className="jy-badge jy-badge--neutral">پیدا نشد</span>,
      text: partner ? 'سفارش جزوه‌یار نیست؛ ثبت نمی‌شود' : 'سفارش ما نیست؛ ثبت نمی‌شود',
      show: true,
    },
    { id: 'dup', n: counts.duplicate, badge: <span className="jy-badge jy-badge--neutral">تکراری</span>, text: 'همین کد پیش‌تر آمده', show: true },
    {
      id: 'invalid',
      n: counts.invalid,
      badge: (
        <span className="jy-badge jy-badge--error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          خوانده نشد
        </span>
      ),
      text: 'کد، عدد یا تاریخ درست نیست',
      show: counts.invalid > 0,
    },
    { id: 'inactive', n: counts.inactive, badge: <span className="jy-badge jy-badge--neutral">غیرفعال در پست</span>, text: 'وضعیتش «فعال» نیست', show: counts.inactive > 0 },
  ];
  return (
    <ul className="ad-tiles ad-counts" aria-label="شمار سطرها">
      {tiles
        .filter((tile) => tile.show)
        .map((tile) => (
          <li key={tile.id}>
            <a className="ad-tile" href={tile.n > 0 ? `#g-${tile.id}` : undefined} data-count={tile.id}>
              {tile.badge}
              <span className="ad-tile__n num">{formatNumber(tile.n)}</span>
              <span className="ad-tile__t">{tile.text}</span>
            </a>
          </li>
        ))}
    </ul>
  );
}

/** سفارش‌هایی که «ثبت» یا همین ورود «تحویل پست شد» کرد؛ به ترتیب شماره. */
const handedNumbers = (rows: readonly ImportRowView[]) =>
  [...new Set(rows.filter((row) => row.verdict === 'matched' && row.handOver && row.order).map((row) => row.order!.orderNumber))].sort(
    (a, b) => a - b,
  );

/** زیرعنوان هر گروه، با حال ورود و از چشم چاپخانه (۶٫۲). */
function groupSub(group: (typeof ROW_GROUPS)[number], view: ImportPageView, partner: string | null): string {
  const committed = view.kind === 'committed';
  const reverted = view.import.status === 'reverted';
  switch (group.verdict) {
    case 'matched':
      return reverted
        ? 'این ورود برگشت و کدهایش کنار رفت.'
        : committed
          ? 'کد رهگیری هر بسته در صفحهٔ سفارشش نشست.'
          : 'با «ثبت»، کد رهگیری هر بسته در صفحهٔ سفارشش می‌نشیند.';
    case 'review':
      return partner ? `به سفارشی از ${partner} نشست، ولی قطعی نیست؛ جزوه‌یار تأیید یا کنار می‌گذارد.` : group.sub;
    case 'unmatched':
      if (partner) return 'سفارش جزوه‌یار نیست؛ ثبت نمی‌شود.';
      return committed && !reverted && view.canReview ? `${group.sub} اگر مال ماست، دستی به سفارشی بده.` : group.sub;
    default:
      return group.sub;
  }
}

/** گروه‌های سطرها، به ترتیب طرح؛ صف تأیید چاپخانه «در انتظار بررسی جزوه‌یار» (طرح). */
function Groups({ gate, rows, view, partner }: { gate: string; rows: ImportRowView[]; view: ImportPageView; partner: string | null }) {
  const committed = view.kind === 'committed';
  const queue =
    committed && view.canReview && view.import.status === 'committed' && rows.some((row) => row.queued) ? (
      <Link href={panelPath(gate, '/shipments/review')} className="jy-btn jy-btn--text ad-card-head-btn">
        صف تأیید
      </Link>
    ) : null;
  return (
    <>
      {ROW_GROUPS.map((group) => (
        <ImportRows
          key={group.id}
          gate={gate}
          importId={view.import.id}
          id={group.id}
          title={group.verdict === 'review' && partner ? 'در انتظار بررسی جزوه‌یار' : group.title}
          sub={groupSub(group, view, partner)}
          head={group.verdict === 'review' ? queue : undefined}
          rows={rows.filter((row) => row.verdict === group.verdict)}
          committed={committed}
          money={view.money}
          canReview={view.canReview}
          partner={partner !== null}
          now={view.now}
        />
      ))}
    </>
  );
}

/**
 * یک ورود فایل پست (طرح پنل `m-ship-reading`، `m-ship-error`، `m-ship-cols`، `m-ship-preview` و `m-ship-done`؛ ADR-045 و ADR-046):
 * «در حال خواندن» تا کارگر بخواندش؛ «خوانده نشد» با دلیل و راه جلو؛ پیش‌نمایش با حکم هر سطر، «ثبت» و «دور بینداز» (دکمه‌ها ثابت زیر
 * شمارها، تصمیم طرح ۱۴۰۵/۰۷/۰۶)؛ و پس از «ثبت» نتیجه، با «برگرداندن این ورود» برای مالک.
 */
export default async function ImportPage({ params, searchParams }: { params: Promise<{ gate: string; id: string }>; searchParams: Promise<Query> }) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'shipments.import')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await shipments.page(session, id);
  // ورودی که نیست، و ورود بیرون از محدودهٔ این نشست: هر دو همین ۴۰۴ (`not-found.tsx`).
  if (!result.ok) notFound();
  const view = result.value;
  const imp = view.import;
  const partner = session.partner?.name ?? null;
  const error = one(query, 'e');
  const back = (
    <Link href={panelPath(gate, '/shipments')} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      ارسال
    </Link>
  );
  const notes = (
    <>
      {error && PAGE_ERRORS.has(error) ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      {(one(query, 'done') === 'approve' || one(query, 'done') === 'assign') && /^\d{1,9}$/.test(one(query, 'o') ?? '') ? (
        <Alert tone="success">
          کد رهگیری {one(query, 'done') === 'assign' ? 'دستی ' : ''}به{' '}
          <Link className="jy-link" href={panelPath(gate, `/orders/${one(query, 'o')}`)}>
            سفارش <span className="num">{one(query, 'o')}</span>
          </Link>{' '}
          نشست{one(query, 'h') === '1' ? ' و سفارش «تحویل پست شد»' : ''}.
        </Alert>
      ) : one(query, 'done') === 'dismiss' ? (
        <Alert tone="success">سطر کنار گذاشته شد («هیچ‌کدام»). اگر اشتباه بود، از همین صفحه به سفارش درستش بده.</Alert>
      ) : null}
      {one(query, 'same') === '1' ? (
        <Alert tone="info">
          همین فایل پیش‌تر وارد شده؛ این همان ورود است. یک فایل دو بار ثبت نمی‌شود؛ اگر آن ورود اشتباه بود، مالک برش می‌گرداند و بعد
          همین فایل دوباره وارد می‌شود.
        </Alert>
      ) : null}
    </>
  );

  if (view.kind === 'plain') {
    return (
      <>
        {back}
        {notes}
        {imp.status === 'reading' ? (
          <section className="jy-card ad-upstate" aria-label="خواندن فایل پست" data-state="reading">
            <FileLine view={view} />
            <button type="button" className="jy-btn jy-btn--primary jy-btn--block is-loading" aria-disabled="true">
              در حال خواندن فایل…
            </button>
            <p className="ad-hint">
              {imp.job && imp.job.attempts > 0 && imp.job.status === 'queued'
                ? 'تلاش قبلی ناموفق بود؛ کارگر خودش دوباره امتحان می‌کند.'
                : 'چند ثانیه؛ بعد هر سطر را با حکمش می‌بینی. تا «ثبت» چیزی عوض نمی‌شود.'}
            </p>
            <AutoRefresh />
            <noscript>
              <Link className="jy-link" href={panelPath(gate, `/shipments/${imp.id}`)}>
                دوباره نگاه کن
              </Link>
            </noscript>
          </section>
        ) : imp.status === 'unreadable' ? (
          <section className="jy-card ad-upstate" aria-labelledby="t-fail" data-state="unreadable" data-error={imp.errorCode ?? ''}>
            <h1 id="t-fail" className="jy-card__title">
              این فایل خوانده نشد
            </h1>
            <FileLine view={view} badge={<ImportBadge status="unreadable" />} />
            <Alert tone="error">{unreadableText(imp.errorCode)}</Alert>
            <AnotherFile gate={gate} />
          </section>
        ) : (
          <section className="jy-card ad-upstate" aria-labelledby="t-gone" data-state={imp.status}>
            <h1 id="t-gone" className="jy-card__title">
              این فایل دور انداخته شد
            </h1>
            <FileLine view={view} badge={<ImportBadge status={imp.status} />} />
            <p className="ad-hint">
              {imp.discardedByName && imp.discardedAt
                ? `${imp.discardedByName}، ${whenText(imp.discardedAt, view.now)}؛ چیزی ثبت نشد و فایل خام پاک شد.`
                : 'ثبت نشد و پس از روزهای نگهداری دور انداخته شد؛ چیزی ثبت نشد.'}
            </p>
            <AnotherFile gate={gate} />
          </section>
        )}
      </>
    );
  }

  if (view.kind === 'preview' && !view.preview.sheet.ok) {
    const missing = view.preview.sheet.missing;
    const required = ['barcode', 'recipient', 'destination', 'weight', 'fare', 'tax', 'date', 'status'] as const;
    return (
      <>
        {back}
        {notes}
        <section className="jy-card ad-upstate" aria-labelledby="t-cols" data-state="missing_column">
          <h1 id="t-cols" className="jy-card__title">
            این فایل خوانده نشد
          </h1>
          <FileLine view={view} badge={<ImportBadge status="unreadable" />} />
          <Alert tone="error">
            {missingText(missing)} همان فایلی را بده که از پست گرفتی. اگر همان است، شاید پست شکل فایلش را عوض کرده؛ این فایل را نگه دار:
            خواندنش تغییر پنل می‌خواهد.
          </Alert>
          <ul className="ad-need" aria-label="ستون‌های لازم">
            {required.map((column) => (
              <li key={column}>
                <span className={missing.includes(column) ? 'jy-icon jy-icon-error' : 'jy-icon jy-icon-success'} aria-hidden="true" />
                {COLUMN_NAMES[column]}
                <span className="sr-only">{missing.includes(column) ? '، نیست' : '، هست'}</span>
              </li>
            ))}
          </ul>
          <div className="ad-actions">
            <form action={discardImportAction}>
              <input type="hidden" name="gate" value={gate} />
              <input type="hidden" name="id" value={imp.id} />
              <StatusButton className="jy-btn jy-btn--secondary">دور بینداز</StatusButton>
            </form>
          </div>
        </section>
      </>
    );
  }

  const committed = view.kind === 'committed';
  const rows = view.kind === 'preview' ? previewRows(view.preview) : committedRows(view.committed);
  const counts = countsOf(rows);
  const totals =
    view.kind === 'preview' && view.preview.sheet.ok
      ? totalsText(view.preview.sheet.sums, view.preview.sheet.fileTotal, { money: view.money })
      : view.kind === 'committed'
        ? (({ sums, file }) => totalsText(sums, file, { money: view.money }))(committedTotals(view.committed))
        : null;
  const queued = rows.filter((row) => row.queued).length;
  const days = postDaysText(
    rows.reduce<Date | null>((first, row) => (row.postDay && (!first || row.postDay < first) ? row.postDay : first), null),
    rows.reduce<Date | null>((last, row) => (row.postDay && (!last || row.postDay > last) ? row.postDay : last), null),
  );
  const handed = handedNumbers(rows);
  const reverted = imp.status === 'reverted';
  // سفارش‌هایی که کدی از همین ورود «تحویل پست شد»شان کرده بود و حالا «در حال چاپ»اند (قطعی، تأیید یا دستی).
  const reopened =
    reverted && view.kind === 'committed'
      ? [
          ...new Set(
            view.committed.shipments
              .filter((s) => s.handedOrder && view.committed.orders.find((order) => order.id === s.orderId)?.status === 'printing')
              .map((s) => s.orderNumber),
          ),
        ].sort((a, b) => a - b)
      : [];
  const sub: Seg[] = [whoWhen(view), ...(days ? [` · روز فایل ${days}`] : []), ' · '];

  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">
              <bdi className="ad-fname">{imp.filename}</bdi>
            </h1>
            <ImportBadge status={imp.status} />
          </div>
          <p className="ad-sub">
            <Segments segs={sub} />
            {/* گوشی «7» را از «بسته» جدا نکند. */}
            <span className="ad-nowrap">
              <span className="num">{formatNumber(rows.length)}</span> بسته
            </span>
          </p>
        </div>
        {view.canRevert ? (
          <Link href={panelPath(gate, `/shipments/${imp.id}/revert`)} className="jy-btn jy-btn--text">
            برگرداندن این ورود
          </Link>
        ) : null}
      </div>
      {notes}
      <div className="ad-stack">
        {view.kind === 'preview' ? (
          <Alert tone="info">
            هنوز چیزی ثبت نشده.{' '}
            {counts.matched > 0 ? (
              <>
                با «ثبت»، <span className="num">{formatNumber(counts.matched)}</span> کد رهگیری به {partner ? `سفارش‌های ${partner}` : 'سفارش‌ها'}{' '}
                می‌نشیند
                {handed.length > 0 ? (
                  <>
                    ؛ سفارش <Segments segs={numbersText(handed)} /> هم از «در حال چاپ» «تحویل پست شد» {handed.length > 1 ? 'می‌شوند' : 'می‌شود'}، با روز
                    فایل.
                  </>
                ) : (
                  '.'
                )}
              </>
            ) : (
              'در این فایل کد قطعی‌ای نیست؛ با «ثبت» سطرها برای سابقه و صف تأیید می‌مانند.'
            )}
          </Alert>
        ) : reverted ? (
          <Alert tone="info">
            این ورود {imp.revertedAt ? whenText(imp.revertedAt, view.now) : ''}
            {imp.revertedByName ? ` با ${imp.revertedByName}` : ''} برگشت: «{imp.revertReason}». کدهایش کنار رفت، پاک نشد
            {reopened.length > 0 ? (
              <>
                ؛ سفارش <Segments segs={numbersText(reopened)} /> به «در حال چاپ» برگشت
              </>
            ) : null}
            . فایل برای سابقه می‌ماند و دوباره واردشدنی است.
          </Alert>
        ) : (
          <Alert tone="success">
            {imp.committedAt ? whenText(imp.committedAt, view.now) : ''}
            {imp.committedByName ? ` با ${imp.committedByName}` : ''} ثبت شد: <span className="num">{formatNumber(counts.matched)}</span> کد
            رهگیری نشست.
            {handed.length > 0 ? (
              <>
                {' '}
                سفارش <Segments segs={numbersText(handed)} /> «تحویل پست شد» {handed.length > 1 ? 'شدند' : 'شد'}.
              </>
            ) : null}
            {queued > 0 ? (
              partner ? (
                <>
                  {' '}
                  <span className="num">{formatNumber(queued)}</span> سطر در انتظار بررسی جزوه‌یار است.
                </>
              ) : view.canReview ? (
                <>
                  {' '}
                  <Link className="jy-link" href={panelPath(gate, '/shipments/review')}>
                    <span className="num">{formatNumber(queued)}</span> سطر در صف تأیید
                  </Link>{' '}
                  است.
                </>
              ) : null
            ) : null}
          </Alert>
        )}
        <CountTiles counts={counts} committed={committed} partner={partner !== null} />
        {totals ? (
          totals.agree === false ? (
            <Alert tone="warning">
              <Segments segs={totals.text} />
            </Alert>
          ) : (
            <p className="ad-meta">
              <Segments segs={totals.text} />
            </p>
          )
        ) : null}
        {view.kind === 'preview' ? (
          // «ثبت» و «دور بینداز» ثابت همین‌جا، زیر شمارها؛ نه نوار چسبان که در بعضی نمایشگرها وسط صفحه می‌افتاد (تصمیم ۱۴۰۵/۰۷/۰۶).
          <div className="ad-commit">
            <form action={commitImportAction}>
              <input type="hidden" name="gate" value={gate} />
              <input type="hidden" name="id" value={imp.id} />
              <input type="hidden" name="fingerprint" value={view.preview.fingerprint} />
              <StatusButton className="jy-btn jy-btn--primary">
                {counts.matched > 0 ? (
                  <>
                    ثبت: <span className="num">{formatNumber(counts.matched)}</span> کد رهگیری
                  </>
                ) : (
                  'ثبت، بی کد رهگیری'
                )}
              </StatusButton>
            </form>
            <form action={discardImportAction}>
              <input type="hidden" name="gate" value={gate} />
              <input type="hidden" name="id" value={imp.id} />
              <StatusButton className="jy-btn jy-btn--secondary">دور بینداز</StatusButton>
            </form>
            <p className="ad-commit__note">«ثبت» همین حکم‌ها را دوباره می‌سنجد؛ اگر در این فاصله سفارشی عوض شده باشد، پیش‌نمایش تازه می‌بینی.</p>
          </div>
        ) : null}
        <Groups gate={gate} rows={rows} view={view} partner={partner} />
      </div>
    </>
  );
}
