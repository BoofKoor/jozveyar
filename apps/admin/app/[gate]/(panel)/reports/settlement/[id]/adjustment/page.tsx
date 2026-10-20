import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliNumeric, toLatinDigits } from '@jozveyar/text';

import { NoAccess } from '../../../../../../../components/NoAccess';
import { AdjustmentForm } from '../../../../../../../components/SettlementForms';
import { panelPath } from '../../../../../../../lib/gate';
import { STATUS_LABELS } from '../../../../../../../lib/orders';
import { searchOf } from '../../../../../../../lib/production';
import { tomansText } from '../../../../../../../lib/report';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { MissingPartner, rangeOf } from '../forms';

export const metadata: Metadata = { title: 'ثبت اصلاح تسویه' };

/**
 * «ثبت اصلاح» (برش ۱۰٫۳، سؤال ۳۹۶): مالک و حسابدار؛ از دکمهٔ صورت‌حساب، یا از ردیف «لغو پس از شروع چاپ» با سفارشش (`?order=`)، که فرم با
 * وضعیت و سهمش باز می‌شود.
 */
export default async function AdjustmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'settlements.manage')) return <NoAccess gate={gate} session={session} />;
  const { settlement } = requirePanel(gate);
  const result = await settlement.view(session, id, {});
  if (!result.ok) return <MissingPartner gate={gate} partner={session.partner !== null} />;
  const { statement, now } = result.value;
  const range = rangeOf(query);
  const back = `${panelPath(gate, `/reports/settlement/${statement.partner.id}`)}${searchOf(range)}`;
  const orderParam = typeof query.order === 'string' ? toLatinDigits(query.order) : '';
  const order = /^\d{1,9}$/.test(orderParam) ? await settlement.adjustable(session, statement.partner.id, Number(orderParam)) : null;
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صورت‌حساب {statement.partner.name}
      </Link>
      <AdjustmentForm
        target={{
          gate,
          partnerId: statement.partner.id,
          partnerName: statement.partner.name,
          seen: String(statement.version),
          request: randomUUID(),
          range,
          back,
        }}
        today={formatJalaliNumeric(now)}
        order={
          order
            ? {
                number: order.orderNumber,
                text: `سفارش ${order.orderNumber}، ${STATUS_LABELS[order.status]}؛ ${
                  order.shareRials === null ? 'سهمی نداشت' : `سهمش ${tomansText(order.shareRials)} تومان بود`
                }.`,
              }
            : null
        }
      />
    </>
  );
}
