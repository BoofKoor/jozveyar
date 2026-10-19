import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import { HELD_WATCH_MS } from '@jozveyar/db';
import { formatDeadlineDay, formatJalaliWeekday, formatNumber, formatTehranTime, formatTomans } from '@jozveyar/text';

import { Alert } from '../../../components/Alert';
import { DueBadge } from '../../../components/OrderBadges';
import { OrderRows } from '../../../components/OrderRows';
import { Segments } from '../../../components/Segments';
import { liveAlert } from '../../../lib/checkout';
import { dayText, whenText } from '../../../lib/format';
import { panelPath } from '../../../lib/gate';
import { statsSegs } from '../../../lib/orders';
import { availabilityView } from '../../../lib/partners';
import { can } from '../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../lib/server/context';
import { otpCapAlert } from '../../../lib/settings';

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

/** چیپ در دسترس بودن چاپخانه (۱۰٫۱): باز خبر خوب، شلوغ هشدار، تعطیل خطا، تعطیلی آینده خبر. */
const AVAILABILITY_BADGE = {
  open: 'jy-badge jy-badge--success',
  busy: 'jy-badge jy-badge--warning',
  closed: 'jy-badge jy-badge--error',
  scheduled: 'jy-badge jy-badge--info',
} as const;

/** رنگ سطر وضعیت مسیر خرید (کلاس کامل و ثابت، برای آیکون‌های کیت). */
const LIVE_NOTES = { error: 'jy-note jy-note--error', warning: 'jy-note jy-note--warning', info: 'jy-note jy-note--info' } as const;
const LIVE_ICONS = { error: 'jy-icon jy-icon-error', warning: 'jy-icon jy-icon-warning', info: 'jy-icon jy-icon-info' } as const;

/** نام هر تلاش بسته‌ای که پولش نزد درگاه ماند، در «پول مشتری برمی‌گردد» (برش ۷٫۲، طرح `m-dash-alerts`). */
const HELD_KIND: Record<string, string> = {
  order_not_payable: 'پرداخت دوم',
  amount_mismatch: 'پرداخت ناهمخوان',
  expired: 'پرداخت دیرهنگام',
};

/** «پرداخت دوم سفارش 10047 و پرداخت ناهمخوان 10044»: هر تلاش با شمارهٔ سفارشش، پیوند سفارش. */
function HeldList({ gate, held }: { gate: string; held: readonly { orderNumber: number; failureCode: string }[] }) {
  return held.map((item, i) => (
    <Fragment key={`${item.orderNumber}-${i}`}>
      {i === 0 ? '' : i === held.length - 1 ? ' و ' : '، '}
      {HELD_KIND[item.failureCode] ?? 'پرداخت'} سفارش{' '}
      <Link className="jy-link" href={panelPath(gate, `/orders/${item.orderNumber}`)}>
        <span className="num">{item.orderNumber}</span>
      </Link>
    </Fragment>
  ));
}

/**
 * پیشخوان (طرح پنل، ADR-039): چهار کاشی مهلت تحویل به پست به روز تهران (سفارش‌هایی که هنوز به پست نرسیده‌اند)، سطر آمار
 * (چندتا در حال چاپ است، و هفتهٔ گذشته چندتا به‌موقع به پست رسید)، هشدارها (PDF جزوه‌ای که ساخته نشد، پرداخت بی برگشت، از ۵٫۲
 * سفارش «در صف چاپ» بی چاپخانه، از ۶٫۲ سطرهای صف تأیید و «کد رهگیری ندارد»، و از ۷٫۱ سقف کد پیامکی کل سایت، اعتبار کم sms.ir و
 * پیامک پرداختی که نرفت؛ به ترتیب خطا، هشدار و خبر، سؤال ۱۴۰؛ از ۷٫۵ وضعیت مسیر خرید روی سایت بالای همه)، و صف تحویل به ترتیب مهلت. کاربر چاپخانه (۵٫۳، طرح
 * `m-dash` با نقش «چاپخانه») همان را فقط برای سفارش‌های چاپخانهٔ خودش می‌بیند، بی مبلغ؛ «کد رهگیری ندارد» هم فقط سفارش‌های خودش، با
 * «فایل پست آن روز را بده» (تصمیم ۸۲). بقیهٔ هشدارها هرگز به او نمی‌رسند (سفارش پرداخت‌نشده و بی چاپخانه در محدوده‌اش نیست، و صف
 * تأیید با مالک و متصدی است).
 */
export default async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const { orders, settings, reviews } = requirePanel(gate);
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
  const { tiles, alerts, queue, open, slaDays, bounds, stats, untracked, partners: board, assignment } = result.value;
  // هشدارهای پیامک (۷٫۱) و وضعیت مسیر خرید روی سایت (۷٫۵): فقط مالک و متصدی؛ سرویس خودش می‌سنجد.
  // نظرهای تازه (۱۲٫۳): فقط مالک (`reviews.manage`)؛ برای بقیه null.
  const [sms, checkout, pendingReviews] = await Promise.all([settings.smsAlerts(session), settings.checkoutStatus(session), reviews.pendingCount(session)]);
  const live = liveAlert(checkout, now);
  // درگاه آماده نیست (کد ۱۱۵ یا کد پذیرنده) و سایت `live` آماده است: مشتری تازه «موقتاً متوقف» می‌بیند (سؤال‌های ۱۳۹ و ۱۶۶).
  const pausedByGateway = checkout?.readiness.ready === true;
  const cap = sms.otpCap ? otpCapAlert(sms.otpCap, now) : null;
  const low = sms.lowCredit;
  const settingsLink = can(session, 'settings.edit') ? (
    <>
      سقف را در{' '}
      <Link className="jy-link" href={panelPath(gate, '/settings#otp')}>
        «تنظیمات»
      </Link>{' '}
      بالا ببر.
    </>
  ) : (
    'به مالک بگو سقف را در «تنظیمات» بالا ببرد.'
  );
  const statsLine = statsSegs(open, stats);
  const ordersHref = panelPath(gate, '/orders');
  const partner = session.partner;
  const money = can(session, 'orders.money');
  const unreturned = alerts.unreturned.reduce((sum, u) => sum + u.attempts, 0);
  const oneFailed = alerts.failedPdf.length === 1;
  const oneUnassigned = alerts.unassigned.length === 1;
  // پول و درگاه (۷٫۲): پولی که دو ساعت پس از پرداخت هنوز نزد درگاه است دیگر خبر نیست، هشدار است.
  const heldLate = alerts.held.filter((item) => now.getTime() - item.createdAt.getTime() > HELD_WATCH_MS);
  const heldSoon = alerts.held.filter((item) => now.getTime() - item.createdAt.getTime() <= HELD_WATCH_MS);
  const rejected = alerts.gatewayRejected;
  const merchantLink = can(session, 'secrets.edit') ? (
    <>
      کد پذیرنده را در{' '}
      <Link className="jy-link" href={panelPath(gate, '/settings#key-PAYMENT_MERCHANT_ID')}>
        «تنظیمات»
      </Link>{' '}
      بیازما.
    </>
  ) : (
    'به مالک بگو کد پذیرنده را در «تنظیمات» بیازماید.'
  );
  const auto = alerts.autoClosed;
  // تخصیص دستی (۱۰٫۱، سؤال ۱۹۹): سفارش بی چاپخانه کار روزمره است، پس خبر، نه هشدار.
  const manual = assignment?.mode === 'manual';
  const closed = assignment?.closed ?? [];
  const allClosed = assignment?.allClosed ?? null;
  const doneAvailability = query.done === 'availability' ? board.find((row) => row.id === query.p) : undefined;

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

      {doneAvailability ? (
        <Alert tone="success">
          {doneAvailability.name} حالا {availabilityView(doneAvailability, now).text} است؛ از سفارش بعدی اثر دارد.
        </Alert>
      ) : null}

      {live ||
      closed.length > 0 ||
      alerts.failedPdf.length > 0 ||
      unreturned > 0 ||
      rejected ||
      alerts.mismatched.length > 0 ||
      alerts.verifiedUnused.length > 0 ||
      alerts.held.length > 0 ||
      alerts.unassigned.length > 0 ||
      alerts.reviewRows > 0 ||
      alerts.smsFailed.length > 0 ||
      alerts.paidSmsFailed.length > 0 ||
      alerts.partnerSmsFailed.length > 0 ||
      alerts.unrefunded.length > 0 ||
      alerts.refunding.length > 0 ||
      untracked.length > 0 ||
      (pendingReviews ?? 0) > 0 ||
      cap ||
      low ? (
        // ترتیب (سؤال ۱۴۰): اول آنچه پول یا مسیر خرید همه را می‌بندد (خطا)، بعد آنچه کار مالک یا متصدی می‌خواهد (هشدار)، بعد خبر.
        <div className="ad-alerts">
          {live ? (
            // وضعیت مسیر خرید روی سایت، بالای همه (۷٫۵، سؤال ۱۴۰): فقط وقتی `.env` `live` می‌خواهد، و وقتی برای همه باز است هیچ.
            <p className={LIVE_NOTES[live.tone]} data-alert="checkout" data-live={live.kind}>
              <span className={LIVE_ICONS[live.tone]} aria-hidden="true" />
              <span>
                <b>{live.head}</b>
                <Segments segs={live.text} />
                {can(session, 'settings.edit') ? (
                  <>
                    {' '}
                    <Link className="jy-link" href={panelPath(gate, '/settings#checkout')}>
                      {live.link}
                    </Link>
                    .
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {rejected ? (
            // درگاه شروع پرداخت را رد کرد و کار مالک است (۷٫۲، سؤال ۱۳۹): تا اولین شروع یا «آزمایش» درست کد پذیرنده.
            <p className="jy-note jy-note--error" data-alert="gateway">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {rejected.result === 115 ? (
                <span>
                  <b>زیبال IP سرور را نپذیرفت</b> (کد <span className="num">115</span>)، {whenText(rejected.at, now)}
                  {rejected.orderNumber !== null ? (
                    <>
                      {' '}
                      هنگام {rejected.stage === 'inquiry' ? 'استعلام پرداخت' : 'پرداخت'} سفارش{' '}
                      <OrderLinks gate={gate} numbers={[rejected.orderNumber]} />
                    </>
                  ) : null}
                  . تا IP همین سرور در پنل زیبال ثبت نشود، پرداخت تازه شروع نمی‌شود و پرداخت‌های در راه تأیید نمی‌شوند (پولشان خودکار برمی‌گردد)
                  {pausedByGateway ? '؛ برای همین مسیر خرید برای مشتری تازه «موقتاً متوقف» است.' : '.'} بعد از ثبت IP، {merchantLink}
                </span>
              ) : (
                <span>
                  <b>زیبال کد پذیرنده را نپذیرفت</b> (کد <span className="num">{rejected.result}</span>)، {whenText(rejected.at, now)}
                  {rejected.orderNumber !== null ? (
                    <>
                      {' '}
                      هنگام {rejected.stage === 'inquiry' ? 'استعلام پرداخت' : 'پرداخت'} سفارش{' '}
                      <OrderLinks gate={gate} numbers={[rejected.orderNumber]} />
                    </>
                  ) : null}
                  . تا کد پذیرندهٔ درست نیاید، پرداخت تازه شروع نمی‌شود
                  {pausedByGateway ? '؛ برای همین مسیر خرید برای مشتری تازه «موقتاً متوقف» است.' : '.'} کد را از پنل زیبال بردار؛ {merchantLink}
                </span>
              )}
            </p>
          ) : null}
          {alerts.mismatched.map((item) => (
            // مبلغی که درگاه گفت با سفارش نخواند (۷٫۲، ADR-050): `verify` نخورد؛ هر تلاش یک یادداشت.
            <p key={`m-${item.orderNumber}-${item.createdAt.getTime()}`} className="jy-note jy-note--error" data-alert="mismatch">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                <b>مبلغ ناهمخوان:</b> زیبال برای یک تلاش پرداخت سفارش <OrderLinks gate={gate} numbers={[item.orderNumber]} />
                {item.reportedRials !== null ? (
                  <>
                    {' '}
                    مبلغ <span className="num">{formatTomans(item.reportedRials, false)}</span> تومان گزارش داد، نه{' '}
                    <span className="num">{formatTomans(item.amountRials, false)}</span>
                  </>
                ) : (
                  ' مبلغ دیگری گزارش داد'
                )}
                . تأیید نشد و سفارش پرداخت‌نشده ماند؛ پول مشتری خودکار برمی‌گردد. یعنی کسی یا چیزی مبلغ دیگری به درگاه داده؛ جزئیاتش در همان
                سفارش است.
              </span>
            </p>
          ))}
          {alerts.verifiedUnused.length > 0 ? (
            // تأییدشده ولی سفارش نگرفتش (۷٫۲): خودکار برنمی‌گردد؛ بازپرداخت از پنل با ۷٫۳.
            <p className="jy-note jy-note--error" data-alert="verified-unused">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                <b>پولی که خودکار برنمی‌گردد:</b> زیبال یک تلاش پرداخت {alerts.verifiedUnused.length === 1 ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.verifiedUnused.map((item) => item.orderNumber)} /> را تأییدشده می‌گوید، ولی سفارش آن را
                نگرفت. این پول را از پنل زیبال به همان کارت برگردان.
              </span>
            </p>
          ) : null}
          {alerts.failedPdf.length > 0 ? (
            <p className="jy-note jy-note--error" data-alert="pdf">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                PDF جزوهٔ {oneFailed ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.failedPdf} /> ساخته نشد؛ پیش از چاپ دوباره {oneFailed ? 'بسازش' : 'بسازشان'}.
              </span>
            </p>
          ) : null}
          {low && low.credit <= 0 ? (
            <p className="jy-note jy-note--error" data-alert="credit">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                <b>اعتبار پیامک sms.ir تمام شد.</b> شارژ کن؛ بی اعتبار کد تأیید نمی‌رود و کسی نمی‌تواند سفارش بدهد.
              </span>
            </p>
          ) : null}
          {cap && cap.tone === 'warning' ? (
            <p className="jy-note jy-note--warning" data-alert="otp-cap">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <b>{cap.head}</b>
                <Segments segs={cap.text} /> اگر مشتری واقعی است، {settingsLink}
              </span>
            </p>
          ) : null}
          {low && low.credit > 0 ? (
            <p className="jy-note jy-note--warning" data-alert="credit">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <b>اعتبار پیامک کم است:</b> <span className="num">{formatNumber(low.credit)}</span> در sms.ir
                {low.days !== null ? (
                  <>
                    ، برای حدود <span className="num">{formatNumber(low.days)}</span> روز با مصرف هفتهٔ گذشته
                  </>
                ) : null}
                . شارژ کن؛ بی اعتبار کد تأیید نمی‌رود و کسی نمی‌تواند سفارش بدهد.
              </span>
            </p>
          ) : null}
          {alerts.unrefunded.length === 1 ? (
            // پول سفارش لغوشده (۷٫۳، سؤال ۱۵۸؛ طرح `m-dash-alerts`): از لغو تا «برگشت داده شد»، فقط مالک و متصدی.
            <p className="jy-note jy-note--warning" data-alert="unrefunded">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                پول{' '}
                <Link className="jy-link" href={panelPath(gate, `/orders/${alerts.unrefunded[0]!.orderNumber}`)}>
                  سفارش لغوشدهٔ <span className="num">{alerts.unrefunded[0]!.orderNumber}</span>
                </Link>{' '}
                هنوز برنگشته
                {alerts.unrefunded[0]!.cancelledAt ? (
                  <>
                    {' '}
                    (لغو {dayText(alerts.unrefunded[0]!.cancelledAt, now)}، <span className="num">{formatTehranTime(alerts.unrefunded[0]!.cancelledAt)}</span>)
                  </>
                ) : null}
                . از صفحهٔ سفارش برش گردان.
              </span>
            </p>
          ) : alerts.unrefunded.length > 1 ? (
            <p className="jy-note jy-note--warning" data-alert="unrefunded">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                پول سفارش‌های لغوشدهٔ <OrderLinks gate={gate} numbers={alerts.unrefunded.map((row) => row.orderNumber)} /> هنوز برنگشته. از صفحهٔ
                هر کدام برش گردان.
              </span>
            </p>
          ) : null}
          {alerts.refunding.length > 0 ? (
            // بازپرداختی که دو ساعت پس از درخواست هنوز بسته نشده (۷٫۳، سؤال ۱۵۸).
            <p className="jy-note jy-note--warning" data-alert="refunding">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <b>بازپرداخت هنوز در حال برگشت:</b> {alerts.refunding.length === 1 ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.refunding.map((row) => row.orderNumber)} />؛ بیش از دو ساعت از درخواست گذشته و درگاه هنوز
                «برگشت داده شد» نگفته
                {alerts.refunding.some((row) => row.unknown) ? '، و درخواستی هم جواب روشن نگرفته' : ''}. از صفحهٔ سفارش «استعلام از درگاه» بزن؛ اگر
                همان ماند، از پشتیبانی درگاه بپرس.
              </span>
            </p>
          ) : null}
          {allClosed ? (
            // همه تعطیل (۱۰٫۱، سؤال ۲۶۵): سفارش تازه پیش اولین چاپخانه‌ای می‌ماند که باز می‌شود، و سایت نوارش را نشان می‌دهد.
            <p className="jy-note jy-note--warning" data-alert="all-closed">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                همهٔ چاپخانه‌ها تا {formatDeadlineDay(allClosed.until)} تعطیل‌اند. سفارش تازه پیش اولین چاپخانه‌ای می‌رود که باز می‌شود، مهلت تحویل به
                پستش از روز باز شدن شمرده می‌شود، و سایت همین را در نواری بالای همهٔ صفحه‌ها، جای نوار اعلان، می‌گوید.
              </span>
            </p>
          ) : null}
          {closed.map((row) =>
            // چاپخانهٔ تعطیل (۱۰٫۱، سؤال ۲۶۸): سفارش‌های «در صف چاپ»ش تا باز شدن می‌مانند؛ هر شماره یکراست به فرم جابه‌جایی.
            row.queued.length > 0 ? (
              <p key={row.id} className="jy-note jy-note--warning" data-alert="closed" data-partner={row.name}>
                <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                <span>
                  {row.name} {availabilityView(row, now).text} است{row.availabilityNote ? ` (${row.availabilityNote})` : ''}، و{' '}
                  {row.queued.length === 1 ? 'سفارش ' : 'سفارش‌های '}
                  <OrderLinks gate={gate} numbers={row.queued.slice(0, 12)} query="?do=assign" />
                  {row.queued.length > 12 ? ` و ${formatNumber(row.queued.length - 12)} سفارش دیگر` : ''} هنوز در صفش{' '}
                  {row.queued.length === 1 ? 'است؛ اگر مهلتش پیش از باز شدن است، جابه‌جایش کن.' : 'هستند؛ اگر مهلتشان پیش از باز شدن است، جابه‌جایشان کن.'}
                </span>
              </p>
            ) : (
              <p key={row.id} className="jy-note jy-note--info" data-alert="closed" data-partner={row.name}>
                <span className="jy-icon jy-icon-info" aria-hidden="true" />
                <span>
                  {row.name} {availabilityView(row, now).text} است{row.availabilityNote ? ` (${row.availabilityNote})` : ''}؛ تا آن روز سفارش تازه
                  نمی‌گیرد.
                </span>
              </p>
            ),
          )}
          {alerts.unassigned.length > 0 ? (
            // همان الگوی «PDF ساخته نشد» (۵٫۲): هر شماره پیوند سفارش، این‌بار یکراست به فرم انتخاب چاپخانه. در تخصیص دستی (۱۰٫۱) خبر است.
            <p className={manual ? 'jy-note jy-note--info' : 'jy-note jy-note--warning'} data-alert="partner" data-mode={manual ? 'manual' : 'auto'}>
              <span className={manual ? 'jy-icon jy-icon-info' : 'jy-icon jy-icon-warning'} aria-hidden="true" />
              <span>
                {oneUnassigned ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.unassigned} query={can(session, 'orders.assign') ? '?do=assign' : ''} />{' '}
                {manual
                  ? oneUnassigned
                    ? 'منتظر سپردن به چاپخانه است (تخصیص دستی): چاپخانهٔ پیشنهادی در فرمش از پیش انتخاب شده.'
                    : 'منتظر سپردن به چاپخانه‌اند (تخصیص دستی): چاپخانهٔ پیشنهادی هر کدام در فرمش از پیش انتخاب شده.'
                  : oneUnassigned
                    ? 'چاپخانه ندارد؛ یکی را برایش انتخاب کن.'
                    : 'چاپخانه ندارند؛ برای هر کدام یکی انتخاب کن.'}
              </span>
            </p>
          ) : null}
          {alerts.reviewRows > 0 ? (
            // صف تأیید (۶٫۲)، فقط مالک و متصدی.
            <p className="jy-note jy-note--warning" data-alert="review">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <Link className="jy-link" href={panelPath(gate, '/shipments/review')}>
                  <span className="num">{formatNumber(alerts.reviewRows)}</span> سطر فایل پست
                </Link>{' '}
                منتظر تأیید است؛ تا تأیید نشده، مشتری پیامک رهگیری نمی‌گیرد.
              </span>
            </p>
          ) : null}
          {alerts.paidSmsFailed.length > 0 ? (
            // پیامک پرداخت که نرفت (۷٫۱، طرح `m-dash-alerts`): فقط مالک و متصدی، که «دوباره بفرست» کارت «پرداخت‌ها» را دارند.
            <p className="jy-note jy-note--warning" data-alert="paid-sms">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                پیامک پرداخت {alerts.paidSmsFailed.length === 1 ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.paidSmsFailed} /> نرفت؛ از کارت «پرداخت‌ها»
                {alerts.paidSmsFailed.length === 1 ? '' : 'ی هر کدام'} دوباره بفرست.
              </span>
            </p>
          ) : null}
          {alerts.partnerSmsFailed.length > 0 ? (
            // پیامک سفارش تازهٔ چاپخانه که نرفت (۷٫۶، سؤال ۱۷۲): فقط مالک و متصدی، که «دوباره بفرست» کارت «چاپخانه» را دارند؛ کنار هر
            // سفارش، چاپخانه‌ای که پیامک باید به آن می‌رفت.
            <p className="jy-note jy-note--warning" data-alert="partner-sms">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                پیامک سفارش تازهٔ{' '}
                {alerts.partnerSmsFailed.map((row, i) => (
                  <Fragment key={row.orderNumber}>
                    {i === 0 ? '' : i === alerts.partnerSmsFailed.length - 1 ? ' و ' : '، '}
                    <Link className="jy-link" href={panelPath(gate, `/orders/${row.orderNumber}`)}>
                      <span className="num">{row.orderNumber}</span>
                    </Link>{' '}
                    به {row.partnerName}
                  </Fragment>
                ))}{' '}
                نرفت؛ از کارت «چاپخانه»{alerts.partnerSmsFailed.length === 1 ? '' : 'ی هر کدام'} دوباره بفرست.
              </span>
            </p>
          ) : null}
          {alerts.smsFailed.length > 0 ? (
            // پیامک رهگیری که نرفت (۶٫۳؛ در طرح نبود): فقط مالک و متصدی، که «دوباره بفرست» دارند.
            <p className="jy-note jy-note--warning" data-alert="sms">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                پیامک رهگیری {alerts.smsFailed.length === 1 ? 'سفارش ' : 'سفارش‌های '}
                <OrderLinks gate={gate} numbers={alerts.smsFailed} /> نرفت؛ از کارت «بستهٔ پستی» دوباره بفرست.
              </span>
            </p>
          ) : null}
          {heldLate.length > 0 ? (
            <p className="jy-note jy-note--warning" data-alert="held-late">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <b>پول مشتری هنوز برنگشته:</b> <HeldList gate={gate} held={heldLate} />؛ بیش از دو ساعت از پرداخت گذشته و زیبال هنوز «برگشت
                خورد» نگفته. از صفحهٔ سفارش «استعلام از درگاه» بزن؛ اگر همان ماند، از پشتیبانی زیبال بپرس.
              </span>
            </p>
          ) : null}
          {untracked.map((day) => {
            const one = day.orderNumbers.length === 1;
            return (
              // «کد رهگیری ندارد» (۶٫۲، تصمیم ۸۲): هر روز تحویل یک یادداشت؛ فایل پست همان روز راه جلوست.
              <p key={day.day.getTime()} className="jy-note jy-note--warning" data-alert="untracked">
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
            );
          })}
          {cap && cap.tone === 'info' ? (
            <p className="jy-note jy-note--info" data-alert="otp-cap">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                <b>{cap.head}</b>
                <Segments segs={cap.text} /> اگر مشتری واقعی بود، {settingsLink}
              </span>
            </p>
          ) : null}
          {heldSoon.length > 0 ? (
            <p className="jy-note jy-note--info" data-alert="held">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                <b>پول مشتری برمی‌گردد:</b> <HeldList gate={gate} held={heldSoon} /> تأیید {heldSoon.length === 1 ? 'نشد' : 'نشدند'}؛ زیبال{' '}
                <span className="num">15</span> دقیقه پس از هر پرداخت خودکار برش می‌گرداند. تا استعلام بگوید «برگشت خورد»، اینجا{' '}
                {heldSoon.length === 1 ? 'می‌ماند' : 'می‌مانند'}.
              </span>
            </p>
          ) : null}
          {unreturned > 0 ? (
            // «پرداخت بی برگشت» (۴٫۲) با استعلام خودکار (۷٫۲، سؤال ۱۴۴): فقط آنچه استعلام هم نتوانست ببندد.
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
                از درگاه برنگشت و درگاه هم به استعلام جواب روشن نداد؛ هر دقیقه دوباره می‌پرسیم.
                {auto.failed + auto.succeeded > 0 ? (
                  <>
                    {' '}
                    از صبح استعلام خودکار <span className="num">{formatNumber(auto.failed + auto.succeeded)}</span> تلاش بی برگشت را بست:{' '}
                    <span className="num">{formatNumber(auto.failed)}</span> پرداخت‌نشده، <span className="num">{formatNumber(auto.succeeded)}</span>{' '}
                    پرداخت‌شده.
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {pendingReviews ? (
            // نظر مشتری (۱۲٫۳، سؤال ۲۱۳): خبر است، نه هشدار؛ تا مالک تأیید نکند هیچ نظری روی سایت نمی‌رود.
            <p className="jy-note jy-note--info" data-alert="reviews">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                <Link className="jy-link" href={panelPath(gate, '/orders/reviews')}>
                  <span className="num">{formatNumber(pendingReviews)}</span> نظر تازهٔ مشتری
                </Link>{' '}
                منتظر توست؛ تا روی سایت نگذاری، کسی نمی‌بیندش.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {board.length > 0 ? (
        // کارت «چاپخانه‌ها» (۱۰٫۱، سؤال ۲۶۷): مالک و متصدی همهٔ چاپخانه‌های فعال، کاربر چاپخانه فقط خودش؛ «عوض کن» بی کد تازه.
        <section className="jy-card" aria-labelledby="t-partners" data-board="">
          <div className="jy-card__head">
            <h2 id="t-partners" className="jy-card__title">
              {partner ? 'چاپخانهٔ تو' : 'چاپخانه‌ها'}
            </h2>
            {can(session, 'partners.manage') ? (
              <Link href={panelPath(gate, '/partners')} className="jy-btn jy-btn--text ad-card-head-btn">
                همهٔ چاپخانه‌ها
              </Link>
            ) : null}
          </div>
          <ul className="ad-board">
            {board.map((row) => {
              const view = availabilityView(row, now);
              return (
                <li key={row.id} data-partner={row.name}>
                  <span className="ad-board__name">
                    <b>{row.name}</b>
                    <span className="ad-meta">
                      {row.cityName}
                      {row.isDefault ? ' · پیش‌فرض' : ''} · <span className="num">{formatNumber(row.openOrders)}</span> سفارش باز
                      {row.availabilityNote && view.tone !== 'open' ? ` · ${row.availabilityNote}` : ''}
                    </span>
                  </span>
                  <span className={AVAILABILITY_BADGE[view.tone]} data-availability={view.tone}>
                    {view.text}
                  </span>
                  <Link className="jy-link" href={panelPath(gate, `/partners/${row.id}/availability`)}>
                    عوض کن
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
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
