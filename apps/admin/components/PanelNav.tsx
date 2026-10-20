'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatNumber } from '@jozveyar/text';

export interface Tab {
  /** نشانی کامل، با مسیر محرمانه. */
  href: string;
  label: string;
  /** نشانی‌های دیگری که این زبانه رویشان هم جاری است (گزارش ارسال زیر «گزارش‌ها»ی حسابدار، ۱۰٫۲). */
  also?: string[];
  /** شمار کنار نام: گفت‌وگوهای «باز» پشتیبانی (۱۲٫۱، سؤال ۳۱۳)؛ صفر یا نبودن یعنی هیچ. */
  count?: number;
}

/** شمار زبانه برای چشم، و همان برای صفحه‌خوان: «پشتیبانی، 3 بی پاسخ». */
function Count({ count, label }: { count: number; label: string }) {
  return (
    <>
      <span className="ad-count num" aria-hidden="true">
        {formatNumber(count)}
      </span>
      <span className="sr-only">
        ، {formatNumber(count)} {label}
      </span>
    </>
  );
}

const TabLabel = ({ tab }: { tab: Tab }) => (
  <>
    {tab.label}
    {tab.count ? <Count count={tab.count} label="بی پاسخ" /> : null}
  </>
);

/**
 * زبانه‌های پنل (طرح پنل، تصمیم ۲۴): بخش‌های همه در ردیف؛ بخش‌های مالک در دسکتاپ کنارشان و در گوشی زیر
 * «بیشتر»، تا زبانهٔ جاری همیشه دیده شود. زبانهٔ جاری `aria-current`؛ «بیشتر» با رفتن به صفحهٔ دیگر بسته
 * می‌شود. بی «بیشتر» (متصدی از ۱۱٫۳ پنج زبانه دارد) خود ردیف زبانه‌ها در گوشی می‌لغزد، نه صفحه (`ad-nav--slide`).
 * زبانه‌ای که شمار دارد (۱۲٫۱: «پشتیبانی» با گفت‌وگوهای باز) اگر زیر «بیشتر» است، شمارش روی خود «بیشتر» هم هست، تا در گوشی گم نشود.
 */
export function PanelNav({ home, primary, owner }: { home: string; primary: Tab[]; owner: Tab[] }) {
  const pathname = usePathname();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isCurrent = (tab: Tab) => (tab.href === home ? pathname === home : under(tab.href) || (tab.also ?? []).some(under));
  const current = (tab: Tab) => (isCurrent(tab) ? ('page' as const) : undefined);
  const ownerCurrent = owner.some(isCurrent);
  const moreCount = owner.reduce((sum, tab) => sum + (tab.count ?? 0), 0);

  return (
    <nav className={`ad-wrap ad-nav${owner.length > 0 ? '' : ' ad-nav--slide'}`} aria-label="بخش‌های پنل">
      {primary.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={current(tab)}>
          <TabLabel tab={tab} />
        </Link>
      ))}
      {owner.map((tab) => (
        <Link key={tab.href} href={tab.href} className="ad-nav__wide" aria-current={current(tab)}>
          <TabLabel tab={tab} />
        </Link>
      ))}
      {owner.length > 0 ? (
        <details key={pathname} className={`ad-more${ownerCurrent ? ' is-current' : ''}`}>
          <summary>
            بیشتر
            {moreCount > 0 ? <Count count={moreCount} label="پیام بی پاسخ" /> : null}
            <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
          </summary>
          <div className="ad-more__list">
            {owner.map((tab) => (
              <Link key={tab.href} href={tab.href} aria-current={current(tab)}>
                <TabLabel tab={tab} />
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
