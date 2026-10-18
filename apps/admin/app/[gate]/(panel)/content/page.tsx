import type { Metadata } from 'next';
import Link from 'next/link';

import { faqCountOf } from '@jozveyar/content';

import { ContentSegs } from '../../../../components/ContentSegs';
import { NoAccess } from '../../../../components/NoAccess';
import { kindName, scopeText, stateText } from '../../../../lib/content';
import { panelPath } from '../../../../lib/gate';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'محتوای سایت' };

/**
 * محتوای سایت (برش ۱۱٫۱، ADR-065؛ طرح «محتوای سایت (برش ۱۱)»، سؤال ۲۸۲): شش متنی که مالک از پنل عوض می‌کند، هر کدام با حال روی سایت و
 * پیش‌نویس. فقط مالک (`content.edit`)؛ نوار اعلان (۱۱٫۳) بعداً کارت جدای همین صفحه است.
 */
export default async function ContentPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await content.overview(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, rows } = result.value;

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
      <div className="ad-stack">
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
      </div>
    </>
  );
}
