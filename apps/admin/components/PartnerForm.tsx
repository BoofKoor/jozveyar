'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { savePartnerAction, type PartnerState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';

interface Props {
  gate: string;
  back: string;
  /** شناسهٔ `datalist` شهرها، که صفحه یک بار می‌سازد. */
  citiesList: string;
  /** ویرایش: چاپخانه با نام، شهر و موبایل اعلانی که مالک دید؛ نبودنش یعنی افزودن. */
  partner?: { id: string; name: string; cityId: number; cityLabel: string; notifyMobile: string | null };
  /** شناسهٔ قالب پیامک چاپخانه گذاشته نشده و sms.ir در کار است (برش ۷٫۶، سؤال ۱۷۵): هشدار زیر فیلد موبایل. */
  templateMissing?: boolean;
  /** «تنظیمات و کلیدها»، برای پیوند هشدار. */
  keysHref?: string;
}

/**
 * افزودن و ویرایش چاپخانه (طرح پنل `m-partner-edit`، برش ۵٫۲): نام و شهر، و از ۷٫۶ موبایل اعلان (اختیاری). شهر با جست‌وجو در همان
 * فهرست شهرهای سایت (`datalist`، بی JS هم کار می‌کند)؛ سرور متن را به یک شهر برمی‌گرداند و اگر نشد، پیشنهادهایش را. خطای هر فیلد زیر
 * همان فیلد، با نوشته‌ها. شناسهٔ قالبی که هنوز گذاشته نشده زیر موبایل هشدار می‌گیرد (سؤال ۱۷۵): پیامک‌ها «نرفت» می‌مانند تا گذاشته شود.
 */
export function PartnerForm({ gate, back, citiesList, partner, templateMissing = false, keysHref }: Props) {
  const [state, action, pending] = useActionState<PartnerState, FormData>(savePartnerAction, {});
  const nameError = state.field === 'name' ? messageOf(state.error) : null;
  const cityError = state.field === 'city' ? messageOf(state.error) : null;
  const mobileError = state.field === 'mobile' ? messageOf(state.error) : null;
  const other = state.error && !state.field ? messageOf(state.error) : null;

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-pedit">
      <h1 id="t-pedit" className="jy-card__title">
        {partner ? 'ویرایش چاپخانه' : 'افزودن چاپخانه'}
      </h1>
      <p className="ad-lead">چاپخانه به‌تنهایی به کسی دسترسی نمی‌دهد؛ کاربرش را بعد از «ادمین‌ها» می‌سازی.</p>
      {other ? <Alert tone="error">{other}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        {partner ? (
          <>
            <input type="hidden" name="id" value={partner.id} />
            <input type="hidden" name="seenName" value={partner.name} />
            <input type="hidden" name="seenCity" value={partner.cityId} />
            <input type="hidden" name="seenMobile" value={partner.notifyMobile ?? ''} />
          </>
        ) : null}
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="p-name">
              نام
            </label>
            <input
              id="p-name"
              name="name"
              className="jy-input"
              maxLength={100}
              required
              defaultValue={state.values?.name ?? partner?.name}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'p-name-error' : undefined}
            />
            {nameError ? (
              <p id="p-name-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {nameError}
              </p>
            ) : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="p-city">
              شهر
            </label>
            <div className="ad-search ad-select">
              <span className="jy-icon jy-icon-search" aria-hidden="true" />
              <input
                id="p-city"
                name="city"
                className="jy-input"
                list={citiesList}
                autoComplete="off"
                required
                defaultValue={state.values?.city ?? partner?.cityLabel}
                aria-invalid={cityError ? true : undefined}
                aria-describedby={cityError ? 'p-city-error p-city-hint' : 'p-city-hint'}
              />
            </div>
            {cityError ? (
              <p id="p-city-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                <span>
                  {cityError}
                  {state.suggestions?.length ? ` پیشنهادها: ${state.suggestions.join(' · ')}.` : ''}
                </span>
              </p>
            ) : null}
            <p id="p-city-hint" className="jy-hint">
              همان فهرست شهرهای سایت. سفارش‌های همین شهر، و بعد همین استان، به این چاپخانه می‌روند.
            </p>
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="p-mobile">
              موبایل اعلان <span className="jy-optional">(اختیاری)</span>
            </label>
            <input
              id="p-mobile"
              name="mobile"
              className="jy-input jy-input--ltr ad-short"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              defaultValue={state.values?.mobile ?? partner?.notifyMobile ?? ''}
              aria-invalid={mobileError ? true : undefined}
              aria-describedby={mobileError ? 'p-mobile-error p-mobile-hint' : 'p-mobile-hint'}
            />
            {mobileError ? (
              <p id="p-mobile-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {mobileError}
              </p>
            ) : null}
            <p id="p-mobile-hint" className="jy-hint">
              برای هر سفارش تازه‌ای که به این چاپخانه برسد، هنگام پرداخت یا جابه‌جایی، یک پیامک: «جزوه‌یار: سفارش تازه{' '}
              <span className="num">10027</span>؛ تحویل به پست تا دوشنبه <span className="num">13</span> مهر». خالی یعنی بی پیامک. نشانی پنل در
              پیامک نمی‌آید.
            </p>
            {templateMissing ? (
              <p className="jy-note jy-note--warning ad-gap" data-partner-template="missing">
                <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                <span>
                  شناسهٔ قالب پیامک چاپخانه در{' '}
                  {keysHref ? (
                    <Link href={keysHref} className="jy-link">
                      «تنظیمات و کلیدها»
                    </Link>
                  ) : (
                    '«تنظیمات و کلیدها»'
                  )}{' '}
                  هنوز گذاشته نشده؛ تا گذاشته نشود، این پیامک‌ها نمی‌روند. پس از گذاشتنش، هر پیامکی که نرفت را از کارت «چاپخانه» همان سفارش
                  دوباره بفرست.
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {partner ? 'ذخیره' : 'افزودن'}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
