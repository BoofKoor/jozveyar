import { rowBadges, type BadgeTone } from '../lib/pages';
import type { PageRow } from '../lib/server/pages';

/** نام کلاس‌ها کامل و ثابت‌اند: Tailwind فقط آیکونی را می‌سازد که نامش عیناً در کد آمده باشد. */
const TONES: Record<BadgeTone, { badge: string; icon: string | null }> = {
  success: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success' },
  info: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-info' },
  warning: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning' },
  neutral: { badge: 'jy-badge jy-badge--neutral', icon: null },
};

/** نشان‌های حال یک صفحه (برش ۱۵٫۲، طرح «صفحه‌ها و مقاله‌ها»): روی سایت، زمان‌دار، پیش‌نویس، برداشته، متن پیش‌فرض و شمار هشدار. */
export function PageBadges({ row }: { row: PageRow }) {
  return (
    <>
      {rowBadges(row).map((badge) => {
        const tone = TONES[badge.tone];
        return (
          <span key={badge.text} className={tone.badge}>
            {tone.icon ? <span className={tone.icon} aria-hidden="true" /> : null}
            {badge.text}
          </span>
        );
      })}
    </>
  );
}
