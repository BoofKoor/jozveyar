import Link from 'next/link';

import type { PanelOrderLine } from '@jozveyar/db';
import { formatTomans } from '@jozveyar/text';

import { whenText } from '../lib/format';
import { panelPath } from '../lib/gate';
import { dueBadge, isOpen, jozveSegs, rowState, type DayBounds } from '../lib/orders';
import { DueBadge } from './OrderBadges';
import { Segments } from './Segments';

/**
 * ردیف‌های سفارش (طرح پنل): در دسکتاپ ردیف جدول، در گوشی کارت فشرده؛ هر ردیف پیوند جزئیات. ستون آخر مهلت تحویل
 * به پست است، فقط برای سفارش باز (در صف و در حال چاپ)؛ در فهرست «تحویل پست شد» روزی که رسید، در «لغو شد» روز لغو، و
 * برای سفارش پرداخت‌نشده (فهرست «در انتظار» و «رهاشده») زمان ساختنش.
 */
export function OrderRows({
  gate,
  rows,
  bounds,
  dates,
}: {
  gate: string;
  rows: readonly PanelOrderLine[];
  bounds: DayBounds;
  /** ستون آخر: `due` فقط مهلت؛ `created` زمان ساختن؛ `handed` رسیدن به پست؛ `cancelled` زمان لغو. */
  dates: 'due' | 'created' | 'handed' | 'cancelled';
}) {
  return (
    <ul className="ad-rows">
      {rows.map((row) => {
        const state = rowState(row);
        const due = row.postHandoffDueAt && isOpen(row.status) ? dueBadge(row.postHandoffDueAt, bounds) : null;
        const when =
          dates === 'created' ? row.createdAt : dates === 'handed' ? row.handedToPostAt : dates === 'cancelled' ? row.cancelledAt : null;
        return (
          <li key={row.id}>
            <Link href={panelPath(gate, `/orders/${row.orderNumber}`)} className="ad-row" data-order={row.orderNumber}>
              <span className="ad-row__id num">{row.orderNumber}</span>
              <span className="ad-row__who">
                <b>{row.recipientName}</b> <span className="ad-row__city">{row.cityName ?? row.provinceName}</span>
              </span>
              <span className="ad-row__what">
                <Segments segs={jozveSegs(row)} />
              </span>
              <span className="ad-row__sum">
                <span className="num">{formatTomans(row.totalRials, false)}</span>
                <span className="ad-row__unit"> تومان</span>
              </span>
              <span className={state.icon === 'info' ? 'ad-row__state ad-row__state--info' : 'ad-row__state'}>
                {state.icon === 'error' ? <span className="jy-icon jy-icon-error" aria-hidden="true" /> : null}
                {state.icon === 'info' ? <span className="jy-icon jy-icon-info" aria-hidden="true" /> : null}
                {state.icon ? ' ' : null}
                {state.label}
              </span>
              <span className="ad-row__due">
                {due ? (
                  <DueBadge kind={due.kind}>{due.label}</DueBadge>
                ) : when ? (
                  <span className="ad-row__city">{whenText(when, bounds.at)}</span>
                ) : (
                  <span className="ad-row__none">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">بی مهلت</span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
