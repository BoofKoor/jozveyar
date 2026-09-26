'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { inviteAdminAction, type LinkState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { LinkReady } from './LinkReady';

const FIELD_ERRORS: Record<string, 'displayName' | 'username' | 'role' | 'code'> = {
  invalid_display_name: 'displayName',
  invalid_username: 'username',
  username_taken: 'username',
  invalid_role: 'role',
  wrong_code: 'code',
  code_used: 'code',
};

/** «افزودن متصدی» (طرح پنل): نام، نام کاربری، نقش و کد تازه؛ بعد پیوند یک‌باره، همین‌جا. */
export function InviteAdminForm({ gate, back }: { gate: string; back: string }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(inviteAdminAction, {});
  if (state.link) return <LinkReady link={state.link} back={back} />;

  const at = state.error ? FIELD_ERRORS[state.error] : undefined;
  const errorOf = (field: string) => (at === field ? messageOf(state.error) : null);
  const role = state.values?.role === 'owner' ? 'owner' : 'operator';

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-inv">
      <h1 id="t-inv" className="jy-card__title">
        افزودن متصدی
      </h1>
      <p className="ad-lead">یک پیوند ثبت یک‌باره می‌سازی و برایش می‌فرستی؛ رمز و برنامهٔ تأیید را خودش می‌گذارد.</p>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error && !at ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <div className="ad-form">
          <Field
            id="v-name"
            label="نام"
            error={errorOf('displayName')}
            input={{ name: 'displayName', className: 'jy-input', maxLength: 100, defaultValue: state.values?.displayName }}
          />
          <Field
            id="v-user"
            label="نام کاربری"
            error={errorOf('username')}
            hint="حرف لاتین کوچک و رقم."
            input={{
              name: 'username',
              className: 'jy-input jy-input--ltr ad-short',
              autoCapitalize: 'none',
              spellCheck: false,
              maxLength: 32,
              defaultValue: state.values?.username,
            }}
          />
          <fieldset className="jy-field">
            <legend className="jy-label">نقش</legend>
            <div className="jy-tiles ad-roles">
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="role" value="operator" defaultChecked={role === 'operator'} />
                <span className="jy-tile__title">متصدی</span>
                <span className="jy-tile__note">سفارش‌ها، وضعیت، نشانی و دانلود</span>
              </label>
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="role" value="owner" defaultChecked={role === 'owner'} />
                <span className="jy-tile__title">مالک</span>
                <span className="jy-tile__note">همه‌چیز، با تعرفه، کلیدها و ادمین‌ها</span>
              </label>
            </div>
          </fieldset>
          <CodeField error={errorOf('code')} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            ساختن پیوند
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  input,
}: {
  id: string;
  label: string;
  error: string | null;
  hint?: string;
  input: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const described = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="jy-field">
      <label className="jy-label" htmlFor={id}>
        {label}
      </label>
      <input {...input} id={id} required aria-invalid={error ? true : undefined} aria-describedby={described || undefined} />
      {error ? (
        <p id={`${id}-error`} className="jy-error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="jy-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
