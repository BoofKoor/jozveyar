import Link from 'next/link';

import { panelPath } from '../lib/gate';

/** بخشی که مجوزش را ندارد (متصدی؛ طرح پنل): چه چیزی با مالک است، و برگشت به پیشخوان. */
export function NoAccess({ gate }: { gate: string }) {
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-noaccess">
      <h1 id="t-noaccess" className="jy-card__title">
        این بخش فقط برای مالک است
      </h1>
      <p className="ad-lead">تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، ادمین‌ها و رویدادها با مالک پنل است.</p>
      <div className="ad-actions">
        <Link href={panelPath(gate)} className="jy-btn jy-btn--secondary">
          پیشخوان
        </Link>
      </div>
    </section>
  );
}
