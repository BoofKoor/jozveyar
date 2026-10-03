import type { Metadata } from 'next';
import Link from 'next/link';

import { NoAccess } from '../../../../../components/NoAccess';
import { PartnerForm } from '../../../../../components/PartnerForm';
import { panelPath } from '../../../../../lib/gate';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { CITIES_LIST, CitiesList } from '../cities';

export const metadata: Metadata = { title: 'افزودن چاپخانه' };

/** افزودن چاپخانه (طرح پنل `m-partner-edit`): نام و شهر، و از ۷٫۶ موبایل اعلان؛ فقط مالک. */
export default async function NewPartnerPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'partners.manage')) return <NoAccess gate={gate} partner={session.partner} />;
  const back = panelPath(gate, '/partners');
  const templateMissing = await settings.partnerTemplateMissing(session);
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        چاپخانه‌ها
      </Link>
      <PartnerForm
        gate={gate}
        back={back}
        citiesList={CITIES_LIST}
        templateMissing={templateMissing}
        keysHref={`${panelPath(gate, '/settings')}#keys`}
      />
      <CitiesList />
    </>
  );
}
