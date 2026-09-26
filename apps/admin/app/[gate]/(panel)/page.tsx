import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliWeekday, formatTehranTime } from '@jozveyar/text';

import { panelPath } from '../../../lib/gate';
import { can } from '../../../lib/server/auth';
import { requireSession } from '../../../lib/server/context';

export const metadata: Metadata = { title: 'پیشخوان' };

/**
 * پیشخوان. صف تحویل به پست و هشدارهای سفارش با ۴٫۲ می‌آیند (طرح پنل)؛ در ۴٫۱ فقط خوشامد و راه بخش‌ها.
 */
export default async function Dashboard({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const session = await requireSession(gate);
  const now = new Date();
  const manages = can(session, 'admins.manage');
  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">پیشخوان</h1>
          <p className="ad-sub">
            {formatJalaliWeekday(now)}، ساعت <span className="num">{formatTehranTime(now)}</span>
          </p>
        </div>
      </div>
      <section className="jy-card ad-narrow" aria-labelledby="t-welcome">
        <h2 id="t-welcome" className="jy-card__title">
          خوش آمدی، {session.displayName}
        </h2>
        <p className="ad-lead">صف تحویل به پست و فهرست سفارش‌ها با قدم بعدی پنل اینجا می‌آیند.</p>
        {manages ? (
          <div className="ad-actions">
            <Link href={panelPath(gate, '/admins')} className="jy-btn jy-btn--secondary">
              ادمین‌ها
            </Link>
            <Link href={panelPath(gate, '/events')} className="jy-btn jy-btn--text">
              رویدادها
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
