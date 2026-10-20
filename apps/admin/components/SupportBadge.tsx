import type { SupportStatus } from '@jozveyar/db';

import { STATUS_LABELS } from '../lib/support';

/** حال گفت‌وگوی پشتیبانی (برش ۱۲٫۱، طرح): باز هشدار است، چون کار ماست؛ پاسخ‌داده موفق؛ بسته خنثی. نام کلاس‌ها کامل و ثابت‌اند. */
const BADGES: Record<SupportStatus, { badge: string; icon: string | null }> = {
  open: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning' },
  answered: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success' },
  closed: { badge: 'jy-badge jy-badge--neutral', icon: null },
};

export function SupportBadge({ status }: { status: SupportStatus }) {
  const { badge, icon } = BADGES[status];
  return (
    <span className={badge} data-thread-status={status}>
      {icon ? <span className={icon} aria-hidden="true" /> : null}
      {STATUS_LABELS[status]}
    </span>
  );
}
