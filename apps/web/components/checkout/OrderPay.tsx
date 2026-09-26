'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { checkoutApi, type ApiFailure } from '../../lib/checkout/api';
import { publishDockHeight } from '../../lib/dock';
import { SumValue } from './parts';

/*
 * «دوباره پرداخت کن» صفحهٔ سفارش (۳ج): تلاش تازهٔ پرداخت با همان قیمت منجمد (ADR-034)، و رفتن به درگاه.
 * جزیرهٔ کلاینت کوچکی در صفحهٔ سرور؛ دکمهٔ خلاصه و دکمهٔ نوار موبایل یک حالت دارند.
 */

let snapshot: { busy: boolean; failure: ApiFailure | null } = { busy: false, failure: null };
const listeners = new Set<() => void>();

function set(patch: Partial<typeof snapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function usePay() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  // برگشت از درگاه با «برگشت» مرورگر، از حافظهٔ مرورگر: دکمه دیگر در حال کار نیست.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) set({ busy: false });
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
  return state;
}

async function payAgain(token: string) {
  if (snapshot.busy) return;
  set({ busy: true, failure: null });
  const result = await checkoutApi(window.fetch.bind(window)).payAgain(token);
  if (result.ok) {
    // پرداخت شده بود (دو زبانه): صفحهٔ سفارش خودش «ثبت شد» را نشان می‌دهد.
    if (result.value.payment) window.location.assign(result.value.payment.redirectUrl);
    else window.location.reload();
    return;
  }
  // فایل‌ها دیگر نیستند و سفارش منقضی شد: صفحه همین را با راه جلویش نشان می‌دهد.
  if (result.error === 'order_expired') {
    window.location.reload();
    return;
  }
  set({ busy: false, failure: result });
}

/** دکمهٔ «دوباره پرداخت کن»؛ در نوار موبایل کوتاه، با همان نام. */
export function PayAgainButton({ token, short = false }: { token: string; short?: boolean }) {
  const { busy } = usePay();
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label={short ? 'دوباره پرداخت کن' : undefined}
      onClick={() => void payAgain(token)}
      className={`jy-btn jy-btn--primary jy-btn--lg${short ? ' shrink-0' : ' jy-btn--block home-sum__go'}${busy ? ' is-loading' : ''}`}
    >
      {short ? 'دوباره پرداخت' : 'دوباره پرداخت کن'}
      {busy ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
    </button>
  );
}

const MESSAGE: Partial<Record<ApiFailure['error'], string>> = {
  network: 'ارتباط برقرار نشد. اینترنت را ببین و دوباره «دوباره پرداخت کن» را بزن.',
  gateway_unavailable: 'درگاه پرداخت الان جواب نمی‌دهد. سفارشت با همین قیمت مانده؛ چند دقیقهٔ دیگر دوباره بزن.',
  auth_required: 'برای پرداخت، این صفحه را با همان گوشی و مرورگری باز کن که با آن سفارش دادی.',
  not_found: 'پرداخت آنلاین الان بسته است؛ سفارشت با همین قیمت مانده.',
};

/** چرا «دوباره پرداخت کن» نشد، زیر کارت سفارش. */
export function PayAgainNote() {
  const { failure } = usePay();
  if (!failure) return null;
  return (
    <div className="jy-note jy-note--error" role="alert" data-testid="pay-again-failed">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      <span>{MESSAGE[failure.error] ?? 'الان نشد؛ چند لحظهٔ دیگر دوباره بزن.'}</span>
    </div>
  );
}

/** نوار قیمت موبایل صفحهٔ سفارش در انتظار پرداخت: جمع با ارسال، و «دوباره پرداخت». */
export function OrderDock({ token, totalRials, ship }: { token: string; totalRials: number; ship: string }) {
  return (
    <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
      <div className="site-wrap home-dock__in">
        <p className="home-dock__price">
          <span className="home-dock__label">جمع با ارسال</span>
          <SumValue rials={totalRials} testId="price-total" />
          <span className="home-dock__ship">{ship}</span>
        </p>
        <PayAgainButton token={token} short />
      </div>
    </div>
  );
}
