'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { inviteAdminAction, type LinkState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { LinkReady } from './LinkReady';

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

/** همان کد خطای جابه‌جایی (`partner_required`)، ولی اینجا چاپخانهٔ خود کاربر است، نه «چاپخانهٔ تازه». */
const MESSAGES: Record<string, string> = { partner_required: 'چاپخانهٔ این کاربر را انتخاب کن.' };

/** چاپخانهٔ فعالی که کاربر چاپخانهٔ تازه به آن سپرده می‌شود. */
export interface PartnerChoice {
  id: string;
  name: string;
  cityName: string;
  isDefault: boolean;
}

/**
 * «افزودن ادمین» (طرح پنل `m-admin-invite`): نام، نام کاربری، نقش (متصدی، چاپخانه یا مالک) و کد تازه؛ بعد پیوند یک‌باره، همین‌جا.
 * «کدام چاپخانه» فقط با نقش «چاپخانه» دیده می‌شود (`:has()`، بی JS)؛ سرور هم فقط برای همان نقش می‌خواندش (برش ۵٫۳).
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
  const errorOf = (field: string) => (at === field ? (MESSAGES[state.error!] ?? messageOf(state.error)) : null);
  const role = state.values?.role === 'owner' || state.values?.role === 'print_partner' ? state.values.role : 'operator';
  const partner = partners.find((p) => p.id === state.values?.partner)?.id ?? partners[0]?.id;
  const partnerError = errorOf('partner');

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
          <fieldset className="jy-field">
            <legend className="jy-label">نقش</legend>
            <div className="jy-tiles ad-roles">
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="role" value="operator" defaultChecked={role === 'operator'} />
                <span className="jy-tile__title">متصدی</span>
                <span className="jy-tile__note">همهٔ سفارش‌ها، وضعیت، لغو، نشانی، جابه‌جایی چاپخانه و دانلود</span>
              </label>
              <label className="jy-tile">
                <input
                  className="jy-radio ad-role-partner"
                  type="radio"
                  name="role"
                  value="print_partner"
                  defaultChecked={role === 'print_partner'}
                />
                <span className="jy-tile__title">چاپخانه</span>
                <span className="jy-tile__note">فقط سفارش‌های یک چاپخانه: دانلود، شروع چاپ و تحویل پست؛ بی مبلغ</span>
              </label>
              <label className="jy-tile">
                <input className="jy-radio" type="radio" name="role" value="owner" defaultChecked={role === 'owner'} />
                <span className="jy-tile__title">مالک</span>
                <span className="jy-tile__note">همه‌چیز، با تعرفه، کلیدها، چاپخانه‌ها و ادمین‌ها</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="jy-field ad-if-partner" aria-describedby={partnerError ? 'v-partner-error' : undefined}>
            <legend className="jy-label">کدام چاپخانه</legend>
            {partners.length > 0 ? (
              <div className="jy-tiles ad-roles">
                {partners.map((p) => (
                  <label key={p.id} className="jy-tile">
                    <input className="jy-radio" type="radio" name="partner" value={p.id} defaultChecked={p.id === partner} />
                    <span className="jy-tile__title">{p.name}</span>
                    <span className="jy-tile__note">{p.isDefault ? `${p.cityName} · پیش‌فرض` : p.cityName}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="jy-note">
                هیچ چاپخانهٔ فعالی نیست؛ اول از{' '}
                <Link className="jy-link" href={partnersHref}>
                  «چاپخانه‌ها»
                </Link>{' '}
                یکی بیفزا یا فعال کن.
              </p>
            )}
            {partnerError ? (
              <p id="v-partner-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {partnerError}
              </p>
            ) : null}
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
