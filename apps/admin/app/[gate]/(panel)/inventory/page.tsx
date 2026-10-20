import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { StockTable } from './StockTable';

export const metadata: Metadata = { title: 'موجودی کاغذ' };

/**
 * موجودی کاغذ (برش ۱۰٫۴، ADR-070، سؤال ۴۱۶): هر چاپخانه با کاغذهایی که موجودی‌شان را نگه می‌دارد؛ مالک و متصدی. کاربر چاپخانه یکراست به صفحهٔ
 * چاپخانهٔ خودش می‌رود. حسابدار نه (پیش از هر خواندن).
 */
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'inventory.read')) return <NoAccess gate={gate} session={session} />;
  if (session.partner) redirect(panelPath(gate, `/inventory/${session.partner.id}`));
  const result = await requirePanel(gate).inventory.overview(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { rows, canManage } = result.value;
  const error = typeof query.e === 'string' ? query.e : null;

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">موجودی کاغذ</h1>
          <p className="ad-sub">
            موجودی هر کاغذ هر چاپخانه، به برگ. «شروع چاپ» هر سفارش برگ‌هایش را خودش کم می‌کند و برگرداندن به صف برمی‌گرداند؛ ورود، ضایعات و شمارش
            دستی است.
          </p>
        </div>
      </div>
      {error === 'stock_partner_not_found' ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      {rows.map(({ partner, items }) => (
        <section key={partner.id} className="jy-card ad-gap" aria-labelledby={`t-${partner.id}`} data-stock-partner={partner.name}>
          <h2 id={`t-${partner.id}`} className="jy-card__title">
            <Link className="jy-link" href={panelPath(gate, `/inventory/${partner.id}`)}>
              {partner.name}
            </Link>{' '}
            · {partner.cityName}
            {partner.active ? null : <span className="jy-badge jy-badge--neutral">غیرفعال</span>}
          </h2>
          {items.length === 0 ? (
            <p className="ad-lead">
              هنوز موجودی هیچ کاغذی نگه داشته نمی‌شود.{' '}
              {canManage ? (
                <Link className="jy-link" href={panelPath(gate, `/inventory/${partner.id}`)}>
                  کاغذ تازه
                </Link>
              ) : null}
            </p>
          ) : (
            <>
              <p className="ad-hint">
                <span className="num">{formatNumber(items.length)}</span> کاغذ
              </p>
              <StockTable gate={gate} items={items} />
            </>
          )}
        </section>
      ))}
    </>
  );
}
