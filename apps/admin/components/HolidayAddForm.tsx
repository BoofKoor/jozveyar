'use client';

import { useActionState } from 'react';

import { addHolidayAction, type HolidayState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/** پیام هر خطای فیلد؛ «تا پایان N» با سال از صفحه. */
function fieldMessage(code: string | undefined, maxYear: number): string | null {
  switch (code) {
    case undefined:
      return null;
    case 'holiday_date_format':
      return 'تاریخ را به شکل 1406/03/25 بنویس.';
    case 'holiday_date_invalid':
      return 'این روز در تقویم نیست.';
    case 'holiday_past':
      return 'فقط روزهای بعد از امروز؛ امروز و گذشته روی مهلت هیچ سفارشی اثر ندارند.';
    case 'holiday_too_far':
      return `فقط تا پایان ${maxYear}؛ تعطیلی‌های سال بعدش را با آمدن ${maxYear} وارد کن.`;
    case 'holiday_title':
      return 'مناسبت را بنویس (حداکثر 100 نویسه).';
    default:
      return messageOf(code);
  }
}

/**
 * افزودن تعطیلی (طرح پنل `m-settings`، `.ad-addday`): تاریخ شمسی با ارقام فارسی یا لاتین، و مناسبت. خطای هر فیلد زیر خودش
 * با نوشته‌ها؛ روزی که همین حالا در فهرست است با مناسبتش.
 */
export function HolidayAddForm({ gate, maxYear }: { gate: string; maxYear: number }) {
  const [state, action, pending] = useActionState<HolidayState, FormData>(addHolidayAction, {});
  const dateError = state.exists
    ? `${state.exists.date} همین حالا در فهرست است: ${state.exists.title}.`
    : fieldMessage(state.errors?.date, maxYear);
  const titleError = fieldMessage(state.errors?.title, maxYear);
  const other = state.error && !dateError && !titleError ? messageOf(state.error) : null;

  // سنجش با سرور و پیام خودش زیر فیلد، نه حباب مرورگر.
  return (
    <form action={action} aria-label="افزودن تعطیلی" noValidate>
      <input type="hidden" name="gate" value={gate} />
      {other ? <p className="jy-error ad-gap">{other}</p> : null}
      <div className="ad-addday">
        <div className="jy-field">
          <label className="jy-label" htmlFor="s-hd">
            تاریخ
          </label>
          <input
            id="s-hd"
            name="date"
            className="jy-input jy-input--ltr"
            placeholder="1406/03/25"
            inputMode="numeric"
            autoComplete="off"
            required
            defaultValue={state.values?.date}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? 's-hd-error' : undefined}
          />
          {dateError ? (
            <p id="s-hd-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {dateError}
            </p>
          ) : null}
        </div>
        <div className="jy-field">
          <label className="jy-label" htmlFor="s-ht">
            مناسبت
          </label>
          <input
            id="s-ht"
            name="title"
            className="jy-input"
            autoComplete="off"
            required
            maxLength={200}
            defaultValue={state.values?.title}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 's-ht-error' : undefined}
          />
          {titleError ? (
            <p id="s-ht-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {titleError}
            </p>
          ) : null}
        </div>
        <button type="submit" className={`jy-btn jy-btn--secondary${pending ? ' is-loading' : ''}`} disabled={pending}>
          <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          افزودن
        </button>
      </div>
    </form>
  );
}
