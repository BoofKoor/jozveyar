import { Logo } from '@jozveyar/ui';

import { PanelNav } from '../../../components/PanelNav';
import { panelPath } from '../../../lib/gate';
import { roleLabel } from '../../../lib/messages';
import { can } from '../../../lib/server/auth';
import { requireSession } from '../../../lib/server/context';
import { logoutAction } from '../actions';

/**
 * پوستهٔ پنل (طرح پنل، تصمیم ۲۴): سربرگ سفید با لوگو، «پنل مدیریت»، نام و نقش ادمین و «خروج»، و زبانه‌ها. کاربر چاپخانه (برش
 * ۵٫۳) به جای نقش نام چاپخانه‌اش را دارد («حسن · چاپ نور») و فقط «پیشخوان» و «سفارش‌ها». هر صفحه هم خودش نشست و مجوز را
 * می‌سنجد: چیدمان با رفتن از صفحه‌ای به صفحهٔ دیگر دوباره اجرا نمی‌شود.
 */
export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const session = await requireSession(gate);
  const home = panelPath(gate);
  const primary = [
    { href: home, label: 'پیشخوان' },
    ...(can(session, 'orders.read') ? [{ href: panelPath(gate, '/orders'), label: 'سفارش‌ها' }] : []),
    ...(can(session, 'tariff.read') ? [{ href: panelPath(gate, '/tariff'), label: 'تعرفه' }] : []),
  ];
  const owner = [
    ...(can(session, 'settings.edit') || can(session, 'secrets.edit') ? [{ href: panelPath(gate, '/settings'), label: 'تنظیمات' }] : []),
    ...(can(session, 'partners.manage') ? [{ href: panelPath(gate, '/partners'), label: 'چاپخانه‌ها' }] : []),
    ...(can(session, 'admins.manage') ? [{ href: panelPath(gate, '/admins'), label: 'ادمین‌ها' }] : []),
    ...(can(session, 'events.read') ? [{ href: panelPath(gate, '/events'), label: 'رویدادها' }] : []),
  ];

  return (
    <>
      <header className="ad-top">
        <div className="ad-wrap ad-head">
          <div className="ad-brand">
            <Logo height={52} />
            <span className="ad-brand__label">پنل مدیریت</span>
          </div>
          <div className="ad-user">
            <span>
              {session.displayName} · {roleLabel(session.roles, session.partner)}
            </span>
            <form action={logoutAction}>
              <input type="hidden" name="gate" value={gate} />
              <button type="submit" className="jy-btn jy-btn--text">
                خروج
              </button>
            </form>
          </div>
        </div>
        <PanelNav home={home} primary={primary} owner={owner} />
      </header>
      <main className="ad-wrap ad-page">{children}</main>
    </>
  );
}
