'use client';

import Link from 'next/link';
import { Fragment, useActionState } from 'react';

import { templateKeyAction, type TemplateKeyState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** `SMS_OTP_TEMPLATE`، `SMS_PAID_TEMPLATE` یا `SMS_TRACKING_TEMPLATE`. */
  name: string;
  /** شناسهٔ امروز (راز نیست)، برای پر بودن فیلد در «تغییر». */
  current: string | null;
  /** متن پیامک آزمایشی با پارامترهای نمونه، همان که باید روی گوشی برسد. */
  sample: string;
  /** سقف آزمایش در ساعت. */
  perHour: number;
  seen: string;
  back: string;
}

/**
 * شناسهٔ قالب تازه (۷٫۱، ADR-049، سؤال ۱۳۸، طرح `m-key-tpl`): اول «پیامک آزمایشی بفرست» با پارامترهای نمونه به موبایلی که همین‌جا
 * وارد می‌شود، بی کد؛ بعد، فقط برای همان شناسه، «ذخیره» با کد تازه. sms.ir جواب نداد: «دوباره بفرست» یا «بی آزمایش ذخیره کن»؛ رد شد:
 * ذخیره‌شدنی نیست. شناسه و موبایل پس از هر پاسخ می‌مانند (راز نیستند)؛ رسید آزمایش در فیلد پنهان، که سرور با HMAC می‌سنجد.
 */
export function TemplateKeyForm({ gate, name, current, sample, perHour, seen, back }: Props) {
  const [state, action, pending] = useActionState<TemplateKeyState, FormData>(templateKeyAction, {});
  const tested = state.tested;
  const receipt = tested?.receipt;
  const valueError = state.error === 'invalid_template_id' ? messageOf(state.error) : null;
  const mobileError = state.error === 'invalid_test_mobile' ? messageOf(state.error) : null;
  const codeError = state.error === 'wrong_code' || state.error === 'code_used' ? messageOf(state.error) : null;
  const valueId = `kt-${name}`;
  const mobileId = `kt-${name}-tel`;
  const loading = pending ? ' is-loading' : '';

  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="seen" value={seen} />
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
      ) : state.error && !valueError && !mobileError && !codeError ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor={valueId}>
            شناسهٔ قالب
          </label>
          <input
            id={valueId}
            name="value"
            className="jy-input jy-input--ltr ad-short"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={40}
            defaultValue={state.values?.value ?? current ?? ''}
            aria-invalid={valueError ? true : undefined}
            aria-describedby={valueError ? `${valueId}-error` : undefined}
          />
          {valueError ? (
            <p id={`${valueId}-error`} className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {valueError}
            </p>
          ) : null}
        </div>
        <div className="jy-field">
          <label className="jy-label" htmlFor={mobileId}>
            موبایل برای پیامک آزمایشی
          </label>
          <input
            id={mobileId}
            name="mobile"
            className="jy-input jy-input--ltr ad-short"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            defaultValue={state.values?.mobile ?? ''}
            aria-invalid={mobileError ? true : undefined}
            aria-describedby={mobileError ? `${mobileId}-error ${mobileId}-hint` : `${mobileId}-hint`}
          />
          {mobileError ? (
            <p id={`${mobileId}-error`} className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {mobileError}
            </p>
          ) : null}
          <p id={`${mobileId}-hint`} className="jy-hint">
            یک پیامک واقعی با پارامترهای نمونه به همین شماره می‌رود، به هزینهٔ یک پیامک؛ سقف <span className="num">{perHour}</span> آزمایش در
            ساعت.
          </p>
        </div>
      </div>
      {tested?.outcome === 'ok' ? (
        <p className="jy-note jy-note--success ad-gap" role="status" data-key-note="sent">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          <span>
            <b>پیامک آزمایشی رفت</b> (sms.ir پذیرفت){tested.mobile ? <> به <span className="num">{tested.mobile}</span></> : null}. روی گوشی ببین
            همین رسیده: «
            {sample.split('\n').map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
            ». اگر فرق داشت، قالب را در sms.ir درست کن، نه اینجا.
          </span>
        </p>
      ) : tested?.outcome === 'unavailable' ? (
        <p className="jy-note jy-note--warning ad-gap" role="alert" data-key-note="unavailable">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            <b>در دسترس نیست:</b> sms.ir جواب نداد و پیامک آزمایشی نرفت. کمی بعد دوباره بفرست، یا بی آزمایش ذخیره کن و بعد با «آزمایش» بسنجش.
          </span>
        </p>
      ) : tested?.outcome === 'rejected' ? (
        <p className="jy-note jy-note--error ad-gap" role="alert" data-key-note="rejected">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <b>رد شد:</b> sms.ir پیامک آزمایشی را نپذیرفت
            {tested.code !== null ? (
              <>
                {' '}
                (کد <span className="num">{tested.code}</span>)
              </>
            ) : null}
            ، پس این شناسه ذخیره‌شدنی نیست. شناسه و تأیید قالب را در پنل sms.ir ببین.
          </span>
        </p>
      ) : tested?.outcome === 'unconfigured' ? (
        <p className="jy-note jy-note--error ad-gap" role="alert" data-key-note="unconfigured">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>کلید API sms.ir خالی است یا خوانده نشد، پس پیامک آزمایشی نرفت. اول کلید API را وارد کن و بیازما.</span>
        </p>
      ) : null}
      {receipt ? (
        <div className="ad-form">
          <CodeField error={codeError} />
        </div>
      ) : null}
      <div className="ad-actions">
        {receipt?.outcome === 'ok' ? (
          <>
            <button type="submit" name="intent" value="save" className={`jy-btn jy-btn--primary${loading}`} disabled={pending}>
              ذخیره
            </button>
            <button type="submit" name="intent" value="test" className="jy-btn jy-btn--secondary" disabled={pending} formNoValidate>
              دوباره بفرست
            </button>
          </>
        ) : receipt?.outcome === 'unavailable' ? (
          <>
            <button type="submit" name="intent" value="test" className={`jy-btn jy-btn--primary${loading}`} disabled={pending} formNoValidate>
              دوباره بفرست
            </button>
            <button type="submit" name="intent" value="save" className="jy-btn jy-btn--secondary" disabled={pending}>
              بی آزمایش ذخیره کن
            </button>
          </>
        ) : (
          <button type="submit" name="intent" value="test" className={`jy-btn jy-btn--primary${loading}`} disabled={pending}>
            {tested ? 'دوباره بفرست' : 'پیامک آزمایشی بفرست'}
          </button>
        )}
        <Link href={back} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
