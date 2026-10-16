import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliNumeric } from '@jozveyar/text';

import { AvailabilityForm } from '../../../../../../components/AvailabilityForm';
import { NoAccess } from '../../../../../../components/NoAccess';
import { panelPath } from '../../../../../../lib/gate';
import { availabilitySeen, availabilityStateOf, availabilityView, closedLastDay } from '../../../../../../lib/partners';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'در دسترس بودن چاپخانه' };

/**
 * در دسترس بودن یک چاپخانه (برش ۱۰٫۱، سؤال‌های ۲۰۰ و ۲۶۷): مالک و متصدی برای هر چاپخانهٔ فعال، کاربر چاپخانه فقط برای خودش (چاپخانهٔ
 * دیگر همان «پیدا نشد»). از کارت «چاپخانه‌ها»ی پیشخوان یا ردیف «چاپخانه‌ها» باز می‌شود و به همان برمی‌گردد (`?back=partners`).
 */
export default async function AvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'partners.availability')) return <NoAccess gate={gate} session={session} />;
  const back = query.back === 'partners' && can(session, 'partners.manage') ? 'partners' : 'dashboard';
  const backHref = panelPath(gate, back === 'partners' ? '/partners' : '/');
  const backLink = (
    <Link href={backHref} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      {back === 'partners' ? 'چاپخانه‌ها' : 'پیشخوان'}
    </Link>
  );
  const result = await requirePanel(gate).partners.availability(session, id);
  if (!result.ok) {
    return (
      <>
        {backLink}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این چاپخانه پیدا نشد
          </h1>
          <p className="ad-lead">چاپخانه‌های فعال در کارت «چاپخانه‌ها»ی پیشخوان‌اند.</p>
        </section>
      </>
    );
  }
  const partner = result.value;
  const now = new Date();
  const state = availabilityStateOf(partner);
  const view = availabilityView(partner, now);
  const closedAhead = partner.availability === 'closed' && partner.closedUntil && partner.closedUntil.getTime() > now.getTime();
  return (
    <>
      {backLink}
      <AvailabilityForm
        key={availabilitySeen(state)}
        gate={gate}
        id={partner.id}
        name={partner.name}
        seen={availabilitySeen(state)}
        current={{
          // تعطیلی گذشته در فرم نمی‌ماند: حالش همان «باز» است.
          availability: partner.availability === 'closed' && !closedAhead ? 'open' : partner.availability,
          from: closedAhead && partner.closedFrom ? formatJalaliNumeric(partner.closedFrom) : formatJalaliNumeric(now),
          until: closedAhead && partner.closedUntil ? closedLastDay(partner.closedUntil) : '',
          note: partner.availabilityNote ?? '',
        }}
        lead={`امروز: ${view.text}${partner.availabilityNote && view.tone !== 'open' ? ` (${partner.availabilityNote})` : ''}. فقط سفارش‌های بعدی را جابه‌جا می‌کند؛ سفارش‌هایی که پیش‌تر سپرده شده‌اند در صف همین چاپخانه می‌مانند.`}
        back={back}
        backHref={backHref}
        notice={query.e === 'partner_availability_changed' ? 'partner_availability_changed' : null}
      />
    </>
  );
}
