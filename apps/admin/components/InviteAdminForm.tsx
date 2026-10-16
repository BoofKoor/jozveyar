'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { inviteAdminAction, type LinkState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { isRoleTile } from '../lib/roles';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { LinkReady } from './LinkReady';
import { ROLE_MESSAGES, RoleFields, type PartnerChoice } from './RoleFields';

const FIELD_ERRORS: Record<string, 'displayName' | 'username' | 'role' | 'partner' | 'code'> = {
  invalid_display_name: 'displayName',
  invalid_username: 'username',
  username_taken: 'username',
  invalid_role: 'role',
  partner_required: 'partner',
  partner_inactive: 'partner',
  wrong_code: 'code',
  code_used: 'code',
};

/**
 * «افزودن ادمین» (طرح پنل `m-admin-invite`): نام، نام کاربری، نقش (متصدی، از ۹٫۴ حسابدار، چاپخانه یا مالک) و کد تازه؛ بعد پیوند
 * یک‌باره، همین‌جا. «کدام چاپخانه» فقط با نقش «چاپخانه» (برش ۵٫۳، `RoleFields`).
 */
export function InviteAdminForm({
  gate,
  back,
  partners,
  partnersHref,
}: {
  gate: string;
  back: string;
  partners: readonly PartnerChoice[];
  /** زبانهٔ «چاپخانه‌ها»، وقتی هیچ چاپخانهٔ فعالی نیست. */
  partnersHref: string;
}) {
  const [state, action, pending] = useActionState<LinkState, FormData>(inviteAdminAction, {});
  if (state.link) return <LinkReady link={state.link} back={back} />;

  const at = state.error ? FIELD_ERRORS[state.error] : undefined;
  const errorOf = (field: string) => (at === field ? (ROLE_MESSAGES[state.error!] ?? messageOf(state.error)) : null);
  const picked = state.values?.role;
  const role = isRoleTile(picked) ? picked : 'operator';
  const partner = partners.find((p) => p.id === state.values?.partner)?.id ?? partners[0]?.id;

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-inv">
      <h1 id="t-inv" className="jy-card__title">
        افزودن ادمین
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
        <div className="ad-form ad-roles-form">
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
          <RoleFields
            role={role}
            partners={partners}
            partner={partner}
            roleError={errorOf('role')}
            partnerError={errorOf('partner')}
            partnersHref={partnersHref}
          />
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
