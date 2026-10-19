'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { BANNER_ALT_MAX } from '@jozveyar/content/banner';

import { saveBannerAction, type BannerField, type BannerState } from '../app/[gate]/actions';
import { countText, fieldError } from '../lib/content';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { ContentSegs } from './ContentSegs';

interface Props {
  gate: string;
  /** شمارهٔ بارگذاری. */
  id: number;
  /** «همان که دیده شد» بنر امروز (`bannerSeen`). */
  seen: string;
  /** متن جایگزین و پیوند از پیش: بنر امروز اگر همین تصویر است، وگرنه همان دو از بنر قبلی. */
  initial: Record<BannerField, string>;
  /** همین تصویر همین حالا بنر روشن سایت است، پس فرم فقط متن و پیوند را عوض می‌کند. */
  live: boolean;
  back: string;
}

/**
 * «روی سایت بگذار» بنر، یا ذخیرهٔ متن و پیوند بنر روشن (برش ۱۱٫۲، سؤال ۲۰۶): متن جایگزین (لازم، با شمار نویسه)، پیوند اختیاری فقط به همین
 * سایت، و کد تازه، چون هر دو روی سایت دیده می‌شوند. خطای هر فیلد زیر همان فیلد و پیش از کد؛ بنری که همین حالا جای دیگری عوض شد صفحه را از نو
 * می‌سازد.
 */
export function BannerForm({ gate, id, seen, initial, live, back }: Props) {
  const [state, action, pending] = useActionState<BannerState, FormData>(saveBannerAction, {});
  const value = (key: BannerField) => state.values?.[key] ?? initial[key];
  const [alt, setAlt] = useState(value('alt'));
  const issues = state.issues ?? [];
  const codeError = state.field === 'code' && state.error ? messageOf(state.error) : null;
  const other = state.error && state.field !== 'code' && state.error !== 'banner_invalid' && state.error !== 'account_locked' ? messageOf(state.error) : null;

  const fieldErrors = (field: BannerField) => {
    const segs = fieldError(field, issues);
    return segs ? (
      <p id={`banner-${field}-error`} className="jy-error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        <span>
          <ContentSegs segs={segs} />
        </span>
      </p>
    ) : null;
  };
  const describedBy = (field: BannerField) => [fieldError(field, issues) ? `banner-${field}-error` : null, `banner-${field}-hint`].filter(Boolean).join(' ');

  return (
    <>
      {state.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : other ? (
        <Alert tone="error">{other}</Alert>
      ) : state.error === 'banner_invalid' ? (
        <Alert tone="error">{messageOf(state.error)}</Alert>
      ) : null}
      <form action={action} data-banner-form="">
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="banner-alt">
              متن جایگزین
            </label>
            <input
              id="banner-alt"
              name="alt"
              className="jy-input"
              autoComplete="off"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              aria-invalid={fieldError('alt', issues) ? true : undefined}
              aria-describedby={describedBy('alt')}
            />
            {fieldErrors('alt')}
            <p id="banner-alt-hint" className="jy-hint">
              همان پیام بنر، کوتاه؛ صفحه‌خوان و گوگل این را به جای تصویر می‌خوانند. <ContentSegs segs={countText(alt.trim(), BANNER_ALT_MAX)} />
            </p>
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="banner-href">
              پیوند <span className="jy-optional">(اختیاری)</span>
            </label>
            <input
              id="banner-href"
              name="href"
              className="jy-input jy-input--ltr"
              dir="ltr"
              autoComplete="off"
              placeholder="/#tariff"
              defaultValue={value('href')}
              aria-invalid={fieldError('href', issues) ? true : undefined}
              aria-describedby={describedBy('href')}
            />
            {fieldErrors('href')}
            <p id="banner-href-hint" className="jy-hint">
              فقط صفحه‌ای از همین سایت، مثل <bdi className="ad-ltr">/#tariff</bdi> یا <bdi className="ad-ltr">/contact</bdi>؛ خالی یعنی بنر پیوند
              ندارد.
            </p>
          </div>
          <CodeField
            error={codeError}
            required={false}
            hint="روشن کردن و هر تغییر بنر روشن کد تازه می‌خواهد؛ متن و پیوندی که عوض نشده کد نمی‌خواهد، و «خاموش کن» همان لحظه و بی کد است."
          />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {live ? 'ذخیره کن' : 'روی سایت بگذار'}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
