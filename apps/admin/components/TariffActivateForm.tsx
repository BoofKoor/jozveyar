'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { activateTariffAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  version: number;
  /** نسخهٔ فعالی که صفحه تغییرها را نسبت به آن نشان داد. */
  active: number;
  /** اثر انگشت همان نسخه که تغییرهایش دیده شد. */
  fingerprint: string;
  back: string;
}

/**
 * «فعال کن» تعرفه با کد تازهٔ برنامهٔ تأیید (طرح پنل `m-tariff-activate`، کار حساس، ADR-038). نسخهٔ فعال و اثر انگشتی
 * که صفحه نشان داد با فرم می‌روند، تا اگر در این میان چیزی عوض شد، سرور پیش از کد و دوباره زیر قفل ردش کند.
 */
export function TariffActivateForm({ gate, version, active, fingerprint, back }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(activateTariffAction, {});
  const codeError = state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null;

  return (
    <>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error && !codeError ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="active" value={active} />
        <input type="hidden" name="fingerprint" value={fingerprint} />
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            فعال کن
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
