import Link from 'next/link';

import { barShown } from '@jozveyar/content';
import { AnnouncementBar } from '@jozveyar/content/render';
import { formatDeadlineDay } from '@jozveyar/text';

import { barOffAction } from '../app/[gate]/actions';
import { barBadge, barEventText, hrefText, type BarTone } from '../lib/bar';
import { panelPath } from '../lib/gate';
import type { BarView } from '../lib/server/content';
import { ContentSegs } from './ContentSegs';

const ICONS: Record<BarTone, string | null> = { success: 'success', info: 'info', neutral: null };

/** حال نوار در یک نشان: «روشن تا پنجشنبه 30 مهر» با آیکون، «خاموش» و «تمام شد، 30 مهر» بی آیکون. */
export function BarBadge({ bar, now }: Pick<BarView, 'bar' | 'now'>) {
  const badge = barBadge(bar, now);
  const icon = ICONS[badge.tone];
  return (
    <span className={`jy-badge jy-badge--${badge.tone}`} data-bar-state="">
      {icon ? <span className={`jy-icon jy-icon-${icon}`} aria-hidden="true" /> : null}
      {badge.text}
    </span>
  );
}

/**
 * کارت «نوار اعلان» در «محتوای سایت» (برش ۱۱٫۳، طرح «محتوای سایت (برش ۱۱)»، سؤال ۲۸۲): حال، پیش‌نمایش با ظاهر سایت و عدد امروز، جا و پیوند،
 * آخرین تغییر، و وقتی همهٔ چاپخانه‌ها تعطیل‌اند اینکه پیام تعطیلی جای نوار است (سؤال ۲۹۳). «ویرایش»، و «خاموش کن» بی کد برای نواری که حالا یا
 * بعداً روی سایت است. مالک و متصدی.
 */
export function BarCard({ gate, view }: { gate: string; view: BarView }) {
  const { bar, now, values, event, closedUntil } = view;
  const shown = barShown(bar, now);
  const changed = barEventText(event, now);
  return (
    <section className="jy-card" aria-labelledby="bar-title" data-testid="content-bar">
      <div className="jy-card__head">
        <h2 id="bar-title" className="jy-card__title">
          نوار اعلان
        </h2>
        <BarBadge bar={bar} now={now} />
      </div>
      {bar.text ? (
        <div className="ad-barpv">
          <AnnouncementBar bar={bar} options={{ values, inert: true }} />
        </div>
      ) : null}
      <p className="ad-meta ad-gap">
        {shown ? (
          <>
            بالای همهٔ صفحه‌های سایت، جز پس از انداختن فایل؛ <ContentSegs segs={hrefText(bar.href)} />.
          </>
        ) : bar.text ? (
          'روی سایت نیست.'
        ) : (
          'متنی ندارد؛ با «ویرایش» بنویسش و روشنش کن.'
        )}
        {changed ? ` ${changed}` : null}
      </p>
      {shown && closedUntil ? (
        <p className="jy-note jy-note--warning ad-gap" data-bar-closure="">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            همهٔ چاپخانه‌ها تا {formatDeadlineDay(closedUntil)} تعطیل‌اند؛ تا آن روز پیام تعطیلی جای این نوار روی سایت است، و پس از آن این نوار خودش
            برمی‌گردد.
          </span>
        </p>
      ) : null}
      <div className="ad-actions">
        <Link href={panelPath(gate, '/content/bar')} className="jy-btn jy-btn--secondary">
          ویرایش
        </Link>
        {shown ? (
          <form action={barOffAction}>
            <input type="hidden" name="gate" value={gate} />
            <button type="submit" className="jy-btn jy-btn--text">
              خاموش کن
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
