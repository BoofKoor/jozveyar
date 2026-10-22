'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { formatJalaliWeekday, parseJalaliNumeric } from '@jozveyar/text';

import { publishPageAction, type PageFormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** «tarefe» یا شمارهٔ صفحه. */
  page: string;
  /** `draft`، `default` یا شمارهٔ نسخه‌ای که برمی‌گردد. */
  from: string;
  /** آخرین شمارهٔ نسخه و اثر انگشت متنی که «چه عوض می‌شود»ش را صفحه نشان داد. */
  version: number;
  seen: string;
  /** «منتشر کن» یا «برگردان». */
  label: string;
  /** پیش‌فرض روز زمان‌دار: فردا (`1405/08/01`). */
  dayDefault: string;
  back: string;
  backLabel: string;
}

/**
 * انتشار یک صفحه با کد تازه (۱۵٫۲، طرح «انتشار»؛ سؤال ۴۶۵): «همین حالا» یا «در روز و ساعت» به وقت تهران، روز و ساعت فقط با دومی (`:has()`، بی
 * JS هم)، و کد تازه. آخرین نسخه و اثر انگشت متنی که صفحه نشان داد با فرم می‌روند؛ چیزی که در این میان عوض شد صفحه را از نو باز می‌کند
 * (`publishPageAction`).
 *
 * کاشی‌ها و روز کنترل‌نشده‌اند، با پیش‌فرضِ آنچه فرستاده شد (مثل `BarForm`): React پس از هر کار فرم را ریست می‌کند، و کاشی کنترل‌شده با آن به
 * «همین حالا» برمی‌گشت، پس روز و ساعت پنهان می‌شدند درست وقتی خطایشان زیرشان بود. `when` و `day` فقط برای متن دکمه و روز هفته‌اند.
 */
export function PagePublishForm({ gate, page, from, version, seen, label, dayDefault, back, backLabel }: Props) {
  const [state, action, pending] = useActionState<PageFormState, FormData>(publishPageAction, {});
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  const [when, setWhen] = useState(value('when', 'now'));
  const [day, setDay] = useState(value('day', dayDefault));
  const errorOf = (field: PageFormState['field']) => (state.error && state.field === field ? messageOf(state.error) : null);
  const codeError = state.field === 'code' ? errorOf('code') : null;
  const other = state.error && !state.field && state.error !== 'account_locked' ? messageOf(state.error) : null;
  const parsedDay = parseJalaliNumeric(day);
  const fieldError = (field: 'when' | 'day' | 'hour') => {
    const message = errorOf(field);
    return message ? (
      <p id={`pub-${field}-error`} className="jy-error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        <span>{message}</span>
      </p>
    ) : null;
  };

  return (
    <>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : other ? (
        <Alert tone="error">{other}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="seen" value={seen} />
        <fieldset className="ad-fs ad-gap ad-when-form" aria-describedby={errorOf('when') ? 'pub-when-error' : undefined}>
          <legend>کی روی سایت برود</legend>
          <div className="jy-tiles">
            <label className="jy-tile">
              <input className="jy-radio" type="radio" name="when" value="now" defaultChecked={value('when', 'now') !== 'at'} onChange={() => setWhen('now')} />
              <span className="jy-tile__title">همین حالا</span>
              <span className="jy-tile__note">تا یک دقیقه بعد روی سایت</span>
            </label>
            <label className="jy-tile">
              <input
                className="jy-radio ad-when-at"
                type="radio"
                name="when"
                value="at"
                defaultChecked={value('when', 'now') === 'at'}
                onChange={() => setWhen('at')}
              />
              <span className="jy-tile__title">در روز و ساعت</span>
              <span className="jy-tile__note">به وقت تهران</span>
            </label>
          </div>
          {fieldError('when')}
          <div className="ad-pair ad-if-at">
            <div className="jy-field">
              <label className="jy-label" htmlFor="pub-day">
                روز
              </label>
              <input
                id="pub-day"
                name="day"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={value('day', dayDefault)}
                onChange={(event) => setDay(event.target.value)}
                aria-invalid={errorOf('day') ? true : undefined}
                aria-describedby={[errorOf('day') ? 'pub-day-error' : null, 'pub-day-hint'].filter(Boolean).join(' ')}
              />
              {fieldError('day')}
              <p id="pub-day-hint" className="jy-hint">
                {parsedDay ? `${formatJalaliWeekday(parsedDay)}؛ ` : null}تا <span className="num">90</span> روز بعد.
              </p>
            </div>
            <div className="jy-field">
              <label className="jy-label" htmlFor="pub-hour">
                ساعت
              </label>
              <input
                id="pub-hour"
                name="hour"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={value('hour', '09:00')}
                aria-invalid={errorOf('hour') ? true : undefined}
                aria-describedby={errorOf('hour') ? 'pub-hour-error' : undefined}
              />
              {fieldError('hour')}
            </div>
          </div>
          <p className="ad-hint">تا آن ساعت صفحه نه روی سایت است و نه در نقشهٔ سایت. زمان‌دار را تا پیش از آن بی کد پس می‌گیری؛ پیش‌نویس می‌ماند.</p>
        </fieldset>
        <div className="ad-form ad-gap">
          <CodeField error={codeError} hint="صفحه‌ای که به نام جزوه‌یار با مشتری حرف می‌زند، کد تازه می‌خواهد." />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {when === 'at' ? 'زمان‌دار کن' : label}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            {backLabel}
          </Link>
        </div>
      </form>
    </>
  );
}
