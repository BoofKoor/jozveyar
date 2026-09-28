import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import { formatJalaliWeekday, formatNumber, formatTehranTime } from '@jozveyar/text';

import { DueBadge } from '../../../components/OrderBadges';
import { OrderRows } from '../../../components/OrderRows';
import { Segments } from '../../../components/Segments';
import { panelPath } from '../../../lib/gate';
import { statsSegs } from '../../../lib/orders';
import { can } from '../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../lib/server/context';

export const metadata: Metadata = { title: 'پیشخوان' };

/** «10031»، «10031 و 10040»، «10031، 10040 و 10052»: هر شماره پیوند سفارش خودش (`query` کار همان صفحه، مثل `?do=assign`). */
function OrderLinks({ gate, numbers, query = '' }: { gate: string; numbers: readonly number[]; query?: string }) {
  return numbers.map((n, i) => (
    <Fragment key={n}>
      {i === 0 ? '' : i === numbers.length - 1 ? ' و ' : '، '}
      <Link className="jy-link" href={`${panelPath(gate, `/orders/${n}`)}${query}`}>
        <span className="num">{n}</span>
      </Link>
    </Fragment>
  ));
}

/**
 * پیشخوان (طرح پنل، ADR-039): چهار کاشی مهلت تحویل به پست به روز تهران (سفارش‌هایی که هنوز به پست نرسیده‌اند)، سطر آمار
 * (چندتا در حال چاپ است، و هفتهٔ گذشته چندتا به‌موقع به پست رسید)، هشدارها (PDF جزوه‌ای که ساخته نشد، پرداخت بی برگشت، و از ۵٫۲
 * سفارش «در صف چاپ» بی چاپخانه)، و صف تحویل به ترتیب مهلت. کاربر چاپخانه (۵٫۳، طرح `m-dash` با نقش «چاپخانه») همان را فقط برای
 * سفارش‌های چاپخانهٔ خودش می‌بیند، بی مبلغ؛ دو هشدار دیگر هرگز به او نمی‌رسند (سفارش پرداخت‌نشده و بی چاپخانه در محدوده‌اش نیست).
 */
export default async function Dashboard({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const now = new Date();
  const head = (
    <div className="ad-pagehead">
      <div>
        <h1 className="ad-title">پیشخوان</h1>
        <p className="ad-sub">
          {formatJalaliWeekday(now)}، ساعت <span className="num">{formatTehranTime(now)}</span>
        </p>
      </div>
    </div>
  );
  if (!can(session, 'orders.read')) return head;
  const result = await orders.dashboard(session);
  if (!result.ok) return head;
  const { tiles, alerts, queue, open, slaDays, bounds, stats } = result.value;
  const statsLine = statsSegs(open, stats);
  const ordersHref = panelPath(gate, '/orders');
  const partner = session.partner;
  const money = can(session, 'orders.money');
  const unreturned = alerts.unreturned.reduce((sum, u) => sum + u.attempts, 0);
  const oneFailed = alerts.failedPdf.length === 1;
  const oneUnassigned = alerts.unassigned.length === 1;

  return (
    <>
      {head}
      <section className="ad-due" aria-labelledby="t-due">
        <h2 id="t-due" className="ad-h2">
          تحویل به پست
        </h2>
        <p className="ad-meta">
          {partner
            ? `سفارش‌هایی که به ${partner.name} سپرده شده‌اند و هنوز به پست نرسیده‌اند، به ترتیب مهلت.`
            : 'سفارش‌های پرداخت‌شده‌ای که هنوز به پست نرسیده‌اند، به ترتیب مهلت.'}{' '}
          تعهد: <span className="num">{slaDays}</span> روز کاری بعد از پرداخت.
        </p>
        <ul className="ad-tiles">
          {tiles.map((tile) => (
            <li key={tile.kind}>
              <Link href={ordersHref} className="ad-tile" data-due={tile.kind}>
                <DueBadge kind={tile.kind}>{tile.label}</DueBadge>
                <span className="ad-tile__n num">{formatNumber(tile.count)}</span>
                <span className="ad-tile__t">{tile.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        {statsLine ? (
          <p className="ad-meta ad-gap" data-stats="">
            <Segments segs={statsLine} />
          </p>
        ) : null}
      </section>

      {alerts.failedPdf.length > 0 || unreturned > 0 || alerts.unassigned.length > 0 ? (
        <div className="ad-alerts">
          {alerts.failedPdf.length > 0 ? (
            <p className="jy-note jy-note--error" data-alert="pdf">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                PDF جزوهٔ {oneFailed ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.failedPdf} /> ساخته نشد؛ پیش از چاپ دوباره {oneFailed ? 'بسازش' : 'بسازشان'}.
              </span>
            </p>
          ) : null}
          {unreturned > 0 ? (
            <p className="jy-note jy-note--info" data-alert="unreturned">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                <Link
                  className="jy-link"
                  href={
                    alerts.unreturned.length === 1
                      ? panelPath(gate, `/orders/${alerts.unreturned[0]!.orderNumber}`)
                      : `${ordersHref}?status=awaiting`
                  }
                >
                  <span className="num">{formatNumber(unreturned)}</span> تلاش پرداخت
                </Link>{' '}
                از درگاه برنگشت.
              </span>
            </p>
          ) : null}
          {alerts.unassigned.length > 0 ? (
            // همان الگوی «PDF ساخته نشد» (۵٫۲): هر شماره پیوند سفارش، این‌بار یکراست به فرم انتخاب چاپخانه.
            <p className="jy-note jy-note--warning" data-alert="partner">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                {oneUnassigned ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.unassigned} query={can(session, 'orders.assign') ? '?do=assign' : ''} />{' '}
                {oneUnassigned
                  ? 'چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود. یکی را برایش انتخاب کن.'
                  : 'چاپخانه ندارند: هنگام پرداختشان هیچ چاپخانهٔ فعالی نبود. برای هر کدام یکی انتخاب کن.'}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section className={`jy-card ad-list${money ? '' : ' ad-list--nosum'}`} aria-labelledby="t-queue">
        <div className="jy-card__head">
          <h2 id="t-queue" className="jy-card__title">
            صف تحویل به پست
          </h2>
          {/* چاپخانه «سفارش‌ها» را در زبانه‌ها دارد؛ طرح صف او را بی این پیوند کشید */}
          {partner ? null : (
            <Link href={ordersHref} className="jy-btn jy-btn--text ad-card-head-btn">
              همهٔ سفارش‌ها
            </Link>
          )}
        </div>
        {queue.length > 0 ? (
          <OrderRows gate={gate} rows={queue} bounds={bounds} dates="due" money={money} />
        ) : (
          <p className="ad-empty">{partner ? 'هیچ سفارشی در صف نیست.' : 'هیچ سفارش پرداخت‌شده‌ای در صف نیست.'}</p>
        )}
        {open > queue.length ? (
          <div className="ad-pager">
            <span>
              <span className="num">{formatNumber(queue.length)}</span> سفارش اول از <span className="num">{formatNumber(open)}</span>
            </span>
            <Link href={ordersHref} className="jy-btn jy-btn--text">
              همه
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
