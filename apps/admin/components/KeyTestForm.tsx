'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { testKeyAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/**
 * «آزمایش» مقدار امروز کلید API sms.ir (۷٫۱، سؤال ۱۳۸): یک دکمه در ردیف کلید، بی کد؛ اعتبار حساب، بی پیامک. از ۷٫۲ کد پذیرندهٔ زیبال هم:
 * یک درخواست پرداخت آزمایشی. نتیجه کنار همان کلید و در پیام بالای کارت (به صفحه با `done=key_test`).
 */
export function KeyTestButton({ gate, name }: { gate: string; name: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(testKeyAction, {});
  return (
    <form action={action} className="ad-inline-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <button type="submit" className={`jy-btn jy-btn--text${pending ? ' is-loading' : ''}`} disabled={pending} data-key-test={name}>
        آزمایش
      </button>
    </form>
  );
}

/**
 * «آزمایش» مقدار امروز یک شناسهٔ قالب (۷٫۱، سؤال ۱۳۸): یک پیامک آزمایشی با پارامترهای نمونه به موبایلی که همین‌جا وارد می‌شود، بی کد.
 * خطای موبایل همین‌جا با شمارهٔ نوشته‌شده؛ نتیجهٔ پیامک کنار همان کلید.
 */
export function TemplateTestForm({ gate, name, perHour, back }: { gate: string; name: string; perHour: number; back: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(testKeyAction, {});
  const error = state.error ? messageOf(state.error) : null;
  const id = `kx-${name}-tel`;
  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor={id}>
            موبایل برای پیامک آزمایشی
          </label>
          <input
            id={id}
            name="mobile"
            className="jy-input jy-input--ltr ad-short"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={40}
            defaultValue={state.values?.mobile ?? ''}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
          />
          {error ? (
            <p id={`${id}-error`} className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <p id={`${id}-hint`} className="jy-hint">
            شناسهٔ امروز با پارامترهای نمونه آزموده می‌شود: یک پیامک واقعی به همین شماره، به هزینهٔ یک پیامک؛ سقف{' '}
            <span className="num">{perHour}</span> آزمایش در ساعت.
          </p>
        </div>
      </div>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
          پیامک آزمایشی بفرست
        </button>
        <Link href={back} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
