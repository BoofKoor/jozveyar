'use client';

import { useActionState, useRef, useState } from 'react';

import { saveSettingAction, type SettingState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { NumberSettingKey } from '../lib/settings';

interface Props {
  gate: string;
  /** نام تنظیم در `settings`. */
  settingKey: NumberSettingKey;
  title: string;
  label: string;
  /** شناسهٔ یکتای کارت و فیلد. */
  id: string;
  /** همان که صفحه نشان داد؛ «همان که دیده شد». */
  value: number;
  /** بازهٔ قرارداد (`SETTING_SCHEMAS`)، از صفحه: این جزء مرورگری است و zod را با خودش نمی‌آورد. */
  min: number;
  max: number;
  /** شمارندهٔ − عدد + (روز کاری، طرح)، یا فیلد عدد (سقف کد). */
  stepper: boolean;
  /** پیام خطای مقدار، با بازه. */
  rangeError: string;
  hint: React.ReactNode;
  /**
   * درون کارتی که صفحه خودش می‌چیند (۷٫۱: «سقف کد پیامکی» با دو سقف و «اعتبار پیامک» با آستانه): بی کارت و بی تیتر، فقط فرم.
   */
  bare?: boolean;
}

/**
 * یک تنظیم عددی در کارت خودش (طرح پنل `m-settings`): روز کاری تحویل به پست و روزهای نگهداری فایل‌های سفارش با شمارنده، و سقف
 * ساعتی کد پیامکی با فیلد. خطای
 * مقدار همین‌جا با عدد نوشته‌شده؛ عددی که صفحه نشان داد با فرم می‌رود (`seen`)، تا اگر زبانه یا ادمین دیگری همین حالا
 * عوضش کرده باشد، رونویسی نشود.
 */
export function NumberSettingForm({ gate, settingKey, title, label, id, value, min, max, stepper, rangeError, hint, bare = false }: Props) {
  const [state, action, pending] = useActionState<SettingState, FormData>(saveSettingAction, {});
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(value);
  const error = state.error === 'invalid_setting' ? rangeError : state.error ? messageOf(state.error) : null;
  const fieldId = `s-${id}`;
  const describedBy = `${error ? `${fieldId}-error ` : ''}${fieldId}-hint`;
  const step = (by: 1 | -1) => {
    if (!input.current) return;
    if (by > 0) input.current.stepUp();
    else input.current.stepDown();
    setCurrent(Number(input.current.value));
  };

  const field = stepper ? (
    // − و + بسته هم فوکوس را نگه می‌دارند (aria-disabled، نه disabled)، مثل شمارندهٔ تعداد نسخهٔ سایت.
    <div className="jy-stepper" role="group" aria-labelledby={`${fieldId}-label`}>
      <button type="button" aria-label="یکی کمتر" aria-disabled={current <= min} onClick={() => current > min && step(-1)}>
        <span className="jy-icon jy-icon-minus" aria-hidden="true" />
      </button>
      <input
        ref={input}
        id={fieldId}
        name="value"
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        className="num"
        defaultValue={state.value ?? value}
        onInput={(event) => setCurrent(Number(event.currentTarget.value))}
        aria-labelledby={`${fieldId}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <button type="button" aria-label="یکی بیشتر" aria-disabled={current >= max} onClick={() => current < max && step(1)}>
        <span className="jy-icon jy-icon-plus" aria-hidden="true" />
      </button>
    </div>
  ) : (
    <input
      id={fieldId}
      name="value"
      className="jy-input jy-input--ltr ad-short"
      inputMode="numeric"
      autoComplete="off"
      required
      defaultValue={state.value ?? String(value)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    />
  );

  const form = (
    // سنجش با سرور و پیام خودش زیر فیلد، نه حباب مرورگر برای min و max
    <form action={action} noValidate data-setting={bare ? settingKey : undefined} aria-label={bare ? title : undefined}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="key" value={settingKey} />
        <input type="hidden" name="seen" value={value} />
        <div className="ad-form">
          <div className="jy-field">
            <label id={`${fieldId}-label`} className="jy-label" htmlFor={fieldId}>
              {label}
            </label>
            {field}
            {error ? (
              <p id={`${fieldId}-error`} className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <p id={`${fieldId}-hint`} className="jy-hint">
              {hint}
            </p>
          </div>
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--secondary${pending ? ' is-loading' : ''}`} disabled={pending}>
            ذخیره
          </button>
        </div>
      </form>
  );
  if (bare) return form;
  return (
    <section className="jy-card" aria-labelledby={`t-${id}`} data-setting={settingKey}>
      <h2 id={`t-${id}`} className="jy-card__title">
        {title}
      </h2>
      {form}
    </section>
  );
}
