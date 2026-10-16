import Link from 'next/link';

import { panelPath } from '../lib/gate';
import { can, type AdminSession } from '../lib/server/auth';

/**
 * گزارش تولید و گزارش ارسال (۱۰٫۲، سؤال ۲۷۶): دو چیپ بالای هر دو صفحه، فقط برای کسی که هر دو را دارد (مالک و حسابدار). زبانهٔ «گزارش‌ها»
 * به گزارش تولید می‌رود؛ کاربر چاپخانه فقط گزارش تولید خودش را دارد و چیپی نمی‌بیند.
 */
export function ReportsNav({ gate, session, current }: { gate: string; session: AdminSession; current: 'production' | 'shipping' }) {
  if (!can(session, 'reports.production') || !can(session, 'reports.read')) return null;
  const tabs = [
    { key: 'production', href: panelPath(gate, '/reports'), label: 'گزارش تولید' },
    { key: 'shipping', href: panelPath(gate, '/shipments/report'), label: 'گزارش ارسال' },
  ] as const;
  return (
    <nav className="ad-chips" aria-label="گزارش‌ها" data-reports-nav>
      {tabs.map((tab) => (
        <Link key={tab.key} className="ad-chip" href={tab.href} aria-current={tab.key === current ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
