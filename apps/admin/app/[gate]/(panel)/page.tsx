import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

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
 * (چندتا در حال چاپ است، و هفتهٔ گذشته چندتا به‌موقع به پست رسید)، هشدارها (PDF جزوه‌ای که ساخته نشد، پرداخت بی برگشت، از ۵٫۲
 * سفارش «در صف چاپ» بی چاپخانه، و از ۶٫۲ سطرهای صف تأیید و «کد رهگیری ندارد»)، و صف تحویل به ترتیب مهلت. کاربر چاپخانه (۵٫۳، طرح
 * `m-dash` با نقش «چاپخانه») همان را فقط برای سفارش‌های چاپخانهٔ خودش می‌بیند، بی مبلغ؛ «کد رهگیری ندارد» هم فقط سفارش‌های خودش، با
 * «فایل پست آن روز را بده» (تصمیم ۸۲). بقیهٔ هشدارها هرگز به او نمی‌رسند (سفارش پرداخت‌نشده و بی چاپخانه در محدوده‌اش نیست، و صف
 * تأیید با مالک و متصدی است).
 */
export default async function Dashboard({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { orders, sms: smsPanel } = requirePanel(gate);
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
  const [result, sms] = await Promise.all([orders.dashboard(session), smsPanel.alerts(session)]);
  if (!result.ok) return head;
  const { tiles, alerts, queue, open, slaDays, bounds, stats, untracked } = result.value;
  const statsLine = statsSegs(open, stats);
  const ordersHref = panelPath(gate, '/orders');
  const partner = session.partner;
  const money = can(session, 'orders.money');
  const unreturned = alerts.unreturned.reduce((sum, u) => sum + u.attempts, 0);
  const oneFailed = alerts.failedPdf.length === 1;
  const oneUnassigned = alerts.unassigned.length === 1;

  // هشدارها به ترتیب شدت (سؤال ۱۳۸): خطا (مشتری همین حالا گیر است)، هشدار (کاری با ماست)، اطلاع (خودش درست می‌شود).
  const notes: { tone: 'error' | 'warning' | 'info'; node: ReactNode }[] = [];
  if (alerts.failedPdf.length > 0) {
    notes.push({
      tone: 'error',
      node: (
        <p key="pdf" className="jy-note jy-note--error" data-alert="pdf">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            PDF جزوهٔ {oneFailed ? 'سفارش ' : 'سفارش‌های '}
            <OrderLinks gate={gate} numbers={alerts.failedPdf} /> ساخته نشد؛ پیش از چاپ دوباره {oneFailed ? 'بسازش' : 'بسازشان'}.
          </span>
        </p>
      ),
    });
  }
  if (sms.daily) {
    // سقف روزانهٔ کد (۷٫۱، ADR-049؛ طرح `m-dash7`): مالک و متصدی.
    notes.push({
      tone: 'error',
      node: (
        <p key="otp-day" className="jy-note jy-note--error" data-alert="otp-day">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <b>سقف روزانهٔ کد پیامکی پر شد</b> (<span className="num">{formatNumber(sms.daily.limit)}</span> کد، ساعت{' '}
            <span className="num">{formatTehranTime(sms.daily.at)}</span>). مشتری تازه تا پایان امروز کد نمی‌گیرد؛ گوشی‌ای که در{' '}
            <span className="num">30</span> روز گذشته تأیید شده کد نمی‌خواهد. اگر ربات نیست، سقف را در{' '}
            {can(session, 'settings.edit') ? (
              <Link className="jy-link" href={panelPath(gate, '/settings')}>
                تنظیمات
              </Link>
            ) : (
              'تنظیمات (مالک)'
            )}{' '}
            بالا ببر.
          </span>
        </p>
      ),
    });
  }
  if (sms.hourly) {
    notes.push({
      tone: 'error',
      node: (
        <p key="otp-hour" className="jy-note jy-note--error" data-alert="otp-hour">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <b>سقف ساعتی کد پیامکی امروز پر شد</b> (<span className="num">{formatNumber(sms.hourly.limit)}</span> کد در ساعت، ساعت{' '}
            <span className="num">{formatTehranTime(sms.hourly.at)}</span>). تا یک ساعت پس از آن مشتری تازه کد نمی‌گرفت. اگر ربات نیست، سقف را در{' '}
            {can(session, 'settings.edit') ? (
              <Link className="jy-link" href={panelPath(gate, '/settings')}>
                تنظیمات
              </Link>
            ) : (
              'تنظیمات (مالک)'
            )}{' '}
            بالا ببر.
          </span>
        </p>
      ),
    });
  }
  if (alerts.unassigned.length > 0) {
    // همان الگوی «PDF ساخته نشد» (۵٫۲): هر شماره پیوند سفارش، این‌بار یکراست به فرم انتخاب چاپخانه.
    notes.push({
      tone: 'warning',
      node: (
        <p key="partner" className="jy-note jy-note--warning" data-alert="partner">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            {oneUnassigned ? 'سفارش ' : 'سفارش‌های '}
            <OrderLinks gate={gate} numbers={alerts.unassigned} query={can(session, 'orders.assign') ? '?do=assign' : ''} />{' '}
            {oneUnassigned
              ? 'چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود. یکی را برایش انتخاب کن.'
              : 'چاپخانه ندارند: هنگام پرداختشان هیچ چاپخانهٔ فعالی نبود. برای هر کدام یکی انتخاب کن.'}
          </span>
        </p>
      ),
    });
  }
  if (alerts.reviewRows > 0) {
    // صف تأیید (۶٫۲)، فقط مالک و متصدی.
    notes.push({
      tone: 'warning',
      node: (
        <p key="review" className="jy-note jy-note--warning" data-alert="review">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <Link className="jy-link" href={panelPath(gate, '/shipments/review')}>
              <span className="num">{formatNumber(alerts.reviewRows)}</span> سطر فایل پست
            </Link>{' '}
            منتظر تأیید است؛ تا تأیید نشده، مشتری پیامک رهگیری نمی‌گیرد.
          </span>
        </p>
      ),
    });
  }
  if (alerts.smsFailed.length > 0) {
    // پیامک رهگیری که نرفت (۶٫۳؛ در طرح نبود): فقط مالک و متصدی، که «دوباره بفرست» دارند.
    notes.push({
      tone: 'warning',
      node: (
        <p key="sms" className="jy-note jy-note--warning" data-alert="sms">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            پیامک رهگیری {alerts.smsFailed.length === 1 ? 'سفارش ' : 'سفارش‌های '}
            <OrderLinks gate={gate} numbers={alerts.smsFailed} /> نرفت؛ از کارت «بستهٔ پستی» دوباره بفرست.
          </span>
        </p>
      ),
    });
  }
  if (alerts.paidSmsFailed.length > 0) {
    // پیامک پرداخت که نرفت (۷٫۱، مثل رهگیری): مالک و متصدی، از کارت «پرداخت‌ها».
    notes.push({
      tone: 'warning',
      node: (
        <p key="paid-sms" className="jy-note jy-note--warning" data-alert="paid-sms">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            پیامک پرداخت {alerts.paidSmsFailed.length === 1 ? 'سفارش ' : 'سفارش‌های '}
            <OrderLinks gate={gate} numbers={alerts.paidSmsFailed} /> نرفت؛ از کارت «پرداخت‌ها» دوباره بفرست.
          </span>
        </p>
      ),
    });
  }
  if (sms.credit) {
    notes.push({
      tone: 'warning',
      node: (
        <p key="credit" className="jy-note jy-note--warning" data-alert="credit">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <b>اعتبار پیامک کم است:</b> <span className="num">{formatNumber(Math.floor(sms.credit.credit))}</span> پیامک، زیر آستانهٔ{' '}
            <span className="num">{formatNumber(sms.credit.threshold)}</span>. در پنل sms.ir شارژ کن؛ بی اعتبار نه کد تأیید می‌رود، نه پیامک
            پرداخت و رهگیری.
          </span>
        </p>
      ),
    });
  }
  for (const day of untracked) {
    const one = day.orderNumbers.length === 1;
    // «کد رهگیری ندارد» (۶٫۲، تصمیم ۸۲): هر روز تحویل یک یادداشت؛ فایل پست همان روز راه جلوست.
    notes.push({
      tone: 'warning',
      node: (
        <p key={`untracked-${day.day.getTime()}`} className="jy-note jy-note--warning" data-alert="untracked">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            کد رهگیری {one ? 'سفارش ' : 'سفارش‌های '}
            <OrderLinks gate={gate} numbers={day.orderNumbers} /> نرسیده، با اینکه دو روز کاری از تحویل {one ? 'پستش' : 'پستشان'} (
            {formatJalaliWeekday(day.day)}) گذشته. فایل پست آن روز را{' '}
            <Link className="jy-link" href={panelPath(gate, '/shipments')}>
              {partner ? 'بده' : 'وارد کن'}
            </Link>
            .
          </span>
        </p>
      ),
    });
  }
  if (unreturned > 0) {
    notes.push({
      tone: 'info',
      node: (
        <p key="unreturned" className="jy-note jy-note--info" data-alert="unreturned">
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
      ),
    });
  }

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

      {notes.length > 0 ? <div className="ad-alerts">{notes.map((note) => note.node)}</div> : null}

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
