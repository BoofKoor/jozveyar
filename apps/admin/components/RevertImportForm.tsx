'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { revertImportAction, type ReasonState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/**
 * دلیل برگرداندن یک ورود فایل پست (طرح `m-ship-revert`، فقط مالک): در رویدادها و فهرست ورودها می‌ماند. کد تازه نمی‌خواهد (ADR-046).
 */
export function RevertImportForm({ gate, id, maxLength, back }: { gate: string; id: string; maxLength: number; back: string }) {
  const [state, action, pending] = useActionState<ReasonState, FormData>(revertImportAction, {});
  const error = state.error ? messageOf(state.error) : null;
  return (
    <form action={action}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="id" value={id} />
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor="rv-why">
            دلیل
          </label>
          <textarea
            id="rv-why"
            name="reason"
            className="jy-input"
            rows={3}
            maxLength={maxLength}
            required
            defaultValue={state.reason}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'rv-why-error rv-why-hint' : 'rv-why-hint'}
          />
          {error ? (
            <p id="rv-why-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <p id="rv-why-hint" className="jy-hint">
            در رویدادها و فهرست ورودها می‌ماند.
          </p>
        </div>
      </div>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--danger${pending ? ' is-loading' : ''}`} disabled={pending}>
          <span className="jy-icon jy-icon-close" aria-hidden="true" />
          این ورود را برگردان
        </button>
        <Link href={back} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
