'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import type { OrderStatus } from '@jozveyar/db';

import { orderReasonAction, type ReasonState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  kind: 'cancel' | 'revert';
  gate: string;
  orderNumber: number;
  /** وضعیتی که ادمین دید؛ اگر همین حالا عوض شده باشد، سرور کار را نمی‌کند. */
  from: OrderStatus;
  /** نام دو وضعیت، از صفحه (`STATUS_LABELS`): این جزء مرورگری است و `lib/orders` پایگاه داده را با خودش می‌آورد. */
  fromLabel: string;
  toLabel: string;
  /** لغو: مبلغ پرداختی، «374,750». */
  amount: string;
  /** بیشترین طول دلیل (`REASON_MAX`). */
  maxLength: number;
  back: string;
}

/**
 * لغو سفارش (طرح پنل `m-order-cancel`) و برگرداندن وضعیت اشتباه (فقط مالک، سؤال ۲۶؛ در طرح نیست)، در ستون کنار و به
 * جای کار بعدی: دلیل، که فقط در پنل دیده می‌شود. لغو هشدار می‌دهد که پول خودکار برنمی‌گردد (دکمهٔ خطر)؛ برگرداندن
 * می‌گوید مشتری چه می‌بیند.
 */
export function ReasonForm({ kind, gate, orderNumber, from, fromLabel, toLabel: target, amount, maxLength, back }: Props) {
  const [state, action, pending] = useActionState<ReasonState, FormData>(orderReasonAction, {});
  const cancel = kind === 'cancel';
  const error = state.error ? messageOf(state.error) : null;

  return (
    <form action={action} className="ad-step" aria-labelledby="t-reason">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="number" value={orderNumber} />
      <input type="hidden" name="action" value={kind} />
      <input type="hidden" name="from" value={from} />
      <p id="t-reason" className="ad-step__title">
        {cancel ? (
          <>
            لغو سفارش <span className="num">{orderNumber}</span>
          </>
        ) : (
          `برگرداندن به «${target}»`
        )}
      </p>
      {cancel ? (
        <p className="jy-note jy-note--warning ad-gap">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            مشتری در صفحهٔ سفارشش «لغو شد» را می‌بیند. پول خودکار برنمی‌گردد: <span className="num">{amount}</span> تومان را خودت
            برگردان و در دلیل بنویس چطور.
          </span>
        </p>
      ) : (
        <p className="jy-note jy-note--info ad-gap">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            برای وضعیتی که اشتباه زده شد: سفارش از «{fromLabel}» یک قدم به «{target}» برمی‌گردد و مشتری در صفحهٔ سفارشش همان
            را می‌بیند.
          </span>
        </p>
      )}
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor="o-reason">
            {cancel ? 'دلیل لغو' : 'دلیل برگرداندن'}
          </label>
          <textarea
            id="o-reason"
            name="reason"
            className="jy-input"
            rows={3}
            maxLength={maxLength}
            required
            defaultValue={state.reason}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'o-reason-error o-reason-hint' : 'o-reason-hint'}
          />
          {error ? (
            <p id="o-reason-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <p id="o-reason-hint" className="jy-hint">
            فقط در پنل دیده می‌شود، نه برای مشتری.
          </p>
        </div>
      </div>
      <div className="ad-status__actions">
        <button
          type="submit"
          className={`jy-btn ${cancel ? 'jy-btn--danger' : 'jy-btn--primary'} jy-btn--lg jy-btn--block${pending ? ' is-loading' : ''}`}
          disabled={pending}
        >
          {cancel ? <span className="jy-icon jy-icon-close" aria-hidden="true" /> : null}
          {cancel ? 'سفارش را لغو کن' : `به «${target}» برگردان`}
        </button>
        <Link href={back} className="jy-btn jy-btn--text jy-btn--block">
          انصراف
        </Link>
      </div>
    </form>
  );
}
