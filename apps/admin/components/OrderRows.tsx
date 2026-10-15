import Link from 'next/link';

import type { PanelOrderLine, PanelOrderSpec } from '@jozveyar/db';
import { formatTomans } from '@jozveyar/text';

import { dayText, whenText } from '../lib/format';
import { panelPath } from '../lib/gate';
import { dueBadge, isOpen, jozveSegs, rowState, type DayBounds } from '../lib/orders';
import { DueBadge } from './OrderBadges';
import { OrderSpec } from './OrderSpec';
import { Segments } from './Segments';

/** ستون آخر: `due` فقط مهلت؛ `created` زمان ساختن؛ `handed` رسیدن به پست؛ `cancelled` زمان لغو. */
type Dates = 'due' | 'created' | 'handed' | 'cancelled';

/**
 * خانه‌های یک ردیف سفارش (طرح پنل): در دسکتاپ ردیف جدول، در گوشی کارت فشرده. ستون آخر مهلت تحویل به پست است، فقط برای سفارش باز
 * (در صف و در حال چاپ)؛ در فهرست «تحویل پست شد» روزی که رسید، در «لغو شد» روز لغو، و برای سفارش پرداخت‌نشده (فهرست «در انتظار» و
 * «رهاشده») زمان ساختنش. بی `orders.money` (کاربر چاپخانه، ۵٫۳) بی ستون مبلغ. فهرست جمع‌وجور (۹٫۱) فلش کنار شماره دارد و، برای
 * مالک و متصدی، نام چاپخانه زیر وضعیت.
 */
function RowCells({
  row,
  bounds,
  dates,
  money,
  fold = false,
  partner = false,
}: {
  row: PanelOrderLine;
  bounds: DayBounds;
  dates: Dates;
  money: boolean;
  fold?: boolean;
  partner?: boolean;
}) {
  const state = rowState(row);
  const due = row.postHandoffDueAt && isOpen(row.status) ? dueBadge(row.postHandoffDueAt, bounds) : null;
  const when = dates === 'created' ? row.createdAt : dates === 'handed' ? row.handedToPostAt : dates === 'cancelled' ? row.cancelledAt : null;
  const stateCell = (
    <span
      className={
        state.icon === 'info' ? 'ad-row__state ad-row__state--info' : state.icon === 'warning' ? 'ad-row__state ad-row__state--warning' : 'ad-row__state'
      }
    >
      {state.icon === 'error' ? <span className="jy-icon jy-icon-error" aria-hidden="true" /> : null}
      {state.icon === 'warning' ? <span className="jy-icon jy-icon-warning" aria-hidden="true" /> : null}
      {state.icon === 'info' ? <span className="jy-icon jy-icon-info" aria-hidden="true" /> : null}
      {state.icon ? ' ' : null}
      {state.label}
    </span>
  );
  return (
    <>
      {fold ? (
        <span className="ad-row__id">
          <span className="num">{row.orderNumber}</span>
          <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
        </span>
      ) : (
        <span className="ad-row__id num">{row.orderNumber}</span>
      )}
      <span className="ad-row__who">
        <b>{row.recipientName}</b> <span className="ad-row__city">{row.cityName ?? row.provinceName}</span>
      </span>
      <span className="ad-row__what">
        <Segments segs={jozveSegs(row)} />
      </span>
      {money ? (
        <span className="ad-row__sum">
          <span className="num">{formatTomans(row.totalRials, false)}</span>
          <span className="ad-row__unit"> تومان</span>
        </span>
      ) : null}
      {partner && row.partnerName ? (
        <span className="ad-row__status">
          {stateCell}
          <span className="ad-row__prt">{row.partnerName}</span>
        </span>
      ) : (
        stateCell
      )}
      <span className="ad-row__due">
        {due ? (
          <DueBadge kind={due.kind}>{due.label}</DueBadge>
        ) : when ? (
          <span className="ad-row__city">
            {/* روز پستِ فایل پست ساعت ندارد (برش ۶٫۱). */}
            {dates === 'handed' && row.handedByFile ? dayText(when, bounds.at) : whenText(when, bounds.at)}
          </span>
        ) : (
          <span className="ad-row__none">
            <span aria-hidden="true">—</span>
            <span className="sr-only">بی مهلت</span>
          </span>
        )}
      </span>
    </>
  );
}

/** ردیف‌های صف پیشخوان: هر ردیف پیوند صفحهٔ سفارش. بی `orders.money` فهرستش `ad-list--nosum`. */
export function OrderRows({ gate, rows, bounds, dates, money }: { gate: string; rows: readonly PanelOrderLine[]; bounds: DayBounds; dates: Dates; money: boolean }) {
  return (
    <ul className="ad-rows">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={panelPath(gate, `/orders/${row.orderNumber}`)} className="ad-row" data-order={row.orderNumber}>
            <RowCells row={row} bounds={bounds} dates={dates} money={money} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * فهرست جمع‌وجور «سفارش‌ها» (برش ۹٫۱، طرح `m-l91`؛ سؤال‌های ۲۲۷ و ۲۲۸): هر ردیف `details` است و کل ردیف `summary`، پس کلیک (یا
 * Enter و فاصله) مشخصات فایل‌ها را همان‌جا باز و بسته می‌کند، بی JS، و چند ردیف با هم باز می‌مانند؛ «صفحهٔ کامل سفارش» درون
 * مشخصات است. مشخصات همهٔ ردیف‌های صفحه با یک فراخوانی ذخیره‌گاه می‌آید (`specs`)؛ ردیفی که مشخصاتش نیامد فقط پیوند صفحهٔ سفارش را دارد.
 */
export function OrderFolds({
  gate,
  rows,
  specs,
  bounds,
  dates,
  money,
  partner,
  canZip,
}: {
  gate: string;
  rows: readonly PanelOrderLine[];
  specs: ReadonlyMap<string, PanelOrderSpec>;
  bounds: DayBounds;
  dates: Dates;
  money: boolean;
  /** نام چاپخانه زیر وضعیت: مالک و متصدی؛ کاربر چاپخانه همه‌اش خودش است. */
  partner: boolean;
  /** «همهٔ فایل‌ها (zip)» (`files.download`). */
  canZip: boolean;
}) {
  return (
    <ul className="ad-rows">
      {rows.map((row) => {
        const spec = specs.get(row.id);
        return (
          <li key={row.id}>
            <details className="ad-fold">
              <summary className="ad-row" data-order={row.orderNumber}>
                <RowCells row={row} bounds={bounds} dates={dates} money={money} fold partner={partner} />
              </summary>
              {spec ? (
                <OrderSpec gate={gate} spec={spec} at={bounds.at} canZip={canZip} />
              ) : (
                <div className="ad-fold__body">
                  <div className="ad-zip">
                    <Link className="jy-btn jy-btn--text ad-zip__page" href={panelPath(gate, `/orders/${row.orderNumber}`)}>
                      صفحهٔ کامل سفارش
                      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
