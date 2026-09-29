import Link from 'next/link';

import { panelPath } from '../lib/gate';
import { fareText, orderLine, weightSegs, whyText, type ImportRowView } from '../lib/shipments';
import { Barcode } from './Barcode';
import { Segments } from './Segments';

/**
 * یک گروه سطرهای فایل پست (طرح `m-ship-preview`): هر سطر با شماره، «نام گ» و مقصد فایل، کد رهگیری، سفارشی که نشست یا دلیل حکم،
 * و وزن با کرایه و مالیات. `money`: کرایه و مالیات فقط با `orders.money` (از ۶٫۲ چاپخانه بی مبلغ، طرح).
 */
export function ImportRows({
  gate,
  id,
  title,
  sub,
  rows,
  committed,
  money,
}: {
  gate: string;
  id: string;
  title: string;
  sub: string;
  rows: readonly ImportRowView[];
  committed: boolean;
  money: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="jy-card ad-list" id={`g-${id}`} aria-labelledby={`t-g-${id}`} data-group={id}>
      <div className="jy-card__head">
        <h2 id={`t-g-${id}`} className="jy-card__title">
          {title} <span className="num">{rows.length}</span>
        </h2>
      </div>
      {sub ? <p className="ad-list__sub">{sub}</p> : null}
      <ol className="ad-rows">
        {rows.map((row) => {
          const why = whyText(row, { committed });
          const fare = money ? fareText(row) : null;
          return (
            <li key={row.rowNo} className="ad-prow" data-row={row.rowNo} data-verdict={row.verdict}>
              <span className="ad-prow__n num">{row.rowNo}</span>
              <p className="ad-prow__file">
                {row.purged ? (
                  <span className="ad-meta">متن سطر پس از روزهای نگهداری پاک شد</span>
                ) : (
                  <>
                    <b>
                      {row.surname}
                      {row.orderNumber !== null ? (
                        <>
                          {row.surname ? ' ' : ''}
                          <span className="num">{row.orderNumber}</span>
                        </>
                      ) : null}
                    </b>{' '}
                    <span className="ad-row__city">{row.destination}</span>
                  </>
                )}
              </p>
              <p className="ad-prow__bc">
                {row.barcode ? (
                  <Barcode code={row.barcode} />
                ) : row.barcodeText ? (
                  <bdi className="ad-ltr">{row.barcodeText}</bdi>
                ) : (
                  'بی کد رهگیری'
                )}
              </p>
              <div className="ad-prow__match">
                {row.verdict === 'matched' && row.order ? (
                  <p className="ad-prow__to">
                    <span className="jy-icon jy-icon-check" aria-hidden="true" />
                    <span>
                      <Link className="jy-link" href={panelPath(gate, `/orders/${row.order.orderNumber}`)}>
                        <Segments segs={orderLine(row.order).slice(0, 2)} />
                      </Link>
                      <Segments segs={orderLine(row.order).slice(2)} />
                    </span>
                  </p>
                ) : null}
                {why ? (
                  <p className="ad-prow__why">
                    <Segments segs={why} />
                  </p>
                ) : null}
                {row.shipment?.voidedAt ? <p className="ad-prow__why">کد کنار رفت: {row.shipment.voidReason}</p> : null}
                {row.costMismatch ? (
                  <p className="ad-prow__why">کرایه و مالیات با «هزینه کل» این سطر نمی‌خوانند؛ کرایه و مالیات ثبت می‌شوند.</p>
                ) : null}
              </div>
              <p className="ad-prow__w">{row.weightGrams ? <Segments segs={weightSegs(row.weightGrams)} /> : null}</p>
              {fare ? (
                <p className="ad-prow__fare">
                  <Segments segs={fare} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
