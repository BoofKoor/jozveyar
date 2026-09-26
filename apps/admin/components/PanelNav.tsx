'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface Tab {
  /** نشانی کامل، با مسیر محرمانه. */
  href: string;
  label: string;
}

/**
 * زبانه‌های پنل (طرح پنل، تصمیم ۲۴): بخش‌های همه در ردیف؛ بخش‌های مالک در دسکتاپ کنارشان و در گوشی زیر
 * «بیشتر»، تا زبانهٔ جاری همیشه دیده شود. زبانهٔ جاری `aria-current`؛ «بیشتر» با رفتن به صفحهٔ دیگر بسته
 * می‌شود.
 */
export function PanelNav({ home, primary, owner }: { home: string; primary: Tab[]; owner: Tab[] }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`));
  const current = (href: string) => (isCurrent(href) ? ('page' as const) : undefined);
  const ownerCurrent = owner.some((tab) => isCurrent(tab.href));

  return (
    <nav className="ad-wrap ad-nav" aria-label="بخش‌های پنل">
      {primary.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={current(tab.href)}>
          {tab.label}
        </Link>
      ))}
      {owner.map((tab) => (
        <Link key={tab.href} href={tab.href} className="ad-nav__wide" aria-current={current(tab.href)}>
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
              <Link key={tab.href} href={tab.href} aria-current={current(tab.href)}>
                {tab.label}
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
