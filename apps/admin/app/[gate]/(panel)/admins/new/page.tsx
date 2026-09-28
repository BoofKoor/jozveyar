import type { Metadata } from 'next';
import Link from 'next/link';

import { InviteAdminForm } from '../../../../../components/InviteAdminForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'افزودن ادمین' };

/**
 * «افزودن ادمین» (طرح پنل `m-admin-invite`): متصدی، چاپخانه یا مالک؛ برای نقش «چاپخانه» (۵٫۳) یکی از چاپخانه‌های فعال، طرف قرارداد
 * اول و پیش‌فرض آخر.
 */
export default async function NewAdminPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'admins.manage')) return <NoAccess gate={gate} partner={session.partner} />;
  const choices = await auth.partnerChoices(session);
  if (!choices.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const back = panelPath(gate, '/admins');
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ادمین‌ها
      </Link>
      <InviteAdminForm
        gate={gate}
        back={back}
        partners={choices.value.map(({ id, name, cityName, isDefault }) => ({ id, name, cityName, isDefault }))}
        partnersHref={panelPath(gate, '/partners')}
      />
    </>
  );
}
