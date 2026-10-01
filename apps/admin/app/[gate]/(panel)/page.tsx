import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import { HELD_WATCH_MS } from '@jozveyar/db';
import { formatJalaliWeekday, formatNumber, formatTehranTime, formatTomans } from '@jozveyar/text';

import { DueBadge } from '../../../components/OrderBadges';
import { OrderRows } from '../../../components/OrderRows';
import { Segments } from '../../../components/Segments';
import { dayText, whenText } from '../../../lib/format';
import { panelPath } from '../../../lib/gate';
import { statsSegs } from '../../../lib/orders';
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
 * پیامک پرداختی که نرفت؛ به ترتیب خطا، هشدار و خبر، سؤال ۱۴۰)، و صف تحویل به ترتیب مهلت. کاربر چاپخانه (۵٫۳، طرح
 * `m-dash` با نقش «چاپخانه») همان را فقط برای سفارش‌های چاپخانهٔ خودش می‌بیند، بی مبلغ؛ «کد رهگیری ندارد» هم فقط سفارش‌های خودش، با
 * «فایل پست آن روز را بده» (تصمیم ۸۲). بقیهٔ هشدارها هرگز به او نمی‌رسند (سفارش پرداخت‌نشده و بی چاپخانه در محدوده‌اش نیست، و صف
 * تأیید با مالک و متصدی است).
 */
export default async function Dashboard({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { orders, settings } = requirePanel(gate);
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
  const { tiles, alerts, queue, open, slaDays, bounds, stats, untracked } = result.value;
  // هشدارهای پیامک (۷٫۱): فقط مالک و متصدی؛ سرویس خودش می‌سنجد.
  const sms = await settings.smsAlerts(session);
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

      {alerts.failedPdf.length > 0 ||
      unreturned > 0 ||
      rejected ||
      alerts.mismatched.length > 0 ||
      alerts.verifiedUnused.length > 0 ||
      alerts.held.length > 0 ||
      alerts.unassigned.length > 0 ||
      alerts.reviewRows > 0 ||
      alerts.smsFailed.length > 0 ||
      alerts.paidSmsFailed.length > 0 ||
      alerts.unrefunded.length > 0 ||
      alerts.refunding.length > 0 ||
      untracked.length > 0 ||
      cap ||
      low ? (
        // ترتیب (سؤال ۱۴۰): اول آنچه پول یا مسیر خرید همه را می‌بندد (خطا)، بعد آنچه کار مالک یا متصدی می‌خواهد (هشدار)، بعد خبر.
        <div className="ad-alerts">
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
                  . تا IP همین سرور در پنل زیبال ثبت نشود، پرداخت تازه شروع نمی‌شود و پرداخت‌های در راه تأیید نمی‌شوند (پولشان خودکار برمی‌گردد).
                  بعد از ثبت IP، {merchantLink}
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
                  . تا کد پذیرندهٔ درست نیاید، پرداخت تازه شروع نمی‌شود. کد را از پنل زیبال بردار؛ {merchantLink}
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
