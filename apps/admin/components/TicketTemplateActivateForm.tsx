'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { activateTemplateAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** شناسهٔ نسخه، یا `default-<نوع>` برای برگشت به قالب پیش‌فرض. */
  id: string;
  /** نسخهٔ فعالی که صفحه نشان داد؛ خالی یعنی قالب پیش‌فرض. */
  active: number | null;
  /** متن و زمان پیش‌نمایشی که صفحه نشان داد (`activationSeen`). */
  seen: string;
  back: string;
  label: string;
}

/**
 * «فعال کن» قالب برگه با کد تازهٔ برنامهٔ تأیید (۹٫۲، کار حساس، ADR-038؛ مثل `TariffActivateForm`). نسخهٔ فعال و پیش‌نمایشی که صفحه نشان
 * داد با فرم می‌روند، تا اگر در این میان چیزی عوض شد، سرور پیش از کد و دوباره زیر قفل ردش کند.
 */
export function TicketTemplateActivateForm({ gate, id, active, seen, back, label }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(activateTemplateAction, {});
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
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={active ?? ''} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {label}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
