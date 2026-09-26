'use client';

import { useEffect, useState } from 'react';
import type { MockDecision } from '@jozveyar/contracts/checkout';
import { checkoutApi } from '../../lib/checkout/api';

/**
 * سه تصمیم درگاه نمونه (ADR-035): موفق، ناموفق، انصراف. تصمیم به سرور می‌رود و بعد برگشت از درگاه، به همان
 * شکل زرین‌پال (`/pay/callback?Authority=…&Status=…`). تصمیمی که یک بار ثبت شد عوض نمی‌شود؛ آن‌وقت فقط
 * «برگشت به جزوه‌یار».
 */
export function GateActions({ authority, decided }: { authority: string; decided: boolean }) {
  const [busy, setBusy] = useState<MockDecision | null>(null);
  const [failed, setFailed] = useState(false);
  // «برگشت» مرورگر از صفحهٔ سفارش به این صفحه، از حافظهٔ مرورگر: دکمه‌ها دیگر در حال کار نیستند.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  if (decided) {
    return (
      <>
        <p className="jy-note">این پرداخت پیش‌تر نتیجه گرفته است.</p>
        <div className="ck-gate__actions">
          <a
            className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block"
            href={`/pay/callback?Authority=${encodeURIComponent(authority)}&Status=NOK`}
          >
            برگشت به جزوه‌یار
          </a>
        </div>
      </>
    );
  }

  const decide = async (decision: MockDecision) => {
    if (busy) return;
    setBusy(decision);
    setFailed(false);
    const result = await checkoutApi(window.fetch.bind(window)).mockDecision(authority, decision);
    if (result.ok) {
      window.location.assign(result.value.redirectUrl);
      return;
    }
    setBusy(null);
    setFailed(true);
  };

  const button = (decision: MockDecision, label: string, variant: string) => (
    <button
      type="button"
      disabled={busy !== null}
      aria-busy={busy === decision || undefined}
      onClick={() => void decide(decision)}
      className={`jy-btn ${variant} jy-btn--block${busy === decision ? ' is-loading' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <>
      {failed ? (
        <p className="jy-note jy-note--error" role="alert">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>تصمیم ثبت نشد. دوباره بزن.</span>
        </p>
      ) : null}
      <div className="ck-gate__actions">
        {button('success', 'پرداخت موفق', 'jy-btn--primary jy-btn--lg')}
        {button('failure', 'پرداخت ناموفق', 'jy-btn--secondary jy-btn--lg')}
        {button('cancel', 'انصراف و بازگشت', 'jy-btn--text')}
      </div>
    </>
  );
}
