import type { Metadata } from 'next';
import Link from 'next/link';

import { PUBLISHED_REVIEWS_LIMIT, type ReviewFilter, type ReviewStatus, type ReviewView } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { StatusButton } from '../../../../../components/StatusButton';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { REVIEW_FILTERS, type ReviewAction } from '../../../../../lib/server/reviews';
import { decideReviewAction } from '../../../actions';

export const metadata: Metadata = { title: 'نظر مشتری‌ها' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const ERRORS = new Set(['forbidden', 'review_not_found', 'review_stale', 'review_no_body', 'review_bad_action']);

const FILTER_LABELS: Record<ReviewFilter, string> = { pending: 'منتظر', approved: 'روی سایت', hidden: 'پنهان', all: 'همه' };

const EMPTY: Record<ReviewFilter, string> = {
  pending: 'نظر تازه‌ای منتظر نیست.',
  approved: 'هنوز هیچ نظری روی سایت نیست.',
  hidden: 'هیچ نظری پنهان نیست.',
  all: 'هنوز هیچ مشتری‌ای نظر نداده.',
};

const DONE: Record<ReviewAction, string> = {
  approve: 'نظر روی سایت رفت؛ تا یک دقیقهٔ دیگر روی صفحهٔ اصلی دیده می‌شود.',
  hide: 'نظر پنهان شد؛ تا یک دقیقهٔ دیگر از صفحهٔ اصلی می‌رود.',
  delete: 'نظر پاک شد.',
};

const BADGES: Record<Exclude<ReviewStatus, 'deleted'>, { tone: string; text: string }> = {
  pending: { tone: 'info', text: 'منتظر' },
  approved: { tone: 'success', text: 'روی سایت' },
  hidden: { tone: 'neutral', text: 'پنهان' },
};

/** «روی سایت از دیروز 14:05، پروین»: آخرین تصمیم. */
function decidedLine(review: ReviewView, now: Date): string | null {
  if (review.decidedAt === null) return null;
  const who = review.decidedByName ? `، ${review.decidedByName}` : '';
  return `${review.status === 'approved' ? 'روی سایت' : 'پنهان'} از ${whenText(review.decidedAt, now)}${who}`;
}

/** دکمه‌ای که تصمیم را با وضعیتی که این صفحه دید می‌فرستد (`seen`). */
function Decide({ gate, review, filter, action, children }: { gate: string; review: ReviewView; filter: ReviewFilter; action: ReviewAction; children: React.ReactNode }) {
  return (
    <form action={decideReviewAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="seen" value={review.status} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="f" value={filter} />
      <StatusButton className={action === 'delete' ? 'jy-btn jy-btn--danger' : 'jy-btn jy-btn--text'}>{children}</StatusButton>
    </form>
  );
}

/**
 * نظر مشتری‌ها (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): نظر صاحب هر سفارش پس از «تحویل پست شد»، تازه‌ترین اول، با چیپ‌های منتظر، روی سایت، پنهان و
 * همه، و میانگین نمره. هیچ نظری بی تصمیم مالک روی صفحهٔ اصلی نمی‌آید: «روی سایت بگذار» (فقط نظر متن‌دار)، «پنهان کن»، و «پاک کن» که تأیید
 * جدای همین صفحه را دارد (`?delete=`)، چون نمره و متن برای همیشه می‌روند. فقط مالک (`reviews.manage`).
 */
export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { reviews } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'reviews.manage')) return <NoAccess gate={gate} session={session} />;
  const result = await reviews.list(session, one(query, 'f'));
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, filter, reviews: rows, counts } = result.value;
  const error = ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const done = one(query, 'done') as ReviewAction;
  const deleting = one(query, 'delete');
  const self = `${panelPath(gate, '/orders/reviews')}?f=${filter}`;
  const countOf: Record<ReviewFilter, number> = { pending: counts.pending, approved: counts.approved, hidden: counts.hidden, all: counts.total };
  // میانگین با یک رقم اعشار، بی صفر ته («4» و «4.3»).
  const average = counts.averageRating === null ? null : String(Math.round(counts.averageRating * 10) / 10);

  return (
    <>
      <Link href={panelPath(gate, '/orders')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        سفارش‌ها
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">نظر مشتری‌ها</h1>
          <p className="ad-sub">
            صاحب هر سفارش پس از «تحویل پست شد» یک بار نمره و چند کلمه می‌دهد. هیچ نظری بی تصمیم تو روی صفحهٔ اصلی نمی‌آید؛ آنجا فقط نام کوچک و
            شهر، همان که مشتری زیر فرم دید.
          </p>
        </div>
      </div>
      {error ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : done in DONE ? (
        <Alert tone="success">{DONE[done]}</Alert>
      ) : null}

      {average !== null ? (
        <p className="ad-lead" data-testid="reviews-average">
          میانگین نمره <span className="num">{average}</span> از <span className="num">5</span>، از <span className="num">{formatNumber(counts.total)}</span> نظر
        </p>
      ) : null}
      <nav className="ad-chips" aria-label="وضعیت نظر">
        {REVIEW_FILTERS.map((f) => (
          <Link
            key={f}
            className="ad-chip"
            href={`${panelPath(gate, '/orders/reviews')}?f=${f}`}
            aria-current={f === filter ? 'page' : undefined}
          >
            {FILTER_LABELS[f]} <span className="num">{formatNumber(countOf[f])}</span>
          </Link>
        ))}
      </nav>

      <section className="jy-card" aria-label={`نظرهای ${FILTER_LABELS[filter]}`}>
        {rows.length === 0 ? (
          <p className="ad-hint">{EMPTY[filter]}</p>
        ) : (
          <ul className="ad-partners ad-reviews" data-testid="reviews">
            {rows.map((review) => {
              const badge = BADGES[review.status as keyof typeof BADGES];
              const decided = decidedLine(review, now);
              return (
                <li key={review.id} data-review={review.id} data-status={review.status}>
                  <div>
                    <p>
                      <span className="ad-partners__name">
                        <span className="num">{review.rating}</span> از <span className="num">5</span>
                      </span>
                      {badge ? <span className={`jy-badge jy-badge--${badge.tone}`}>{badge.text}</span> : null}
                    </p>
                    {review.body !== null ? (
                      <blockquote className="ad-review__body">{review.body}</blockquote>
                    ) : (
                      <p className="ad-partners__meta">بی متن، فقط نمره؛ روی سایت نمی‌رود.</p>
                    )}
                    <p className="ad-partners__meta">
                      {review.publicName}، {review.publicPlace} · سفارش{' '}
                      <Link className="jy-link num" href={panelPath(gate, `/orders/${review.orderNumber}`)}>
                        {review.orderNumber}
                      </Link>{' '}
                      · {whenText(review.createdAt, now)}
                    </p>
                    {decided ? <p className="ad-partners__meta">{decided}</p> : null}
                  </div>
                  <div className="ad-people__btns">
                    {review.status !== 'approved' && review.body !== null ? (
                      <Decide gate={gate} review={review} filter={filter} action="approve">
                        روی سایت بگذار
                      </Decide>
                    ) : null}
                    {review.status !== 'hidden' ? (
                      <Decide gate={gate} review={review} filter={filter} action="hide">
                        پنهان کن
                      </Decide>
                    ) : null}
                    {deleting === review.id ? null : (
                      <Link href={`${self}&delete=${review.id}`} className="jy-btn jy-btn--text" scroll={false}>
                        پاک کن
                      </Link>
                    )}
                  </div>
                  {deleting === review.id ? (
                    <div className="ad-step ad-review__confirm" data-testid="review-delete">
                      <p className="ad-step__title">پاک کردن این نظر</p>
                      <p className="jy-note jy-note--warning ad-gap">
                        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                        <span>
                          نمره و متن این نظر برای همیشه پاک می‌شود و برنمی‌گردد، و این سفارش دیگر نظر تازه نمی‌گیرد. اگر فقط نمی‌خواهی روی سایت باشد،
                          «پنهان کن» را بزن.
                        </span>
                      </p>
                      <div className="ad-actions">
                        <Decide gate={gate} review={review} filter={filter} action="delete">
                          پاک کن
                        </Decide>
                        <Link href={self} className="jy-btn jy-btn--text" scroll={false}>
                          انصراف
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="ad-hint ad-gap">
          روی صفحهٔ اصلی تازه‌ترین <span className="num">{PUBLISHED_REVIEWS_LIMIT}</span> نظرِ «روی سایت» می‌آید، با نمره و متن و نام کوچک و شهر؛
          نام خانوادگی، موبایل و شمارهٔ سفارش هرگز.
        </p>
      </section>
    </>
  );
}
