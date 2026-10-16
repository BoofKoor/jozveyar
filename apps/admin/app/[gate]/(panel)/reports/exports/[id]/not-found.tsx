'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { panelPath } from '../../../../../../lib/gate';

/**
 * «این خروجی پیدا نشد» (برش ۱۰٫۲) با وضعیت ۴۰۴: خروجی‌ای که نیست، پس از یک روز پاک شده، یا مال کس دیگری است (فقط خواهنده بازش می‌کند)؛
 * هر سه یکی‌اند، پس شناسهٔ خروجی دیگران چیزی نمی‌گوید.
 */
export default function ExportNotFound() {
  const { gate } = useParams<{ gate: string }>();
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-missing" data-notfound="">
      <h1 id="t-missing" className="jy-card__title">
        این خروجی پیدا نشد
      </h1>
      <p className="ad-lead">هر خروجی PDF فقط برای کسی است که خواستش، و یک روز پس از خواستن پاک می‌شود. از گزارش دوباره بخواهش.</p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/reports')} className="jy-btn jy-btn--secondary">
          گزارش‌ها
        </Link>
      </div>
    </section>
  );
}
