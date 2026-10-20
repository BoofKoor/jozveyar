'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { partnerShareAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { AdminErrorCode } from '../lib/server/result';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

const CODE_ERRORS: readonly (AdminErrorCode | undefined)[] = ['wrong_code', 'code_used', 'share_code_required'];

/**
 * درصد سهم یک چاپخانه (برش ۱۰٫۳، سؤال ۳۹۱؛ فقط مالک): ۰ تا ۱۰۰ با تا دو رقم اعشار، با کد تازه. فقط سپردن‌های بعدی را عوض می‌کند: سهم
 * سفارش‌هایی که تا حالا سپرده شده‌اند همان است که بود.
 */
export function ShareForm({
  gate,
  id,
  name,
  seen,
  current,
  example,
  back,
  notice,
}: {
  gate: string;
  id: string;
  name: string;
  /** درصدی که صفحه نشان داد (`shareSeen`). */
  seen: string;
  /** درصد امروز برای مقدار اولیه: «65»، یا خالی. */
  current: string;
  /** «از سفارشی با جمع چاپ، کاغذ و صحافی 245,000 تومان: 159,250 تومان»، با درصد امروز؛ null بی درصد. */
  example: string | null;
  back: string;
  /** صفحه پس از درصدی که همین حالا عوض شد دوباره ساخته شد (`?e=partner_share_changed`). */
  notice: AdminErrorCode | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(partnerShareAction, {});
  const shareError = state.error === 'share_invalid' ? messageOf(state.error) : null;
  const codeError = CODE_ERRORS.includes(state.error) ? messageOf(state.error!) : null;
  const general = state.error && !shareError && !codeError ? state.error : null;
  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-share" data-share-form="">
      <h1 id="t-share" className="jy-card__title">
        درصد سهم {name}
      </h1>
      <p className="ad-lead">
        سهم چاپخانه از هر سفارش، از جمع چاپ، کاغذ و صحافی پیش از تخفیف؛ کرایهٔ پست در آن نیست. به تومان گرد می‌شود و هنگام سپردن سفارش به چاپخانه
        روی همان سفارش می‌ماند، پس درصد تازه فقط سفارش‌های بعدی را عوض می‌کند.
      </p>
      {example ? <p className="ad-meta">{example}</p> : null}
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : general ? (
        <Alert tone="error">{messageOf(general)}</Alert>
      ) : !state.error && notice ? (
        <Alert tone="warning">{messageOf(notice)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="share-percent">
              درصد سهم
            </label>
            <input
              id="share-percent"
              name="share"
              className="jy-input jy-input--ltr ad-short num"
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              maxLength={8}
              placeholder="65"
              required
              defaultValue={state.values?.share ?? current}
              aria-invalid={shareError ? true : undefined}
              aria-describedby={shareError ? 'share-percent-error share-percent-hint' : 'share-percent-hint'}
            />
            {shareError ? (
              <p id="share-percent-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {shareError}
              </p>
            ) : null}
            <p id="share-percent-hint" className="jy-hint">
              0 تا 100، با تا دو رقم اعشار؛ 0 یعنی سهمی ندارد، مثل چاپخانهٔ خود جزوه‌یار.
            </p>
          </div>
          <CodeField error={codeError} hint="عددی است که پول چاپخانه از آن درمی‌آید؛ کد تازه لازم است." />
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            ذخیرهٔ درصد
          </button>
          <Link href={back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
