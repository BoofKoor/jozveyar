import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { NoAccess } from '../../../../../../components/NoAccess';
import { RevertImportForm } from '../../../../../../components/RevertImportForm';
import { Segments } from '../../../../../../components/Segments';
import { panelPath } from '../../../../../../lib/gate';
import { REASON_MAX } from '../../../../../../lib/orders';
import { committedRows, numbersText } from '../../../../../../lib/shipments';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'برگرداندن ورود فایل پست' };

/**
 * برگرداندن یک ورود (طرح پنل `m-ship-revert`، ADR-045): فقط مالک (`shipments.revert`)، با دلیل و بی کد تازه. پیش از دکمه می‌گوید چه
 * می‌شود: کدها کنار می‌روند نه پاک، سفارش‌هایی که همین ورود «تحویل پست شد» کرد به «در حال چاپ» برمی‌گردند (اگر کد زندهٔ دیگری
 * ندارند)، و فایل برای سابقه می‌ماند و دوباره واردشدنی است.
 */
export default async function RevertImportPage({ params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'shipments.revert')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await shipments.page(session, id);
  if (!result.ok) notFound();
  const view = result.value;
  const self = panelPath(gate, `/shipments/${id}`);
  // فقط ورود ثبت‌شده برمی‌گردد، یک بار؛ بقیه صفحهٔ خودشان را دارند.
  if (view.kind !== 'committed' || view.import.status !== 'committed') redirect(`${self}?e=import_not_committed`);
  const rows = committedRows(view.committed);
  const live = view.committed.shipments.filter((shipment) => shipment.voidedAt === null).length;
  const handed = [
    ...new Set(rows.filter((row) => row.shipment?.handedOrder && row.shipment.voidedAt === null && row.order).map((row) => row.order!.orderNumber)),
  ].sort((a, b) => a - b);

  return (
    <>
      <Link href={self} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        <bdi>{view.import.filename}</bdi>
      </Link>
      <section className="jy-card" style={{ maxWidth: '36rem' }} aria-labelledby="t-revert">
        <h1 id="t-revert" className="jy-card__title">
          برگرداندن <bdi>{view.import.filename}</bdi>
        </h1>
        <ul className="ad-changes ad-gap">
          <li>
            <span className="ad-changes__k">کد رهگیری</span>
            <span>
              <span className="num">{formatNumber(live)}</span> کد کنار می‌رود، پاک نمی‌شود
            </span>
          </li>
          <li>
            <span className="ad-changes__k">وضعیت</span>
            <span>
              {handed.length > 0 ? (
                <>
                  سفارش <Segments segs={numbersText(handed)} /> به «در حال چاپ» {handed.length > 1 ? 'برمی‌گردند' : 'برمی‌گردد'}، مگر کد زندهٔ
                  دیگری داشته باشد
                </>
              ) : (
                'وضعیت هیچ سفارشی عوض نمی‌شود'
              )}
            </span>
          </li>
          <li>
            <span className="ad-changes__k">فایل</span>
            <span>برای سابقه می‌ماند و دوباره واردشدنی است</span>
          </li>
        </ul>
        <RevertImportForm gate={gate} id={id} maxLength={REASON_MAX} back={self} />
      </section>
    </>
  );
}
