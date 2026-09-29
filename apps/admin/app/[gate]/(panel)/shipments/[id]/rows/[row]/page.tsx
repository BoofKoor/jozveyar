import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert } from '../../../../../../../components/Alert';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { AssignStart, ManualCard, ReviewCard, RowHead, type ReviewFrom } from '../../../../../../../components/ReviewCard';
import { Segments } from '../../../../../../../components/Segments';
import { panelPath } from '../../../../../../../lib/gate';
import { messageOf } from '../../../../../../../lib/messages';
import { pageOf } from '../../../../../../../lib/orders';
import { reviewWhy, rowStateText } from '../../../../../../../lib/shipments';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'سطر فایل پست' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** شکست‌هایی که کارهای همین صفحه با برگشت به آن می‌گویند (`?e=`). */
const PAGE_ERRORS = new Set([
  'row_not_found',
  'row_closed',
  'choice_required',
  'order_not_found',
  'shipment_order_changed',
  'blocked_cancelled',
  'blocked_before_payment',
  'blocked_needs_partner',
  'blocked_needs_print',
  'barcode_elsewhere',
  'forbidden',
]);

/**
 * یک سطر فایل پست برای تصمیم (۶٫۲، ADR-046): سطر صف همان کارت صف را دارد؛ سطری که در صف نیست ولی به سفارشی داده می‌شود («پیدا
 * نشد»، یا «هیچ‌کدام»ی که اشتباه بود) شمارهٔ سفارش را می‌خواهد؛ و با `?order=` (قدم دوم دادن دستی، تصمیم ۸۳) کارت همان سفارش با
 * معیارها و «همین است». مالک و متصدی (`shipments.review`)؛ سطر بیرون از محدوده همان ۴۰۴.
 */
export default async function ReviewRowPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string; row: string }>;
  searchParams: Promise<Query>;
}) {
  const { gate, id, row } = await params;
  const query = await searchParams;
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'shipments.review')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await shipments.row(session, id, row, { order: one(query, 'order') });
  if (!result.ok) notFound();
  const { review, manual, manualError, now, money } = result.value;
  const back: ReviewFrom = { from: one(query, 'from') === 'import' ? 'import' : 'queue', page: pageOf(one(query, 'page')) };
  const home =
    back.from === 'import'
      ? panelPath(gate, `/shipments/${review.import.id}`)
      : `${panelPath(gate, '/shipments/review')}${back.page > 1 ? `?page=${back.page}` : ''}`;
  const error = one(query, 'e');
  const shown = error && PAGE_ERRORS.has(error) ? error : null;
  const titleId = `t-rv-${review.import.id}-${review.row.rowNo}`;

  return (
    <>
      <Link href={home} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        {back.from === 'import' ? <bdi>{review.import.filename}</bdi> : 'صف تأیید'}
      </Link>
      <div className="ad-stack">
        {manual || manualError ? (
          <>
            <section className="jy-card ad-rv" aria-labelledby={titleId}>
              <RowHead review={review} now={now} money={money} titleId={titleId} level={1} />
              {review.queued ? (
                <Alert tone="warning">
                  <Segments segs={reviewWhy(review, now)} />
                </Alert>
              ) : (
                <p className="ad-hint ad-gap">
                  <Segments segs={rowStateText(review, now)} />
                </p>
              )}
            </section>
            {manual ? (
              <ManualCard gate={gate} review={review} pick={manual} now={now} back={back} cancel={home} error={shown} />
            ) : (
              <section className="jy-card ad-rv" aria-label="شمارهٔ سفارش">
                <Alert tone="error">{messageOf(manualError!)}</Alert>
                <AssignStart gate={gate} review={review} back={back} />
              </section>
            )}
          </>
        ) : review.queued ? (
          <ReviewCard gate={gate} review={review} now={now} money={money} back={back} at="row" error={shown} />
        ) : (
          <section className="jy-card ad-rv" aria-labelledby={titleId} data-row-state={review.assignable ? 'assignable' : 'closed'}>
            <RowHead review={review} now={now} money={money} titleId={titleId} level={1} />
            {shown ? <Alert tone="error">{messageOf(shown)}</Alert> : null}
            <p className="ad-hint ad-gap">
              <Segments segs={rowStateText(review, now)} />
            </p>
            {review.assignable ? <AssignStart gate={gate} review={review} back={back} /> : null}
          </section>
        )}
      </div>
    </>
  );
}
