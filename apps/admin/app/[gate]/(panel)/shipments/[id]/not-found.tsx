'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { panelPath } from '../../../../../lib/gate';

/**
 * «این ورود پیدا نشد» (مثل سفارش، طرح پنل `ad-notfound`) با وضعیت ۴۰۴، درون پوستهٔ پنل: شناسه‌ای که نیست، و ورود بیرون از محدودهٔ
 * این نشست (ورود چاپخانهٔ دیگر، ۶٫۲). هر دو یکی‌اند.
 */
export default function ImportNotFound() {
  const { gate } = useParams<{ gate: string }>();
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-missing" data-notfound="">
      <h1 id="t-missing" className="jy-card__title">
        این ورود فایل پست پیدا نشد
      </h1>
      <p className="ad-lead">از فهرست ورودها پیدایش کن.</p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/shipments')} className="jy-btn jy-btn--secondary">
          ارسال
        </Link>
      </div>
    </section>
  );
}
