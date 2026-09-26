'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { InviteLink } from '../app/[gate]/actions';

/**
 * پیوند ثبت آماده (طرح پنل): فقط همین یک بار نشان داده می‌شود؛ جایی ذخیره نمی‌شود و با بار دوبارهٔ صفحه
 * می‌رود. «کپی» اگر مرورگر اجازه ندهد، خود پیوند را برای کپی دستی انتخاب می‌کند.
 */
export function LinkReady({ link, back }: { link: InviteLink; back: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(input: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      input?.select();
    }
  }

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-link">
      <h1 id="t-link" className="jy-card__title">
        {link.reset ? `پیوند ثبت تازهٔ ${link.displayName} آماده است` : `پیوند ثبت ${link.displayName} آماده است`}
      </h1>
      <p className="jy-note jy-note--warning ad-gap">
        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
        <span>
          فقط یک بار و تا ساعت <span className="num">{link.until}</span> کار می‌کند، و دوباره نشان داده نمی‌شود. همین حالا از
          راهی خصوصی برایش بفرست، نه در گروه.
        </span>
      </p>
      <div className="ad-linkbox">
        <input
          id="invite-link"
          className="jy-input"
          readOnly
          value={link.url}
          aria-label="پیوند ثبت"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className="jy-btn jy-btn--secondary"
          onClick={() => copy(document.getElementById('invite-link') as HTMLInputElement | null)}
        >
          {copied ? 'کپی شد' : 'کپی'}
        </button>
      </div>
      <div className="ad-actions">
        <Link href={back} className="jy-btn jy-btn--text">
          برگشت به ادمین‌ها
        </Link>
      </div>
    </section>
  );
}
