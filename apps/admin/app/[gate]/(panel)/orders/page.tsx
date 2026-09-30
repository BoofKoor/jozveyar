import type { Metadata } from 'next';
import Link from 'next/link';

import type { PanelBucket } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { NoAccess } from '../../../../components/NoAccess';
import { OrderRows } from '../../../../components/OrderRows';
import { Segments } from '../../../../components/Segments';
import { panelPath } from '../../../../lib/gate';
import { BUCKET_LABELS } from '../../../../lib/orders';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'سفارش‌ها' };

const EMPTY: Record<PanelBucket, string> = {
  open: 'سفارش بازی نیست.',
  handed: 'هنوز سفارشی به پست نرسیده است.',
  cancelled: 'سفارش لغوشده‌ای نیست.',
  awaiting: 'سفارشی در انتظار پرداخت نیست.',
  abandoned: 'سفارش رهاشده‌ای نیست.',
  all: 'هنوز سفارشی نیست.',
};

/** ستون آخر هر فهرست: مهلت سفارش باز، زمان ساختن سفارش پرداخت‌نشده، روز رسیدن به پست، یا روز لغو. */
const LAST_COLUMN: Record<PanelBucket, { head: string; dates: 'due' | 'created' | 'handed' | 'cancelled' }> = {
  open: { head: 'تحویل به پست تا', dates: 'due' },
  handed: { head: 'به پست رسید', dates: 'handed' },
  cancelled: { head: 'لغو شد', dates: 'cancelled' },
  awaiting: { head: 'ساخته شد', dates: 'created' },
  abandoned: { head: 'ساخته شد', dates: 'created' },
  all: { head: 'تحویل به پست تا', dates: 'due' },
};

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

/**
 * سفارش‌ها (طرح پنل): جست‌وجو (شماره، موبایل یا نام گیرنده)، چیپ‌های وضعیت با شمار (باز، تحویل پست شد، لغو شد، در
 * انتظار پرداخت، رهاشده، همه)، و ردیف‌ها؛ صفحه‌ای ۵۰ تا. همه در نشانی (`?q=&status=&page=`)، بی JS. جست‌وجو در همهٔ
 * سفارش‌هاست و چیپ‌ها شمار همان جست‌وجو را می‌گویند. کاربر چاپخانه (۵٫۳، طرح `m-orders` با نقش «چاپخانه») فقط سفارش‌های
 * چاپخانهٔ خودش را دارد، با چهار چیپ (باز، تحویل پست شد، لغو شد، همه)، بی ستون مبلغ و بی یادداشت «رهاشده».
 *
 * از ۶٫۴ (تصمیم ۱۰۸) پیوند «بی کد رهگیری» گزارش ارسال به همین فهرست می‌آید (`?untracked=1405-07`): فقط سفارش‌های «تحویل پست شد»
 * همان ماه که کد رهگیری زنده ندارند، به جای چیپ‌ها یادداشتی با «همهٔ سفارش‌ها».
 */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'orders.read')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await orders.list(session, {
    status: one(query.status),
    q: one(query.q),
    page: one(query.page),
    untracked: one(query.untracked),
  });
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { buckets, bucket, q, counts, page, pages, rows, bounds, untracked } = result.value;
  const money = can(session, 'orders.money');
  const base = panelPath(gate, '/orders');
  const hrefOf = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (value === undefined || value === '' ? [] : [[key, String(value)]])),
    ).toString();
    return search ? `${base}?${search}` : base;
  };
  const last = LAST_COLUMN[bucket];

  return (
    <>
      <div className="ad-pagehead">
        <h1 className="ad-title">سفارش‌ها</h1>
      </div>
      <form className="ad-search" role="search" action={base} method="get">
        <span className="jy-icon jy-icon-search" aria-hidden="true" />
        <input
          className="jy-input"
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="شمارهٔ سفارش، موبایل، نام گیرنده یا کد رهگیری"
          aria-label="جست‌وجوی سفارش"
          autoComplete="off"
        />
      </form>
      {untracked ? (
        <p className="jy-note jy-note--info ad-gap" data-filter="untracked">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            فقط سفارش‌های «تحویل پست شد» <Segments segs={untracked.label} /> که کد رهگیری ندارند:{' '}
            <span className="num">{formatNumber(counts.handed)}</span> سفارش، همان «بی کد رهگیری» گزارش ارسال.{' '}
            <Link className="jy-link" href={base}>
              همهٔ سفارش‌ها
            </Link>
          </span>
        </p>
      ) : (
        <nav className="ad-chips" aria-label="وضعیت سفارش">
          {buckets.map((b) => (
            <Link key={b} className="ad-chip" href={hrefOf({ status: b, q })} aria-current={b === bucket ? 'page' : undefined}>
              {BUCKET_LABELS[b]} <span className="num">{formatNumber(counts[b])}</span>
            </Link>
          ))}
        </nav>
      )}
      <section className={`jy-card ad-list${money ? '' : ' ad-list--nosum'}`} aria-label={`سفارش‌های ${BUCKET_LABELS[bucket]}`}>
        {rows.length > 0 ? (
          <>
            <div className="ad-cols" aria-hidden="true">
              <span>سفارش</span>
              <span>گیرنده</span>
              <span>جزوه</span>
              {money ? <span>مبلغ (تومان)</span> : null}
              <span>وضعیت</span>
              <span>{last.head}</span>
            </div>
            <OrderRows gate={gate} rows={rows} bounds={bounds} dates={last.dates} money={money} />
          </>
        ) : (
          <p className="ad-empty">
            {untracked ? (
              <>
                همهٔ سفارش‌های تحویل پست‌شدهٔ <Segments segs={untracked.label} /> کد رهگیری دارند.
              </>
            ) : q ? (
              <>
                سفارشی با «{q}» {bucket === 'all' ? '' : `در «${BUCKET_LABELS[bucket]}» `}پیدا نشد.
                {bucket !== 'all' && counts.all > 0 ? (
                  <>
                    {' '}
                    <Link className="jy-link" href={hrefOf({ status: 'all', q })}>
                      در همه ببین
                    </Link>
                  </>
                ) : null}
              </>
            ) : (
              EMPTY[bucket]
            )}
          </p>
        )}
        {pages > 1 ? (
          <div className="ad-pager">
            <span>
              صفحهٔ <span className="num">{formatNumber(page)}</span> از <span className="num">{formatNumber(pages)}</span>
            </span>
            <span className="ad-pager__nav">
              {page > 1 ? (
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: bucket, q, untracked: untracked?.key, page: page - 1 })}>
                  قبلی
                </Link>
              ) : null}
              {page < pages ? (
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: bucket, q, untracked: untracked?.key, page: page + 1 })}>
                  بعدی
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
      {buckets.includes('abandoned') && !untracked ? (
        <p className="ad-meta ad-gap">
          «رهاشده»: سفارشی که پرداخت نشد و فایل‌هایش دیگر روی سرور نیست، یا تا یک ساعت دیگر پاک می‌شود؛ از فهرست باز جداست.
        </p>
      ) : null}
    </>
  );
}
