import type { Metadata } from 'next';
import Link from 'next/link';

import type { MobileBlockView } from '@jozveyar/db';

import { Alert } from '../../../../../components/Alert';
import { BlockForm } from '../../../../../components/BlockForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { StatusButton } from '../../../../../components/StatusButton';
import { phoneText, whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { REASON_MAX } from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { unblockMobileAction } from '../../../actions';

export const metadata: Metadata = { title: 'شماره‌های مسدود' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const ERRORS = new Set(['forbidden', 'mobile_already_blocked', 'block_not_found', 'order_not_found']);

/** «از سفارش 10027»، با پیوند به همان سفارش. */
function FromOrder({ gate, block }: { gate: string; block: MobileBlockView }) {
  if (block.orderNumber === null) return null;
  return (
    <>
      {' · از سفارش '}
      <Link className="jy-link num" href={panelPath(gate, `/orders/${block.orderNumber}`)}>
        {block.orderNumber}
      </Link>
    </>
  );
}

/**
 * شماره‌های مسدود (برش ۱۲٫۲، ADR-063؛ سؤال‌های ۲۱۲ و ۳۱۹): هر مسدودی زنده با از کی، چه کسی، سفارشی که از صفحه‌اش آمد و دلیل، و «رفع
 * مسدودی»؛ فرم «مسدود کردن شماره» برای شماره‌ای که سفارشی ندارد؛ و آخرین رفع‌شده‌ها. مالک و متصدی (`customers.block`).
 */
export default async function BlockedPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { blocks } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'customers.block')) return <NoAccess gate={gate} session={session} />;
  const result = await blocks.list(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, live, past } = result.value;
  const error = ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const done = one(query, 'done');

  return (
    <>
      <Link href={panelPath(gate, '/orders')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        سفارش‌ها
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">شماره‌های مسدود</h1>
          <p className="ad-sub">
            با شمارهٔ مسدود کد پیامکی نمی‌رود، و سفارش تازه و پرداخت تازه ساخته نمی‌شود؛ سفارش‌های پرداخت‌شده همان‌طور چاپ و ارسال می‌شوند.
            مسدود کردن مشتری از صفحهٔ سفارشش است، یا برای شماره‌ای که سفارشی ندارد از همین‌جا.
          </p>
        </div>
      </div>
      {error ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : done === 'block' || done === 'block_again' ? (
        <Alert tone="success">شماره مسدود شد.</Alert>
      ) : done === 'unblock' ? (
        <Alert tone="success">مسدودی برداشته شد؛ این شماره از همین حالا دوباره سفارش می‌دهد.</Alert>
      ) : null}

      <section className="jy-card" aria-labelledby="t-blocked">
        <h2 id="t-blocked" className="jy-card__title">
          {live.length === 0 ? (
            'هیچ شماره‌ای مسدود نیست'
          ) : (
            <>
              <span className="num">{live.length}</span> شمارهٔ مسدود
            </>
          )}
        </h2>
        {live.length === 0 ? null : (
          <ul className="ad-partners" data-testid="blocked-live">
            {live.map((block) => (
              <li key={block.id} data-mobile={block.mobile}>
                <div>
                  <p>
                    <span className="num ad-partners__name">{phoneText(block.mobile)}</span>
                  </p>
                  <p className="ad-partners__meta">
                    از {whenText(block.blockedAt, now)}
                    {block.blockedByName ? `، ${block.blockedByName}` : ''}
                    <FromOrder gate={gate} block={block} />
                  </p>
                  <p className="ad-partners__meta">دلیل: {block.reason}</p>
                </div>
                <div className="ad-people__btns">
                  <form action={unblockMobileAction}>
                    <input type="hidden" name="gate" value={gate} />
                    <input type="hidden" name="id" value={block.id} />
                    <StatusButton className="jy-btn jy-btn--text">رفع مسدودی</StatusButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <BlockForm gate={gate} maxLength={REASON_MAX} back={null} />
      </section>

      {past.length === 0 ? null : (
        <section className="jy-card" aria-labelledby="t-unblocked">
          <h2 id="t-unblocked" className="jy-card__title">
            رفع‌شده‌ها
          </h2>
          <ul className="ad-partners" data-testid="blocked-past">
            {past.map((block) => (
              <li key={block.id} data-mobile={block.mobile}>
                <div>
                  <p>
                    <span className="num ad-partners__name">{phoneText(block.mobile)}</span>
                  </p>
                  <p className="ad-partners__meta">
                    مسدود از {whenText(block.blockedAt, now)}
                    {block.blockedByName ? `، ${block.blockedByName}` : ''}
                    <FromOrder gate={gate} block={block} />
                  </p>
                  <p className="ad-partners__meta">
                    رفع {whenText(block.unblockedAt!, now)}
                    {block.unblockedByName ? `، ${block.unblockedByName}` : ''}
                  </p>
                  <p className="ad-partners__meta">دلیل: {block.reason}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="ad-hint ad-gap">مسدودی پاک نمی‌شود؛ تاریخچه برای همیشه می‌ماند.</p>
        </section>
      )}
    </>
  );
}
