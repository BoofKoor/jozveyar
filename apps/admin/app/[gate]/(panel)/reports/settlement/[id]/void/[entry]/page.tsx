import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliNumeric } from '@jozveyar/text';

import { NoAccess } from '../../../../../../../../components/NoAccess';
import { VoidForm } from '../../../../../../../../components/SettlementForms';
import { panelPath } from '../../../../../../../../lib/gate';
import { searchOf } from '../../../../../../../../lib/production';
import { entryEffectRials, entryKindText, signedTomansText } from '../../../../../../../../lib/settlement';
import { can } from '../../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../../lib/server/context';
import { rangeOf } from '../../forms';

export const metadata: Metadata = { title: 'باطل کردن ردیف دفتر' };

/** «باطل کن» یک ردیف دفتر تسویه (برش ۱۰٫۳، سؤال ۳۹۶): مالک و حسابدار، با دلیل و کد تازه؛ ردیف باطل‌شده دوباره باطل نمی‌شود. */
export default async function VoidPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string; entry: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id, entry: entryParam } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'settlements.manage')) return <NoAccess gate={gate} session={session} />;
  const range = rangeOf(query);
  const result = await requirePanel(gate).settlement.entry(session, id, entryParam);
  const back = `${panelPath(gate, `/reports/settlement/${id}`)}${searchOf(range)}`;
  if (!result.ok || result.value.entry.voided) {
    return (
      <>
        <Link href={back} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          صورت‌حساب
        </Link>
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            {result.ok ? 'این ردیف پیش‌تر باطل شده' : 'این ردیف دفتر پیدا نشد'}
          </h1>
        </section>
      </>
    );
  }
  const { partner, entry, version } = result.value;
  const summary = `${entryKindText(entry)}، ${signedTomansText(entryEffectRials(entry))} تومان، روز ${formatJalaliNumeric(entry.day)}${
    entry.note ? `: ${entry.note}` : ''
  }.`;
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صورت‌حساب {partner.name}
      </Link>
      <VoidForm
        target={{ gate, partnerId: partner.id, partnerName: partner.name, seen: String(version), request: '', range, back, entry: entry.id }}
        entry={entry.id}
        summary={summary}
      />
    </>
  );
}
