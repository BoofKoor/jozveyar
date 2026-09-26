import type { Metadata } from 'next';
import Link from 'next/link';

import { FILE_MARGIN_MS, type PanelOrderDetails, type PanelOrderItem } from '@jozveyar/db';
import { bytesParts, formatNumber, formatTehranTime, formatTomans } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { DueBadge, PaymentBadge, StateBadge } from '../../../../../components/OrderBadges';
import { Segments } from '../../../../../components/Segments';
import { tehranDay, whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import {
  addressText,
  breakdownOf,
  dueCard,
  filesUntil,
  orderNumberOf,
  orderState,
  orderTimeline,
  paymentView,
  pdfView,
  phoneText,
  shippingText,
  specFacts,
  staleSections,
  sumLines,
  timelineWhen,
  type DayBounds,
} from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { rebuildPdfAction } from '../../../actions';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const orderNumber = orderNumberOf((await params).number);
  return { title: orderNumber ? `سفارش ${orderNumber}` : 'سفارش' };
}

/** خطاهایی که «دوباره بساز» یا دانلود با برگشت به همین صفحه می‌گویند (`?e=`). */
const PAGE_ERRORS = new Set(['pdf_not_ready', 'pdf_not_failed', 'files_gone', 'storage_unavailable', 'order_not_found', 'forbidden']);

/** «(شنبه 11 مهر 14:06 تا 14:21)»: پایان، اگر همان روز است، فقط ساعت. */
function span(from: Date, to: Date | null, now: Date): string {
  if (!to) return whenText(from, now);
  const end = tehranDay(from) === tehranDay(to) ? formatTehranTime(to) : whenText(to, now);
  return `${whenText(from, now)} تا ${end}`;
}

/** PDF جزوه (طرح پنل): دانلود، در حال ساختن، یا ساخته نشد با دلیل و «دوباره بساز». */
function PdfBox({
  gate,
  details,
  item,
  now,
  canDownload,
}: {
  gate: string;
  details: PanelOrderDetails;
  item: PanelOrderItem;
  now: Date;
  canDownload: boolean;
}) {
  const view = pdfView(details, item, now);
  if (view.kind === 'unpaid') return <p className="ad-hint ad-gap">PDF جزوه بعد از پرداخت ساخته می‌شود.</p>;
  const icon = <span className="jy-icon jy-icon-file ad-pdf__icon" aria-hidden="true" />;
  if (view.kind === 'ready') {
    const size = view.bytes === null ? null : bytesParts(view.bytes);
    return (
      <div className="ad-pdf" data-pdf="ready">
        {icon}
        <div className="ad-pdf__body">
          <p className="ad-pdf__name ad-ltr">{view.fileName}</p>
          <p className="ad-pdf__meta">
            <span className="num">{formatNumber(view.pages)}</span> صفحه
            {size ? (
              <>
                {' · '}
                <span className="num">{size.value}</span> {size.unit}
              </>
            ) : null}
            {' · '}ساخته شد {whenText(view.readyAt, now)}
          </p>
        </div>
        {canDownload ? (
          <a
            className="jy-btn jy-btn--secondary"
            href={panelPath(gate, `/orders/${details.order.orderNumber}/pdf/${item.seq}`)}
            download={view.fileName}
          >
            <span className="jy-icon jy-icon-download" aria-hidden="true" />
            دانلود PDF
          </a>
        ) : null}
      </div>
    );
  }
  if (view.kind === 'building') {
    return (
      <div className="ad-pdf" data-pdf="building">
        {icon}
        <div className="ad-pdf__body">
          <p className="ad-pdf__meta">
            در حال ساختن PDF جزوه…{view.retrying ? ' تلاش قبلی ناموفق بود؛ کارگر خودش دوباره امتحان می‌کند.' : ''}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="ad-pdf" data-pdf="failed">
      {icon}
      <div className="ad-pdf__body">
        <p className="ad-pdf__name ad-ltr">{view.fileName}</p>
        <p className="ad-pdf__meta">ساخته نشد</p>
      </div>
      {canDownload && view.filesUntil ? (
        <form action={rebuildPdfAction}>
          <input type="hidden" name="gate" value={gate} />
          <input type="hidden" name="number" value={details.order.orderNumber} />
          <button type="submit" className="jy-btn jy-btn--secondary">
            دوباره بساز
          </button>
        </form>
      ) : null}
      <p className="jy-note jy-note--error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        <span>
          <span className="num">{formatNumber(view.attempts)}</span> تلاش ناموفق: {view.reason} ({span(view.from, view.to, now)}).{' '}
          {view.filesUntil
            ? `فایل‌های مشتری تا ${whenText(view.filesUntil, now)} روی سرورند؛ دوباره بساز.`
            : 'فایل‌های مشتری دیگر روی سرور نیستند، پس دوباره ساختنش ممکن نیست؛ با مشتری تماس بگیر.'}
        </span>
      </p>
    </div>
  );
}

/** ستون کنار: مهلت تحویل به پست، یا اینکه هنوز پرداخت نشده یا رها شد. کار بعدی («شروع چاپ»…) با ۴٫۳. */
function StatusCard({ details, bounds, stale }: { details: PanelOrderDetails; bounds: DayBounds; stale: boolean }) {
  const { order } = details;
  const now = bounds.at;
  if (order.status === 'paid' && order.postHandoffDueAt) {
    const card = dueCard(order.postHandoffDueAt, bounds);
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-due={card.kind}>
        <h2 id="t-st" className="jy-card__title">
          {card.title}
        </h2>
        <p className="ad-meta">{card.deadline}</p>
        <div className="ad-status__badges">
          <DueBadge kind={card.kind}>
            <span>
              <Segments segs={card.left} />
            </span>
          </DueBadge>
        </div>
        {order.paidAt ? <p className="ad-meta ad-gap">پرداخت شد {whenText(order.paidAt, now)}</p> : null}
      </section>
    );
  }
  const until = filesUntil(details.items, now);
  const payableUntil = until ? new Date(until.getTime() - FILE_MARGIN_MS) : null;
  if (order.status === 'awaiting_payment' && !stale && payableUntil) {
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st">
        <h2 id="t-st" className="jy-card__title">
          هنوز پرداخت نشده
        </h2>
        <p className="ad-meta">ساخته شد {whenText(order.createdAt, now)}</p>
        <p className="jy-note ad-gap">
          مشتری از صفحهٔ سفارشش می‌تواند دوباره پرداخت کند، تا {whenText(payableUntil, now)}؛ بعد از آن فایل‌ها پاک می‌شوند و
          سفارش «رهاشده» است.
        </p>
      </section>
    );
  }
  return (
    <section className="jy-card ad-status" aria-labelledby="t-st">
      <h2 id="t-st" className="jy-card__title">
        رها شد
      </h2>
      <p className="ad-meta">ساخته شد {whenText(order.createdAt, now)}</p>
      <p className="jy-note ad-gap">پرداخت نشد و فایل‌هایش دیگر روی سرور نیست، یا تا یک ساعت دیگر پاک می‌شود؛ پرداختنی نیست.</p>
    </section>
  );
}

/**
 * جزئیات سفارش (طرح پنل، ADR-039): وضعیت و مهلت در ستون کنار (در گوشی بالای همه)؛ جزوه با فایل‌ها، مشخصات و PDF
 * جزوه؛ گیرنده و نشانی؛ مبلغ منجمد؛ پرداخت‌ها؛ و رویدادها. وضعیت فقط دیدنی است: «شروع چاپ»، لغو و ویرایش نشانی
 * با ۴٫۳.
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, number } = await params;
  const query = await searchParams;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'orders.read')) return <NoAccess gate={gate} />;
  const back = (
    <Link href={panelPath(gate, '/orders')} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      سفارش‌ها
    </Link>
  );
  const result = await orders.details(session, number);
  if (!result.ok) {
    return (
      <>
        {back}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این سفارش پیدا نشد
          </h1>
          <p className="ad-lead">شماره را در فهرست سفارش‌ها جست‌وجو کن.</p>
        </section>
      </>
    );
  }
  const { details, bounds, canDownload } = result.value;
  const { order } = details;
  const now = bounds.at;
  const stale = staleSections(
    details.items.flatMap((item) => item.sections),
    now,
  );
  const state = orderState(order.status, stale);
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  const breakdown = breakdownOf(order);
  const many = details.items.length > 1;
  const entries = orderTimeline(details);
  const when = timelineWhen(entries);

  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div className="ad-title-row">
          <h1 className="ad-title">
            سفارش <span className="num">{order.orderNumber}</span>
          </h1>
          <StateBadge state={state} />
        </div>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}

      <div className="ad-grid">
        <aside className="ad-side" aria-label="وضعیت">
          <StatusCard details={details} bounds={bounds} stale={stale} />
        </aside>

        <div className="ad-main">
          {details.items.map((item, i) => (
            <section key={item.id} className="jy-card" aria-labelledby={`t-jozve-${item.seq}`}>
              <div className="jy-card__head">
                <h2 id={`t-jozve-${item.seq}`} className="jy-card__title">
                  {many ? (
                    <>
                      جزوهٔ <span className="num">{item.seq}</span>
                    </>
                  ) : (
                    'جزوه'
                  )}
                </h2>
                {item.sections.length > 1 ? (
                  <span className="jy-card__meta">
                    <span className="num">{formatNumber(item.sections.length)}</span> فایل، پشت‌سرهم با یک صحافی
                  </span>
                ) : null}
              </div>
              <ol className="ad-files">
                {item.sections.map((section) => (
                  <li key={section.seq}>
                    <span className="ad-files__n num">{section.seq}</span>
                    <span className="ad-files__name" dir="auto">
                      {section.originalName}
                    </span>
                    <span className="ad-files__pages">
                      <span className="num">{formatNumber(section.pageCount)}</span> صفحه
                    </span>
                  </li>
                ))}
              </ol>
              <dl className="ad-facts ad-spec">
                {specFacts(item, breakdown.items[i]).map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      <Segments segs={fact.value} />
                    </dd>
                  </div>
                ))}
              </dl>
              <PdfBox gate={gate} details={details} item={item} now={now} canDownload={canDownload} />
            </section>
          ))}

          <section className="jy-card" aria-labelledby="t-to">
            <h2 id="t-to" className="jy-card__title">
              ارسال به
            </h2>
            <dl className="ad-facts">
              <div>
                <dt>گیرنده</dt>
                <dd>{order.recipientName}</dd>
              </div>
              <div>
                <dt>موبایل</dt>
                <dd>
                  <span className="num">{phoneText(order.recipientPhone)}</span>
                </dd>
              </div>
              <div>
                <dt>نشانی</dt>
                <dd>{addressText(details)}</dd>
              </div>
              <div>
                <dt>کد پستی</dt>
                <dd>{order.postalCode ? <span className="num">{order.postalCode}</span> : 'ندارد'}</dd>
              </div>
              <div>
                <dt>ارسال</dt>
                <dd>{shippingText(details)}</dd>
              </div>
            </dl>
          </section>

          <section className="jy-card" aria-labelledby="t-sum">
            <div className="jy-card__head">
              <h2 id="t-sum" className="jy-card__title">
                مبلغ
              </h2>
              <span className="jy-card__meta">
                تعرفهٔ نسخهٔ <span className="num">{order.priceListVersion}</span> · منجمد
              </span>
            </div>
            <dl className="ad-sum">
              {sumLines(details).map((line, i) => (
                <div key={i}>
                  <dt>
                    <Segments segs={line.label} />
                  </dt>
                  <dd className="num">{formatTomans(line.rials, false)}</dd>
                </div>
              ))}
            </dl>
            <div className="ad-sum__total">
              <span>{order.status === 'paid' ? 'پرداخت شد' : 'مبلغ سفارش'}</span>
              <b>
                <span className="num">{formatTomans(order.totalRials, false)}</span> تومان
              </b>
            </div>
            <p className="ad-hint ad-gap">قیمت سفارش ثبت‌شده هیچ‌وقت دوباره حساب نمی‌شود، حتی اگر تعرفه عوض شود.</p>
          </section>

          <section className="jy-card" aria-labelledby="t-pay">
            <h2 id="t-pay" className="jy-card__title">
              پرداخت‌ها
            </h2>
            {details.payments.length === 0 ? (
              <p className="ad-hint ad-gap">مشتری هنوز به درگاه نرفته است.</p>
            ) : (
              <ol className="ad-pay">
                {details.payments.map((payment) => {
                  const view = paymentView(payment, now);
                  return (
                    <li key={payment.id} data-payment={view.kind}>
                      <PaymentBadge kind={view.kind} />
                      <span>{whenText(view.at, now)}</span>
                      <span className="ad-pay__meta">
                        <Segments segs={view.meta} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="jy-card" aria-labelledby="t-log">
            <h2 id="t-log" className="jy-card__title">
              رویدادها
            </h2>
            <ol className="ad-log">
              {entries.map((entry, i) => (
                <li key={i}>
                  <span className="ad-log__when">
                    {when[i]!.day ? `${when[i]!.day} ` : ''}
                    <span className="num">{when[i]!.time}</span>
                  </span>
                  <span>
                    <Segments segs={entry.text} /> <span className="ad-log__who">· {entry.who}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
