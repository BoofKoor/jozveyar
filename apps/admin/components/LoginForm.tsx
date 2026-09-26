'use client';

import { useActionState } from 'react';

import { loginAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';

/**
 * ورود: یک فرم، سه فیلد؛ خطا یکی است و نمی‌گوید کدام فیلد اشتباه بود (طرح پنل). حساب قفل: هشدار با
 * ساعت پایان، و دکمهٔ بسته‌ای که همان را می‌گوید.
 */
export function LoginForm({ gate }: { gate: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const locked = state.error === 'account_locked';
  return (
    <section className="jy-card" aria-labelledby="t-login">
      <h1 id="t-login" className="jy-card__title">
        ورود به پنل
      </h1>
      {locked ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="l-user">
              نام کاربری
            </label>
            <input
              id="l-user"
              name="username"
              className="jy-input jy-input--ltr"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              defaultValue={state.values?.username}
            />
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="l-pass">
              رمز
            </label>
            <input id="l-pass" name="password" type="password" className="jy-input jy-input--ltr" autoComplete="current-password" required />
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="l-code">
              کد برنامهٔ تأیید
            </label>
            <input
              id="l-code"
              name="code"
              className="jy-input jy-input--code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              aria-describedby="l-code-hint"
            />
            <p id="l-code-hint" className="jy-hint">
              کد <span className="num">6</span> رقمی برنامهٔ تأیید گوشی؛ هر <span className="num">30</span> ثانیه عوض می‌شود.
            </p>
          </div>
        </div>
        <div className="ad-actions">
          {locked ? (
            <button type="button" className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block is-status" aria-disabled="true">
              <span>
                ورود تا <span className="num">{state.until}</span> بسته است
              </span>
            </button>
          ) : (
            <button
              type="submit"
              className={`jy-btn jy-btn--primary jy-btn--lg jy-btn--block${pending ? ' is-loading' : ''}`}
              disabled={pending}
            >
              ورود
              {pending ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
