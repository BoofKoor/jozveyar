'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { assignPartnerAction, type AssignState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/** یک چاپخانهٔ فعال برای جابه‌جایی: کاشی طرح، «تهران · پیش‌فرض · 8 سفارش باز». */
export interface AssignOption {
  id: string;
  name: string;
  cityName: string;
  isDefault: boolean;
  openOrders: number;
}

interface Props {
  gate: string;
  orderNumber: number;
  /** چاپخانه‌ای که ادمین دید؛ null یعنی سفارش چاپخانه نداشت. اگر همین حالا عوض شده، سرور کار را نمی‌کند. */
  from: { id: string; name: string; cityName: string } | null;
  options: AssignOption[];
  /** بیشترین طول دلیل (`REASON_MAX`). */
  maxLength: number;
  back: string;
}

/**
 * جابه‌جایی چاپخانهٔ سفارش (طرح پنل `m-order-assign`، برش ۵٫۲): در ستون کنار و به جای کارت چاپخانه؛ فقط در «در صف چاپ». چاپخانهٔ
 * تازه از میان چاپخانه‌های فعال (پیش‌فرض اول و انتخاب‌شده)، و دلیل که فقط در پنل دیده می‌شود. سفارشی که چاپخانه نداشت همین فرم
 * را دارد با عنوان «انتخاب چاپخانه» (در طرح نیست).
 */
export function AssignForm({ gate, orderNumber, from, options, maxLength, back }: Props) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignPartnerAction, {});
  const partnerError = state.error === 'partner_required' ? messageOf(state.error) : null;
  const reasonError = state.error === 'reason_required' || state.error === 'reason_too_long' ? messageOf(state.error) : null;
  const chosen = options.some((option) => option.id === state.to) ? state.to : options[0]?.id;

  return (
    <section className="jy-card" aria-labelledby="t-assign" data-assign="">
      <h2 id="t-assign" className="jy-card__title">
        {from ? 'جابه‌جایی چاپخانه' : 'انتخاب چاپخانه'}
      </h2>
      {from ? (
        <p className="ad-meta">
          امروز: <b>{from.name}</b>، {from.cityName}
        </p>
      ) : (
        <p className="ad-meta">این سفارش چاپخانه ندارد: هنگام پرداختش هیچ چاپخانهٔ فعالی نبود.</p>
      )}
      <p className="jy-note jy-note--info ad-gap">
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        <span>
          {from
            ? `فقط پیش از «شروع چاپ». از همین لحظه ${from.name} این سفارش را نمی‌بیند و چاپخانهٔ تازه آن را در صفش می‌بیند. کرایهٔ مشتری عوض نمی‌شود.`
            : 'فقط پیش از «شروع چاپ». چاپخانه‌ای که انتخاب کنی سفارش را در صفش می‌بیند. کرایهٔ مشتری عوض نمی‌شود.'}
        </span>
      </p>
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="number" value={orderNumber} />
        <input type="hidden" name="from" value={from?.id ?? ''} />
        <div className="ad-form">
          <fieldset
            className="jy-field"
            aria-invalid={partnerError ? true : undefined}
            aria-describedby={partnerError ? 'as-to-error' : undefined}
          >
            <legend className="jy-label">{from ? 'چاپخانهٔ تازه' : 'چاپخانه'}</legend>
            <div className="jy-tiles ad-roles">
              {options.map((option) => (
                <label key={option.id} className="jy-tile">
                  <input className="jy-radio" type="radio" name="to" value={option.id} defaultChecked={option.id === chosen} />
                  <span className="jy-tile__title">{option.name}</span>
                  <span className="jy-tile__note">
                    {option.cityName}
                    {option.isDefault ? ' · پیش‌فرض' : ''} · <span className="num">{option.openOrders}</span> سفارش باز
                  </span>
                </label>
              ))}
            </div>
            {partnerError ? (
              <p id="as-to-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {partnerError}
              </p>
            ) : null}
          </fieldset>
          <div className="jy-field">
            <label className="jy-label" htmlFor="as-why">
              دلیل
            </label>
            <textarea
              id="as-why"
              name="reason"
              className="jy-input"
              rows={3}
              maxLength={maxLength}
              required
              defaultValue={state.reason}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? 'as-why-error as-why-hint' : 'as-why-hint'}
            />
            {reasonError ? (
              <p id="as-why-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {reasonError}
              </p>
            ) : null}
            <p id="as-why-hint" className="jy-hint">
              در رویدادهای سفارش می‌ماند؛ مشتری نمی‌بیند.
            </p>
          </div>
        </div>
        <div className="ad-status__actions">
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--block${pending ? ' is-loading' : ''}`} disabled={pending}>
            {from ? 'جابه‌جا کن' : 'بسپار'}
          </button>
          <Link href={back} className="jy-btn jy-btn--text jy-btn--block">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
