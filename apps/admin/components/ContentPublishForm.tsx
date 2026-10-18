'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { publishContentAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  kind: string;
  /** `draft`، `default` یا شمارهٔ نسخه‌ای که برمی‌گردد. */
  from: string;
  /** نسخهٔ روی سایت و اثر انگشت متنی که «چه عوض می‌شود»ش را صفحه نشان داد. */
  live: number;
  seen: string;
  label: string;
  back: string;
  backLabel: string;
}

/**
 * «منتشر کن» یا «برگردان» یک متن سایت با کد تازهٔ برنامهٔ تأیید (۱۱٫۱، سؤال ۲۸۷؛ مثل `TicketTemplateActivateForm`). نسخهٔ روی سایت و اثر
 * انگشت متنی که صفحه نشان داد با فرم می‌روند، تا اگر در این میان چیزی عوض شد، سرور پیش از کد و دوباره زیر قفل ردش کند؛ آن خطاها صفحه را
 * با «چه عوض می‌شود» تازه از نو باز می‌کنند (`publishContentAction`).
 */
export function ContentPublishForm({ gate, kind, from, live, seen, label, back, backLabel }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(publishContentAction, {});
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
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="live" value={live} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <CodeField error={codeError} hint="متنی که روی سایت به نام جزوه‌یار با مشتری حرف می‌زند، کد تازه می‌خواهد." />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {label}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            {backLabel}
          </Link>
        </div>
      </form>
    </>
  );
}
