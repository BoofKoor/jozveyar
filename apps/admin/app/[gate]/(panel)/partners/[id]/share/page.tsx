import type { Metadata } from 'next';
import Link from 'next/link';

import { shareRialsOf } from '@jozveyar/db';

import { NoAccess } from '../../../../../../components/NoAccess';
import { ShareForm } from '../../../../../../components/ShareForm';
import { panelPath } from '../../../../../../lib/gate';
import { tomansText } from '../../../../../../lib/report';
import { shareSeen, shareText } from '../../../../../../lib/settlement';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'درصد سهم چاپخانه' };

/** سفارش نمونهٔ «مثلاً» (۲۴۵ هزار تومان، همان جزوهٔ نمونهٔ صفحهٔ اصلی). */
const EXAMPLE_BASE_RIALS = 2_450_000n;

/**
 * درصد سهم یک چاپخانه (برش ۱۰٫۳، سؤال ۳۹۱): فقط مالک، از ردیف «چاپخانه‌ها» یا هشدار پیشخوان؛ با کد تازه، و به «چاپخانه‌ها» برمی‌گردد.
 * غیرفعال هم، چون دوباره فعال می‌شود.
 */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'partners.manage')) return <NoAccess gate={gate} session={session} />;
  const backHref = panelPath(gate, '/partners');
  const backLink = (
    <Link href={backHref} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      چاپخانه‌ها
    </Link>
  );
  const result = await requirePanel(gate).partners.find(session, id);
  if (!result.ok) {
    return (
      <>
        {backLink}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این چاپخانه پیدا نشد
          </h1>
          <p className="ad-lead">چاپخانه‌ها در زبانهٔ «چاپخانه‌ها»اند.</p>
        </section>
      </>
    );
  }
  const partner = result.value;
  const current = partner.shareBp === null ? '' : shareText(partner.shareBp).replace('٪', '');
  return (
    <>
      {backLink}
      <ShareForm
        key={shareSeen(partner.shareBp)}
        gate={gate}
        id={partner.id}
        name={partner.name}
        seen={shareSeen(partner.shareBp)}
        current={current}
        example={
          partner.shareBp === null
            ? 'درصد سهم این چاپخانه هنوز تعیین نشده: سفارش‌هایی که حالا به آن سپرده شوند بی سهم‌اند.'
            : `امروز ${shareText(partner.shareBp)}: از سفارشی با جمع چاپ، کاغذ و صحافی ${tomansText(EXAMPLE_BASE_RIALS)} تومان، ${tomansText(shareRialsOf(EXAMPLE_BASE_RIALS, partner.shareBp))} تومان.`
        }
        back={backHref}
        notice={query.e === 'partner_share_changed' ? 'partner_share_changed' : null}
      />
    </>
  );
}
