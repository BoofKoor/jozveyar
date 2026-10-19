import type { Metadata } from 'next';
import Link from 'next/link';

import { barShown } from '@jozveyar/content';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { BarBadge } from '../../../../../components/BarCard';
import { BarForm } from '../../../../../components/BarForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { barEventText, barFormValues } from '../../../../../lib/bar';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'نوار اعلان' };

/** پیام هر کار موفق (`?done=`). */
const DONE: Record<string, string> = {
  on: 'نوار اعلان روشن شد؛ تا یک دقیقه بعد روی سایت است.',
  change: 'نوار اعلان عوض شد؛ تا یک دقیقه بعد روی سایت است.',
  off: 'نوار اعلان خاموش شد؛ تا یک دقیقه بعد از سایت می‌رود.',
  save: 'متن نوار ذخیره شد؛ نوار خاموش است و روی سایت نیست.',
  same: 'چیزی عوض نشد؛ نوار همان است که بود.',
};

/**
 * نوار اعلان (برش ۱۱٫۳، ADR-066؛ طرح «نوار اعلان» در `admin.html`، سؤال‌های ۲۸۷ و ۲۹۱ تا ۲۹۴): مالک و متصدی (`content.bar`). فرم و پیش‌نمایش در
 * `BarForm`؛ نواری که همین حالا جای دیگری عوض شد (`?e=bar_changed`) با حال تازه دوباره ساخته می‌شود.
 */
export default async function BarPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<{ done?: string; e?: string; n?: string }>;
}) {
  const { gate } = await params;
  const { done, e, n } = await searchParams;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.bar')) return <NoAccess gate={gate} session={session} />;
  const result = await content.bar(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, bar, seen, values, event } = result.value;
  const changed = barEventText(event, now);
  const doneText = done ? DONE[done] : undefined;

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">نوار اعلان</h1>
            <BarBadge bar={bar} now={now} />
          </div>
          {changed ? <p className="ad-sub">{changed}</p> : null}
        </div>
      </div>
      {doneText ? (
        <Alert tone="success">{doneText}</Alert>
      ) : e === 'bar_changed' ? (
        <Alert tone="warning">{messageOf(e)}</Alert>
      ) : e ? (
        <Alert tone="error">{messageOf(e)}</Alert>
      ) : null}
      {/* پس از هر کار فرم از نو، با نوار تازه (`n` هر هدایت تازه است). */}
      <BarForm
        key={`${seen}-${n ?? ''}`}
        gate={gate}
        seen={seen}
        initial={barFormValues(bar)}
        values={values}
        canOff={barShown(bar, now)}
        today={formatJalaliNumeric(now)}
        weekLater={formatJalaliNumeric(tehranDayStart(now, 7))}
      />
    </>
  );
}
