import type { ReactNode } from 'react';

import type { ContentIssue } from '@jozveyar/content';

import { fieldError } from '../lib/content';
import { ContentSegs } from './ContentSegs';

/** شناسهٔ فیلد از مسیرش: «promises.1.title» ← «f-promises-1-title». */
export const fieldId = (name: string) => `f-${name.replace(/\./g, '-')}`;

/**
 * یک فیلد ویرایشگر متن‌های سایت (برش ۱۱٫۱): برچسب، فیلد با نام مسیرش در متن، خطای همان فیلد زیرش (سه نشانه: لبه، آیکون، پیام) و راهنما.
 * هیچ `required` و `maxLength`ی ندارد: سؤال بسته در `details` هم فرستاده می‌شود و مرورگر فیلد پنهان را نمی‌تواند نشان دهد، و سقف را سرور با
 * شمار خودش می‌گوید؛ پیش‌نویس با خطا هم ذخیره می‌شود.
 */
export function ContentField({
  name,
  label,
  value,
  issues,
  rows,
  ltr = false,
  inputMode,
  optional = false,
  hint,
  help,
  prefix,
  ariaLabel,
  className,
}: {
  name: string;
  /** null یعنی بی برچسب دیدنی (متن قدم، با `ariaLabel`). */
  label: ReactNode | null;
  value: string;
  issues: readonly ContentIssue[];
  /** چند خط؛ بی آن فیلد یک‌خطی. */
  rows?: number;
  ltr?: boolean;
  inputMode?: 'tel' | 'email' | 'numeric';
  optional?: boolean;
  hint?: ReactNode;
  /** راهنمای نحو Markdown زیر متن صفحه (`ad-mdhelp`). */
  help?: ReactNode;
  /** پیشوند نشانی کنار شناسه («t.me/»). */
  prefix?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const id = fieldId(name);
  const error = fieldError(name, issues);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null, help ? `${id}-help` : null].filter(Boolean).join(' ');
  const props = {
    id,
    name,
    defaultValue: value,
    className: ['jy-input', ltr ? 'jy-input--ltr' : null, className].filter(Boolean).join(' '),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    'aria-label': ariaLabel,
  };
  const control = rows ? <textarea rows={rows} {...props} /> : <input {...props} inputMode={inputMode} />;
  return (
    <div className="jy-field">
      {label === null ? null : (
        <label className="jy-label" htmlFor={id}>
          {label}
          {optional ? (
            <>
              {' '}
              <span className="jy-optional">اختیاری</span>
            </>
          ) : null}
        </label>
      )}
      {prefix ? (
        <div className="ad-prefix">
          <span className="ad-prefix__t">{prefix}</span>
          {control}
        </div>
      ) : (
        control
      )}
      {error ? (
        <p id={`${id}-error`} className="jy-error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>
            <ContentSegs segs={error} />
          </span>
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="jy-hint">
          {hint}
        </p>
      ) : null}
      {help ? (
        <div id={`${id}-help`} className="ad-mdhelp">
          {help}
        </div>
      ) : null}
    </div>
  );
}
