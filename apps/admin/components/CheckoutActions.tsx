'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { lowerAudienceAction, previewLinkAction, type PreviewState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { Alert } from './Alert';

/**
 * کارهای کارت «مسیر خرید روی سایت» در مخاطب «پیش‌نمایش مالک» (برش ۷٫۵، طرح `st-live-pre` و `st-live-link`): «باز برای همه…» (صفحهٔ کد
 * تازه)، «پیوند پیش‌نمایش بساز» (بی کد)، و «توقف» (بی کد، همان لحظه). پیوند فقط همین یک بار در حالت فرم می‌آید، زیر دکمه‌ها؛ جایی
 * ذخیره نمی‌شود و با بار دوبارهٔ صفحه می‌رود. «کپی» اگر مرورگر اجازه ندهد، خود پیوند را برای کپی دستی انتخاب می‌کند.
 */
export function CheckoutPreviewActions({ gate, seen, openHref }: { gate: string; seen: string; openHref: string }) {
  const [state, action, pending] = useActionState<PreviewState, FormData>(previewLinkAction, {});
  const [copied, setCopied] = useState(false);
  const link = state.link;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      (document.getElementById('preview-link') as HTMLInputElement | null)?.select();
    }
  }

  return (
    <>
      {state.error ? <Alert tone="error">{messageOf(state.error)}</Alert> : null}
      <div className="ad-actions">
        <Link href={openHref} className="jy-btn jy-btn--primary">
          باز برای همه…
        </Link>
        <form action={action}>
          <input type="hidden" name="gate" value={gate} />
          <button type="submit" className={`jy-btn jy-btn--secondary${pending ? ' is-loading' : ''}`} disabled={pending}>
            پیوند پیش‌نمایش بساز
          </button>
        </form>
        <form action={lowerAudienceAction}>
          <input type="hidden" name="gate" value={gate} />
          <input type="hidden" name="to" value="paused" />
          <input type="hidden" name="seen" value={seen} />
          <button type="submit" className="jy-btn jy-btn--text">
            توقف
          </button>
        </form>
      </div>
      {link ? (
        <div className="ad-keys__form ad-gap" data-preview-link="">
          <p className="jy-note jy-note--warning">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              فقط یک بار و تا ساعت <span className="num">{link.until}</span> کار می‌کند، و دوباره نشان داده نمی‌شود. در مرورگری بازش کن که
              با آن آزمایش می‌کنی؛ همان مرورگر تا <span className="num">24</span> ساعت مسیر خرید را می‌بیند، با نوار «پیش‌نمایش مالک».
            </span>
          </p>
          <div className="ad-linkbox">
            <input
              id="preview-link"
              className="jy-input"
              readOnly
              value={link.url}
              aria-label="پیوند پیش‌نمایش"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className="jy-btn jy-btn--secondary" onClick={() => void copy()}>
              {copied ? 'کپی شد' : 'کپی'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
