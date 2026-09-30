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
import { smsReached } from '../../../../../../lib/sms';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'برگرداندن ورود فایل پست' };

/**
 * برگرداندن یک ورود (طرح پنل `m-ship-revert`، ADR-045): فقط مالک (`shipments.revert`)، با دلیل و بی کد تازه. پیش از دکمه می‌گوید چه
 * می‌شود: کدها کنار می‌روند نه پاک (از ۶٫۲ کد تأیید و دستی هم)، سفارش‌هایی که کدی از همین ورود «تحویل پست شد»شان کرد به «در حال
 * چاپ» برمی‌گردند (اگر کد زندهٔ دیگری ندارند)، سطرهای صف تأیید این فایل بیرون می‌روند (تصمیم ۷۹)، و فایل برای سابقه می‌ماند و
 * دوباره واردشدنی است.
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
    ...new Set(view.committed.shipments.filter((shipment) => shipment.voidedAt === null && shipment.handedOrder).map((shipment) => shipment.orderNumber)),
  ].sort((a, b) => a - b);
  const queued = rows.filter((row) => row.queued).length;
  // پیامکی که رفت برنمی‌گردد (طرح `m-ship-revert`، ۶٫۳): سفارش‌هایی که پیامک کد زندهٔ همین ورود را گرفتند.
  const reached = smsReached(view.committed.shipments, view.now);

  return (
    <>
      <Link href={self} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        <bdi>{view.import.filename}</bdi>
      </Link>
      <section className="jy-card ad-narrow" aria-labelledby="t-revert">
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
          {queued > 0 ? (
            <li>
              <span className="ad-changes__k">صف تأیید</span>
              <span>
                <span className="num">{formatNumber(queued)}</span> سطر این فایل از صف بیرون می‌رود
              </span>
            </li>
          ) : null}
          <li>
            <span className="ad-changes__k">فایل</span>
            <span>برای سابقه می‌ماند و دوباره واردشدنی است</span>
          </li>
        </ul>
        {reached.length > 0 ? (
          <p className="jy-note jy-note--warning ad-gap" data-sms-reached="">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              پیامکی که رفت برنمی‌گردد. {reached.length > 1 ? 'این ' : ''}
              {reached.length > 1 ? (
                <>
                  <span className="num">{formatNumber(reached.length)}</span> سفارش کد رهگیری را پیامک گرفته‌اند:{' '}
                </>
              ) : (
                'سفارش '
              )}
              <Segments segs={numbersText(reached)} />
              {reached.length > 1 ? '. ' : ' کد رهگیری را پیامک گرفته است. '}
              اگر کدی اشتباه بود، خودت خبرشان کن. اگر همین کدها دوباره برای همان سفارش‌ها وارد شوند، پیامک دوباره نمی‌رود.
            </span>
          </p>
        ) : null}
        <RevertImportForm gate={gate} id={id} maxLength={REASON_MAX} back={self} />
      </section>
    </>
  );
}
