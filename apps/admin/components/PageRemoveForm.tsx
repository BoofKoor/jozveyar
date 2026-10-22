'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { removePageAction, type PageFormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { RemoveTarget } from '../lib/server/pages';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  page: string;
  /** آخرین شمارهٔ نسخه‌ای که صفحه نشان داد. */
  version: number;
  targets: readonly RemoveTarget[];
  /** «پیدا نشد» بسته است: متنی روی سایت یا زمان‌دار به این صفحه پیوند دارد (فهرستش بالای فرم). */
  goneBlocked: number;
  back: string;
}

/**
 * «از سایت بردار» با کد تازه (۱۵٫۲، طرح «از سایت بردار»؛ سؤال ۴۶۶): «به صفحهٔ دیگری» (۳۰۱، از پیش انتخاب‌شده) با مقصدش، یا «پیدا نشد» (۴۰۴)، که
 * تا متنی به این صفحه پیوند دارد بسته است؛ مقصد فقط با «به صفحهٔ دیگری» (`:has()`، بی JS هم).
 */
export function PageRemoveForm({ gate, page, version, targets, goneBlocked, back }: Props) {
  const [state, action, pending] = useActionState<PageFormState, FormData>(removePageAction, {});
  const mode = state.values?.mode ?? 'moved';
  const errorOf = (field: PageFormState['field']) => (state.error && state.field === field ? messageOf(state.error) : null);
  const other = state.error && !state.field && state.error !== 'account_locked' ? messageOf(state.error) : null;

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
        <input type="hidden" name="version" value={version} />
        <fieldset className="ad-fs ad-gap ad-remove-form" aria-describedby={errorOf('mode') ? 'rm-mode-error' : undefined}>
          <legend>این نشانی پس از برداشتن</legend>
          <div className="jy-tiles">
            <label className="jy-tile">
              <input className="jy-radio ad-rm-moved" type="radio" name="mode" value="moved" defaultChecked={mode !== 'gone'} />
              <span className="jy-tile__title">
                به صفحهٔ دیگری (<span className="num">301</span>)
              </span>
              <span className="jy-tile__note">رتبهٔ این نشانی به مقصد می‌رود؛ برای صفحه‌ای که جانشین دارد</span>
            </label>
            <label className="jy-tile">
              <input className="jy-radio" type="radio" name="mode" value="gone" defaultChecked={mode === 'gone' && goneBlocked === 0} disabled={goneBlocked > 0} />
              <span className="jy-tile__title">
                «پیدا نشد» (<span className="num">404</span>)
              </span>
              <span className="jy-tile__note">
                {goneBlocked > 0 ? (
                  <>
                    بسته: <span className="num">{goneBlocked}</span> پیوند روی سایت به این صفحه است (بالا)
                  </>
                ) : (
                  'از نقشهٔ سایت و پاورقی هم می‌رود'
                )}
              </span>
            </label>
          </div>
          {errorOf('mode') ? (
            <p id="rm-mode-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>{errorOf('mode')}</span>
            </p>
          ) : null}
          <div className="jy-field ad-select ad-if-moved">
            <label className="jy-label" htmlFor="rm-to">
              به
            </label>
            <select
              id="rm-to"
              name="to"
              className="jy-input"
              defaultValue={state.values?.to ?? targets[0]?.value}
              aria-invalid={errorOf('to') ? true : undefined}
              aria-describedby={errorOf('to') ? 'rm-to-error' : undefined}
            >
              {targets.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.value === 'home' ? target.label : `${target.label} (${target.path})`}
                </option>
              ))}
            </select>
            {errorOf('to') ? (
              <p id="rm-to-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                <span>{errorOf('to')}</span>
              </p>
            ) : null}
          </div>
        </fieldset>
        <p className="ad-hint ad-gap">نسخه‌ها پاک نمی‌شوند؛ با انتشار دوباره همان نشانی برمی‌گردد و دیگر به جای دیگری نمی‌رود.</p>
        <div className="ad-form ad-gap">
          <CodeField error={state.field === 'code' ? errorOf('code') : null} hint="برداشتن صفحه‌ای که روی سایت است کد تازه می‌خواهد." />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--danger${pending ? ' is-loading' : ''}`} disabled={pending}>
            از سایت بردار
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
