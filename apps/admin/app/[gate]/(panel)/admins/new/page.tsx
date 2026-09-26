import type { Metadata } from 'next';
import Link from 'next/link';

import { InviteAdminForm } from '../../../../../components/InviteAdminForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { can } from '../../../../../lib/server/auth';
import { requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'افزودن متصدی' };

export default async function NewAdminPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const session = await requireSession(gate);
  if (!can(session, 'admins.manage')) return <NoAccess gate={gate} />;
  const back = panelPath(gate, '/admins');
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ادمین‌ها
      </Link>
      <InviteAdminForm gate={gate} back={back} />
    </>
  );
}
