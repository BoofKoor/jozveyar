'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { refundGatewayAction, refundManualAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

/** همان پرداخت و آخرین بازپرداختی که صفحه نشان داد («همان که دیده شد»)؛ سرور پیش از کد و دوباره زیر قفل می‌سنجد. */
interface Target {
  gate: string;
  orderNumber: number;
  paymentId: string;
  seen: string;
  /** «374,750». */
  amount: string;
  back: string;
}

const CODE_HINT = 'پول جابه‌جا می‌شود؛ کد تازه لازم است.';

/** خطای کلی فرم (قفل، پیش‌استعلامی که جواب نداد)؛ خطای کد کنار خودش. */
function FormError({ state, inline }: { state: FormState; inline: boolean }) {
  if (state.error === 'account_locked') {
    return (
      <Alert tone="warning">
        تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
      </Alert>
    );
  }
  return state.error && !inline ? <Alert tone="error">{messageOf(state.error)}</Alert> : null;
}

const codeErrorOf = (state: FormState) => (state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null);

/**
 * «بازپرداخت از درگاه» (برش ۷٫۳، طرح `m-refund`؛ فقط مالک): مبلغ، کارت و کارمزد پیش از کد تازه، و موجودی‌ای که کیف پول باید داشته
 * باشد؛ بعد کد و «X تومان را برگردان».
 */
export function RefundGatewayForm({
  target,
  card,
  gatewayName,
  fee,
  total,
}: {
  target: Target;
  /** «6037 99•• •••• 1234»، یا null اگر درگاه کارت را نگفت. */
  card: string | null;
  gatewayName: string;
  fee: string;
  /** مبلغ و کارمزد با هم، کمینهٔ موجودی کیف پول. */
  total: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(refundGatewayAction, {});
  const codeError = codeErrorOf(state);
  return (
    <section className="jy-card ad-refund" aria-labelledby="t-rf-gw" data-refund-form="gateway">
      <h2 id="t-rf-gw" className="jy-card__title">
        بازپرداخت از درگاه
      </h2>
      <ul className="ad-changes">
        <li>
          <span className="ad-changes__k">مبلغ</span>
          <span>
            <span className="num">{target.amount}</span> تومان، کل پرداخت
          </span>
        </li>
        <li>
          <span className="ad-changes__k">به</span>
          <span>
            {card ? (
              <>
                کارت <span className="num nw">{card}</span>، همان که پرداخت کرد
              </>
            ) : (
              'همان کارتی که با آن پرداخت شد'
            )}
          </span>
        </li>
        <li>
          <span className="ad-changes__k">کارمزد {gatewayName}</span>
          <span data-refund-fee="">
            <span className="num">{fee}</span> تومان، از کیف پول {gatewayName} جزوه‌یار
          </span>
        </li>
      </ul>
      <p className="jy-note jy-note--info ad-gap">
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        <span>
          {gatewayName} از کیف پول برمی‌گرداند، پس کیف پول باید دست‌کم <span className="num">{total}</span> تومان داشته باشد؛ وگرنه رد
          می‌کند و ثبت دستی می‌ماند. پول معمولاً <span className="num">5</span> تا <span className="num">30</span> دقیقه بعد به کارت
          می‌نشیند.
        </span>
      </p>
      <FormError state={state} inline={codeError !== null} />
      <form action={action}>
        <input type="hidden" name="gate" value={target.gate} />
        <input type="hidden" name="number" value={target.orderNumber} />
        <input type="hidden" name="payment" value={target.paymentId} />
        <input type="hidden" name="seen" value={target.seen} />
        <div className="ad-form">
          <CodeField error={codeError} hint={CODE_HINT} />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            <span>
              <span className="num">{target.amount}</span> تومان را برگردان
            </span>
          </button>
          <Link href={target.back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

/** پیام هر فیلد دستی، از کد خطای سرور. */
const FIELD_OF: Partial<Record<NonNullable<FormState['error']>, 'day' | 'reference' | 'note'>> = {
  refund_day_invalid: 'day',
  refund_day_future: 'day',
  refund_day_early: 'day',
  refund_reference_invalid: 'reference',
  refund_note_too_long: 'note',
};

/**
 * «ثبت بازپرداخت دستی» (برش ۷٫۳، طرح `m-refund-manual`؛ فقط مالک): پولی که از راه دیگری برگشت؛ روز (پیش‌فرض امروز)، کد پیگیری بانک،
 * «چطور برگشت» اختیاری که مشتری نمی‌بیند، و کد تازه.
 */
export function RefundManualForm({ target, today, noteMax }: { target: Target; today: string; noteMax: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(refundManualAction, {});
  const values = state.values ?? { day: today, reference: '', note: '' };
  const field = state.error ? FIELD_OF[state.error] : undefined;
  const errorFor = (name: 'day' | 'reference' | 'note') => (field === name ? messageOf(state.error!) : null);
  const codeError = codeErrorOf(state);
  const day = errorFor('day');
  const reference = errorFor('reference');
  const note = errorFor('note');
  const described = (id: string, error: string | null, hint?: string) =>
    [error ? `${id}-error` : null, hint ?? null].filter(Boolean).join(' ') || undefined;
  return (
    <section className="jy-card ad-refund" aria-labelledby="t-rf-manual" data-refund-form="manual">
      <h2 id="t-rf-manual" className="jy-card__title">
        ثبت بازپرداخت دستی
      </h2>
      <p className="ad-hint">
        وقتی پول را از راه دیگری برگرداندی، مثل کارت‌به‌کارت یا پایا. این فقط ثبت است و پولی جابه‌جا نمی‌کند؛ مشتری «برگشت داده شد» را
        با کد پیگیری می‌بیند.
      </p>
      <FormError state={state} inline={codeError !== null || field !== undefined} />
      <form action={action}>
        <input type="hidden" name="gate" value={target.gate} />
        <input type="hidden" name="number" value={target.orderNumber} />
        <input type="hidden" name="payment" value={target.paymentId} />
        <input type="hidden" name="seen" value={target.seen} />
        <div className="ad-form">
          <dl className="ad-facts">
            <div>
              <dt>مبلغ</dt>
              <dd>
                <span className="num">{target.amount}</span> تومان، کل پرداخت
              </dd>
            </div>
          </dl>
          <div className="jy-field">
            <label className="jy-label" htmlFor="rm-day">
              روز برگشت
            </label>
            <input
              id="rm-day"
              name="day"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              required
              defaultValue={values.day}
              aria-invalid={day ? true : undefined}
              aria-describedby={described('rm-day', day)}
            />
            {day ? <FieldError id="rm-day-error">{day}</FieldError> : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="rm-ref">
              کد پیگیری بانک
            </label>
            <input
              id="rm-ref"
              name="reference"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              maxLength={60}
              required
              defaultValue={values.reference}
              aria-invalid={reference ? true : undefined}
              aria-describedby={described('rm-ref', reference)}
            />
            {reference ? <FieldError id="rm-ref-error">{reference}</FieldError> : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="rm-how">
              چطور برگشت <span className="jy-optional">(اختیاری)</span>
            </label>
            <input
              id="rm-how"
              name="note"
              className="jy-input"
              autoComplete="off"
              maxLength={noteMax}
              defaultValue={values.note}
              aria-invalid={note ? true : undefined}
              aria-describedby={described('rm-how', note, 'rm-how-hint')}
            />
            {note ? <FieldError id="rm-how-error">{note}</FieldError> : null}
            <p id="rm-how-hint" className="jy-hint">
              فقط در پنل؛ مشتری نمی‌بیند.
            </p>
          </div>
          <CodeField error={codeError} hint={CODE_HINT} />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            ثبت بازپرداخت
          </button>
          <Link href={target.back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="jy-error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      {children}
    </p>
  );
}
