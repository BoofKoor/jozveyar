import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { PartnerForm } from '../../../../../components/PartnerForm';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { partnerCityLabel } from '../../../../../lib/partners';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { CITIES_LIST, CitiesList } from '../cities';

export const metadata: Metadata = { title: 'ویرایش چاپخانه' };

/**
 * ویرایش چاپخانه (طرح پنل `m-partner-edit`، همان فرم افزودن): نام و شهر، از همان که مالک دید. اگر همین حالا جای دیگری عوض شد،
 * همین صفحه با نام و شهر تازه و پیامش (`?e=partner_changed`).
 */
export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { partners } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'partners.manage')) return <NoAccess gate={gate} />;
  const back = panelPath(gate, '/partners');
  const backLink = (
    <Link href={back} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      چاپخانه‌ها
    </Link>
  );
  const result = await partners.find(session, id);
  if (!result.ok) {
    return (
      <>
        {backLink}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این چاپخانه پیدا نشد
          </h1>
          <p className="ad-lead">از فهرست چاپخانه‌ها پیدایش کن.</p>
        </section>
      </>
    );
  }
  const partner = result.value;
  return (
    <>
      {backLink}
      {query.e === 'partner_changed' ? <Alert tone="error">{messageOf('partner_changed')}</Alert> : null}
      <PartnerForm
        key={`${partner.name}|${partner.cityId}`}
        gate={gate}
        back={back}
        citiesList={CITIES_LIST}
        partner={{ id: partner.id, name: partner.name, cityId: partner.cityId, cityLabel: partnerCityLabel(partner) }}
      />
      <CitiesList />
    </>
  );
}
