import { Logo } from '@jozveyar/ui';

import { PanelNav } from '../../../components/PanelNav';
import { panelPath } from '../../../lib/gate';
import { roleLabel } from '../../../lib/messages';
import { can } from '../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../lib/server/context';
import { logoutAction } from '../actions';

/**
 * پوستهٔ پنل (طرح پنل، تصمیم ۲۴): سربرگ سفید با لوگو، «پنل مدیریت»، نام و نقش ادمین و «خروج»، و زبانه‌ها. کاربر چاپخانه (برش
 * ۵٫۳) به جای نقش نام چاپخانه‌اش را دارد («حسن · چاپ نور») و فقط «پیشخوان» و «سفارش‌ها». از ۶٫۱ «ارسال» کنار «سفارش‌ها»؛ و تا
 * زبانه‌ها در گوشی ۳۲۰ پیکسلی جا شوند، «تعرفه»ی مالک با بخش‌های مالک (در دسکتاپ کنارشان، در گوشی زیر «بیشتر»)، و متصدی همان
 * ردیف (طرح برش ۶). حسابدار (۹٫۴) «پیشخوان»، «سفارش‌ها» و «گزارش‌ها». «گزارش‌ها» (۱۰٫۲، سؤال ۲۷۶) به گزارش تولید می‌رود: مالک در
 * بخش‌های مالک، و حسابدار و کاربر چاپخانه در ردیف؛ گزارش ارسال با چیپ همان صفحه، و برای حسابدار، که «ارسال» ندارد، زبانهٔ «گزارش‌ها»
 * روی گزارش ارسال هم جاری است. «تخفیف‌ها» (۱۱٫۴) برای مالک پس از «تعرفه» و برای حسابدار پس از «گزارش‌ها»، و «محتوای سایت» (۱۱٫۱) برای مالک
 * پس از «گزارش‌ها» و از ۱۱٫۳ برای متصدی در ردیف پس از «تعرفه»، با نوار اعلان (سؤال ۲۸۲). «پشتیبانی» (۱۲٫۱، سؤال ۳۱۳) پس از «سفارش‌ها»، با شمار
 * گفت‌وگوهای «باز»: متصدی در ردیف، و مالک اول بخش‌های خودش با «ارسال» پس از آن (در گوشی زیر «بیشتر»، با همان شمار روی «بیشتر»). «موجودی
 * کاغذ» (۱۰٫۴، سؤال ۴۱۶) پس از «ارسال»: متصدی و کاربر چاپخانه در ردیف، و مالک در بخش‌های خودش؛ حسابدار ندارد. هر صفحه هم
 * خودش نشست و مجوز را می‌سنجد: چیدمان با رفتن از صفحه‌ای به صفحهٔ دیگر دوباره اجرا نمی‌شود، پس شمار با هر کار فرم (که هدایت می‌کند) و هر
 * بار کردن کامل تازه می‌شود، و فهرست خود صندوق همیشه تازه است.
 */
export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const session = await requireSession(gate);
  const { support } = requirePanel(gate);
  const home = panelPath(gate);
  const open = await support.openSummary(session);
  const supportTab = open ? [{ href: panelPath(gate, '/support'), label: 'پشتیبانی', count: open.count }] : [];
  const ship = can(session, 'shipments.import') ? [{ href: panelPath(gate, '/shipments'), label: 'ارسال' }] : [];
  const tariff = can(session, 'tariff.read') ? [{ href: panelPath(gate, '/tariff'), label: 'تعرفه' }] : [];
  const inventory = can(session, 'inventory.read') ? [{ href: panelPath(gate, '/inventory'), label: 'موجودی کاغذ' }] : [];
  const reports = can(session, 'reports.production')
    ? [
        {
          href: panelPath(gate, '/reports'),
          label: 'گزارش‌ها',
          ...(can(session, 'reports.read') && !can(session, 'shipments.import') ? { also: [panelPath(gate, '/shipments/report')] } : {}),
        },
      ]
    : [];
  // تخفیف‌ها (۱۱٫۴، سؤال ۳۰۴): مالک در بخش‌های مالک پس از «تعرفه»، و حسابدار در ردیف پس از «گزارش‌ها».
  const discounts = can(session, 'discounts.read') ? [{ href: panelPath(gate, '/discounts'), label: 'تخفیف‌ها' }] : [];
  // محتوای سایت (۱۱٫۱ و ۱۱٫۳، سؤال ۲۸۲): مالک در بخش‌های مالک کنار «تعرفه» و «گزارش‌ها»، و متصدی (فقط نوار اعلان) در ردیف پس از «تعرفه».
  const content =
    can(session, 'content.edit') || can(session, 'content.bar') ? [{ href: panelPath(gate, '/content'), label: 'محتوای سایت' }] : [];
  const ownerOnly = [
    ...(can(session, 'settings.edit') || can(session, 'secrets.edit') ? [{ href: panelPath(gate, '/settings'), label: 'تنظیمات' }] : []),
    ...(can(session, 'partners.manage') ? [{ href: panelPath(gate, '/partners'), label: 'چاپخانه‌ها' }] : []),
    ...(can(session, 'admins.manage') ? [{ href: panelPath(gate, '/admins'), label: 'ادمین‌ها' }] : []),
    ...(can(session, 'events.read') ? [{ href: panelPath(gate, '/events'), label: 'رویدادها' }] : []),
  ];
  const primary = [
    { href: home, label: 'پیشخوان' },
    ...(can(session, 'orders.read') ? [{ href: panelPath(gate, '/orders'), label: 'سفارش‌ها' }] : []),
    ...(ownerOnly.length > 0 ? [] : [...supportTab, ...ship, ...inventory, ...reports, ...discounts, ...tariff, ...content]),
  ];
  const owner = ownerOnly.length > 0 ? [...supportTab, ...ship, ...inventory, ...tariff, ...discounts, ...reports, ...content, ...ownerOnly] : [];

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
