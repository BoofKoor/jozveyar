'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { panelPath } from '../../../../../lib/gate';

/**
 * «این سفارش پیدا نشد» (طرح پنل `ad-notfound`) با وضعیت ۴۰۴، درون پوستهٔ پنل: شماره‌ای که نیست، و از ۵٫۳ سفارشی که بیرون از
 * محدودهٔ این نشست است (سفارش چاپخانهٔ دیگر، یا پرداخت‌نشده برای کاربر چاپخانه). هر دو یکی‌اند، پس وجود سفارش لو نمی‌رود.
 * صفحهٔ سفارش، برگه و هر دانلود و کاری که «پیدا نشد» می‌گیرد به همین می‌رسد. `not-found` پارامتر نمی‌گیرد؛ مسیر محرمانه از نشانی.
 */
export default function OrderNotFound() {
  const { gate } = useParams<{ gate: string }>();
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-missing" data-notfound="">
      <h1 id="t-missing" className="jy-card__title">
        این سفارش پیدا نشد
      </h1>
      <p className="ad-lead">شماره را درست زدی؟ از فهرست سفارش‌ها پیدایش کن.</p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/orders')} className="jy-btn jy-btn--secondary">
          سفارش‌ها
        </Link>
      </div>
    </section>
  );
}
