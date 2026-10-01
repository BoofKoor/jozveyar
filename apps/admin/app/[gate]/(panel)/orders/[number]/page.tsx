import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Fragment } from 'react';

import { FILE_MARGIN_MS, IRAN_POST, isChecking, isPaidStatus, voidKept, type PanelOrderDetails, type PanelOrderItem, type VoidKept } from '@jozveyar/db';
import { GATEWAY_NAMES } from '@jozveyar/payments';
import { bytesParts, formatNumber, formatTehranTime, formatTomans } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { AssignForm } from '../../../../../components/AssignForm';
import { Barcode } from '../../../../../components/Barcode';
import { NoAccess } from '../../../../../components/NoAccess';
import { InquiryForm } from '../../../../../components/InquiryForm';
import { DueBadge, PaymentBadge, StateBadge } from '../../../../../components/OrderBadges';
import { ReasonForm } from '../../../../../components/ReasonForm';
import { RecipientForm } from '../../../../../components/RecipientForm';
import { ResendPaymentSmsForm } from '../../../../../components/ResendPaymentSmsForm';
import { ResendSmsForm } from '../../../../../components/ResendSmsForm';
import { Segments } from '../../../../../components/Segments';
import { StatusButton } from '../../../../../components/StatusButton';
import { VoidShipmentForm } from '../../../../../components/VoidShipmentForm';
import { dayHeading, tehranDay, whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { partnerCard } from '../../../../../lib/partners';
import { parcelsCount, weightSegs } from '../../../../../lib/shipments';
import { paymentSmsView, smsView } from '../../../../../lib/sms';
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
  TICKET_UPDATING_WITH,
  ticketFileName,
  ticketView,
  timelineWhen,
  volumeFileName,
  volumesSegs,
  type JobFailure,
} from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import type { InquiryOutcome, OrderDetailsView } from '../../../../../lib/server/orders';
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
  'print_needs_partner',
  'order_partner_changed',
  'assign_closed',
  'partner_inactive',
  'order_has_shipment',
  'shipment_not_found',
  'shipment_voided',
  'sms_not_failed',
  'reason_required',
  'payment_not_found',
  'paid_sms_closed',
  'gateway_not_configured',
  'payment_final',
  'unavailable',
]);

/**
 * فرم باز ستون کنار یا کارت‌ها (`?do=`): لغو، برگرداندن، ویرایش گیرنده، جابه‌جایی چاپخانه (۵٫۲)، یا کنار گذاشتن یک کد رهگیری (۶٫۲،
 * با `code`)؛ هر چیز دیگر یعنی هیچ.
 */
type Mode = 'cancel' | 'revert' | 'edit' | 'assign' | 'void' | null;
const modeOf = (value: unknown): Mode =>
  value === 'cancel' || value === 'revert' || value === 'edit' || value === 'assign' || value === 'void' ? value : null;

/** هر فرم، با مجوزی که می‌خواهد؛ کاربر چاپخانه (۵٫۳) هیچ‌کدام را ندارد و به جای سفارش «این بخش برای چاپخانه باز نیست» می‌بیند. */
const modeAllowed = (mode: Exclude<Mode, null>, view: OrderDetailsView, canVoid: boolean): boolean =>
  mode === 'cancel'
    ? view.canCancel
    : mode === 'revert'
      ? view.canRevert
      : mode === 'edit'
        ? view.canEditRecipient
        : mode === 'void'
          ? canVoid
          : view.canAssign;

/** پس از کنار رفتن یک کد، سفارش چه می‌شود (تصمیم ۸۰)؛ همان `voidKept` ذخیره‌گاه. */
const VOID_OUTCOME: Record<VoidKept | 'reopen', string> = {
  reopen: 'سفارش یک قدم به «در حال چاپ» برمی‌گردد: همین کد «تحویل پست شد»ش کرده بود و کد دیگری ندارد.',
  other_code: 'سفارش «تحویل پست شد» می‌ماند: کد رهگیری زندهٔ دیگری دارد.',
  handed_before: 'سفارش «تحویل پست شد» می‌ماند: پیش از این کد به پست رسیده بود.',
  files_deleted: 'سفارش «تحویل پست شد» می‌ماند: فایل‌هایش پاک شده و به چاپ برنمی‌گردد.',
};

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
              {/* جلدها با هم ساخته می‌شوند؛ زمان فقط در ردیف یک‌جلدی، همان طرح */}
              {many ? null : <> · ساخته شد {whenText(volume.builtAt, now)}</>}
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
              {view.changed && canDownload && item.printPdfKey ? (
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
        ? `در حال به‌روز شدن ${TICKET_UPDATING_WITH[view.cause]}…`
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

/**
 * دکمهٔ اصلی رو به جلو: «شروع چاپ» یا «تحویل پست شد»، از وضعیتی که صفحه نشان داد؛ «شروع چاپ» از چاپخانه‌ای هم که صفحه نشان داد
 * (۵٫۲)، تا جابه‌جایی هم‌زمان و «شروع چاپ» فقط یکی شوند.
 */
function AdvanceForm({
  gate,
  orderNumber,
  action,
  from,
  partner,
  children,
}: {
  gate: string;
  orderNumber: number;
  action: 'start_print' | 'handed_to_post';
  from: 'paid' | 'printing';
  partner?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={advanceOrderAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="from" value={from} />
      {partner ? <input type="hidden" name="partner" value={partner} /> : null}
      <StatusButton className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block">{children}</StatusButton>
    </form>
  );
}

/** «در حال چاپ از امروز 10:05، سارا»، «امروز 16:40، سارا»: کی، و کدام ادمین. */
const byWhom = (at: Date, now: Date, adminName: string | null | undefined) => `${whenText(at, now)}${adminName ? `، ${adminName}` : ''}`;

/**
 * ستون کنار (طرح پنل): وضعیت، مهلت و کار بعدی. سفارش باز یک دکمهٔ اصلی دارد، «شروع چاپ» (تا چاپخانه ندارد بسته: «اول چاپخانه
 * انتخاب شود»، برش ۵٫۲؛ و تا فایل چاپ همهٔ جزوه‌ها ساخته نشده: «اول فایل چاپ ساخته شود»، برش ۵٫۱) و بعد «تحویل پست شد»، با «لغو
 * سفارش»؛ به پست رسیده روز و به‌موقع بودنش را دارد، و لغوشده دلیلش را. مالک هر وضعیت پس از پرداخت جز «در صف چاپ» را یک قدم
 * برمی‌گرداند، مگر فایل‌هایش پاک شده باشد (ADR-044). با فرم جابه‌جایی چاپخانه باز (طرح `m-order-assign`) کارهای وضعیت پنهان‌اند.
 * پرداخت‌نشده همان کارت‌های ۴٫۲.
 */
function StatusCard({ gate, view, stale, mode }: { gate: string; view: OrderDetailsView; stale: boolean; mode: Mode }) {
  const { details, bounds, canStatus, canCancel, canRevert, revertTo } = view;
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
    const partner = order.printPartnerId;
    let actions: React.ReactNode = null;
    if (mode === 'cancel' && canCancel) actions = reasonForm('cancel', 'cancelled');
    else if (revert) actions = revert;
    else if (mode === 'assign' && view.canAssign) actions = null;
    else if (canStatus || canCancel || revertLink) {
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
          {canStatus && !printing && partner && ready ? (
            <>
              <AdvanceForm gate={gate} orderNumber={order.orderNumber} action="start_print" from="paid" partner={partner}>
                <span className="jy-icon jy-icon-printer" aria-hidden="true" />
                شروع چاپ
              </AdvanceForm>
              <p className="ad-hint">وقتی چاپ را شروع کردی بزن؛ مشتری در صفحهٔ سفارشش «در حال چاپ» می‌بیند.</p>
            </>
          ) : null}
          {canStatus && !printing && !partner ? (
            <button type="button" className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block is-status" aria-disabled="true">
              اول چاپخانه انتخاب شود
            </button>
          ) : null}
          {canStatus && !printing && partner && !ready ? (
            <button type="button" className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block is-status" aria-disabled="true">
              اول فایل چاپ ساخته شود
            </button>
          ) : null}
          {canCancel ? <ModeLink href={`${self}?do=cancel`}>لغو سفارش</ModeLink> : null}
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
    // «ثبت» فایل پست (۶٫۱): فایل فقط روز پست را دارد (سؤال ۷۰)، پس روز بی ساعت، و کننده «فایل پست، حسن» (طرح `m-order-shipped`).
    const fromFile = (moved?.note as { source?: unknown } | null)?.source === 'post_file';
    const live = details.shipments.filter((shipment) => shipment.voidedAt === null);
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-status={order.status}>
        <h2 id="t-st" className="jy-card__title">
          به پست رسید
        </h2>
        <p className="ad-meta">
          {fromFile
            ? `${dayHeading(order.handedToPostAt, now)} · فایل پست${moved?.adminName ? `، ${moved.adminName}` : ''}`
            : byWhom(order.handedToPostAt, now, moved?.adminName)}
        </p>
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
        {live.length > 0 ? (
          <p className="jy-note ad-gap" data-tracking="">
            <span>
              کد رهگیری{' '}
              {live.map((shipment, i) => (
                <Fragment key={shipment.id}>
                  {i > 0 ? '، ' : null}
                  <Barcode code={shipment.barcode} />
                </Fragment>
              ))}{' '}
              {/* طرح `m-order-shipped`: وقتی همهٔ پیامک‌ها رفت؛ وگرنه کارت «بستهٔ پستی» می‌گوید کدام نرفت (۶٫۳). */}
              {live.every((shipment) => shipment.sms && smsView(shipment.sms, shipment.createdAt, now).state === 'sent')
                ? 'به موبایل مشتری پیامک شد.'
                : 'از فایل پست آمد؛ پیامکش را کارت «بستهٔ پستی» می‌گوید.'}
            </span>
          </p>
        ) : (
          <p className="jy-note ad-gap">کد رهگیری را فایل پست می‌آورد و به موبایل مشتری پیامک می‌شود.</p>
        )}
        {view.revertBlockedBy ? (
          <p className="ad-hint ad-gap">
            با کد رهگیری به «در حال چاپ» برنمی‌گردد؛ اگر کد اشتباه است، از کارت «بستهٔ پستی» کنارش بگذار، یا اگر کل فایل اشتباه بود،
            ورود{' '}
            <Link className="jy-link" href={panelPath(gate, `/shipments/${view.revertBlockedBy.importId}`)}>
              <bdi>{view.revertBlockedBy.filename}</bdi>
            </Link>{' '}
            را برگردان.
          </p>
        ) : null}
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
        {/* چاپخانه (۵٫۳) دلیل را نمی‌بیند، که برگشت پول را می‌گوید؛ کار بعدی‌اش همین است */}
        {view.partnerView ? <p className="jy-note ad-gap">این سفارش چاپ نمی‌شود؛ اگر چاپش کرده‌ای، کنار بگذار.</p> : null}
        {onlyRevert}
      </section>
    );
  }

  const until = filesUntil(details.items, now);
  const payableUntil = until ? new Date(until.getTime() - FILE_MARGIN_MS) : null;
  // «در حال بررسی» (برش ۷٫۲، طرح `m-order-unpaid`): پولی شاید گرفته شده و نتیجه نیامده؛ مشتری «دوباره پرداخت کن» ندارد.
  if (order.status === 'awaiting_payment' && details.payments.some(isChecking)) {
    return (
      <section className="jy-card ad-status" aria-labelledby="t-st" data-status="checking">
        <h2 id="t-st" className="jy-card__title">
          پرداخت در حال بررسی
        </h2>
        <p className="ad-meta">ساخته شد {whenText(order.createdAt, now)}</p>
        <p className="jy-note ad-gap">
          مشتری از درگاه برگشت ولی درگاه هنوز نتیجهٔ روشن نداده؛ مشتری «پرداختت در حال بررسی است» می‌بیند، بی «دوباره پرداخت کن». استعلام
          خودکار هر دقیقه دوباره می‌پرسد؛ «استعلام از درگاه» در کارت «پرداخت‌ها» همین حالا.
          {payableUntil ? <> فایل‌ها تا {whenText(until!, now)} روی سرورند.</> : null}
        </p>
      </section>
    );
  }
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
 * چاپخانهٔ سفارش در ستون کنار (طرح پنل `m-order`، برش ۵٫۲): نام و شهر، و از کجا آمد («خودکار، هنگام پرداخت: هم‌شهر مشتری.»)؛
 * «جابه‌جایی» فقط در «در صف چاپ» و وقتی چاپخانهٔ فعال دیگری هست. سفارش «در صف چاپ» بی چاپخانه هشدار دارد و «انتخاب»؛ پرداخت‌نشده
 * کارت ندارد.
 */
function PartnerCard({ gate, view }: { gate: string; view: OrderDetailsView }) {
  const { details, canAssign } = view;
  const card = partnerCard(details);
  if (!card) return null;
  const { partner, order } = details;
  const self = panelPath(gate, `/orders/${order.orderNumber}`);
  return (
    <section className="jy-card" aria-labelledby="t-prt" data-partner={partner?.id ?? 'none'}>
      <div className="jy-card__head">
        <h2 id="t-prt" className="jy-card__title">
          چاپخانه
        </h2>
        {canAssign ? (
          <Link href={`${self}?do=assign`} className="jy-btn jy-btn--text ad-card-head-btn" scroll={false}>
            {partner ? 'جابه‌جایی' : 'انتخاب'}
          </Link>
        ) : null}
      </div>
      {partner ? (
        <>
          <p className="ad-partner">
            <b>{partner.name}</b>
            <span className="ad-meta">{partner.cityName}</span>
            {partner.active ? null : <span className="jy-badge jy-badge--neutral">غیرفعال</span>}
          </p>
          {card.note ? <p className="ad-meta">{card.note}</p> : null}
        </>
      ) : order.status === 'paid' ? (
        <p className="jy-note jy-note--warning ad-gap">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            {canAssign
              ? 'این سفارش چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود. یکی را برایش انتخاب کن.'
              : 'این سفارش چاپخانه ندارد و هیچ چاپخانهٔ فعالی نیست؛ مالک پنل از «چاپخانه‌ها» یکی را فعال یا اضافه کند.'}
          </span>
        </p>
      ) : (
        <p className="ad-meta">بی چاپخانه.</p>
      )}
    </section>
  );
}

/**
 * ردیف «پیامک» کارت «بستهٔ پستی» (۶٫۳، طرح `m-order-shipped`): به کدام موبایل، کی، رفت یا نرفت؛ «دوباره بفرست» برای مالک و متصدی
 * وقتی نرفت. چاپخانه حال را می‌بیند و کار بعدی‌اش را: «جزوه‌یار دوباره می‌فرستد».
 */
function SmsFact({
  gate,
  shipment,
  orderNumber,
  now,
  canResend,
  partner,
}: {
  gate: string;
  shipment: PanelOrderDetails['shipments'][number];
  orderNumber: number;
  now: Date;
  canResend: boolean;
  partner: boolean;
}) {
  const sms = smsView(shipment.sms, shipment.createdAt, now);
  return (
    <div data-sms={sms.state}>
      <dt>پیامک</dt>
      <dd className="ad-sms">
        <span>
          <Segments segs={sms.text} />
          {sms.resendable && partner ? ' جزوه‌یار دوباره می‌فرستد.' : null}
        </span>
        {sms.resendable && canResend ? <ResendSmsForm gate={gate} shipmentId={shipment.id} orderNumber={orderNumber} /> : null}
      </dd>
    </div>
  );
}

/**
 * بستهٔ پستی سفارش (طرح پنل `m-order-shipped`، برش ۶٫۱، ADR-047): کد رهگیری هر بسته با پیوند سایت پست (فقط `<a>`، قاعدهٔ ۸)، وزن
 * واقعی در برابر برآورد، کرایه و مالیات پست فقط با `orders.money`، و ورود فایل پستی که آورد؛ کد کنارگذاشته با دلیلش. سفارش بی کد
 * این کارت را ندارد.
 */
function ParcelCard({
  gate,
  view,
  canImports,
  canVoid,
  canResend,
  voiding,
}: {
  gate: string;
  view: OrderDetailsView;
  canImports: boolean;
  /** «کنار گذاشتن این کد…» (۶٫۲، فقط مالک، `shipments.revert`). */
  canVoid: boolean;
  /** «دوباره بفرست» پیامکی که نرفت (۶٫۳، مالک و متصدی، `shipments.review`). */
  canResend: boolean;
  /** کدی که فرم کنار گذاشتنش باز است (`?do=void&code=`). */
  voiding: string | null;
}) {
  const { details, bounds } = view;
  if (details.shipments.length === 0) return null;
  const now = bounds.at;
  const self = panelPath(gate, `/orders/${details.order.orderNumber}`);
  const live = details.shipments.filter((shipment) => shipment.voidedAt === null);
  const voided = details.shipments.filter((shipment) => shipment.voidedAt !== null);
  const fileLink = (shipment: (typeof live)[number]) =>
    canImports ? (
      <Link className="jy-link" href={panelPath(gate, `/shipments/${shipment.importId}`)}>
        <bdi>{shipment.filename}</bdi>
      </Link>
    ) : (
      <bdi>{shipment.filename}</bdi>
    );
  return (
    <section className="jy-card" aria-labelledby="t-parcel" data-parcels={live.length}>
      <div className="jy-card__head">
        <h2 id="t-parcel" className="jy-card__title">
          بستهٔ پستی
        </h2>
        <span className="jy-card__meta">
          {details.shippingMethodName ? `${details.shippingMethodName} · ` : ''}
          {live.length > 0 ? parcelsCount(live.length) : 'بی کد زنده'}
        </span>
      </div>
      {live.map((shipment) => (
        <Fragment key={shipment.id}>
          <div className="ad-parcel">
            <Barcode code={shipment.barcode} large />
            {/* فقط پیوند؛ چیزی از سایت پست بار نمی‌شود (قاعدهٔ ۸، ADR-047). */}
            <a className="jy-btn jy-btn--secondary" href={IRAN_POST.trackingUrl(shipment.barcode)} target="_blank" rel="noopener noreferrer">
              رهگیری در سایت پست<span className="sr-only"> (زبانهٔ تازه)</span>
            </a>
          </div>
          <dl className="ad-facts">
            <div>
              <dt>وزن</dt>
              <dd>
                <Segments segs={weightSegs(shipment.weightGrams)} />
                {live.length === 1 ? (
                  <>
                    {' · برآورد '}
                    <Segments segs={weightSegs(details.order.estWeightGrams)} />
                  </>
                ) : null}
              </dd>
            </div>
            {view.canMoney ? (
              <div>
                <dt>کرایهٔ پست</dt>
                <dd>
                  <span className="num">{formatTomans(shipment.fareRials, false)}</span> + مالیات{' '}
                  <span className="num">{formatTomans(shipment.taxRials, false)}</span> تومان
                </dd>
              </div>
            ) : null}
            <div>
              <dt>فایل پست</dt>
              <dd>
                {fileLink(shipment)}، سطر <span className="num">{shipment.rowNo}</span>
                {` · ${shipment.matchedBy === 'review' ? 'با تأیید، ' : shipment.matchedBy === 'manual' ? 'دستی، ' : ''}${shipment.adminName ? `${shipment.adminName}، ` : ''}${whenText(shipment.createdAt, now)}`}
              </dd>
            </div>
            <SmsFact gate={gate} shipment={shipment} orderNumber={details.order.orderNumber} now={now} canResend={canResend} partner={view.partnerView} />
          </dl>
          {canVoid && voiding === shipment.id ? (
            <section className="ad-step ad-gap" aria-labelledby={`t-void-${shipment.id}`} data-void={shipment.id}>
              <p id={`t-void-${shipment.id}`} className="ad-step__title">
                کنار گذاشتن این کد
              </p>
              <ul className="ad-changes ad-gap">
                <li>
                  <span className="ad-changes__k">کد رهگیری</span>
                  <span>کنار می‌رود، پاک نمی‌شود؛ سطرش در همان فایل پست به صف تأیید برمی‌گردد</span>
                </li>
                <li>
                  <span className="ad-changes__k">وضعیت</span>
                  <span>
                    {
                      VOID_OUTCOME[
                        voidKept(shipment, live.some((other) => other.id !== shipment.id), details.order.filesDeletedAt !== null) ?? 'reopen'
                      ]
                    }
                  </span>
                </li>
              </ul>
              {shipment.sms && smsView(shipment.sms, shipment.createdAt, now).state === 'sent' ? (
                <p className="jy-note jy-note--warning ad-gap" data-sms-warning="">
                  <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                  <span>
                    این کد به <span className="num">{phoneText(shipment.sms.toMobile)}</span> پیامک شده؛ پیامکی که رفت برنمی‌گردد. اگر اشتباه بود،
                    خودت خبرش کن.
                  </span>
                </p>
              ) : null}
              <VoidShipmentForm gate={gate} orderNumber={details.order.orderNumber} shipmentId={shipment.id} maxLength={REASON_MAX} back={self} />
            </section>
          ) : canVoid ? (
            <div className="ad-actions">
              <Link href={`${self}?do=void&code=${shipment.id}`} className="jy-btn jy-btn--text" scroll={false}>
                کنار گذاشتن این کد…
              </Link>
            </div>
          ) : null}
        </Fragment>
      ))}
      {voided.map((shipment) => (
        <p key={shipment.id} className="ad-hint ad-gap" data-voided="">
          کد <Barcode code={shipment.barcode} /> کنار رفت
          {shipment.voidedAt ? ` ${whenText(shipment.voidedAt, now)}` : ''}
          {shipment.voidedByName ? ` با ${shipment.voidedByName}` : ''}
          {shipment.voidReason ? `: «${shipment.voidReason}»` : ''} (از {fileLink(shipment)}).
        </p>
      ))}
    </section>
  );
}

/**
 * جزئیات سفارش (طرح پنل، ADR-039): وضعیت، مهلت و کار بعدی در ستون کنار (در گوشی بالای همه)؛ جزوه با فایل‌ها، مشخصات، و از
 * ۵٫۱ فایل چاپ هر جلد و برگهٔ سفارش (ADR-043)، یا «فایل‌ها پاک شد» (ADR-044)؛ گیرنده و نشانی، با «ویرایش» تا پیش از پست؛
 * مبلغ منجمد؛ پرداخت‌ها؛ و رویدادها. لغو، برگرداندن و ویرایش در همین صفحه باز می‌شوند (`?do=`)؛ هر کار از وضعیتی که صفحه
 * نشان داد.
 */
/**
 * ردیف «پیامک پرداخت» زیر پرداخت‌ها (۷٫۱، طرح `ad-paysms`): رفت، در راه، نرفت با علت، یا معلوم نیست؛ «دوباره بفرست» (مالک و متصدی) فقط
 * وقتی سفارش در صف چاپ یا در حال چاپ است. پرداخت پیش از ۷٫۱ ردیف ندارد.
 */
function PaymentSmsRow({
  gate,
  payment,
  orderNumber,
  open,
  canResend,
  now,
}: {
  gate: string;
  payment: PanelOrderDetails['payments'][number];
  orderNumber: number;
  open: boolean;
  canResend: boolean;
  now: Date;
}) {
  const view = paymentSmsView(payment.sms, open, now);
  if (!view) return null;
  return (
    <div className="ad-paysms" data-paysms={view.state}>
      <b>پیامک پرداخت</b>
      {view.state === 'sent' ? (
        <span className="ad-paysms__ok">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          <span>
            <Segments segs={view.text} />
          </span>
        </span>
      ) : view.state === 'sending' ? (
        <span>
          <Segments segs={view.text} />
        </span>
      ) : (
        <span className="ad-paysms__fail">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <Segments segs={view.text} />
          </span>
        </span>
      )}
      {view.resendable && canResend ? <ResendPaymentSmsForm gate={gate} paymentId={payment.id} orderNumber={orderNumber} /> : null}
    </div>
  );
}

/** نتیجهٔ «استعلام از درگاه» (برش ۷٫۲) بالای صفحه؛ جزئیاتش در خود کارت «پرداخت‌ها». */
const INQUIRY_DONE: Record<InquiryOutcome, { tone: 'success' | 'info' | 'warning' | 'error'; text: string }> = {
  succeeded: { tone: 'success', text: 'درگاه پرداخت را تأیید کرد و سفارش «در صف چاپ» رفت؛ پیامک پرداخت به مشتری می‌رود.' },
  failed: { tone: 'info', text: 'درگاه گفت این پرداخت انجام نشد؛ تلاش «ناموفق» شد. علتش در کارت «پرداخت‌ها» است.' },
  pending: { tone: 'info', text: 'درگاه گفت این پرداخت هنوز انجام نشده؛ تلاش باز ماند.' },
  unanswered: { tone: 'warning', text: 'درگاه جواب روشن نداد؛ چیزی عوض نشد. استعلام خودکار هر دقیقه دوباره می‌پرسد.' },
  closed: { tone: 'info', text: 'این تلاش همین حالا جای دیگری بسته شد (برگشت مشتری یا استعلام خودکار)؛ نتیجه در کارت «پرداخت‌ها» است.' },
  busy: { tone: 'info', text: 'همین حالا استعلام دیگری روی همین تلاش در کار است؛ چند ثانیهٔ دیگر صفحه را تازه کن.' },
  held: { tone: 'info', text: 'این تلاش تأیید نشد و پولش نزد درگاه است؛ خودکار به کارت مشتری برمی‌گردد. علتش در کارت «پرداخت‌ها» است.' },
  returned: { tone: 'success', text: 'درگاه پول این تلاش را به کارت مشتری برگرداند.' },
  verified: { tone: 'error', text: 'درگاه این تلاش را تأییدشده می‌گوید، پس پولش خودکار برنمی‌گردد؛ دستی به مشتری برش گردان.' },
};

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
  if (!can(session, 'orders.read')) return <NoAccess gate={gate} partner={session.partner} />;
  const back = (
    <Link href={panelPath(gate, '/orders')} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      سفارش‌ها
    </Link>
  );
  const result = await orders.details(session, number);
  // سفارشی که نیست، و از ۵٫۳ سفارشی که بیرون از محدودهٔ این نشست است: هر دو همین ۴۰۴ (`not-found.tsx`)، پس وجودش لو نمی‌رود.
  if (!result.ok) notFound();
  const view = result.value;
  const mode = modeOf(query.do);
  const canVoid = can(session, 'shipments.revert');
  if (mode && view.partnerView && !modeAllowed(mode, view, canVoid)) return <NoAccess gate={gate} partner={session.partner} />;
  const voiding = mode === 'void' && canVoid && typeof query.code === 'string' ? query.code : null;
  const { details, bounds, canDownload, canEditRecipient } = view;
  const { order } = details;
  const now = bounds.at;
  const stale = staleSections(
    details.items.flatMap((item) => item.sections),
    now,
  );
  const state = orderState(order.status, stale);
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  const self = panelPath(gate, `/orders/${order.orderNumber}`);
  const breakdown = breakdownOf(order);
  const many = details.items.length > 1;
  const purged = purgedNote(details);
  const printable = isPaidStatus(order.status) && !purged;
  const ticketRow = <TicketRow gate={gate} details={details} now={now} canDownload={canDownload} />;
  const entries = orderTimeline(details);
  const when = timelineWhen(entries);
  // نام درگاه سر کارت «پرداخت‌ها» (طرح)، وقتی همهٔ تلاش‌ها از یک درگاه‌اند.
  const providers = new Set(details.payments.map((payment) => payment.provider));
  const payGateway = providers.size === 1 ? (GATEWAY_NAMES[[...providers][0]!] ?? null) : null;

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
      {query.done === 'sms_resend' ? (
        query.sent === '1' ? (
          <Alert tone="success">پیامک رهگیری دوباره فرستاده شد و رفت.</Alert>
        ) : (
          <Alert tone="error">پیامک رهگیری باز نرفت؛ پنل پیامک جواب نداد. کمی بعد دوباره بفرست، یا کد را خودت به مشتری بگو.</Alert>
        )
      ) : null}
      {query.done === 'paid_sms_resend' ? (
        query.sent === '1' ? (
          <Alert tone="success">پیامک پرداخت دوباره فرستاده شد و رفت.</Alert>
        ) : (
          <Alert tone="error">پیامک پرداخت باز نرفت؛ علتش در کارت «پرداخت‌ها» است. کمی بعد دوباره بفرست، یا روز تحویل را خودت به مشتری بگو.</Alert>
        )
      ) : null}
      {query.done === 'inquiry' && typeof query.r === 'string' && query.r in INQUIRY_DONE ? (
        <Alert tone={INQUIRY_DONE[query.r as InquiryOutcome].tone}>{INQUIRY_DONE[query.r as InquiryOutcome].text}</Alert>
      ) : null}
      {query.done === 'void' ? (
        <Alert tone="success">
          کد رهگیری کنار رفت و سطرش به صف تأیید برگشت
          {query.re === '1' ? '؛ سفارش به «در حال چاپ» برگشت.' : '.'}
        </Alert>
      ) : null}

      <div className="ad-grid">
        <aside className="ad-side" aria-label="وضعیت و کار بعدی">
          <StatusCard gate={gate} view={view} stale={stale} mode={mode} />
          {mode === 'assign' && view.canAssign ? (
            <AssignForm
              gate={gate}
              orderNumber={order.orderNumber}
              from={details.partner ? { id: details.partner.id, name: details.partner.name, cityName: details.partner.cityName } : null}
              options={view.partnerOptions}
              maxLength={REASON_MAX}
              back={self}
            />
          ) : view.partnerView ? null : (
            // چاپخانه (۵٫۳) کارت چاپخانه ندارد: سفارش‌هایش همه مال خودش است (طرح).
            <PartnerCard gate={gate} view={view} />
          )}
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
                    <Segments segs={[...volumesSegs(breakdown.items[i]!.volumes), '، هر جلد یک فایل']} />
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

          <ParcelCard
            gate={gate}
            view={view}
            canImports={can(session, 'shipments.import')}
            canVoid={canVoid}
            canResend={can(session, 'shipments.review')}
            voiding={voiding}
          />

          {view.canMoney ? (
            <>
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
                <div className="jy-card__head">
                  <h2 id="t-pay" className="jy-card__title">
                    پرداخت‌ها
                  </h2>
                  {payGateway ? <span className="jy-card__meta">{payGateway}</span> : null}
                </div>
                {details.payments.length === 0 ? (
                  <p className="ad-hint ad-gap">مشتری هنوز به درگاه نرفته است.</p>
                ) : (
                  <ol className="ad-pay">
                    {details.payments.map((payment) => {
                      const pay = paymentView(payment, now);
                      return (
                        <li key={payment.id} data-payment={pay.kind}>
                          <PaymentBadge kind={pay.kind} />
                          <span>{whenText(pay.at, now)}</span>
                          <span className="ad-pay__meta">
                            <Segments segs={pay.meta} />
                          </span>
                          {pay.inquirable && view.inquiryProviders.includes(payment.provider) ? (
                            <span className="ad-pay__act">
                              <InquiryForm gate={gate} paymentId={payment.id} orderNumber={order.orderNumber} />
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
                {details.payments.map((payment) => (
                  <PaymentSmsRow
                    key={payment.id}
                    gate={gate}
                    payment={payment}
                    orderNumber={order.orderNumber}
                    open={order.status === 'paid' || order.status === 'printing'}
                    canResend={can(session, 'orders.money')}
                    now={now}
                  />
                ))}
              </section>
            </>
          ) : null}

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
