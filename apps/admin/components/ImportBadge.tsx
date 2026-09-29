import type { ShipmentImportStatus } from '@jozveyar/db';

import { IMPORT_BADGES } from '../lib/shipments';

/** نام کلاس‌ها کامل و ثابت، مثل `Alert`: Tailwind فقط نامی را می‌شناسد که عیناً در کد آمده. */
const BADGE_CLASS = { success: 'jy-badge jy-badge--success', error: 'jy-badge jy-badge--error', neutral: 'jy-badge jy-badge--neutral' } as const;

/** برچسب وضعیت ورود فایل پست (طرح `m-ship`)؛ رنگ همیشه با آیکون یا متن. */
export function ImportBadge({ status }: { status: ShipmentImportStatus }) {
  const badge = IMPORT_BADGES[status];
  return (
    <span className={BADGE_CLASS[badge.tone]} data-status={status}>
      {badge.tone === 'success' ? <span className="jy-icon jy-icon-success" aria-hidden="true" /> : null}
      {badge.tone === 'error' ? <span className="jy-icon jy-icon-error" aria-hidden="true" /> : null}
      {badge.label}
    </span>
  );
}
