'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { brandLogoAction, publishLogoAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** `publish`: همین بارگذاری روی سایت؛ `brand`: برگشت به لوگوی جزوه‌یار. */
  mode: 'publish' | 'brand';
  /** شمارهٔ بارگذاری، فقط با `publish`. */
  id?: number;
  /** «همان که دیده شد» لوگوی امروز (`logoSeen`). */
  seen: string;
  /** «انصراف»، اگر فرم صفحهٔ خودش است. */
  back?: string;
  label: string;
}

/**
 * «روی سایت بگذار» لوگو و «برگشت به لوگوی جزوه‌یار» با کد تازهٔ برنامهٔ تأیید (۱۱٫۲، کار حساس، ADR-038؛ مثل `TicketTemplateActivateForm`). لوگویی
 * که صفحه نشان داد با فرم می‌رود، تا اگر در این میان جای دیگری عوض شد، سرور پیش از کد و دوباره زیر قفل ردش کند.
 */
export function LogoPublishForm({ gate, mode, id, seen, back, label }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === 'publish' ? publishLogoAction : brandLogoAction, {});
  const codeError =
    state.error === 'wrong_code' || state.error === 'code_used' || state.error === 'logo_code_required' ? messageOf(state.error) : null;

  return (
    <>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error && !codeError ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action} data-logo-form={mode}>
        <input type="hidden" name="gate" value={gate} />
        {id === undefined ? null : <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {label}
          </button>
          {back ? (
            <Link href={back} className="jy-btn jy-btn--text">
              انصراف
            </Link>
          ) : null}
        </div>
      </form>
    </>
  );
}
