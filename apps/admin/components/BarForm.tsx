'use client';

import { useActionState, useState } from 'react';

import type { PlaceholderValues } from '@jozveyar/content';
import { BAR_LINK_TEXT_MAX, BAR_TEXT_INPUT_MAX, BAR_TEXT_MAX, barPlainText } from '@jozveyar/content/bar';
import { AnnouncementBar } from '@jozveyar/content/render';
import { formatJalaliWeekday, formatNumber, parseJalaliNumeric } from '@jozveyar/text';
import { Logo } from '@jozveyar/ui';

import { barOffAction, saveBarAction, type BarState } from '../app/[gate]/actions';
import type { BarField } from '../lib/bar';
import { fieldError } from '../lib/content';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { ContentSegs } from './ContentSegs';

interface Props {
  gate: string;
  /** «همان که دیده شد» نوار امروز (`barSeen`). */
  seen: string;
  /** فرم از روی نوار امروز (`barFormValues`). */
  initial: Record<BarField, string>;
  /** عدد امروز جای‌نگهدارها، برای پیش‌نمایش و شمار نویسه. */
  values: PlaceholderValues;
  /** نوار امروز خاموش نیست، پس «خاموش کن» دارد. */
  canOff: boolean;
  /** نمونهٔ فیلدهای روز: امروز و یک هفته بعد (`1405/07/27`). */
  today: string;
  weekLater: string;
}

const MODES = [
  { value: 'off', title: 'خاموش' },
  { value: 'always', title: 'همیشه' },
  { value: 'range', title: 'در بازه' },
] as const;

/**
 * فرم نوار اعلان (برش ۱۱٫۳، طرح «نوار اعلان» در `admin.html`؛ سؤال‌های ۲۸۷ و ۲۹۱ تا ۲۹۴): «کی دیده شود» با سه کاشی، روز اول و آخر فقط با «در
 * بازه» (`:has()`)، متن با شمار نویسه با عددهای امروز، پیوند و متنش، و کد تازه؛ کنارش پیش‌نمایش گوشی ۳۲۰ پیکسلی و دسکتاپ با همان جزء سایت
 * (`AnnouncementBar`)، که با نوشتن عوض می‌شود. «خاموش کن» کار جدای همین فرم است: بی کد و بی سنجش فیلدها.
 */
export function BarForm({ gate, seen, initial, values, canOff, today, weekLater }: Props) {
  const [state, action, pending] = useActionState<BarState, FormData>(saveBarAction, {});
  const value = (key: BarField) => state.values?.[key] ?? initial[key];
  const [text, setText] = useState(value('text'));
  const [href, setHref] = useState(value('href'));
  const [linkText, setLinkText] = useState(value('linkText'));
  const [last, setLast] = useState(value('until'));

  const error = state.error;
  const at = state.field;
  const issues = state.issues ?? [];
  const errorOf = (field: BarField | 'code') => (at === field && error ? messageOf(error) : null);
  const issueOf = (field: BarField) => fieldError(field, issues);
  const describedBy = (field: BarField, hint: boolean) =>
    [errorOf(field) || issueOf(field) ? `bar-${field}-error` : null, hint ? `bar-${field}-hint` : null].filter(Boolean).join(' ') || undefined;
  const fieldErrors = (field: BarField) => {
    const message = errorOf(field);
    const segs = issueOf(field);
    return message || segs ? (
      <p id={`bar-${field}-error`} className="jy-error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        <span>{message ?? <ContentSegs segs={segs!} />}</span>
      </p>
    ) : null;
  };
  const invalid = (field: BarField) => (errorOf(field) || issueOf(field) ? true : undefined);
  const other = error && !at && error !== 'bar_invalid' ? messageOf(error) : null;
  const length = [...barPlainText(text, values)].length;
  const lastDay = parseJalaliNumeric(last);
  const preview = { text, href: href.trim() ? href : '', linkText: href.trim() ? linkText : '' };

  return (
    <div className="ad-ed">
      <section className="jy-card" aria-labelledby="t-bar-ed">
        <h2 id="t-bar-ed" className="sr-only">
          نوار
        </h2>
        {error === 'account_locked' ? (
          <Alert tone="warning">
            تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
          </Alert>
        ) : other ? (
          <Alert tone="error">{other}</Alert>
        ) : error === 'bar_invalid' ? (
          <Alert tone="error">{messageOf(error)}</Alert>
        ) : null}
        <form action={action}>
          <input type="hidden" name="gate" value={gate} />
          <input type="hidden" name="seen" value={seen} />
          <input type="hidden" name="back" value="bar" />
          <div className="ad-form ad-bar-form">
            <fieldset className="ad-fs" aria-describedby={errorOf('mode') ? 'bar-mode-error' : undefined}>
              <legend>کی دیده شود</legend>
              <div className="jy-tiles jy-tiles--3">
                {MODES.map((mode) => (
                  <label key={mode.value} className="jy-tile">
                    <input
                      className={`jy-radio ad-bar-${mode.value}`}
                      type="radio"
                      name="mode"
                      value={mode.value}
                      defaultChecked={value('mode') === mode.value}
                    />
                    <span className="jy-tile__title">{mode.title}</span>
                  </label>
                ))}
              </div>
              {fieldErrors('mode')}
              <div className="ad-pair ad-if-range">
                <div className="jy-field">
                  <label className="jy-label" htmlFor="bar-from">
                    روز اول
                  </label>
                  <input
                    id="bar-from"
                    name="from"
                    className="jy-input ad-short num"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={today}
                    defaultValue={value('from')}
                    aria-invalid={invalid('from')}
                    aria-describedby={describedBy('from', false)}
                  />
                  {fieldErrors('from')}
                </div>
                <div className="jy-field">
                  <label className="jy-label" htmlFor="bar-until">
                    روز آخر
                  </label>
                  <input
                    id="bar-until"
                    name="until"
                    className="jy-input ad-short num"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={weekLater}
                    defaultValue={value('until')}
                    onChange={(event) => setLast(event.target.value)}
                    aria-invalid={invalid('until')}
                    aria-describedby={describedBy('until', true)}
                  />
                  {fieldErrors('until')}
                  <p id="bar-until-hint" className="jy-hint">
                    {lastDay ? `${formatJalaliWeekday(lastDay).split(' ')[0]}؛ ` : null}هر دو روز با هم، به وقت تهران، تا{' '}
                    <span className="num">90</span> روز بعد.
                  </p>
                </div>
              </div>
            </fieldset>
            <div className="jy-field">
              <label className="jy-label" htmlFor="bar-text">
                متن
              </label>
              <textarea
                id="bar-text"
                name="text"
                className="jy-input"
                rows={2}
                maxLength={BAR_TEXT_INPUT_MAX}
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-invalid={invalid('text')}
                aria-describedby={describedBy('text', true)}
              />
              {fieldErrors('text')}
              <p id="bar-text-hint" className="jy-hint">
                یک خط، تا <span className="num">{formatNumber(BAR_TEXT_MAX)}</span> نویسه با عددها:{' '}
                <span className="num" data-bar-count="">
                  {formatNumber(length)}
                </span>{' '}
                از <span className="num">{formatNumber(BAR_TEXT_MAX)}</span>. پررنگ با دو ستاره، و جای‌نگهدارها مثل متن صفحه‌ها.
              </p>
            </div>
            <div className="ad-pair">
              <div className="jy-field">
                <label className="jy-label" htmlFor="bar-href">
                  پیوند <span className="jy-optional">(اختیاری)</span>
                </label>
                <input
                  id="bar-href"
                  name="href"
                  className="jy-input jy-input--ltr"
                  dir="ltr"
                  autoComplete="off"
                  maxLength={300}
                  value={href}
                  onChange={(event) => setHref(event.target.value)}
                  aria-invalid={invalid('href')}
                  aria-describedby={describedBy('href', true)}
                />
                {fieldErrors('href')}
                <p id="bar-href-hint" className="jy-hint">
                  فقط نشانی همین سایت، مثل <bdi className="ad-ltr">/contact</bdi>؛ خالی یعنی بی پیوند.
                </p>
              </div>
              <div className="jy-field">
                <label className="jy-label" htmlFor="bar-go">
                  متن پیوند
                </label>
                <input
                  id="bar-go"
                  name="linkText"
                  className="jy-input"
                  autoComplete="off"
                  maxLength={BAR_LINK_TEXT_MAX * 2}
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  aria-invalid={invalid('linkText')}
                  aria-describedby={describedBy('linkText', false)}
                />
                {fieldErrors('linkText')}
              </div>
            </div>
            <CodeField
              error={errorOf('code')}
              required={false}
              hint="روشن کردن و هر تغییر نوار روشن کد تازه می‌خواهد؛ «خاموش کن» همان لحظه و بی کد است."
            />
          </div>
          <div className="ad-actions">
            <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
              ذخیره کن
            </button>
            {canOff ? (
              <button type="submit" formAction={barOffAction} className="jy-btn jy-btn--secondary" disabled={pending}>
                خاموش کن
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <section className="jy-card ad-pv" aria-labelledby="t-bar-pv">
        <div className="jy-card__head">
          <h2 id="t-bar-pv" className="jy-card__title">
            پیش‌نمایش
          </h2>
          <span className="jy-card__meta">با عددهای امروز</span>
        </div>
        {text.trim() ? (
          <>
            <p className="ad-pvlabel">
              گوشی، <span className="num">320</span> پیکسل
            </p>
            <div className="ad-barpv ad-barpv--phone" data-bar-preview="phone">
              <AnnouncementBar bar={preview} options={{ values, live: 'ad-live-n', inert: true }} />
              <span className="ad-barpv__head" aria-hidden="true">
                <Logo height={40} />
                <span>تعرفه · سؤال‌ها</span>
              </span>
            </div>
            <p className="ad-pvlabel">دسکتاپ</p>
            <div className="ad-barpv" data-bar-preview="desktop">
              <AnnouncementBar bar={preview} options={{ values, live: 'ad-live-n', inert: true }} />
              <span className="ad-barpv__head" aria-hidden="true">
                <Logo height={40} />
                <span>چطور کار می‌کند · تعرفه · سؤال‌ها</span>
              </span>
            </div>
          </>
        ) : (
          <p className="ad-hint">پیش‌نمایش با نوشتن متن ساخته می‌شود.</p>
        )}
        <p className="jy-note jy-note--info ad-gap">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            بالای همهٔ صفحه‌های سایت، جز پس از انداختن فایل و صفحهٔ سفارش. وقتی همهٔ چاپخانه‌ها تعطیل‌اند، پیام تعطیلی جای این نوار می‌نشیند و پس از آن، این
            نوار خودش برمی‌گردد.
          </span>
        </p>
      </section>
    </div>
  );
}
