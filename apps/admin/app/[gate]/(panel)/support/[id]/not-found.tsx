'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { panelPath } from '../../../../../lib/gate';

/** «این گفت‌وگو پیدا نشد» (برش ۱۲٫۱) با وضعیت ۴۰۴، درون پوستهٔ پنل، مثل سفارشی که نیست. */
export default function ThreadNotFound() {
  const { gate } = useParams<{ gate: string }>();
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-missing" data-notfound="">
      <h1 id="t-missing" className="jy-card__title">
        این گفت‌وگو پیدا نشد
      </h1>
      <p className="ad-lead">از صندوق پشتیبانی پیدایش کن؛ با موبایل، شمارهٔ سفارش یا نام.</p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/support')} className="jy-btn jy-btn--secondary">
          پشتیبانی
        </Link>
      </div>
    </section>
  );
}
