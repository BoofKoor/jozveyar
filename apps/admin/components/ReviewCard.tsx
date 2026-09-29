import Link from 'next/link';

import type { ReviewRow, ShipmentOrderFacts } from '@jozveyar/db';
import { formatJalaliWeekday, recipientSurname } from '@jozveyar/text';

import { assignShipmentAction, reviewAction } from '../app/[gate]/actions';
import { whenText } from '../lib/format';
import { panelPath } from '../lib/gate';
import { messageOf } from '../lib/messages';
import type { Seg } from '../lib/orders';
import {
  BLOCK_BUTTONS,
  BLOCK_NOTES,
  choiceText,
  criteriaParts,
  fareText,
  joined,
  orderLine,
  queuedNote,
  reviewMeta,
  reviewWhy,
  seenText,
  weightSegs,
} from '../lib/shipments';
import type { ManualPick } from '../lib/server/shipments';
import { Alert } from './Alert';
import { Barcode } from './Barcode';
import { Segments } from './Segments';
import { StatusButton } from './StatusButton';

/** از کجا آمد: صف تأیید (با شمارهٔ صفحه‌اش) یا صفحهٔ ورود؛ کارها پس از انجام به همان‌جا برمی‌گردند. */
export interface ReviewFrom {
  from: 'queue' | 'import';
  page: number;
}

/** «می‌خواند: شماره، شهر · نمی‌خواند: نام خانوادگی، وزن (برآورد 1.3 کیلوگرم)» (طرح `m-ship-review`). */
function CriteriaNote({ parts }: { parts: { yes: Seg[][]; no: Seg[][] } }) {
  return (
    <>
      {parts.yes.length > 0 ? (
        <>
          <b>می‌خواند:</b> <Segments segs={joined(parts.yes, '، ')} />
        </>
      ) : null}
      {parts.yes.length > 0 && parts.no.length > 0 ? ' · ' : null}
      {parts.no.length > 0 ? (
        <>
          <b>نمی‌خواند:</b> <Segments segs={joined(parts.no, '، ')} />
        </>
      ) : null}
    </>
  );
}

/** فیلدهای پنهانی که کارها لازم دارند تا به همان‌جا برگردند. */
function BackFields({ back, importId }: { back: ReviewFrom; importId: string }) {
  return (
    <>
      <input type="hidden" name="from" value={back.from} />
      {back.page > 1 ? <input type="hidden" name="page" value={back.page} /> : null}
      <input type="hidden" name="import" value={importId} />
    </>
  );
}

/**
 * سر کارت هر سطر (طرح `m-ship-review`): «نام گ» و مقصد فایل، فایل و سطر و کسی که آورد، و کد رهگیری با وزن و، با `money`، کرایه و
 * مالیات. در کارت صف و صفحهٔ سطر هر دو.
 */
export function RowHead({ review, now, money, titleId, level = 2 }: { review: ReviewRow; now: Date; money: boolean; titleId: string; level?: 1 | 2 }) {
  const { row } = review;
  const surname = row.nameG ? recipientSurname(row.nameG) : '';
  const fare = money ? fareText(row) : null;
  const Title = level === 1 ? 'h1' : 'h2';
  return (
    <>
      <div className="jy-card__head">
        <Title id={titleId} className="jy-card__title">
          {surname}
          {row.orderNumber !== null ? (
            <>
              {surname ? ' ' : ''}
              <span className="num">{row.orderNumber}</span>
            </>
          ) : null}{' '}
          <span className="ad-row__city">{row.destination}</span>
        </Title>
        <span className="jy-card__meta">
          <Segments segs={reviewMeta(review, now)} />
        </span>
      </div>
      <p className="ad-rv__file">
        {row.barcode ? <Barcode code={row.barcode} /> : null}
        {row.weightGrams ? (
          <span>
            <Segments segs={weightSegs(row.weightGrams)} />
          </span>
        ) : null}
        {fare ? (
          <span>
            <Segments segs={fare} />
          </span>
        ) : null}
      </p>
    </>
  );
}

/** «سفارش دیگر»: شماره، و «ببین» به کارت همان سفارش در صفحهٔ سطر (قدم اول دادن دستی، تصمیم ۸۳)؛ GET، بی کار سرور. */
function OtherOrderForm({ gate, review, back, id }: { gate: string; review: ReviewRow; back: ReviewFrom; id: string }) {
  return (
    <form id={id} method="get" action={panelPath(gate, `/shipments/${review.import.id}/rows/${review.row.rowNo}`)}>
      <input type="hidden" name="from" value={back.from} />
      {back.page > 1 ? <input type="hidden" name="page" value={back.page} /> : null}
    </form>
  );
}

/** ورودی شماره و «ببین» که مال فرم `OtherOrderForm` است، هر جای کارت که باشد. */
function OtherOrderInput({ form, label }: { form: string; label: string }) {
  return (
    <span className="ad-rv__otherrow">
      <input
        form={form}
        name="order"
        className="jy-input jy-input--ltr ad-rv__no"
        inputMode="numeric"
        autoComplete="off"
        placeholder="شمارهٔ سفارش"
        aria-label={label}
        required
      />
      <button form={form} type="submit" className="jy-btn jy-btn--secondary">
        ببین
      </button>
    </span>
  );
}

/** «همین است» برای سفارش «در صف چاپ»: «شروع چاپ» و «تحویل پست شد» با هم، با روز فایل و مهلت. */
function QueuedNotes({ orders, postDay, now, many }: { orders: ShipmentOrderFacts[]; postDay: Date | null; now: Date; many: boolean }) {
  return (
    <>
      {orders.map((order) => {
        const note = queuedNote(order, postDay, now);
        return note ? (
          <Alert key={order.id} tone="info">
            {many ? (
              <>
                سفارش <span className="num">{order.orderNumber}</span>:{' '}
              </>
            ) : null}
            <Segments segs={note} />
          </Alert>
        ) : null;
      })}
    </>
  );
}

/**
 * یک سطر صف تأیید (۶٫۲، طرح `m-ship-review`، ADR-046): چرا اینجاست، تا سه نامزد با «می‌خواند» و «نمی‌خواند» هر کدام (نامزد قوی از
 * پیش انتخاب‌شده، تصمیم ۷۸؛ نامزدی که «همین است»ش بسته است با دلیلش و بی انتخاب)، «سفارش دیگر» با شماره، و «همین است» و
 * «هیچ‌کدام». همین کد زنده برای سفارش دیگر: «همین است» بسته تا مالک آن را کنار بگذارد (تصمیم ۸۵).
 */
export function ReviewCard({
  gate,
  review,
  now,
  money,
  back,
  at,
  error,
}: {
  gate: string;
  review: ReviewRow;
  now: Date;
  money: boolean;
  back: ReviewFrom;
  /** کارت در صف است یا در صفحهٔ سطر؛ شکست به همان‌جا برمی‌گردد. */
  at: 'queue' | 'row';
  error: string | null;
}) {
  const { row } = review;
  const key = `${review.import.id}-${row.rowNo}`;
  const { candidates, preselected } = review.candidates;
  const elsewhere = review.elsewhere;
  const open = candidates.filter((c) => c.blocked === null);
  const firstBlock = candidates.find((c) => c.blocked !== null)?.blocked ?? null;
  const queuedOrders = elsewhere ? [] : open.filter((c) => c.order.status === 'paid').map((c) => c.order);
  const otherForm = `rv-other-${key}`;

  return (
    <section className="jy-card ad-rv" id={`r-${key}`} aria-labelledby={`t-rv-${key}`} data-review={`${review.import.id}.${row.rowNo}`}>
      <RowHead review={review} now={now} money={money} titleId={`t-rv-${key}`} level={at === 'row' ? 1 : 2} />
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <Alert tone="warning">
        <Segments segs={reviewWhy(review, now)} />
      </Alert>
      <form action={reviewAction}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="row" value={row.rowNo} />
        <input type="hidden" name="at" value={at} />
        <BackFields back={back} importId={review.import.id} />
        <fieldset className="jy-field ad-gap">
          <legend className="jy-label">کدام سفارش؟</legend>
          <div className="jy-tiles ad-roles">
            {candidates.map((c) => (
              <label key={c.order.id} className="jy-tile" data-candidate={c.order.orderNumber} data-blocked={c.blocked ?? undefined}>
                <input
                  className="jy-radio"
                  type="radio"
                  name="choice"
                  value={choiceText(c.order)}
                  defaultChecked={!elsewhere && preselected === c.order.id}
                  disabled={elsewhere !== null || c.blocked !== null}
                  required
                />
                <span className="jy-tile__title">
                  <Segments segs={orderLine(c.order)} />
                </span>
                <span className="jy-tile__note">
                  {c.blocked ? BLOCK_NOTES[c.blocked] : <CriteriaNote parts={criteriaParts(c.criteria, c.order)} />}
                  {c.voidedHere ? ' · کد همین سطر پیش‌تر از این سفارش کنار رفت' : null}
                </span>
              </label>
            ))}
            {elsewhere ? null : (
              <div className="jy-tile ad-rv__other">
                <span className="jy-tile__title">سفارش دیگر</span>
                <OtherOrderInput form={otherForm} label="شمارهٔ سفارش دیگر" />
              </div>
            )}
          </div>
        </fieldset>
        <QueuedNotes orders={queuedOrders} postDay={row.postDay} now={now} many={candidates.length > 1} />
        <div className="ad-actions">
          {elsewhere ? (
            <button type="button" className="jy-btn jy-btn--primary is-status" aria-disabled="true">
              {BLOCK_BUTTONS.barcode_elsewhere}
            </button>
          ) : open.length > 0 ? (
            <StatusButton name="do" value="approve" className="jy-btn jy-btn--primary">
              همین است
            </StatusButton>
          ) : firstBlock ? (
            <button type="button" className="jy-btn jy-btn--primary is-status" aria-disabled="true">
              {BLOCK_BUTTONS[firstBlock]}
            </button>
          ) : null}
          <StatusButton name="do" value="dismiss" formNoValidate className="jy-btn jy-btn--text">
            هیچ‌کدام
          </StatusButton>
        </div>
      </form>
      {elsewhere ? null : <OtherOrderForm gate={gate} review={review} back={back} id={otherForm} />}
    </section>
  );
}

/**
 * دادن دستی، قدم اول (۶٫۲، تصمیم ۸۳): سطری که در صف نیست ولی به سفارشی داده می‌شود («پیدا نشد»، یا «هیچ‌کدام»ی که اشتباه بود):
 * شمارهٔ سفارش، و «ببین».
 */
export function AssignStart({ gate, review, back }: { gate: string; review: ReviewRow; back: ReviewFrom }) {
  const id = `rv-other-${review.import.id}-${review.row.rowNo}`;
  return (
    <div className="jy-field ad-gap">
      <label className="jy-label" htmlFor={`${id}-n`}>
        به کدام سفارش بدهم؟
      </label>
      <span className="ad-rv__otherrow">
        <input
          id={`${id}-n`}
          form={id}
          name="order"
          className="jy-input jy-input--ltr ad-rv__no"
          inputMode="numeric"
          autoComplete="off"
          placeholder="شمارهٔ سفارش"
          required
        />
        <button form={id} type="submit" className="jy-btn jy-btn--secondary">
          ببین
        </button>
      </span>
      <p className="jy-hint">کارت همان سفارش را با «می‌خواند» و «نمی‌خواند» می‌بینی، و بعد «همین است».</p>
      <OtherOrderForm gate={gate} review={review} back={back} id={id} />
    </div>
  );
}

/**
 * دادن دستی، قدم دوم (۶٫۲، تصمیم ۸۳): کارت سفارشی که ادمین با شماره‌اش آورد، با همان معیارها و دروازه‌های نامزدها؛ «همین است» از
 * همان که ادمین از سفارش دید. لغوشده و پرداخت‌نشده هرگز؛ «در صف چاپ» فقط با دروازه‌های «شروع چاپ» (تصمیم ۸۴).
 */
export function ManualCard({
  gate,
  review,
  pick,
  now,
  back,
  cancel,
  error,
}: {
  gate: string;
  review: ReviewRow;
  pick: ManualPick;
  now: Date;
  back: ReviewFrom;
  /** «انصراف»: همان‌جا که ادمین از آن آمد. */
  cancel: string;
  error: string | null;
}) {
  if (pick.kind === 'missing') {
    return (
      <section className="jy-card ad-rv" aria-labelledby="t-manual" data-manual="missing">
        <h2 id="t-manual" className="jy-card__title">
          سفارش <span className="num">{pick.orderNumber}</span> پیدا نشد
        </h2>
        <p className="ad-hint ad-gap">
          {review.import.partner
            ? `این فایل از ${review.import.partner.name} است و فقط به سفارش‌هایی داده می‌شود که به ${review.import.partner.name} سپرده شده‌اند. شماره را ببین و دوباره بنویس.`
            : 'پرداخت‌نشده هم کد رهگیری نمی‌گیرد. شماره را ببین و دوباره بنویس.'}
        </p>
        <AssignStart gate={gate} review={review} back={back} />
      </section>
    );
  }
  const { order, criteria, block, voidedHere } = pick;
  const elsewhere = review.elsewhere;
  const parts = criteriaParts(criteria, order);
  const note = block || elsewhere ? null : queuedNote(order, review.row.postDay, now);
  return (
    <section className="jy-card ad-rv" aria-labelledby="t-manual" data-manual={order.orderNumber}>
      <h2 id="t-manual" className="jy-card__title">
        به سفارش <span className="num">{order.orderNumber}</span> بدهم؟
      </h2>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <div className="jy-tile ad-rv__pick ad-gap" data-candidate={order.orderNumber}>
        <span className="jy-tile__title">
          <Segments segs={orderLine(order)} />
        </span>
        <span className="jy-tile__note">
          <CriteriaNote parts={parts} />
        </span>
      </div>
      {block ? <Alert tone="warning">{messageOf(`blocked_${block}`)}</Alert> : null}
      {elsewhere ? <Alert tone="warning">{messageOf('barcode_elsewhere')}</Alert> : null}
      {voidedHere ? <Alert tone="warning">کد همین سطر پیش‌تر از همین سفارش کنار رفت؛ اگر مطمئنی، دوباره بده.</Alert> : null}
      {order.liveShipments > 0 && !block && !elsewhere ? (
        <Alert tone="info">
          این سفارش کد رهگیری دارد
          {order.handedToPostAt ? ` و ${formatJalaliWeekday(order.handedToPostAt)} به پست رسید` : ''}؛ این بستهٔ دوم آن می‌شود و وضعیتش همان
          می‌ماند.
        </Alert>
      ) : null}
      {note ? (
        <Alert tone="info">
          <Segments segs={note} />
        </Alert>
      ) : order.status === 'printing' && !block && !elsewhere ? (
        <Alert tone="info">
          «در حال چاپ» است؛ با «همین است» «تحویل پست شد» هم می‌شود، با روز فایل{review.row.postDay ? `: ${formatJalaliWeekday(review.row.postDay)}` : ''}.
        </Alert>
      ) : null}
      <form action={assignShipmentAction} className="ad-actions">
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="row" value={review.row.rowNo} />
        <input type="hidden" name="order" value={order.id} />
        <input type="hidden" name="seen" value={seenText(order)} />
        <input type="hidden" name="number" value={order.orderNumber} />
        <BackFields back={back} importId={review.import.id} />
        {block || elsewhere ? (
          <button type="button" className="jy-btn jy-btn--primary is-status" aria-disabled="true">
            {BLOCK_BUTTONS[elsewhere ? 'barcode_elsewhere' : block!]}
          </button>
        ) : (
          <StatusButton className="jy-btn jy-btn--primary">همین است</StatusButton>
        )}
        <Link href={cancel} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </form>
    </section>
  );
}

/** «هیچ‌کدام»، علی محمدی، امروز 11:20 (۶٫۲). */
export function dismissedText(review: ReviewRow, now: Date): string | null {
  const { row } = review;
  if (!row.dismissedAt) return null;
  return `«هیچ‌کدام»${row.dismissedByName ? `، ${row.dismissedByName}` : ''}، ${whenText(row.dismissedAt, now)}`;
}
