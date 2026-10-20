import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliNumeric } from '@jozveyar/text';

import { NoAccess } from '../../../../../../../components/NoAccess';
import { PaymentForm } from '../../../../../../../components/SettlementForms';
import { panelPath } from '../../../../../../../lib/gate';
import { searchOf } from '../../../../../../../lib/production';
import { balanceText } from '../../../../../../../lib/settlement';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { MissingPartner, rangeOf } from '../forms';

export const metadata: Metadata = { title: 'ثبت پرداخت به چاپخانه' };

/** «ثبت پرداخت» (برش ۱۰٫۳، سؤال ۳۹۶): مالک و حسابدار؛ «همان که دیده شد» نسخهٔ دفتر همین لحظه است، و هر بار باز شدن فرم شناسهٔ تازه دارد. */
export default async function PaymentPage({
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
  const result = await requirePanel(gate).settlement.view(session, id, {});
  if (!result.ok) return <MissingPartner gate={gate} partner={session.partner !== null} />;
  const { statement, now } = result.value;
  const range = rangeOf(query);
  const back = `${panelPath(gate, `/reports/settlement/${statement.partner.id}`)}${searchOf(range)}`;
  const balance = balanceText(statement.balanceRials);
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صورت‌حساب {statement.partner.name}
      </Link>
      <PaymentForm
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
        balance={balance.tone === 'settled' ? 'تسویه' : `${balance.amount} تومان، ${balance.text}`}
      />
    </>
  );
}
