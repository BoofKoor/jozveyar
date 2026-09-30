'use client';

import { useActionState } from 'react';

import { formatNumber } from '@jozveyar/text';

import { saveOtpLimitsAction, type OtpLimitsState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  /** همان که صفحه نشان داد؛ «همان که دیده شد». */
  hour: number;
  day: number;
  /** بازهٔ قرارداد هر کدام (`SETTING_SCHEMAS`)، از صفحه؛ پیام خطا با آن. */
  hourError: string;
  dayError: string;
  /** شمار کد ساعت و ۲۴ ساعت گذشته، بالای فیلدها. */
  usage: React.ReactNode;
  hint: React.ReactNode;
}

/**
 * کارت «سقف کد پیامکی» (۷٫۱، طرح `m-settings`، سؤال ۱۳۳): سقف ساعتی و ۲۴ ساعتهٔ کل سایت با یک «ذخیره»، و شمار واقعی بالایشان تا سقف
 * معنا داشته باشد. خطای هر فیلد زیر خودش با عدد نوشته‌شده؛ عددهایی که صفحه نشان داد با فرم می‌روند.
 */
export function OtpLimitsForm({ gate, hour, day, hourError, dayError, usage, hint }: Props) {
  const [state, action, pending] = useActionState<OtpLimitsState, FormData>(saveOtpLimitsAction, {});
  const bad = (name: 'hour' | 'day') => state.error === 'invalid_setting' && (state.invalid ?? []).includes(name);
  const general = state.error && state.error !== 'invalid_setting' ? messageOf(state.error) : null;

  return (
    <section id="otp" className="jy-card" aria-labelledby="t-otp" data-setting="otp.site_limits">
      <h2 id="t-otp" className="jy-card__title">
        سقف کد پیامکی
      </h2>
      <p className="ad-usage" data-otp-usage="">
        {usage}
      </p>
      <form action={action} noValidate>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="seenHour" value={hour} />
        <input type="hidden" name="seenDay" value={day} />
        {general ? (
          <p className="jy-note jy-note--error ad-gap" role="alert">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            <span>{general}</span>
          </p>
        ) : null}
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="s-otp">
              کد در ساعت، برای کل سایت
            </label>
            <input
              id="s-otp"
              name="hour"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              required
              defaultValue={state.values?.hour ?? formatNumber(hour)}
              aria-invalid={bad('hour') ? true : undefined}
              aria-describedby={bad('hour') ? 's-otp-error' : undefined}
            />
            {bad('hour') ? (
              <p id="s-otp-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {hourError}
              </p>
            ) : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="s-otp-day">
              کد در <span className="num">24</span> ساعت، برای کل سایت
            </label>
            <input
              id="s-otp-day"
              name="day"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              required
              defaultValue={state.values?.day ?? formatNumber(day)}
              aria-invalid={bad('day') ? true : undefined}
              aria-describedby={bad('day') ? 's-otp-day-error s-otp-hint' : 's-otp-hint'}
            />
            {bad('day') ? (
              <p id="s-otp-day-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {dayError}
              </p>
            ) : null}
            <p id="s-otp-hint" className="jy-hint">
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
    </section>
  );
}
