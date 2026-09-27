/**
 * برچسب‌های سفارش (طرح پنل): مهلت تحویل به پست، وضعیت سفارش، و وضعیت هر تلاش پرداخت. رنگ وضعیت همیشه با آیکون و
 * متن. نام کلاس‌ها کامل و ثابت‌اند: Tailwind فقط آیکونی را می‌سازد که نامش عیناً در کد آمده باشد.
 */

import type { DueKind, OrderState, PaymentKind } from '../lib/orders';

const DUE: Record<DueKind, { badge: string; icon: string | null }> = {
  overdue: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error' },
  today: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning' },
  tomorrow: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-info' },
  later: { badge: 'jy-badge jy-badge--neutral', icon: null },
};

export function DueBadge({ kind, children }: { kind: DueKind; children: React.ReactNode }) {
  const { badge, icon } = DUE[kind];
  return (
    <span className={badge}>
      {icon ? <span className={icon} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** طرح پنل: در صف و در حال چاپ اطلاع‌اند (چاپگر برای دومی)، رسیده به پست موفق، و لغوشده خطا. */
const STATE: Record<OrderState, { badge: string; icon: string | null; label: string }> = {
  queued: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-info', label: 'در صف چاپ' },
  printing: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-printer', label: 'در حال چاپ' },
  handed: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success', label: 'تحویل پست شد' },
  cancelled: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error', label: 'لغو شد' },
  awaiting: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning', label: 'در انتظار پرداخت' },
  abandoned: { badge: 'jy-badge jy-badge--neutral', icon: null, label: 'رهاشده' },
};

export function StateBadge({ state }: { state: OrderState }) {
  const { badge, icon, label } = STATE[state];
  return (
    <span className={badge}>
      {icon ? <span className={icon} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

const PAYMENT: Record<PaymentKind, { badge: string; icon: string | null; label: string }> = {
  succeeded: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success', label: 'موفق' },
  failed: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error', label: 'ناموفق' },
  unreturned: { badge: 'jy-badge jy-badge--neutral', icon: null, label: 'بی برگشت' },
  pending: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-info', label: 'در درگاه' },
};

export function PaymentBadge({ kind }: { kind: PaymentKind }) {
  const { badge, icon, label } = PAYMENT[kind];
  return (
    <span className={badge}>
      {icon ? <span className={icon} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
