'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { raiseAudienceAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** مقصد: «پیش‌نمایش مالک» یا «همه». */
  to: 'preview' | 'everyone';
  /** مخاطبی که صفحه نشان داد، برای «همان که دیده شد». */
  seen: string;
  /** متن دکمه: «باز کن» یا «برگردان». */
  submit: string;
  back: string;
}

/**
 * پلهٔ بالای مخاطب مسیر خرید با کد تازهٔ برنامهٔ تأیید (برش ۷٫۵، طرح `st-live-open`، سؤال ۱۶۹)؛ همان الگوی «فعال کن» تعرفه. مخاطبی که
 * صفحه نشان داد با فرم می‌رود، تا اگر در این میان جای دیگری عوض شد، سرور پیش از کد و دوباره زیر قفل ردش کند.
 */
export function RaiseAudienceForm({ gate, to, seen, submit, back }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(raiseAudienceAction, {});
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
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {submit}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
