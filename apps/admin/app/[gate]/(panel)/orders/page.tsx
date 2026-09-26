import type { Metadata } from 'next';
import Link from 'next/link';

import { PANEL_BUCKETS, type PanelBucket } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { NoAccess } from '../../../../components/NoAccess';
import { OrderRows } from '../../../../components/OrderRows';
import { panelPath } from '../../../../lib/gate';
import { BUCKET_LABELS } from '../../../../lib/orders';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'سفارش‌ها' };

const EMPTY: Record<PanelBucket, string> = {
  open: 'سفارش بازی نیست.',
  awaiting: 'سفارشی در انتظار پرداخت نیست.',
  abandoned: 'سفارش رهاشده‌ای نیست.',
  all: 'هنوز سفارشی نیست.',
};

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

/**
 * سفارش‌ها (طرح پنل): جست‌وجو (شماره، موبایل یا نام گیرنده)، چیپ‌های وضعیت با شمار، و ردیف‌ها؛ صفحه‌ای ۵۰ تا.
 * همه در نشانی (`?q=&status=&page=`)، بی JS. جست‌وجو در همهٔ سفارش‌هاست و چیپ‌ها شمار همان جست‌وجو را می‌گویند.
 * چیپ‌های «تحویل پست شد» و «لغو شد» با وضعیت‌هایشان در ۴٫۳.
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
  if (!can(session, 'orders.read')) return <NoAccess gate={gate} />;
  const result = await orders.list(session, { status: one(query.status), q: one(query.q), page: one(query.page) });
  if (!result.ok) return <NoAccess gate={gate} />;
  const { bucket, q, counts, page, pages, rows, bounds } = result.value;
  const base = panelPath(gate, '/orders');
  const hrefOf = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (value === undefined || value === '' ? [] : [[key, String(value)]])),
    ).toString();
    return search ? `${base}?${search}` : base;
  };
  const unpaid = bucket === 'awaiting' || bucket === 'abandoned';

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
          placeholder="شمارهٔ سفارش، موبایل یا نام گیرنده"
          aria-label="جست‌وجوی سفارش"
          autoComplete="off"
        />
      </form>
      <nav className="ad-chips" aria-label="وضعیت سفارش">
        {PANEL_BUCKETS.map((b) => (
          <Link key={b} className="ad-chip" href={hrefOf({ status: b, q })} aria-current={b === bucket ? 'page' : undefined}>
            {BUCKET_LABELS[b]} <span className="num">{formatNumber(counts[b])}</span>
          </Link>
        ))}
      </nav>
      <section className="jy-card ad-list" aria-label={`سفارش‌های ${BUCKET_LABELS[bucket]}`}>
        {rows.length > 0 ? (
          <>
            <div className="ad-cols" aria-hidden="true">
              <span>سفارش</span>
              <span>گیرنده</span>
              <span>جزوه</span>
              <span>مبلغ (تومان)</span>
              <span>وضعیت</span>
              <span>{unpaid ? 'ساخته شد' : 'تحویل به پست تا'}</span>
            </div>
            <OrderRows gate={gate} rows={rows} bounds={bounds} dates={unpaid ? 'created' : 'due'} />
          </>
        ) : (
          <p className="ad-empty">
            {q ? (
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
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: bucket, q, page: page - 1 })}>
                  قبلی
                </Link>
              ) : null}
              {page < pages ? (
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: bucket, q, page: page + 1 })}>
                  بعدی
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
      <p className="ad-meta ad-gap">
        «رهاشده»: سفارشی که پرداخت نشد و فایل‌هایش دیگر روی سرور نیست، یا تا یک ساعت دیگر پاک می‌شود؛ از فهرست باز جداست.
      </p>
    </>
  );
}
