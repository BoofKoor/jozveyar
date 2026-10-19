'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface Tab {
  /** نشانی کامل، با مسیر محرمانه. */
  href: string;
  label: string;
  /** نشانی‌های دیگری که این زبانه رویشان هم جاری است (گزارش ارسال زیر «گزارش‌ها»ی حسابدار، ۱۰٫۲). */
  also?: string[];
}

/**
 * زبانه‌های پنل (طرح پنل، تصمیم ۲۴): بخش‌های همه در ردیف؛ بخش‌های مالک در دسکتاپ کنارشان و در گوشی زیر
 * «بیشتر»، تا زبانهٔ جاری همیشه دیده شود. زبانهٔ جاری `aria-current`؛ «بیشتر» با رفتن به صفحهٔ دیگر بسته
 * می‌شود. بی «بیشتر» (متصدی از ۱۱٫۳ پنج زبانه دارد) خود ردیف زبانه‌ها در گوشی می‌لغزد، نه صفحه (`ad-nav--slide`).
 */
export function PanelNav({ home, primary, owner }: { home: string; primary: Tab[]; owner: Tab[] }) {
  const pathname = usePathname();
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isCurrent = (tab: Tab) => (tab.href === home ? pathname === home : under(tab.href) || (tab.also ?? []).some(under));
  const current = (tab: Tab) => (isCurrent(tab) ? ('page' as const) : undefined);
  const ownerCurrent = owner.some(isCurrent);

  return (
    <nav className={`ad-wrap ad-nav${owner.length > 0 ? '' : ' ad-nav--slide'}`} aria-label="بخش‌های پنل">
      {primary.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={current(tab)}>
          {tab.label}
        </Link>
      ))}
      {owner.map((tab) => (
        <Link key={tab.href} href={tab.href} className="ad-nav__wide" aria-current={current(tab)}>
          {tab.label}
        </Link>
      ))}
      {owner.length > 0 ? (
        <details key={pathname} className={`ad-more${ownerCurrent ? ' is-current' : ''}`}>
          <summary>
            بیشتر
            <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
          </summary>
          <div className="ad-more__list">
            {owner.map((tab) => (
              <Link key={tab.href} href={tab.href} aria-current={current(tab)}>
                {tab.label}
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
