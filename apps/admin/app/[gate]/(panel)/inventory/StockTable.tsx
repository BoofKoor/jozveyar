import type { StockItem } from '@jozveyar/db';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { panelPath } from '../../../../lib/gate';
import { itemLabel, sheetsNumber, stockState } from '../../../../lib/inventory';

const TONE_BADGE = { error: 'jy-badge--error', warning: 'jy-badge--warning', ok: 'jy-badge--success' } as const;

/**
 * قلم‌های یک چاپخانه (برش ۱۰٫۴، سؤال‌های ۴۱۳ و ۴۱۴): کاغذ و اندازه، موجودی، نیاز سفارش‌های «در صف چاپ» و «پس از صف»، آستانه و حال. هر ردیف به
 * صفحهٔ همان قلم می‌رود.
 */
export function StockTable({ gate, items }: { gate: string; items: StockItem[] }) {
  return (
    <table className="ad-table ad-table--margin">
      <thead>
        <tr>
          <th scope="col">کاغذ</th>
          <th scope="col">موجودی (برگ)</th>
          <th scope="col">در صف</th>
          <th scope="col">پس از صف</th>
          <th scope="col">آستانه</th>
          <th scope="col">حال</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const state = stockState(item);
          return (
            <tr key={item.id} data-stock={itemLabel(item)}>
              <th scope="row">
                <span>
                  <Link className="jy-link" href={panelPath(gate, `/inventory/${item.partnerId}/${item.id}`)}>
                    {itemLabel(item)}
                  </Link>
                  {item.inTariff ? null : <span className="jy-badge jy-badge--neutral">در تعرفهٔ فعال نیست</span>}
                </span>
              </th>
              <td data-k="موجودی (برگ)">
                <span className="num">{sheetsNumber(item.balanceSheets)}</span>
              </td>
              <td data-k="در صف">
                {item.queued.orders === 0 ? (
                  '—'
                ) : (
                  <span>
                    <span className="num">{formatNumber(item.queued.sheets)}</span> برگ،{' '}
                    <span className="num">{formatNumber(item.queued.orders)}</span> سفارش
                  </span>
                )}
              </td>
              <td data-k="پس از صف">
                <span className="num">{sheetsNumber(item.balanceSheets - item.queued.sheets)}</span>
              </td>
              <td data-k="آستانه">{item.thresholdSheets === null ? '—' : <span className="num">{formatNumber(item.thresholdSheets)}</span>}</td>
              <td data-k="حال">
                <span className={`jy-badge ${TONE_BADGE[state.tone]}`}>{state.text}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
