import type { Metadata } from 'next';
import Link from 'next/link';

import { faqCountOf } from '@jozveyar/content';

import { Alert } from '../../../../components/Alert';
import { BarCard } from '../../../../components/BarCard';
import { ContentSegs } from '../../../../components/ContentSegs';
import { NoAccess } from '../../../../components/NoAccess';
import { kindName, scopeText, stateText } from '../../../../lib/content';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import type { ContentOverviewRow } from '../../../../lib/server/content';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'محتوای سایت' };

/** پیام «خاموش کن» کارت نوار (`?done=`). */
const BAR_DONE: Record<string, string> = {
  off: 'نوار اعلان خاموش شد؛ تا یک دقیقه بعد از سایت می‌رود.',
  same: 'نوار اعلان همین حالا هم خاموش است.',
};

/**
 * محتوای سایت (برش ۱۱٫۱، ADR-065؛ طرح «محتوای سایت (برش ۱۱)»، سؤال ۲۸۲): کارت «نوار اعلان» (۱۱٫۳، مالک و متصدی، `content.bar`) و کارت شش
 * متنی که مالک از پنل عوض می‌کند، هر کدام با حال روی سایت و پیش‌نویس (فقط مالک، `content.edit`).
 */
export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<{ done?: string; e?: string }>;
}) {
  const { gate } = await params;
  const { done, e } = await searchParams;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  const texts = can(session, 'content.edit');
  const bars = can(session, 'content.bar');
  if (!texts && !bars) return <NoAccess gate={gate} session={session} />;
  const [overview, bar] = await Promise.all([texts ? content.overview(session) : null, bars ? content.bar(session) : null]);
  if ((overview && !overview.ok) || (bar && !bar.ok)) return <NoAccess gate={gate} session={session} />;
  const doneText = done ? BAR_DONE[done] : undefined;

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">محتوای سایت</h1>
          <p className="ad-sub">
            متن‌هایی که روی <bdi className="ad-ltr">jozveyar.com</bdi> است. هر تغییری تا یک دقیقه بعد روی سایت است.
          </p>
        </div>
      </div>
      {doneText ? <Alert tone="success">{doneText}</Alert> : e ? <Alert tone="error">{messageOf(e)}</Alert> : null}
      <div className="ad-stack">
        {bar?.ok ? <BarCard gate={gate} view={bar.value} /> : null}
        {overview?.ok ? <TextsCard gate={gate} now={overview.value.now} rows={overview.value.rows} /> : null}
      </div>
    </>
  );
}

/** کارت «متن‌های سایت» (۱۱٫۱)، فقط مالک. */
function TextsCard({ gate, now, rows }: { gate: string; now: Date; rows: readonly ContentOverviewRow[] }) {
  return (
    <section className="jy-card" aria-labelledby="texts-title">
      <div className="jy-card__head">
        <h2 id="texts-title" className="jy-card__title">
          متن‌های سایت
        </h2>
        <span className="jy-card__meta">فقط مالک</span>
      </div>
      <ul className="ad-texts" data-testid="content-texts">
        {rows.map(({ kind, live, draft }) => (
          <li key={kind} data-kind={kind}>
            <span className="ad-texts__name">
              {kindName(kind)}
              {draft ? (
                <span className="jy-badge jy-badge--warning">
                  <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                  پیش‌نویس
                </span>
              ) : null}
            </span>
            <span className="ad-texts__meta">
              <ContentSegs segs={scopeText(kind, faqCountOf(live.content))} /> · <ContentSegs segs={stateText(live.latest, draft, now)} />
            </span>
            <Link href={panelPath(gate, `/content/${kind}`)} className="jy-btn jy-btn--secondary">
              {draft ? 'ادامهٔ ویرایش' : 'ویرایش'}
            </Link>
          </li>
        ))}
      </ul>
      <p className="ad-hint ad-gap">
        عنوان و توضیح گوگل هر صفحه در همان ویرایش است. تعرفه، کارت بارگذاری، میز سفارش و مسیر خرید از تعرفه و کد سایت می‌آیند و اینجا نیستند.
      </p>
    </section>
  );
}
