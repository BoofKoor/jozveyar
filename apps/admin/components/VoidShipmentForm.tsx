'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { voidShipmentAction, type ReasonState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/**
 * دلیل کنار گذاشتن یک کد رهگیری (۶٫۲، فقط مالک، از کارت «بستهٔ پستی»): در رویدادهای سفارش و کارت همان بسته می‌ماند. کد تازه
 * نمی‌خواهد (ADR-046). آنچه پس از آن می‌شود (سفارش برمی‌گردد یا نه) را صفحه بالای فرم می‌گوید.
 */
export function VoidShipmentForm({
  gate,
  orderNumber,
  shipmentId,
  maxLength,
  back,
}: {
  gate: string;
  orderNumber: number;
  shipmentId: string;
  maxLength: number;
  back: string;
}) {
  const [state, action, pending] = useActionState<ReasonState, FormData>(voidShipmentAction, {});
  const error = state.error ? messageOf(state.error) : null;
  return (
    <form action={action}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="shipment" value={shipmentId} />
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor="void-why">
            دلیل
          </label>
          <textarea
            id="void-why"
            name="reason"
            className="jy-input"
            rows={3}
            maxLength={maxLength}
            required
            defaultValue={state.reason}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'void-why-error void-why-hint' : 'void-why-hint'}
          />
          {error ? (
            <p id="void-why-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <p id="void-why-hint" className="jy-hint">
            در رویدادهای سفارش و کارت همین بسته می‌ماند.
          </p>
        </div>
      </div>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--danger${pending ? ' is-loading' : ''}`} disabled={pending}>
          <span className="jy-icon jy-icon-close" aria-hidden="true" />
          این کد را کنار بگذار
        </button>
        <Link href={back} className="jy-btn jy-btn--text" scroll={false}>
          انصراف
        </Link>
      </div>
    </form>
  );
}
