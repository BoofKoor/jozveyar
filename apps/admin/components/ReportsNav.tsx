import Link from 'next/link';

import { panelPath } from '../lib/gate';
import { can, type AdminSession } from '../lib/server/auth';

/**
 * گزارش‌ها (۱۰٫۲، سؤال ۲۷۶؛ از ۱۰٫۳ تسویه، سؤال ۳۹۸): یک چیپ برای هر گزارشی که این نشست دارد، بالای هر کدام، فقط وقتی بیش از یکی دارد:
 * مالک و حسابدار تولید، ارسال و تسویه، و کاربر چاپخانه تولید و تسویهٔ خودش. زبانهٔ «گزارش‌ها» به گزارش تولید می‌رود.
 */
export function ReportsNav({ gate, session, current }: { gate: string; session: AdminSession; current: 'production' | 'shipping' | 'settlement' }) {
  const tabs = [
    { key: 'production', href: panelPath(gate, '/reports'), label: 'گزارش تولید', allowed: can(session, 'reports.production') },
    { key: 'shipping', href: panelPath(gate, '/shipments/report'), label: 'گزارش ارسال', allowed: can(session, 'reports.read') },
    { key: 'settlement', href: panelPath(gate, '/reports/settlement'), label: 'تسویه', allowed: can(session, 'settlements.read') },
  ].filter((tab) => tab.allowed);
  if (tabs.length < 2) return null;
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
