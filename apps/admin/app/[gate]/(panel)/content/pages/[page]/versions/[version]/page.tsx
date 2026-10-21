import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TARIFF_SLUG, type LandingContent } from '@jozveyar/content';

import { ContentSegs } from '../../../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../../../components/NoAccess';
import { PagePreview } from '../../../../../../../../components/PagePreview';
import { panelPath } from '../../../../../../../../lib/gate';
import { pageVersionMeta, pageVersionName } from '../../../../../../../../lib/pages';
import { can } from '../../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'نسخهٔ صفحه' };

/**
 * «دیدن» یک نسخهٔ صفحه، یا متن پیش‌فرض «تعرفه» (برش ۱۵٫۲): همان پیش‌نمایش ویرایشگر با عدد امروز، و «برگرداندن…» اگر این متن همین حالا روی سایت
 * نیست و زمان‌داری در راه نیست. فقط مالک (`content.edit`).
 */
export default async function PageVersionPage({ params }: { params: Promise<{ gate: string; page: string; version: string }> }) {
  const { gate, page: param, version: versionParam } = await params;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await pages.version(session, param, versionParam);
  if (!result.ok) {
    if (result.error === 'page_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const { kind, version, content, state, facts, now } = result.value;
  const base = panelPath(gate, `/content/pages/${result.value.param}`);
  const isLive = version === null ? state.live === null || state.live.content === null : state.live?.version === version.version;
  const slug = kind === 'tariff' ? TARIFF_SLUG : (content as LandingContent).slug;
  const canRestore = !isLive && !state.pending && (version === null || version.removal === null);

  return (
    <>
      <Link href={`${base}/versions`} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        نسخه‌ها
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">{version ? <ContentSegs segs={pageVersionName(version)} /> : 'متن پیش‌فرض'}</h1>
          <p className="ad-sub">
            <bdi className="ad-ltr">{`jozveyar.com/${slug}`}</bdi>
            {version ? ` · ${pageVersionMeta(version, now)}` : ' · متنی که سایت با خودش دارد'}
            {isLive ? ' · همین حالا روی سایت' : ''}
          </p>
        </div>
        {canRestore ? (
          <Link href={`${base}/publish?from=${version && version.content !== null ? version.version : 'default'}`} className="jy-btn jy-btn--secondary">
            برگرداندن…
          </Link>
        ) : null}
      </div>
      <section className="jy-card ad-pv ad-measure" aria-label="متن این نسخه">
        <PagePreview kind={kind} content={content} facts={facts} />
        <p className="ad-hint ad-gap">عددهای خط‌چین با تعرفهٔ امروزند، نه روزی که این نسخه منتشر شد.</p>
      </section>
    </>
  );
}
