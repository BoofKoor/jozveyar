import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { DiscountCodeView, DiscountOrderView } from '@jozveyar/db';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { DiscountForm } from '../../../../../components/DiscountForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { StateBadge } from '../../../../../components/OrderBadges';
import { Segments } from '../../../../../components/Segments';
import {
  DISCOUNT_STATE_LABEL,
  discountFormFrom,
  discountState,
  discountTermsText,
  discountUseText,
  discountWindowText,
} from '../../../../../lib/discounts';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { orderState } from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'کد تخفیف' };

type Query = Record<string, string | string[] | undefined>;

/** شرط‌ها و شمارهای کد برای کسی که فقط می‌بیند (حسابدار)؛ مالک همین‌ها را در فرم دارد. */
function Facts({ code, now }: { code: DiscountCodeView; now: Date }) {
  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-discount">
      <h1 id="t-discount" className="jy-card__title">
        کد <bdi className="ad-ltr ad-code">{code.code}</bdi>
      </h1>
      <dl className="ad-facts" data-discount-facts>
        <div>
          <dt>حال</dt>
          <dd>{DISCOUNT_STATE_LABEL[discountState(code, now)]}</dd>
        </div>
        <div>
          <dt>تخفیف</dt>
          <dd>
            <Segments segs={discountTermsText(code)} />
          </dd>
        </div>
        <div>
          <dt>روزها</dt>
          <dd>
            <Segments segs={discountWindowText(code)} />
          </dd>
        </div>
        <div>
          <dt>استفاده</dt>
          <dd>
            <Segments segs={discountUseText(code)} />
          </dd>
        </div>
        <div>
          <dt>هر مشتری</dt>
          <dd>
            <span className="num">{formatNumber(code.perCustomerLimit)}</span> بار
          </dd>
        </div>
        {code.note ? (
          <div>
            <dt>یادداشت</dt>
            <dd>{code.note}</dd>
          </div>
        ) : null}
        <div>
          <dt>ساخته شد</dt>
          <dd>
            {whenText(code.createdAt, now)}
            {code.createdByName ? `، ${code.createdByName}` : ''}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** سفارش‌های این کد، تازه‌ترین اول: شماره، وضعیت، تخفیف و مبلغ. */
function Orders({ gate, orders, now, linked }: { gate: string; orders: DiscountOrderView[]; now: Date; linked: boolean }) {
  return (
    <section className="jy-card ad-narrow ad-gap" aria-labelledby="t-dorders" data-discount-orders>
      <h2 id="t-dorders" className="jy-card__title">
        {orders.length === 0 ? (
          'هنوز سفارشی با این کد ساخته نشده'
        ) : (
          <>
            <span className="num">{orders.length}</span> سفارش با این کد
          </>
        )}
      </h2>
      {orders.length === 0 ? null : (
        <table className="ad-table ad-table--margin ad-discount-orders">
          <thead>
            <tr>
              <th scope="col">سفارش</th>
              <th scope="col">وضعیت</th>
              <th scope="col">تخفیف</th>
              <th scope="col">مبلغ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderNumber} data-order={order.orderNumber}>
                <th scope="row">
                  {linked ? (
                    <Link href={panelPath(gate, `/orders/${order.orderNumber}`)} className="jy-link num">
                      {order.orderNumber}
                    </Link>
                  ) : (
                    <span className="num">{order.orderNumber}</span>
                  )}
                  <span className="ad-meta">{whenText(order.paidAt ?? order.createdAt, now)}</span>
                </th>
                <td>
                  <StateBadge state={orderState(order.status, order.status === 'expired')} />
                </td>
                <td>
                  <span className="num">{formatTomans(order.discountRials, false)}</span>
                </td>
                <td>
                  <span className="num">{formatTomans(order.totalRials, false)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="ad-hint ad-gap">
        مبلغ‌ها تومان‌اند. «در انتظار پرداخت» تا 10 دقیقه پس از ساختن یا آخرین تلاش پرداخت جای کد را نگه می‌دارد؛ پرداخت‌شده یک استفاده است،
        لغوشده هم.
        {orders.length >= 200 ? ' فقط 200 سفارش تازه‌تر.' : ''}
      </p>
    </section>
  );
}

/**
 * یک کد تخفیف (برش ۱۱٫۴، سؤال‌های ۲۹۸ تا ۳۰۲): مالک فرم ویرایش را دارد (کدی که سفارش دارد فقط روز، سقف‌ها، روشن و یادداشت)، و حسابدار
 * شرط‌ها و شمارها را؛ هر دو سفارش‌های همین کد را. کد نادرست یا ناموجود ۴۰۴.
 */
export default async function DiscountPage({ params, searchParams }: { params: Promise<{ gate: string; id: string }>; searchParams: Promise<Query> }) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { discounts } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'discounts.read')) return <NoAccess gate={gate} session={session} />;
  const result = await discounts.page(session, id);
  if (!result.ok && result.error === 'discount_not_found') notFound();
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, code, orders, canManage } = result.value;
  const back = panelPath(gate, '/discounts');
  const notice = query.e === 'discount_changed' ? messageOf('discount_changed') : null;
  const linked = can(session, 'orders.read');

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        تخفیف‌ها
      </Link>
      {canManage ? (
        <DiscountForm
          key={code.updatedAt.getTime()}
          gate={gate}
          back={back}
          notice={notice}
          edit={{
            id: code.id,
            seen: String(code.updatedAt.getTime()),
            form: discountFormFrom(code),
            frozen: orders.length > 0,
            termsText: discountTermsText(code),
            meta: [DISCOUNT_STATE_LABEL[discountState(code, now)], ' · استفاده: ', ...discountUseText(code)],
          }}
        />
      ) : (
        <Facts code={code} now={now} />
      )}
      <Orders gate={gate} orders={orders} now={now} linked={linked} />
    </>
  );
}
