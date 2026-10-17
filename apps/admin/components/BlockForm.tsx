'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { blockMobileAction, type BlockState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  /** از صفحهٔ سفارش: شمارهٔ سفارش و موبایل صاحبش برای سرخط («0912 123 4567»)؛ بی آن، فیلد شماره (فهرست «شماره‌های مسدود»). */
  order?: { number: number; phone: string };
  /** بیشترین طول دلیل (`REASON_MAX`). */
  maxLength: number;
  /** «انصراف»، به همان صفحه بی فرم؛ null یعنی فرم همیشه باز است (فهرست). */
  back: string | null;
}

/**
 * مسدود کردن موبایل مشتری (برش ۱۲٫۲، سؤال ۲۱۲): دلیل، که فقط پنل می‌بیند، و هشدار اینکه مشتری چه می‌بیند و سفارش‌های پرداخت‌شده‌اش چه
 * می‌شوند. بی کد تازه. خطای دلیل و شماره همین‌جا با نوشته‌ها می‌ماند.
 */
export function BlockForm({ gate, order, maxLength, back }: Props) {
  const [state, action, pending] = useActionState<BlockState, FormData>(blockMobileAction, {});
  const mobileError = state.error === 'invalid_block_mobile' ? messageOf(state.error) : null;
  const reasonError = state.error && state.error !== 'invalid_block_mobile' ? messageOf(state.error) : null;

  return (
    <form action={action} className="ad-step" aria-labelledby="t-block" data-testid="block-form">
      <input type="hidden" name="gate" value={gate} />
      {order ? <input type="hidden" name="number" value={order.number} /> : null}
      <p id="t-block" className="ad-step__title">
        {order ? (
          <>
            مسدود کردن <span className="num">{order.phone}</span>
          </>
        ) : (
          'مسدود کردن شماره'
        )}
      </p>
      <p className="jy-note jy-note--warning ad-gap">
        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
        <span>
          با این شماره کد پیامکی نمی‌رود و سفارش تازه و پرداخت تازه ساخته نمی‌شود؛ مشتری «ثبت سفارش با این شماره ممکن نیست؛ از «تماس» پیام
          بده.» را می‌بیند. سفارش‌های پرداخت‌شده‌اش همان‌طور چاپ و ارسال می‌شوند.
        </span>
      </p>
      <div className="ad-form">
        {order ? null : (
          <div className="jy-field">
            <label className="jy-label" htmlFor="b-mobile">
              شمارهٔ موبایل
            </label>
            <input
              id="b-mobile"
              name="mobile"
              className="jy-input jy-input--ltr"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="09123456789"
              required
              defaultValue={state.values?.mobile}
              aria-invalid={mobileError ? true : undefined}
              aria-describedby={mobileError ? 'b-mobile-error' : undefined}
            />
            {mobileError ? (
              <p id="b-mobile-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {mobileError}
              </p>
            ) : null}
          </div>
        )}
        <div className="jy-field">
          <label className="jy-label" htmlFor="b-reason">
            دلیل
          </label>
          <textarea
            id="b-reason"
            name="reason"
            className="jy-input"
            rows={2}
            maxLength={maxLength}
            required
            defaultValue={state.values?.reason}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? 'b-reason-error b-reason-hint' : 'b-reason-hint'}
          />
          {reasonError ? (
            <p id="b-reason-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {reasonError}
            </p>
          ) : null}
          <p id="b-reason-hint" className="jy-hint">
            فقط در پنل دیده می‌شود، نه برای مشتری.
          </p>
        </div>
      </div>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--danger${pending ? ' is-loading' : ''}`} disabled={pending}>
          مسدود کن
        </button>
        {back ? (
          <Link href={back} className="jy-btn jy-btn--text" scroll={false}>
            انصراف
          </Link>
        ) : null}
      </div>
    </form>
  );
}
