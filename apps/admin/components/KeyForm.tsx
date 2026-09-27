'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { keyAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** نام کلید (`SMS_API_KEY`…). */
  name: string;
  /** «مقدار تازه» یا «برگرداندن به .env». */
  mode: 'set' | 'revert';
  /** نام فیلد مقدار: «کلید تازه»، «نام قالب»… */
  field: string;
  /** «آزمایش کلید با خود پنل پیامک واقعی می‌آید.» */
  test: string;
  /** برگرداندن: آنچه از این لحظه به کار می‌رود، «••••3f9a» از `.env`، یا null اگر `.env` این کلید را ندارد. */
  envMask: string | null;
  /** نسخه‌ای که صفحه نشان داد. */
  seen: string;
  back: string;
}

/**
 * تغییر یا برگرداندن یک کلید سرویس (طرح پنل `m-key-edit`، کار حساس با کد تازه، ADR-041). مقدار کلید فقط از مرورگر به سرور
 * می‌رود و هرگز برنمی‌گردد: فیلد رمزی و بی تکمیل خودکار، و پس از هر پاسخ سرور خالی (فرم از نو). نسخه‌ای که صفحه نشان داد
 * (`seen`) با فرم می‌رود، تا کلیدی که همین حالا جای دیگری عوض شد پیش از کد رد شود.
 */
export function KeyForm({ gate, name, mode, field, test, envMask, seen, back }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(keyAction, {});
  const codeError = state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null;
  const valueError = state.error === 'invalid_key_value' ? messageOf(state.error) : null;
  const revert = mode === 'revert';
  const valueId = `k-${name}`;

  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="seen" value={seen} />
      <input type="hidden" name="intent" value={mode} />
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : state.error && !codeError && !valueError ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <div className="ad-form">
        {revert ? (
          <p className="jy-note jy-note--warning">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            {envMask ? (
              <span>
                مقدار پنل پاک می‌شود و از این لحظه مقدار <bdi className="ad-ltr">.env</bdi> به کار می‌رود (
                <span className="ad-mask">{envMask}</span>). مقدار پنل دیگر برنمی‌گردد، مگر دوباره واردش کنی.
              </span>
            ) : (
              <span>
                مقدار پنل پاک می‌شود و <bdi className="ad-ltr">.env</bdi> این کلید را ندارد؛ پس از این، کلید خالی است.
              </span>
            )}
          </p>
        ) : (
          <div className="jy-field">
            <label className="jy-label" htmlFor={valueId}>
              {field}
            </label>
            <input
              id={valueId}
              name="value"
              className="jy-input jy-input--ltr"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={2000}
              aria-invalid={valueError ? true : undefined}
              aria-describedby={valueError ? `${valueId}-error ${valueId}-hint` : `${valueId}-hint`}
            />
            {valueError ? (
              <p id={`${valueId}-error`} className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {valueError}
              </p>
            ) : null}
            <p id={`${valueId}-hint`} className="jy-hint">
              بعد از ذخیره فقط <span className="num">4</span> نویسهٔ آخرش دیده می‌شود. {test}
            </p>
          </div>
        )}
        <CodeField error={codeError} />
      </div>
      <div className="ad-actions">
        <button
          type="submit"
          className={`jy-btn ${revert ? 'jy-btn--danger' : 'jy-btn--primary'}${pending ? ' is-loading' : ''}`}
          disabled={pending}
        >
          {revert ? (
            <>
              به <bdi className="ad-ltr">.env</bdi> برگردان
            </>
          ) : (
            'ذخیره'
          )}
        </button>
        <Link href={back} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
