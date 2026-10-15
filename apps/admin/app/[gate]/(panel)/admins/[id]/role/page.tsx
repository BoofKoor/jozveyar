import type { Metadata } from 'next';
import Link from 'next/link';

import { roleSeen } from '@jozveyar/db';

import { NoAccess } from '../../../../../../components/NoAccess';
import { RoleForm } from '../../../../../../components/RoleForm';
import { panelPath } from '../../../../../../lib/gate';
import { roleLabel } from '../../../../../../lib/messages';
import { isRoleTile } from '../../../../../../lib/roles';
import { requirePanel } from '../../../../../../lib/server/context';
import { adminTarget } from '../target';

export const metadata: Metadata = { title: 'عوض کردن نقش' };

/**
 * «عوض کردن نقش» (برش ۹٫۴، سؤال ۱۹۷): ادمین دیگر، فعال، دعوت‌شده یا غیرفعال؛ فقط مالک (`admins.manage`) و با کد تازه. نقش تازه از کار
 * بعدی‌اش در پنل اثر دارد و نشست‌هایش باز می‌مانند: مجوز و محدوده با هر درخواست خوانده می‌شوند.
 */
export default async function RoleAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { session, target, back } = await adminTarget(gate, id);
  if (!target) return <NoAccess gate={gate} session={session} />;
  const choices = await requirePanel(gate).auth.partnerChoices(session);
  if (!choices.ok) return <NoAccess gate={gate} session={session} />;
  const single = target.roles.length === 1 ? target.roles[0] : null;
  const today = roleLabel(target.roles, target.partner, { withRole: true });
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ادمین‌ها
      </Link>
      <RoleForm
        gate={gate}
        userId={target.user.id}
        name={target.user.displayName}
        seen={roleSeen(target.roles, target.partner?.id ?? null)}
        current={isRoleTile(single) ? single : null}
        currentPartner={target.partner?.id ?? null}
        lead={
          target.user.disabledAt
            ? `نقش امروز: ${today}؛ غیرفعال است. نقش تازه با «فعال کن با پیوند تازه» به کار می‌آید.`
            : `نقش امروز: ${today}. نقش تازه از کار بعدی‌اش در پنل اثر دارد و نشست‌های بازش می‌مانند.`
        }
        partners={choices.value.map(({ id: partnerId, name, cityName, isDefault }) => ({ id: partnerId, name, cityName, isDefault }))}
        partnersHref={panelPath(gate, '/partners')}
        back={back}
        notice={query.e === 'role_stale' ? 'role_stale' : null}
      />
    </>
  );
}
