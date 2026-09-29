import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { ReviewCard } from '../../../../../components/ReviewCard';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'صف تأیید' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** شکست‌هایی که کارت‌های صف با برگشت به همین صفحه می‌گویند (`?e=`، و کارتش `?r=`). */
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

/** نتیجهٔ کاری که همین حالا انجام شد (`?done=`). */
function Done({ gate, query }: { gate: string; query: Query }) {
  const done = one(query, 'done');
  const orderNumber = /^\d{1,9}$/.test(one(query, 'o') ?? '') ? one(query, 'o')! : null;
  if ((done === 'approve' || done === 'assign') && orderNumber) {
    return (
      <Alert tone="success">
        کد رهگیری {done === 'assign' ? 'دستی ' : ''}به{' '}
        <Link className="jy-link" href={panelPath(gate, `/orders/${orderNumber}`)}>
          سفارش <span className="num">{orderNumber}</span>
        </Link>{' '}
        نشست{one(query, 'h') === '1' ? ' و سفارش «تحویل پست شد»' : ''}.
      </Alert>
    );
  }
  if (done === 'dismiss') {
    return <Alert tone="success">سطر کنار گذاشته شد («هیچ‌کدام»). اگر اشتباه بود، از صفحهٔ همان ورود به سفارش درستش بده.</Alert>;
  }
  return null;
}

/**
 * صف تأیید (۶٫۲، طرح پنل `m-ship-review`، ADR-046): سطرهای فایل پست که سفارششان قطعی نیست، قدیمی‌ترین «ثبت» اول و بعد شمارهٔ سطر
 * (تصمیم ۸۶)؛ هر کدام با نامزدها، «همین است»، «هیچ‌کدام» و «سفارش دیگر». مالک و متصدی (`shipments.review`)؛ چاپخانه نه، ورودهای
 * خودش را «در انتظار بررسی جزوه‌یار» می‌بیند.
 */
export default async function ReviewQueuePage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'shipments.review')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await shipments.queue(session, { page: one(query, 'page') });
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { rows, total, page, pages, now, money } = result.value;
  const error = one(query, 'e');
  const shown = error && PAGE_ERRORS.has(error) ? error : null;
  const errorRow = one(query, 'r') ?? null;
  // شکستی که کارتش در این صفحه نیست (همین حالا جای دیگری تصمیم گرفته شد): بالای صفحه.
  const orphan = shown && !rows.some((review) => `${review.import.id}.${review.row.rowNo}` === errorRow) ? shown : null;
  const base = panelPath(gate, '/shipments/review');

  return (
    <>
      <Link href={panelPath(gate, '/shipments')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ارسال
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">صف تأیید</h1>
          <p className="ad-sub">
            سطرهایی از فایل پست که سفارششان قطعی نیست، قدیمی‌ترین اول. «همین است» کد رهگیری را به سفارش می‌نشاند؛ «هیچ‌کدام» سطر را کنار
            می‌گذارد.
          </p>
        </div>
      </div>
      <Done gate={gate} query={query} />
      {orphan ? <Alert tone="error">{messageOf(orphan)}</Alert> : null}
      {rows.length === 0 ? (
        <section className="jy-card" aria-labelledby="t-rv-empty" data-queue="empty">
          <h2 id="t-rv-empty" className="jy-card__title">
            صف تأیید خالی است
          </h2>
          <p className="ad-hint ad-gap">همهٔ سطرهای فایل‌های پست بررسی شده‌اند. سطر تازه با «ثبت» فایل پست به صف می‌آید.</p>
        </section>
      ) : (
        <div className="ad-stack" data-queue={total}>
          {rows.map((review) => (
            <ReviewCard
              key={`${review.import.id}.${review.row.rowNo}`}
              gate={gate}
              review={review}
              now={now}
              money={money}
              back={{ from: 'queue', page }}
              at="queue"
              error={shown && errorRow === `${review.import.id}.${review.row.rowNo}` ? shown : null}
            />
          ))}
        </div>
      )}
      {pages > 1 ? (
        <div className="ad-pager ad-gap">
          <span>
            صفحهٔ <span className="num">{formatNumber(page)}</span> از <span className="num">{formatNumber(pages)}</span> ·{' '}
            <span className="num">{formatNumber(total)}</span> سطر
          </span>
          <span className="ad-pager__nav">
            {page > 1 ? (
              <Link className="jy-btn jy-btn--text" href={page === 2 ? base : `${base}?page=${page - 1}`}>
                قدیمی‌ترها
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="jy-btn jy-btn--text" href={`${base}?page=${page + 1}`}>
                تازه‌ترها
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </>
  );
}
