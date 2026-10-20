'use client';

import { useActionState } from 'react';

import { supportReplyAction, type ReplyState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  threadId: number;
  /** شناسهٔ همین فرم، UUID تصادفی که صفحه با هر بار ساختن فرم می‌گذارد: دو کلیک یک پاسخ است. */
  request: string;
  /** بیشترین طول پاسخ (`SUPPORT_STAFF_MAX`). */
  maxLength: number;
  /** «پاسخ»، یا پس از پاسخی که همین حالا رفت «پاسخ دیگر» (طرح). */
  label: string;
  rows: number;
  /** راهنمای زیر فیلد: مشتری نام ادمین را نمی‌بیند، و پیامک پاسخ به کدام شماره می‌رود یا چرا نمی‌رود. */
  hint: React.ReactNode;
  primary: boolean;
}

/**
 * پاسخ پشتیبانی (برش ۱۲٫۱، سؤال‌های ۳۱۰ تا ۳۱۲): متن تا 2,000 نویسه، بی کد تازه. خطای متن همین‌جا با متن نوشته‌شده می‌ماند؛ پس از فرستادن،
 * گفت‌وگو با پاسخ در فهرست و فرم تازه.
 */
export function ReplyForm({ gate, threadId, request, maxLength, label, rows, hint, primary }: Props) {
  const [state, action, pending] = useActionState<ReplyState, FormData>(supportReplyAction, {});
  const error = state.error ? messageOf(state.error) : null;

  return (
    <form action={action} className="ad-form ad-reply" data-reply-form="">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="thread" value={threadId} />
      <input type="hidden" name="request" value={request} />
      <div className="jy-field">
        <label className="jy-label" htmlFor="s-reply">
          {label}
        </label>
        <textarea
          id="s-reply"
          name="body"
          className="jy-input ad-reply__text"
          rows={rows}
          maxLength={maxLength}
          required
          defaultValue={state.body}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 's-reply-error s-reply-hint' : 's-reply-hint'}
        />
        {error ? (
          <p id="s-reply-error" className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            {error}
          </p>
        ) : null}
        <p id="s-reply-hint" className="jy-hint">
          {hint}
        </p>
      </div>
      <div className="ad-actions">
        <button
          type="submit"
          className={`jy-btn ${primary ? 'jy-btn--primary' : 'jy-btn--secondary'}${pending ? ' is-loading' : ''}`}
          disabled={pending}
        >
          فرستادن پاسخ
        </button>
      </div>
    </form>
  );
}
