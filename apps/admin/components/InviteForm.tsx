'use client';

import { useActionState } from 'react';

import { completeInviteAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';

interface Props {
  gate: string;
  token: string;
  displayName: string;
  username: string;
  lead: string;
  /** پایان پیوند، «11:35». */
  until: string;
  /** رمز برنامهٔ تأیید در گروه‌های چهارتایی، برای وارد کردن دستی. */
  secret: string;
  qr: React.ReactNode;
}

const PASSWORD_ERRORS = new Set(['password_too_short', 'password_too_long', 'password_mismatch', 'password_is_username']);

/** ثبت با پیوند یک‌باره: رمز، و برنامهٔ تأیید گوشی با QR و کلید دستی (طرح پنل). */
export function InviteForm({ gate, token, displayName, username, lead, until, secret, qr }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeInviteAction, {});
  const passwordError = state.error && PASSWORD_ERRORS.has(state.error) ? messageOf(state.error) : null;
  const codeError = state.error === 'wrong_code' ? messageOf(state.error) : null;
  const otherError = state.error && !passwordError && !codeError ? messageOf(state.error) : null;

  return (
    <section className="jy-card" aria-labelledby="t-invite">
      <h1 id="t-invite" className="jy-card__title">
        خوش آمدی، {displayName}
      </h1>
      <p className="ad-lead">{lead}</p>
      <Alert tone="info">
        این پیوند فقط یک بار و تا ساعت <span className="num">{until}</span> کار می‌کند.
      </Alert>
      {otherError ? <Alert tone="error">{otherError}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="token" value={token} />
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="i-user">
              نام کاربری
            </label>
            <input id="i-user" className="jy-input jy-input--ltr" value={username} autoComplete="username" readOnly />
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="i-pass">
              رمز
            </label>
            <input
              id="i-pass"
              name="password"
              type="password"
              className="jy-input jy-input--ltr"
              autoComplete="new-password"
              required
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? 'i-pass-error i-pass-hint' : 'i-pass-hint'}
            />
            {passwordError ? (
              <p id="i-pass-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {passwordError}
              </p>
            ) : null}
            <p id="i-pass-hint" className="jy-hint">
              دست‌کم <span className="num">12</span> نویسه؛ یک جملهٔ کوتاه که فقط خودت می‌دانی خوب است.
            </p>
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="i-pass2">
              تکرار رمز
            </label>
            <input id="i-pass2" name="confirm" type="password" className="jy-input jy-input--ltr" autoComplete="new-password" required />
          </div>
        </div>
        <div className="ad-step">
          <p className="ad-step__title">برنامهٔ تأیید</p>
          <p className="ad-hint">
            در برنامهٔ تأیید گوشی (مثل <bdi>Google Authenticator</bdi> یا <bdi>Microsoft Authenticator</bdi>) «افزودن حساب» را
            بزن و این را اسکن کن.
          </p>
          <div className="ad-qr">
            {qr}
            <p className="ad-qr__manual">
              نمی‌توانی اسکن کنی؟ این کلید را دستی وارد کن:<span className="ad-qr__key">{secret}</span>
            </p>
          </div>
          <div className="ad-form">
            <div className="jy-field">
              <label className="jy-label" htmlFor="i-code">
                کدی که برنامه نشان می‌دهد
              </label>
              <input
                id="i-code"
                name="code"
                className="jy-input jy-input--code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? 'i-code-error' : undefined}
              />
              {codeError ? (
                <p id="i-code-error" className="jy-error">
                  <span className="jy-icon jy-icon-error" aria-hidden="true" />
                  {codeError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ad-actions">
          <button
            type="submit"
            className={`jy-btn jy-btn--primary jy-btn--lg jy-btn--block${pending ? ' is-loading' : ''}`}
            disabled={pending}
          >
            فعال کن و وارد شو
            {pending ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
          </button>
        </div>
      </form>
    </section>
  );
}
