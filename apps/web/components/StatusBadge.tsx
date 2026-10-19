import type { OrderStatus } from '@jozveyar/contracts/checkout';

import { STATUS_LABELS } from '../lib/account';

/** رنگ و آیکون هر وضعیت؛ رنگ همیشه با آیکون و متن. نام کلاس‌ها کامل‌اند: Tailwind فقط آیکونی را می‌سازد که نامش در کد است. */
const BADGES: Record<OrderStatus, { badge: string; icon: string }> = {
  paid: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success' },
  printing: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-printer' },
  handed_to_post: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-truck' },
  cancelled: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error' },
  awaiting_payment: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning' },
  expired: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error' },
};

/** برچسب وضعیت سفارش، یکی برای صفحهٔ سفارش و «سفارش‌های من» (برش ۱۲٫۱، سؤال ۳۰۷: «همان برچسب صفحهٔ سفارش»). کامپوننت سرور. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { badge, icon } = BADGES[status];
  return (
    <span className={badge}>
      <span className={icon} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
