'use client';

import { useActionState } from 'react';

import { orderNoteAction, type NoteState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  orderNumber: number;
  /** شناسهٔ همین فرم، UUID تصادفی که صفحه با هر بار ساختن فرم می‌گذارد: دو کلیک یک یادداشت است. */
  request: string;
  /** بیشترین طول یادداشت (`NOTE_MAX`). */
  maxLength: number;
}

/**
 * یادداشت تازه (برش ۹٫۳، سؤال ۱۹۵): متن و تیک «چاپخانه هم ببیند»، بی کد تازه. خطای متن همین‌جا با متن و تیک نوشته‌شده می‌ماند؛ پس از
 * نوشتن، صفحه با فرم تازه و یادداشت در فهرست بالای همین فرم.
 */
export function NoteForm({ gate, orderNumber, request, maxLength }: Props) {
  const [state, action, pending] = useActionState<NoteState, FormData>(orderNoteAction, {});
  const error = state.error ? messageOf(state.error) : null;

  return (
    <form action={action} className="ad-note-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="request" value={request} />
      <div className="jy-field">
        <label className="jy-label" htmlFor="n-body">
          یادداشت تازه
        </label>
        <textarea
          id="n-body"
          name="body"
          className="jy-input"
          rows={3}
          maxLength={maxLength}
          required
          defaultValue={state.body}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'n-body-error n-body-hint' : 'n-body-hint'}
        />
        {error ? (
          <p id="n-body-error" className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        <p id="n-body-hint" className="jy-hint">
          پاک و ویرایش نمی‌شود؛ اشتباه را با یادداشت تازه درست کن. مشتری هرگز نمی‌بیند.
        </p>
      </div>
      <label className="ad-size__toggle">
        <input type="checkbox" className="ad-check" name="partnerVisible" value="1" defaultChecked={state.partnerVisible} />
        چاپخانه هم ببیند
      </label>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--secondary${pending ? ' is-loading' : ''}`} disabled={pending}>
          افزودن یادداشت
        </button>
      </div>
    </form>
  );
}
