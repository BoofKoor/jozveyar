'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { disableAdminAction, resetAdminAction, type LinkState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { LinkReady } from './LinkReady';

interface Props {
  kind: 'reset' | 'disable';
  gate: string;
  userId: string;
  title: string;
  lead: string;
  submit: string;
  back: string;
}

/** کار حساس روی ادمین دیگر، با کد تازهٔ برنامهٔ تأیید: «کد ورود تازه» (پیوند همین‌جا) یا «غیرفعال کن». */
export function AdminActionForm({ kind, gate, userId, title, lead, submit, back }: Props) {
  const [state, action, pending] = useActionState<LinkState, FormData>(
    kind === 'reset' ? resetAdminAction : disableAdminAction,
    {},
  );
  if (state.link) return <LinkReady link={state.link} back={back} />;
  const codeError = state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null;

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-action">
      <h1 id="t-action" className="jy-card__title">
        {title}
      </h1>
      <p className="ad-lead">{lead}</p>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error && !codeError ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="userId" value={userId} />
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
        <div className="ad-actions">
          <button
            type="submit"
            className={`jy-btn ${kind === 'disable' ? 'jy-btn--danger' : 'jy-btn--primary'}${pending ? ' is-loading' : ''}`}
            disabled={pending}
          >
            {submit}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
