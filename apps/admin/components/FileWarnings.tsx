import type { PanelOrderItem } from '@jozveyar/db';

import { fileWarnings } from '../lib/orders';
import { Segments } from './Segments';

/**
 * هشدارهای فایل‌های جزوه (برش ۸٫۱؛ ADR-029، سؤال ۱۸۱): کیفیت اسکن و حاشیه از ۸٫۱ فقط در پنل دیده می‌شوند، و صفحهٔ خالی و فونت
 * جایگزین هم سایت و هم پنل؛ برای مالک، متصدی و چاپخانه، که چاپ می‌کند. صفحهٔ سفارش، و از ۹٫۱ مشخصات فهرست جمع‌وجور.
 */
export function FileWarnings({ item }: { item: PanelOrderItem }) {
  const warnings = fileWarnings(item);
  if (warnings.length === 0) return null;
  return (
    <ul className="ad-warnings" aria-label="هشدارهای فایل">
      {warnings.map((warning) => (
        <li key={warning.kind} className="jy-note jy-note--warning" data-testid={`file-warning-${warning.kind}`}>
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <Segments segs={warning.segs} />
          </span>
        </li>
      ))}
    </ul>
  );
}
