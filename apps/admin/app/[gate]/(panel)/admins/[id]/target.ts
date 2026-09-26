import { notFound } from 'next/navigation';

import { panelPath } from '../../../../../lib/gate';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

/** ادمین هدف صفحه‌های «کد ورود تازه» و «غیرفعال کن»؛ خود و ادمینی که نیست ۴۰۴. */
export async function adminTarget(gate: string, id: string) {
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'admins.manage')) return { session, target: null, back: panelPath(gate, '/admins') };
  const list = await auth.listAdmins(session);
  const target = list.ok ? list.value.find((item) => item.user.id === id) : undefined;
  if (!target || target.user.id === session.userId) notFound();
  return { session, target, back: panelPath(gate, '/admins') };
}
