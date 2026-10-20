'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import {
  settlementAdjustmentAction,
  settlementPaymentAction,
  settlementVoidAction,
  type FormState,
} from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { AdminErrorCode } from '../lib/server/result';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

/** جای هر خطای فرم، زیر همان فیلد. */
const FIELD_OF: Partial<Record<AdminErrorCode, string>> = {
  settlement_amount_invalid: 'amount',
  settlement_day_invalid: 'day',
  settlement_day_future: 'day',
  settlement_period_invalid: 'periodFrom',
  settlement_period_order: 'periodTo',
  settlement_period_long: 'periodTo',
  settlement_tracking_invalid: 'tracking',
  settlement_note_too_long: 'note',
  settlement_reason_required: 'reason',
  settlement_reason_too_long: 'reason',
  settlement_direction: 'direction',
  settlement_order_invalid: 'order',
  settlement_order_not_found: 'order',
};

const CODE_ERRORS: readonly (AdminErrorCode | undefined)[] = ['wrong_code', 'code_used', 'settlement_code_required'];
const CODE_HINT = 'ثبت در دفتر تسویه کد تازه می‌خواهد؛ کدی که با آن وارد شدی دوباره پذیرفته نیست.';

/** چاپخانه، بازه‌ای که فرم از آن آمد، «همان که دیده شد» و شناسهٔ فرم. */
export interface LedgerTarget {
  gate: string;
  partnerId: string;
  partnerName: string;
  /** نسخهٔ دفتری که صفحه نشان داد. */
  seen: string;
  /** شناسهٔ این فرم: دو کلیک یک ردیف. */
  request: string;
  /** بازهٔ صورت‌حساب برای برگشت: `d`، `from` و `to`. */
  range: Record<string, string>;
  back: string;
}

function Hidden({ target }: { target: LedgerTarget }) {
  return (
    <>
      <input type="hidden" name="gate" value={target.gate} />
      <input type="hidden" name="partner" value={target.partnerId} />
      <input type="hidden" name="seen" value={target.seen} />
      <input type="hidden" name="request" value={target.request} />
      {Object.entries(target.range).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function useForm(action: (state: FormState, form: FormData) => Promise<FormState>) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  const at = state.error ? FIELD_OF[state.error] : undefined;
  const codeError = CODE_ERRORS.includes(state.error) ? messageOf(state.error!) : null;
  const errorFor = (name: string) => (at === name ? messageOf(state.error!) : null);
  const general = state.error && !at && !codeError ? state.error : null;
  return { state, run, pending, errorFor, codeError, general };
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="jy-error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      {children}
    </p>
  );
}

/** یک فیلد متنی با خطا و راهنمای خودش. */
function Field({
  id,
  name,
  label,
  optional,
  value,
  error,
  hint,
  ltr,
  numeric,
  maxLength,
  placeholder,
  required,
}: {
  id: string;
  name: string;
  label: string;
  optional?: boolean;
  value: string;
  error: string | null;
  hint?: string;
  ltr?: boolean;
  numeric?: boolean;
  maxLength: number;
  placeholder?: string;
  required?: boolean;
}) {
  const described = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="jy-field">
      <label className="jy-label" htmlFor={id}>
        {label} {optional ? <span className="jy-optional">(اختیاری)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        className={`jy-input${ltr ? ' jy-input--ltr ad-short num' : ''}`}
        dir={ltr ? 'ltr' : undefined}
        inputMode={numeric ? 'numeric' : undefined}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      {hint ? (
        <p id={`${id}-hint`} className="jy-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Lock({ state }: { state: FormState }) {
  return state.error === 'account_locked' ? (
    <Alert tone="warning">
      تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
    </Alert>
  ) : null;
}

/**
 * «ثبت پرداخت» (برش ۱۰٫۳، سؤال ۳۹۶؛ مالک و حسابدار): پولی که به چاپخانه داده شد؛ مبلغ تومان، روز (پیش‌فرض امروز)، «بابت» اختیاری، کد پیگیری
 * و یادداشت اختیاری، و کد تازه. این فقط ثبت است و پولی جابه‌جا نمی‌کند؛ چاپخانه همین را در صورت‌حسابش می‌بیند.
 */
export function PaymentForm({ target, today, balance }: { target: LedgerTarget; today: string; balance: string }) {
  const { state, run, pending, errorFor, codeError, general } = useForm(settlementPaymentAction);
  const values = state.values ?? { amount: '', day: today, periodFrom: '', periodTo: '', tracking: '', note: '' };
  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-payment" data-settlement-form="payment">
      <h1 id="t-payment" className="jy-card__title">
        ثبت پرداخت به {target.partnerName}
      </h1>
      <p className="ad-lead">
        پولی که به چاپخانه دادی، مثل کارت‌به‌کارت یا پایا. این فقط ثبت است و پولی جابه‌جا نمی‌کند؛ چاپخانه همین را در صورت‌حسابش می‌بیند. ماندهٔ
        امروز: <span className="num">{balance}</span>.
      </p>
      <Lock state={state} />
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <Hidden target={target} />
        <div className="ad-form">
          <Field id="pay-amount" name="amount" label="مبلغ (تومان)" value={values.amount ?? ''} error={errorFor('amount')} ltr numeric maxLength={20} placeholder="2,500,000" required />
          <Field id="pay-day" name="day" label="روز پرداخت" value={values.day ?? today} error={errorFor('day')} ltr numeric maxLength={12} required />
          <Field
            id="pay-from"
            name="periodFrom"
            label="بابت، از"
            optional
            value={values.periodFrom ?? ''}
            error={errorFor('periodFrom')}
            ltr
            numeric
            maxLength={12}
            placeholder="1405/07/01"
          />
          <Field
            id="pay-to"
            name="periodTo"
            label="تا"
            optional
            value={values.periodTo ?? ''}
            error={errorFor('periodTo')}
            hint="سفارش‌های کدام روزها؛ یکی تنها یعنی همان یک روز."
            ltr
            numeric
            maxLength={12}
            placeholder="1405/07/30"
          />
          <Field id="pay-tracking" name="tracking" label="کد پیگیری بانک" optional value={values.tracking ?? ''} error={errorFor('tracking')} ltr maxLength={60} />
          <Field id="pay-note" name="note" label="یادداشت" optional value={values.note ?? ''} error={errorFor('note')} hint="چاپخانه هم در صورت‌حسابش می‌بیند." maxLength={300} />
          <CodeField error={codeError} hint={CODE_HINT} />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            ثبت پرداخت
          </button>
          <Link href={target.back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

/**
 * «ثبت اصلاح» (برش ۱۰٫۳، سؤال ۳۹۶): مبلغی به سود چاپخانه (مثلاً کرایهٔ پستی که از قرارداد خودش داد، یا بخشی از چاپ سفارشی که پس از شروع چاپ لغو
 * شد) یا به زیانش (خسارت)، با سفارش اختیاری، دلیل لازم و کد تازه.
 */
export function AdjustmentForm({
  target,
  today,
  order,
}: {
  target: LedgerTarget;
  today: string;
  /** سفارشی که فرم از کنارش آمد (`?order=`)، با سهمش؛ null یعنی هیچ. */
  order: { number: number; text: string } | null;
}) {
  const { state, run, pending, errorFor, codeError, general } = useForm(settlementAdjustmentAction);
  const values = state.values ?? { amount: '', direction: 'plus', day: today, order: order ? String(order.number) : '', reason: '' };
  const direction = errorFor('direction');
  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-adjust" data-settlement-form="adjustment">
      <h1 id="t-adjust" className="jy-card__title">
        ثبت اصلاح برای {target.partnerName}
      </h1>
      <p className="ad-lead">
        مبلغی بیرون از سهم سفارش‌ها: به سود چاپخانه، مثل کرایهٔ پستی که از قرارداد خودش داد یا بخشی از چاپ سفارشی که پس از شروع چاپ لغو شد؛ یا به
        زیانش، مثل خسارت. دلیل در صورت‌حساب چاپخانه هم دیده می‌شود.
      </p>
      {order ? (
        <p className="jy-note jy-note--info ad-gap">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>{order.text}</span>
        </p>
      ) : null}
      <Lock state={state} />
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <Hidden target={target} />
        <div className="ad-form">
          <Field id="adj-amount" name="amount" label="مبلغ (تومان)" value={values.amount ?? ''} error={errorFor('amount')} ltr numeric maxLength={20} placeholder="120,000" required />
          <fieldset className="jy-field" aria-describedby={direction ? 'adj-direction-error' : undefined}>
            <legend className="jy-label">اثر بر مانده</legend>
            <div className="jy-tiles ad-roles">
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="direction" value="plus" defaultChecked={values.direction !== 'minus'} />
                <span className="jy-tile__title">به سود چاپخانه</span>
                <span className="jy-tile__note">بدهی جزوه‌یار به چاپخانه بیشتر می‌شود</span>
              </label>
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="direction" value="minus" defaultChecked={values.direction === 'minus'} />
                <span className="jy-tile__title">به زیان چاپخانه</span>
                <span className="jy-tile__note">بدهی جزوه‌یار کم می‌شود</span>
              </label>
            </div>
            {direction ? <FieldError id="adj-direction-error">{direction}</FieldError> : null}
          </fieldset>
          <Field id="adj-day" name="day" label="روز" value={values.day ?? today} error={errorFor('day')} ltr numeric maxLength={12} required />
          <Field
            id="adj-order"
            name="order"
            label="سفارش"
            optional
            value={values.order ?? ''}
            error={errorFor('order')}
            hint="سفارشی که اصلاح برای آن است؛ فقط سفارشی که روزی به همین چاپخانه سپرده شد."
            ltr
            numeric
            maxLength={12}
            placeholder="10027"
          />
          <Field id="adj-reason" name="reason" label="دلیل" value={values.reason ?? ''} error={errorFor('reason')} maxLength={300} required />
          <CodeField error={codeError} hint={CODE_HINT} />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            ثبت اصلاح
          </button>
          <Link href={target.back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

/** «باطل کن» یک ردیف دفتر (برش ۱۰٫۳): ردیف پاک نمی‌شود؛ با دلیل در صورت‌حساب می‌ماند و در هیچ جمعی نیست. */
export function VoidForm({ target, entry, summary }: { target: LedgerTarget & { entry: number }; entry: number; summary: string }) {
  const { state, run, pending, errorFor, codeError, general } = useForm(settlementVoidAction);
  const values = state.values ?? { reason: '' };
  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-void" data-settlement-form="void">
      <h1 id="t-void" className="jy-card__title">
        باطل کردن ردیف دفتر {target.partnerName}
      </h1>
      <p className="ad-lead">{summary}</p>
      <p className="ad-hint">ردیف پاک نمی‌شود: با دلیل و نام تو در صورت‌حساب می‌ماند و در هیچ جمعی نیست. اگر مبلغ درست چیز دیگری بود، پس از باطل کردن ردیف تازه بنویس.</p>
      <Lock state={state} />
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <Hidden target={target} />
        <input type="hidden" name="entry" value={entry} />
        <div className="ad-form">
          <Field id="void-reason" name="reason" label="دلیل" value={values.reason ?? ''} error={errorFor('reason')} maxLength={300} required />
          <CodeField error={codeError} hint={CODE_HINT} />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--danger jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            باطل کن
          </button>
          <Link href={target.back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
