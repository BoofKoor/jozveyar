'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { formatTehranTime } from '@jozveyar/text';
import { checkoutApi, type ApiFailure } from '../../lib/checkout/api';
import { publishDockHeight } from '../../lib/dock';
import { SumValue } from './parts';

/*
 * «دوباره پرداخت کن» صفحهٔ سفارش (۳ج): تلاش تازهٔ پرداخت با همان قیمت منجمد (ADR-034)، و رفتن به درگاه.
 * جزیرهٔ کلاینت کوچکی در صفحهٔ سرور؛ دکمهٔ خلاصه و دکمهٔ نوار موبایل یک حالت دارند. از برش ۷٫۲ «در حال بررسی» هم
 * (`CheckingWatch`).
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
  // فایل‌ها دیگر نیستند و سفارش منقضی شد، یا پرداختی از همین سفارش در حال بررسی است (دو زبانه، برش ۷٫۲): صفحه همین را با راه
  // جلویش نشان می‌دهد.
  if (result.error === 'order_expired' || result.error === 'payment_checking') {
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
  // برش ۷٫۲ (سؤال‌های ۱۳۹ و ۱۴۸): کد پذیرنده آماده نیست، یا مبلغ منجمد از سقف یک پرداخت درگاه بیشتر است.
  gateway_not_ready: 'ثبت سفارش موقتاً متوقف است. سفارشت با همین قیمت مانده؛ کمی بعد دوباره امتحان کن.',
  // برش ۷٫۵ (سؤال ۱۶۵): مالک مسیر خرید را «متوقف» کرده؛ همان متن طرح.
  checkout_paused: 'ثبت سفارش موقتاً متوقف است. سفارشت با همین قیمت مانده؛ کمی بعد دوباره امتحان کن.',
  amount_over_gateway_limit: 'مبلغ این سفارش از سقف یک پرداخت درگاه بیشتر است، پس آنلاین پرداخت نمی‌شود. جزوه را دوباره بینداز و با نسخهٔ کمتر سفارش بده.',
  auth_required: 'برای پرداخت، این صفحه را با همان گوشی و مرورگری باز کن که با آن سفارش دادی.',
  not_found: 'پرداخت آنلاین الان بسته است؛ سفارشت با همین قیمت مانده.',
};

/** «موقتاً متوقف» (درگاه آماده نیست، یا مالک «متوقف» کرد) هشدار است، نه خطا؛ مثل یادداشت طرح (`st-paused`). نام کلاس‌ها کامل. */
const PAUSED: ReadonlySet<string> = new Set(['gateway_not_ready', 'checkout_paused']);

/** چرا «دوباره پرداخت کن» نشد، زیر کارت سفارش. */
export function PayAgainNote() {
  const { failure } = usePay();
  if (!failure) return null;
  const paused = PAUSED.has(failure.error);
  return (
    <div className={paused ? 'jy-note jy-note--warning' : 'jy-note jy-note--error'} role="alert" data-testid="pay-again-failed">
      <span className={paused ? 'jy-icon jy-icon-warning' : 'jy-icon jy-icon-error'} aria-hidden="true" />
      <span>{MESSAGE[failure.error] ?? 'الان نشد؛ چند لحظهٔ دیگر دوباره بزن.'}</span>
    </div>
  );
}

/** نوار قیمت موبایل صفحهٔ سفارش در انتظار پرداخت: جمع با ارسال، و «دوباره پرداخت» (یا کار بعدی دیگری، مثل «بررسی»). */
export function OrderDock({ token, totalRials, ship, action }: { token: string; totalRials: number; ship: string; action?: ReactNode }) {
  return (
    <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
      <div className="site-wrap home-dock__in">
        <p className="home-dock__price">
          <span className="home-dock__label">جمع با ارسال</span>
          <SumValue rials={totalRials} testId="price-total" />
          <span className="home-dock__ship">{ship}</span>
        </p>
        {action ?? <PayAgainButton token={token} short />}
      </div>
    </div>
  );
}

/** هر ۱۵ ثانیه (سؤال ۱۳۰): از سرور خودمان، نه از درگاه؛ پرسیدن از درگاه کار استعلام خودکار سرور است، هر دقیقه. */
export const CHECKING_POLL_MS = 15_000;

/**
 * «پرداختت در حال بررسی است» (برش ۷٫۲، سؤال ۱۳۰): صفحه خودش به‌روز می‌شود. جزیرهٔ کوچکی فقط در همین حالت، که هر ۱۵ ثانیه صفحهٔ سفارش را به
 * JSON از سرور خودمان می‌پرسد (زبانهٔ پنهان نه؛ با برگشت به زبانه همان دم)، به‌علاوهٔ «الان دوباره ببین». نتیجه که آمد، صفحه از نو، با
 * حالت تازهٔ سرور. «آخرین بررسی» آخرین باری است که سرور از درگاه پرسید.
 */
export function CheckingWatch({ token, checkedAt }: { token: string; checkedAt: string | null }) {
  const [at, setAt] = useState(checkedAt);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const result = await checkoutApi(window.fetch.bind(window)).order(token);
      // شبکه یا سرور: بار بعد.
      if (!result.ok) return;
      const checking = result.value.details?.checking;
      if (checking) setAt(checking.checkedAt);
      else window.location.reload();
    } finally {
      running.current = false;
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, CHECKING_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return (
    <div className="ck-refresh" data-testid="checking-refresh">
      <p className="ck-refresh__text">
        این صفحه خودش به‌روز می‌شود
        {at ? (
          <>
            ؛ آخرین بررسی ساعت <span className="num">{formatTehranTime(new Date(at))}</span>
          </>
        ) : null}
        .
      </p>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy || undefined}
        className={`jy-btn jy-btn--secondary${busy ? ' is-loading' : ''}`}
        onClick={async () => {
          setBusy(true);
          await refresh();
          setBusy(false);
        }}
      >
        الان دوباره ببین
      </button>
    </div>
  );
}
