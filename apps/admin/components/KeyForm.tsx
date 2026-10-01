'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { keyAction, type KeyState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** نام کلید (`SMS_API_KEY`…). */
  name: string;
  /** «مقدار تازه» یا «برگرداندن به .env». */
  mode: 'set' | 'revert';
  /** نام فیلد مقدار: «کلید تازه»، «کد پذیرندهٔ تازه»… */
  field: string;
  /** «پیش از ذخیره با خود sms.ir آزموده می‌شود…»، یا «آزمایش کد پذیرنده … با راه افتادن درگاه می‌آید.» */
  test: string;
  /** کلید API sms.ir (۷٫۱): «آزمایش و ذخیره»، و پس از «در دسترس نیست» «بی آزمایش ذخیره کن». */
  tested: boolean;
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
 *
 * کلید API sms.ir (۷٫۱، ADR-049، سؤال ۱۳۸، طرح `m-key-edit` و `m-key-down`): «آزمایش و ذخیره»؛ «رد شد» با عدد پاسخ و بی ذخیره؛ «در
 * دسترس نیست» با «دوباره آزمایش و ذخیره» و «بی آزمایش ذخیره کن»، که رسید همان آزمایش را می‌فرستد و همان کلید را دوباره می‌خواهد.
 */
export function KeyForm({ gate, name, mode, field, test, tested, envMask, seen, back }: Props) {
  const [state, action, pending] = useActionState<KeyState, FormData>(keyAction, {});
  const codeError = state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null;
  const valueError = state.error === 'invalid_key_value' || state.error === 'invalid_api_key' ? messageOf(state.error) : null;
  const revert = mode === 'revert';
  const valueId = `k-${name}`;
  // «در دسترس نیست»: رسید همان آزمایش می‌ماند تا «بی آزمایش ذخیره کن»، حتی پس از کد اشتباه.
  const receipt = tested ? state.receipt : undefined;
  const down = state.error === 'key_unavailable' || Boolean(receipt);
  const special = state.error === 'key_unavailable' || state.error === 'key_rejected';

  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="seen" value={seen} />
      {revert ? <input type="hidden" name="intent" value="revert" /> : null}
      {receipt ? (
        <>
          <input type="hidden" name="tested" value={receipt.outcome} />
          <input type="hidden" name="testedAt" value={receipt.at} />
          <input type="hidden" name="receipt" value={receipt.mac} />
        </>
      ) : null}
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : down ? (
        <p className="jy-note jy-note--warning" role="alert" data-key-note="unavailable">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <b>در دسترس نیست:</b> {messageOf('key_unavailable')}
          </span>
        </p>
      ) : state.error === 'key_rejected' ? (
        <p className="jy-note jy-note--error" role="alert" data-key-note="rejected">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <b>رد شد:</b> sms.ir این کلید را نپذیرفت
            {typeof state.code === 'number' ? (
              <>
                {' '}
                (کد <span className="num">{state.code}</span>)
              </>
            ) : null}
            ، پس کلید تازه ذخیره نشد. کلید را از پنل sms.ir دوباره بردار و بیازما.
          </span>
        </p>
      ) : state.error && !codeError && !valueError && !special ? (
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
              {down ? (
                'کلید پس از هر پاسخ پاک می‌شود و به مرورگر برنمی‌گردد؛ دوباره واردش کن.'
              ) : (
                <>
                  {test} بعد از ذخیره فقط <span className="num">4</span> نویسهٔ آخرش دیده می‌شود.
                </>
              )}
            </p>
          </div>
        )}
        <CodeField error={codeError} />
      </div>
      <div className="ad-actions">
        {revert ? (
          <button type="submit" className={`jy-btn jy-btn--danger${pending ? ' is-loading' : ''}`} disabled={pending}>
            به <bdi className="ad-ltr">.env</bdi> برگردان
          </button>
        ) : (
          <>
            <button type="submit" name="intent" value="set" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
              {!tested ? 'ذخیره' : down ? 'دوباره آزمایش و ذخیره' : 'آزمایش و ذخیره'}
            </button>
            {receipt?.outcome === 'unavailable' ? (
              <button type="submit" name="intent" value="skip" className="jy-btn jy-btn--secondary" disabled={pending}>
                بی آزمایش ذخیره کن
              </button>
            ) : null}
          </>
        )}
        <Link href={back} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
