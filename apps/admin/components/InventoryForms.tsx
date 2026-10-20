'use client';

import { useActionState } from 'react';

import { inventoryMoveAction, inventoryThresholdAction, inventoryTrackAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { AdminErrorCode } from '../lib/server/result';
import { Alert } from './Alert';

/** جای هر خطای فرم، زیر همان فیلد. */
const FIELD_OF: Partial<Record<AdminErrorCode, string>> = {
  stock_kind_invalid: 'kind',
  stock_sheets_invalid: 'sheets',
  stock_count_invalid: 'sheets',
  stock_note_required: 'note',
  stock_note_too_long: 'note',
  stock_paper_invalid: 'paper',
  stock_paper_not_found: 'paper',
  stock_item_exists: 'paper',
  stock_threshold_invalid: 'threshold',
};

/** فرم «کاغذ تازه» شمارش را با نام `counted` دارد؛ خطای شمارش آنجا زیر همان فیلد است. */
const TRACK_FIELD_OF: Partial<Record<AdminErrorCode, string>> = { ...FIELD_OF, stock_count_invalid: 'counted' };

/** یک بند کاغذ ۵۰۰ برگ است: راهنمای فیلدهای برگ (سؤال ۴۰۴). */
const REAM_HINT = 'هر بند 500 برگ است.';

function useForm(action: (state: FormState, form: FormData) => Promise<FormState>, fields = FIELD_OF) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, {});
  const at = state.error ? fields[state.error] : undefined;
  const errorFor = (name: string) => (at === name ? messageOf(state.error!) : null);
  const general = state.error && !at ? state.error : null;
  return { state, run, pending, errorFor, general };
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
        className={`jy-input${numeric ? ' jy-input--ltr ad-short num' : ''}`}
        dir={numeric ? 'ltr' : undefined}
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

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <div className="ad-status__actions">
      <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
        {children}
      </button>
    </div>
  );
}

/** دروازه، چاپخانه و شناسهٔ این فرم (دو کلیک یک ردیف). */
export interface StockTarget {
  gate: string;
  partnerId: string;
  request: string;
}

/**
 * «کاغذ تازه» (برش ۱۰٫۴، سؤال ۴۰۵): کاغذ و اندازه از تعرفهٔ فعال (فقط آنچه هنوز پیگیری نمی‌شود)، موجودی امروز (صفر هم) و آستانهٔ اختیاری.
 * از این به بعد «شروع چاپ» سفارش‌های همین چاپخانه از آن کم می‌کند.
 */
export function TrackForm({ target, papers }: { target: StockTarget; papers: { value: string; label: string }[] }) {
  const { state, run, pending, errorFor, general } = useForm(inventoryTrackAction, TRACK_FIELD_OF);
  const values = state.values ?? { paper: papers[0]?.value ?? '', counted: '', threshold: '' };
  const paperError = errorFor('paper');
  return (
    <section className="jy-card ad-gap" aria-labelledby="t-track" data-stock-form="track">
      <h2 id="t-track" className="jy-card__title">
        کاغذ تازه
      </h2>
      <p className="ad-lead">کاغذی که این چاپخانه از امروز موجودی‌اش را نگه می‌دارد. از این به بعد «شروع چاپ» هر سفارشش برگ‌ها را خودش کم می‌کند.</p>
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <input type="hidden" name="gate" value={target.gate} />
        <input type="hidden" name="partner" value={target.partnerId} />
        <input type="hidden" name="request" value={target.request} />
        <div className="ad-form">
          <fieldset className="jy-field" aria-describedby={paperError ? 'track-paper-error' : undefined}>
            <legend className="jy-label">کاغذ و اندازه</legend>
            <div className="jy-tiles ad-roles">
              {papers.map((paper) => (
                <label key={paper.value} className="jy-tile">
                  <input className="jy-radio" type="radio" name="paper" value={paper.value} defaultChecked={values.paper === paper.value} />
                  <span className="jy-tile__title">{paper.label}</span>
                </label>
              ))}
            </div>
            {paperError ? <FieldError id="track-paper-error">{paperError}</FieldError> : null}
          </fieldset>
          <Field
            id="track-counted"
            name="counted"
            label="موجودی امروز (برگ)"
            value={values.counted ?? ''}
            error={errorFor('counted')}
            hint={`شمارش اول؛ صفر هم می‌شود. ${REAM_HINT}`}
            numeric
            maxLength={20}
            placeholder="2,500"
            required
          />
          <Field
            id="track-threshold"
            name="threshold"
            label="آستانهٔ هشدار (برگ)"
            optional
            value={values.threshold ?? ''}
            error={errorFor('threshold')}
            hint="کمتر از این، پیشخوان هشدار می‌دهد."
            numeric
            maxLength={20}
            placeholder="1,000"
          />
        </div>
        <Submit pending={pending}>شروع پیگیری</Submit>
      </form>
    </section>
  );
}

const KINDS = [
  { value: 'purchase', title: 'ورود', note: 'کاغذی که رسید؛ به موجودی افزوده می‌شود' },
  { value: 'waste', title: 'ضایعات', note: 'کاغذی که خراب شد یا جای دیگر رفت؛ با دلیل' },
  { value: 'count', title: 'شمارش', note: 'موجودی واقعی را بنویس؛ تفاوت خودش حساب می‌شود' },
] as const;

/**
 * «ثبت» یک قلم (برش ۱۰٫۴، سؤال ۴۰۹): ورود (برگی که رسید)، ضایعات (با دلیل) یا شمارش (موجودی واقعی، با دلیل)؛ بی کد تازه. ردیف پاک و عوض نمی‌شود؛
 * اشتباه با شمارش درست می‌شود.
 */
export function MoveForm({ target, itemId, balance }: { target: StockTarget; itemId: string; balance: string }) {
  const { state, run, pending, errorFor, general } = useForm(inventoryMoveAction);
  const values = state.values ?? { kind: 'purchase', sheets: '', note: '' };
  const kindError = errorFor('kind');
  return (
    <section className="jy-card" aria-labelledby="t-move" data-stock-form="move">
      <h2 id="t-move" className="jy-card__title">
        ثبت
      </h2>
      <p className="ad-lead">
        موجودی امروز: <span className="num">{balance}</span> برگ. ردیف پاک و عوض نمی‌شود؛ اشتباه را با «شمارش» درست کن.
      </p>
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <input type="hidden" name="gate" value={target.gate} />
        <input type="hidden" name="partner" value={target.partnerId} />
        <input type="hidden" name="item" value={itemId} />
        <input type="hidden" name="request" value={target.request} />
        <div className="ad-form">
          <fieldset className="jy-field" aria-describedby={kindError ? 'move-kind-error' : undefined}>
            <legend className="jy-label">نوع</legend>
            <div className="jy-tiles ad-roles">
              {KINDS.map((kind) => (
                <label key={kind.value} className="jy-tile">
                  <input className="jy-radio" type="radio" name="kind" value={kind.value} defaultChecked={values.kind === kind.value} />
                  <span className="jy-tile__title">{kind.title}</span>
                  <span className="jy-tile__note">{kind.note}</span>
                </label>
              ))}
            </div>
            {kindError ? <FieldError id="move-kind-error">{kindError}</FieldError> : null}
          </fieldset>
          <Field
            id="move-sheets"
            name="sheets"
            label="برگ"
            value={values.sheets ?? ''}
            error={errorFor('sheets')}
            hint={`ورود و ضایعات: چند برگ؛ شمارش: موجودی واقعی. ${REAM_HINT}`}
            numeric
            maxLength={20}
            placeholder="500"
            required
          />
          <Field
            id="move-note"
            name="note"
            label="یادداشت یا دلیل"
            value={values.note ?? ''}
            error={errorFor('note')}
            hint="ضایعات و شمارش دلیل می‌خواهند؛ ورود نه."
            maxLength={300}
          />
        </div>
        <Submit pending={pending}>ثبت</Submit>
      </form>
    </section>
  );
}

/** آستانهٔ هشدار یک قلم (برش ۱۰٫۴، سؤال ۴۱۳)؛ خالی یعنی بی آستانه. */
export function ThresholdForm({ target, itemId, threshold }: { target: Omit<StockTarget, 'request'>; itemId: string; threshold: string }) {
  const { state, run, pending, errorFor, general } = useForm(inventoryThresholdAction);
  const values = state.values ?? { threshold };
  return (
    <section className="jy-card" aria-labelledby="t-threshold" data-stock-form="threshold">
      <h2 id="t-threshold" className="jy-card__title">
        آستانهٔ هشدار
      </h2>
      {general ? <Alert tone="error">{messageOf(general)}</Alert> : null}
      <form action={run}>
        <input type="hidden" name="gate" value={target.gate} />
        <input type="hidden" name="partner" value={target.partnerId} />
        <input type="hidden" name="item" value={itemId} />
        <div className="ad-form">
          <Field
            id="stock-threshold"
            name="threshold"
            label="آستانه (برگ)"
            optional
            value={values.threshold ?? ''}
            error={errorFor('threshold')}
            hint="کمتر از این، پیشخوان برای مالک، متصدی و همین چاپخانه هشدار می‌دهد. خالی یعنی بی آستانه."
            numeric
            maxLength={20}
            placeholder="1,000"
          />
        </div>
        <Submit pending={pending}>ذخیره</Submit>
      </form>
    </section>
  );
}
