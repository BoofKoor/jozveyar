import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { Segments } from '../../../../components/Segments';
import { phoneText } from '../../../../lib/format';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { STATE_LABELS, orderState } from '../../../../lib/orders';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { SUPPORT_BUCKETS } from '../../../../lib/server/support';
import { BUCKET_LABELS, EMPTY, lastSnippet, topicSegs, waitText } from '../../../../lib/support';

export const metadata: Metadata = { title: 'پشتیبانی' };

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);

/**
 * پشتیبانی (برش ۱۲٫۱، ADR-068؛ طرح «صندوق»، سؤال ۳۱۳): پیام مشتری‌ها از «سفارش‌های من»، یک ردیف برای هر گفت‌وگو. چیپ‌های «باز» (پیش‌فرض)،
 * «پاسخ داده شد»، «بسته» و «همه» با شمار همان جست‌وجو؛ «باز» قدیمی‌ترین انتظار اول، و بقیه تازه‌ترین پیام اول. جست‌وجو همان کادر «سفارش‌ها»
 * (موبایل، شمارهٔ سفارش یا ته موبایل، نام). همه در نشانی (`?status=&q=&page=`)، بی JS. مالک و متصدی (`support.reply`).
 */
export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const { support } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'support.reply')) return <NoAccess gate={gate} session={session} />;
  const result = await support.inbox(session, { bucket: one(query.status), q: one(query.q), page: one(query.page) });
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, bucket, query: q, page, pages, inbox } = result.value;
  const error = one(query.e) === 'support_not_found' ? 'support_not_found' : null;
  const base = panelPath(gate, '/support');
  const hrefOf = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (value === undefined || value === '' ? [] : [[key, String(value)]])),
    ).toString();
    return search ? `${base}?${search}` : base;
  };
  const status = (b: string) => (b === 'open' ? undefined : b);

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">پشتیبانی</h1>
          <p className="ad-sub">پیام مشتری‌ها از «سفارش‌های من». باز به ترتیب انتظار، قدیمی‌ترین اول.</p>
        </div>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <form className="ad-search" role="search" action={base} method="get">
        <span className="jy-icon jy-icon-search" aria-hidden="true" />
        {bucket === 'open' ? null : <input type="hidden" name="status" value={bucket} />}
        <input
          className="jy-input"
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="موبایل، شمارهٔ سفارش یا نام"
          aria-label="جست‌وجوی گفت‌وگو"
          autoComplete="off"
        />
      </form>
      <nav className="ad-chips" aria-label="حال گفت‌وگو">
        {SUPPORT_BUCKETS.map((b) => (
          <Link key={b} className="ad-chip" href={hrefOf({ status: status(b), q })} aria-current={b === bucket ? 'page' : undefined}>
            {BUCKET_LABELS[b]} <span className="num">{formatNumber(inbox.counts[b])}</span>
          </Link>
        ))}
      </nav>
      <section className="jy-card ad-list" aria-label={`گفت‌وگوهای ${BUCKET_LABELS[bucket]}`}>
        {inbox.lines.length > 0 ? (
          <ul className="ad-threads" data-testid="threads">
            {inbox.lines.map((line) => (
              <li key={line.id} data-thread={line.id} data-status={line.status}>
                <Link href={panelPath(gate, `/support/${line.id}`)} className="ad-thread">
                  <span className="ad-thread__who">
                    <b>{line.customer.name ?? <span className="num">{phoneText(line.customer.mobile)}</span>}</b>
                    {line.customer.place ? (
                      <>
                        {' '}
                        <span className="ad-row__city">{line.customer.place}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="ad-thread__about">
                    <Segments segs={topicSegs(line.orderNumber)} />
                    {line.orderStatus ? ` · ${STATE_LABELS[orderState(line.orderStatus, false)]}` : null}
                  </span>
                  <span className="ad-thread__snip">{lastSnippet(line.last)}</span>
                  <span className="ad-thread__wait">{waitText(line, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ad-empty">
            {q ? (
              <>
                گفت‌وگویی با «{q}» {bucket === 'all' ? '' : `در «${BUCKET_LABELS[bucket]}» `}پیدا نشد.
                {bucket !== 'all' && inbox.counts.all > 0 ? (
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
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: status(bucket), q, page: page - 1 })}>
                  قبلی
                </Link>
              ) : null}
              {page < pages ? (
                <Link className="jy-btn jy-btn--text" href={hrefOf({ status: status(bucket), q, page: page + 1 })}>
                  بعدی
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
