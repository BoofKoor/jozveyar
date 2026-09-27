import type { Metadata } from 'next';
import Link from 'next/link';

import { FILE_MARGIN_MS, isPaidStatus, type PanelOrderDetails, type PanelOrderItem } from '@jozveyar/db';
import { bytesParts, formatNumber, formatTehranTime, formatTomans } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { DueBadge, PaymentBadge, StateBadge } from '../../../../../components/OrderBadges';
import { ReasonForm } from '../../../../../components/ReasonForm';
import { RecipientForm } from '../../../../../components/RecipientForm';
import { Segments } from '../../../../../components/Segments';
import { StatusButton } from '../../../../../components/StatusButton';
import { tehranDay, whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import {
  REASON_MAX,
  STATUS_LABELS,
  addressText,
  breakdownOf,
  dueCard,
  filesUntil,
  lastMoveTo,
  orderNumberOf,
  orderState,
  orderTimeline,
  paymentView,
  pdfFileName,
  phoneText,
  printReady,
  printView,
  purgedNote,
  reasonOf,
  shippingText,
  specFacts,
  staleSections,
  sumLines,
  ticketFileName,
  ticketView,
  timelineWhen,
  volumeFileName,
  type JobFailure,
} from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import type { OrderDetailsView } from '../../../../../lib/server/orders';
import { advanceOrderAction, rebuildPdfAction } from '../../../actions';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const orderNumber = orderNumberOf((await params).number);
  return { title: orderNumber ? `سفارش ${orderNumber}` : 'سفارش' };
}

/** خطاهایی که «دوباره بساز»، دانلود و کارهای وضعیت با برگشت به همین صفحه می‌گویند (`?e=`). */
const PAGE_ERRORS = new Set([
  'pdf_not_ready',
  'pdf_not_failed',
  'ticket_not_ready',
  'ticket_not_failed',
  'files_deleted',
  'files_gone',
  'storage_unavailable',
  'order_not_found',
  'forbidden',
  'invalid_transition',
  'status_changed',
  'print_needs_pdf',
  'recipient_locked',
]);

/** فرم باز ستون کنار یا کارت گیرنده (`?do=`): لغو، برگرداندن، یا ویرایش گیرنده؛ هر چیز دیگر یعنی هیچ. */
type Mode = 'cancel' | 'revert' | 'edit' | null;
const modeOf = (value: unknown): Mode => (value === 'cancel' || value === 'revert' || value === 'edit' ? value : null);

/** «(شنبه 11 مهر 14:06 تا 14:21)»: پایان، اگر همان روز است، فقط ساعت. */
function span(from: Date, to: Date | null, now: Date): string {
  if (!to) return whenText(from, now);
  const end = tehranDay(from) === tehranDay(to) ? formatTehranTime(to) : whenText(to, now);
  return `${whenText(from, now)} تا ${end}`;
}

/** «دوباره بساز» فایل چاپ یا برگه: فرم بی JS، برگشت به همین صفحه. */
function RebuildForm({ gate, orderNumber, kind }: { gate: string; orderNumber: number; kind: 'print' | 'ticket' }) {
  return (
    <form action={rebuildPdfAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" className="jy-btn jy-btn--secondary">
        دوباره بساز
      </button>
    </form>
  );
}

/** «سه تلاش ناموفق: استوریج جواب نداد (شنبه 14:06 تا 14:21).» */
function FailureNote({ failure, now, children }: { failure: JobFailure; now: Date; children: React.ReactNode }) {
  return (
    <p className="jy-note jy-note--error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      <span>
        {failure.attempts > 0 ? (
          <>
            <span className="num">{formatNumber(failure.attempts)}</span> تلاش ناموفق:{' '}
          </>
        ) : null}
        {failure.reason}
        {failure.from ? ` (${span(failure.from, failure.to, now)})` : ''}. {children}
      </span>
    </p>
  );
}

const Size = ({ bytes }: { bytes: number }) => {
  const size = bytesParts(bytes);
  return (
    <>
      <span className="num">{size.value}</span> {size.unit}
    </>
  );
};

/**
 * فایل چاپ یک جزوه (طرح پنل، ADR-043): هر جلد یک ردیف با دانلود، و «چه عوض شد» با پیوند PDF اصلی جزوه؛ در حال ساختن؛ یا
 * ساخته نشد با دلیل و «دوباره بساز».
 */
function PrintRows({
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
  const view = printView(details, item, now);
  const orderNumber = details.order.orderNumber;
  const icon = <span className="jy-icon jy-icon-file ad-pdf__icon" aria-hidden="true" />;
  if (view.kind === 'unpaid' || view.kind === 'closed' || view.kind === 'purged') return null;
  if (view.kind === 'building') {
    return (
      <li data-print="building">
        {icon}
        <div className="ad-print__body">
          <p className="ad-print__meta">
            در حال ساختن فایل چاپ…{view.retrying ? ' تلاش قبلی ناموفق بود؛ کارگر خودش دوباره امتحان می‌کند.' : ''}
          </p>
        </div>
      </li>
    );
  }
  if (view.kind === 'failed') {
    return (
      <li data-print="failed">
        {icon}
        <div className="ad-print__body">
          <p className="ad-pdf__name ad-ltr">{volumeFileName(orderNumber, item.seq, 1, 1)}</p>
          <p className="ad-print__meta">فایل چاپ ساخته نشد</p>
        </div>
        {canDownload && view.rebuild ? <RebuildForm gate={gate} orderNumber={orderNumber} kind="print" /> : null}
        <FailureNote failure={view} now={now}>
          {!view.rebuild
            ? 'فایل‌های مشتری دیگر روی سرور نیستند، پس دوباره ساختنش ممکن نیست؛ با مشتری تماس بگیر.'
            : view.rebuild.until
              ? `فایل‌های مشتری تا ${whenText(view.rebuild.until, now)} روی سرورند؛ دوباره بساز.`
              : 'PDF جزوه روی سرور است؛ دوباره بساز.'}
        </FailureNote>
      </li>
    );
  }
  const many = view.volumes.length > 1;
  return (
    <>
      {view.volumes.map((volume, i) => (
        <li key={volume.volume} data-print="ready" data-volume={volume.volume}>
          {icon}
          <div className="ad-print__body">
            <p className="ad-pdf__name ad-ltr">{volume.fileName}</p>
            <p className="ad-print__meta">
              {many ? (
                <>
                  جلد <span className="num">{volume.volume}</span> · صفحهٔ <span className="num">{formatNumber(volume.firstPage)}</span>{' '}
                  تا <span className="num">{formatNumber(volume.lastPage)}</span>
                  {volume.sheets !== null ? (
                    <>
                      {' · '}
                      <span className="num">{formatNumber(volume.sheets)}</span> برگ
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  فایل چاپ · <span className="num">{formatNumber(volume.lastPage)}</span> صفحه، A4 عمودی، یک جلد
                </>
              )}
              {' · '}
              <Size bytes={volume.bytes} />
              {' · '}ساخته شد {whenText(volume.builtAt, now)}
            </p>
          </div>
          {canDownload ? (
            <a
              className="jy-btn jy-btn--secondary"
              href={panelPath(gate, `/orders/${orderNumber}/print/${item.seq}/${volume.volume}`)}
              download={volume.fileName}
            >
              <span className="jy-icon jy-icon-download" aria-hidden="true" />
              دانلود
            </a>
          ) : null}
          {i === view.volumes.length - 1 ? (
            <p className="ad-print__orig">
              <Segments segs={view.note} />
              {!view.reused && canDownload && item.printPdfKey ? (
                <>
                  {' '}
                  <a
                    className="jy-link"
                    href={panelPath(gate, `/orders/${orderNumber}/pdf/${item.seq}`)}
                    download={pdfFileName(orderNumber, item.seq)}
                  >
                    PDF اصلی جزوه
                  </a>
                  ، بی تغییر.
                </>
              ) : null}
            </p>
          ) : null}
        </li>
      ))}
    </>
  );
}

/** برگهٔ سفارش (طرح پنل): دیدن و دانلود؛ در حال به‌روز شدن یا ساختن؛ یا ساخته نشد با «دوباره بساز». */
function TicketRow({ gate, details, now, canDownload }: { gate: string; details: PanelOrderDetails; now: Date; canDownload: boolean }) {
  const view = ticketView(details);
  const orderNumber = details.order.orderNumber;
  if (view.kind === 'unpaid' || view.kind === 'purged') return null;
  const meta =
    view.kind === 'ready'
      ? 'شماره، مهلت، مشخصات چاپ و برچسب پست · یک برگ A4، جدا از جزوه'
      : view.kind === 'updating'
        ? 'در حال به‌روز شدن با نام و نشانی تازه…'
        : view.kind === 'building'
          ? `در حال ساختن برگه…${view.retrying ? ' تلاش قبلی ناموفق بود؛ کارگر خودش دوباره امتحان می‌کند.' : ''}`
          : view.kind === 'closed'
            ? 'برگه ساخته نشد؛ این سفارش دیگر چاپ نمی‌شود.'
            : 'برگهٔ سفارش ساخته نشد';
  const self = panelPath(gate, `/orders/${orderNumber}/ticket`);
  return (
    <li data-ticket={view.kind}>
      <span className="jy-icon jy-icon-tag ad-pdf__icon" aria-hidden="true" />
      <div className="ad-print__body">
        <p className="ad-pdf__name">برگهٔ سفارش</p>
        <p className="ad-print__meta">{meta}</p>
      </div>
      {view.kind === 'ready' && canDownload ? (
        <>
          <Link href={self} className="jy-btn jy-btn--text">
            دیدن
          </Link>
          <a className="jy-btn jy-btn--secondary" href={`${self}/pdf`} download={`${ticketFileName(orderNumber)}.pdf`}>
            <span className="jy-icon jy-icon-download" aria-hidden="true" />
            دانلود
          </a>
        </>
      ) : null}
      {view.kind === 'failed' ? (
        <>
          {canDownload ? <RebuildForm gate={gate} orderNumber={orderNumber} kind="ticket" /> : null}
          <FailureNote failure={view} now={now}>
            برگه از دادهٔ سفارش ساخته می‌شود و فایل مشتری نمی‌خواهد؛ دوباره بساز.
          </FailureNote>
        </>
      ) : null}
    </li>
  );
}

/** پیوند کار ستون کنار: لغو یا برگرداندن در همان صفحه (`?do=`)، بی JS. */
function ModeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="jy-btn jy-btn--text jy-btn--block" scroll={false}>
      {children}
    </Link>
  );
}

/** دکمهٔ اصلی رو به جلو: «شروع چاپ» یا «تحویل پست شد»، از وضعیتی که صفحه نشان داد. */
function AdvanceForm({
  gate,
  orderNumber,
  action,
  from,
  children,
}: {
  gate: string;
  orderNumber: number;
  action: 'start_print' | 'handed_to_post';
  from: 'paid' | 'printing';
  children: React.ReactNode;
}) {
  return (
    <form action={advanceOrderAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="from" value={from} />
      <StatusButton className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block">{children}</StatusButton>
    </form>
  );
}

/** «در حال چاپ از امروز 10:05، سارا»، «امروز 16:40، سارا»: کی، و کدام ادمین. */
const byWhom = (at: Date, now: Date, adminName: string | null | undefined) => `${whenText(at, now)}${adminName ? `، ${adminName}` : ''}`;

/**
 * ستون کنار (طرح پنل): وضعیت، مهلت و کار بعدی. سفارش باز یک دکمهٔ اصلی دارد، «شروع چاپ» (تا فایل چاپ همهٔ جزوه‌ها ساخته
 * نشده بسته: «اول فایل چاپ ساخته شود»، برش ۵٫۱) و بعد «تحویل پست شد»، با «لغو سفارش»؛ به پست رسیده روز و به‌موقع بودنش را
 * دارد، و لغوشده دلیلش را. مالک هر وضعیت پس از پرداخت جز «در صف چاپ» را یک قدم برمی‌گرداند، مگر فایل‌هایش پاک شده باشد
 * (ADR-044). پرداخت‌نشده همان کارت‌های ۴٫۲.
 */
function StatusCard({ gate, view, stale, mode }: { gate: string; view: OrderDetailsView; stale: boolean; mode: Mode }) {
  const { details, bounds, canStatus, canRevert, revertTo } = view;
  const { order } = details;
  const now = bounds.at;
  const self = panelPath(gate, `/orders/${order.orderNumber}`);
  const reasonForm = (kind: 'cancel' | 'revert', to: NonNullable<typeof revertTo>) => (
    <ReasonForm
      kind={kind}
      gate={gate}
      orderNumber={order.orderNumber}
      from={order.status}
      fromLabel={STATUS_LABELS[order.status]}
      toLabel={STATUS_LABELS[to]}
      amount={formatTomans(order.totalRials, false)}
      maxLength={REASON_MAX}
      back={self}
    />
  );
  const revert = mode === 'revert' && canRevert && revertTo ? reasonForm('revert', revertTo) : null;
  const revertLink =
    canRevert && revertTo ? <ModeLink href={`${self}?do=revert`}>برگرداندن به «{STATUS_LABELS[revertTo]}»</ModeLink> : null;
  const onlyRevert = revert ?? (revertLink ? <div className="ad-status__actions">{revertLink}</div> : null);

  if ((order.status === 'paid' || order.status === 'printing') && order.postHandoffDueAt) {
    const card = dueCard(order.postHandoffDueAt, bounds);
    const printing = order.status === 'printing';
    const since = printing ? lastMoveTo(details.statusEvents, 'printing') : null;
    const ready = printReady(details);
    let actions: React.ReactNode = null;
    if (mode === 'cancel' && canStatus) actions = reasonForm('cancel', 'cancelled');
    else if (revert) actions = revert;
    else if (canStatus || revertLink) {
      actions = (
        <div className="ad-status__actions">
          {canStatus && printing ? (
            <>
              <AdvanceForm gate={gate} orderNumber={order.orderNumber} action="handed_to_post" from="printing">
                <span className="jy-icon jy-icon-truck" aria-hidden="true" />
                تحویل پست شد
              </AdvanceForm>
              <p className="ad-hint">وقتی بسته را به پست دادی بزن. کد رهگیری را بعداً فایل پست می‌آورد.</p>
            </>
          ) : null}
          {canStatus && !printing && ready ? (
            <>
              <AdvanceForm gate={gate} orderNumber={order.orderNumber} action="start_print" from="paid">
                <span className="jy-icon jy-icon-printer" aria-hidden="true" />
                شروع چاپ
              </AdvanceForm>
              <p className="ad-hint">وقتی چاپ را شروع کردی بزن؛ مشتری در صفحهٔ سفارشش «در حال چاپ» می‌بیند.</p>
            </>
          ) : null}
          {canStatus && !printing && !ready ? (
            <button type="button" className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block is-status" aria-disabled="true">
              اول فایل چاپ ساخته شود
            </button>
          ) : null}
          {canStatus ? <ModeLink href={`${self}?do=cancel`}>لغو سفارش</ModeLink> : null}
          {revertLink}
        </div>
      );
    }
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-due={card.kind} data-status={order.status}>
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
        {printing && since ? (
          <p className="ad-meta ad-gap">در حال چاپ از {byWhom(since.at, now, since.adminName)}</p>
        ) : order.paidAt ? (
          <p className="ad-meta ad-gap">پرداخت شد {whenText(order.paidAt, now)}</p>
        ) : null}
        {actions}
      </section>
    );
  }

  if (order.status === 'handed_to_post' && order.handedToPostAt) {
    const moved = lastMoveTo(details.statusEvents, 'handed_to_post');
    // مهلت پایان انحصاری روز است: تحویل پیش از آن، به‌موقع.
    const onTime = order.postHandoffDueAt !== null && order.handedToPostAt.getTime() < order.postHandoffDueAt.getTime();
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-status={order.status}>
        <h2 id="t-st" className="jy-card__title">
          به پست رسید
        </h2>
        <p className="ad-meta">{byWhom(order.handedToPostAt, now, moved?.adminName)}</p>
        <div className="ad-status__badges">
          {onTime ? (
            <span className="jy-badge jy-badge--success">
              <span className="jy-icon jy-icon-success" aria-hidden="true" />
              به‌موقع
            </span>
          ) : (
            <span className="jy-badge jy-badge--error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              دیرتر از مهلت
            </span>
          )}
        </div>
        <p className="jy-note ad-gap">کد رهگیری را فایل پست می‌آورد و به موبایل مشتری پیامک می‌شود.</p>
        {onlyRevert}
      </section>
    );
  }

  if (order.status === 'cancelled') {
    const moved = lastMoveTo(details.statusEvents, 'cancelled');
    const reason = reasonOf(moved);
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-status={order.status}>
        <h2 id="t-st" className="jy-card__title">
          لغو شد
        </h2>
        {moved ? <p className="ad-meta">{byWhom(moved.at, now, moved.adminName)}</p> : null}
        {reason ? (
          <dl className="ad-facts">
            <div>
              <dt>دلیل</dt>
              <dd>{reason}</dd>
            </div>
          </dl>
        ) : null}
        {onlyRevert}
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
 * جزئیات سفارش (طرح پنل، ADR-039): وضعیت، مهلت و کار بعدی در ستون کنار (در گوشی بالای همه)؛ جزوه با فایل‌ها، مشخصات، و از
 * ۵٫۱ فایل چاپ هر جلد و برگهٔ سفارش (ADR-043)، یا «فایل‌ها پاک شد» (ADR-044)؛ گیرنده و نشانی، با «ویرایش» تا پیش از پست؛
 * مبلغ منجمد؛ پرداخت‌ها؛ و رویدادها. لغو، برگرداندن و ویرایش در همین صفحه باز می‌شوند (`?do=`)؛ هر کار از وضعیتی که صفحه
 * نشان داد.
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
  const view = result.value;
  const { details, bounds, canDownload, canEditRecipient } = view;
  const { order } = details;
  const now = bounds.at;
  const stale = staleSections(
    details.items.flatMap((item) => item.sections),
    now,
  );
  const state = orderState(order.status, stale);
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  const mode = modeOf(query.do);
  const self = panelPath(gate, `/orders/${order.orderNumber}`);
  const breakdown = breakdownOf(order);
  const many = details.items.length > 1;
  const purged = purgedNote(details);
  const printable = isPaidStatus(order.status) && !purged;
  const ticketRow = <TicketRow gate={gate} details={details} now={now} canDownload={canDownload} />;
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
        <aside className="ad-side" aria-label="وضعیت و کار بعدی">
          <StatusCard gate={gate} view={view} stale={stale} mode={mode} />
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
                {(breakdown.items[i]?.volumes ?? 1) > 1 ? (
                  <span className="jy-card__meta">
                    <span className="num">{formatNumber(breakdown.items[i]!.volumes)}</span> جلد، هر جلد یک فایل
                  </span>
                ) : item.sections.length > 1 ? (
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
              {purged ? (
                <p className="jy-note ad-gap">
                  <span className="jy-icon jy-icon-info" aria-hidden="true" />
                  <span>
                    <Segments segs={purged} />
                  </span>
                </p>
              ) : !isPaidStatus(order.status) ? (
                <p className="ad-hint ad-gap">فایل چاپ و برگهٔ سفارش بعد از پرداخت ساخته می‌شوند.</p>
              ) : printView(details, item, now).kind === 'closed' ? (
                <p className="ad-hint ad-gap">فایل چاپ ساخته نشد؛ این سفارش دیگر چاپ نمی‌شود.</p>
              ) : (
                <ul className="ad-print" aria-label="فایل‌های چاپ">
                  <PrintRows gate={gate} details={details} item={item} now={now} canDownload={canDownload} />
                  {many ? null : ticketRow}
                </ul>
              )}
            </section>
          ))}

          {many && printable ? (
            <section className="jy-card" aria-labelledby="t-ticket">
              <h2 id="t-ticket" className="jy-card__title">
                برگهٔ سفارش
              </h2>
              <ul className="ad-print" aria-label="برگهٔ سفارش">
                {ticketRow}
              </ul>
            </section>
          ) : null}

          {mode === 'edit' && canEditRecipient ? (
            <RecipientForm
              gate={gate}
              orderNumber={order.orderNumber}
              initial={{ name: order.recipientName, addressText: order.addressText, postalCode: order.postalCode ?? '' }}
              place={[details.provinceName, details.cityName].filter(Boolean).join('، ')}
              phone={phoneText(order.recipientPhone)}
              back={self}
            />
          ) : (
            <section className="jy-card" aria-labelledby="t-to">
              <div className="jy-card__head">
                <h2 id="t-to" className="jy-card__title">
                  ارسال به
                </h2>
                {canEditRecipient ? (
                  <Link href={`${self}?do=edit`} className="jy-btn jy-btn--text ad-card-head-btn" scroll={false}>
                    ویرایش
                  </Link>
                ) : null}
              </div>
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
          )}

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
              <span>{isPaidStatus(order.status) ? 'پرداخت شد' : 'مبلغ سفارش'}</span>
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
