import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KIND_NAMES, type ContentKind } from '@jozveyar/content';

import { ContentPreview } from '../../../../../../../components/ContentPreview';
import { ContentSegs } from '../../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { versionName } from '../../../../../../../lib/content';
import { whenText } from '../../../../../../../lib/format';
import { panelPath } from '../../../../../../../lib/gate';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind in KIND_NAMES ? `نسخهٔ ${KIND_NAMES[kind as ContentKind]}` : 'محتوای سایت' };
}

/**
 * «دیدن» یک نسخه از متن سایت، یا متن پیش‌فرض (`default`)، با همان پیش‌نمایش ویرایشگر (برش ۱۱٫۱، سؤال ۲۸۸): متن همان نسخه با عدد امروز
 * جای‌نگهدارها، و «برگرداندن…» اگر روی سایت نیست. فقط مالک (`content.edit`).
 */
export default async function ContentVersionPage({ params }: { params: Promise<{ gate: string; kind: string; version: string }> }) {
  const { gate, kind: param, version: versionParam } = await params;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await content.version(session, param, versionParam);
  if (!result.ok) {
    if (result.error === 'content_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const view = result.value;
  const { kind, version, isLive, now } = view;
  const base = panelPath(gate, `/content/${kind}`);
  const restore = version === null || version.content === null ? 'default' : String(version.version);

  return (
    <>
      <Link href={`${base}/versions`} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        نسخه‌های {KIND_NAMES[kind]}
      </Link>
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">{version ? <ContentSegs segs={versionName(version)} /> : 'متن پیش‌فرض'}</h1>
            {isLive ? (
              <span className="jy-badge jy-badge--success">
                <span className="jy-icon jy-icon-success" aria-hidden="true" />
                روی سایت
              </span>
            ) : null}
          </div>
          <p className="ad-sub">
            {KIND_NAMES[kind]} ·{' '}
            {version
              ? `${whenText(version.createdAt, now)}، ${version.createdByName}`
              : 'متنی که سایت با خودش دارد؛ با به‌روزرسانی سایت به‌روز می‌شود.'}
          </p>
        </div>
        {isLive ? null : (
          <Link href={`${base}/publish?from=${restore}`} className="jy-btn jy-btn--secondary">
            برگرداندن…
          </Link>
        )}
      </div>
      <section className="jy-card ad-measure ad-pv" aria-label="متن این نسخه">
        <ContentPreview kind={kind} content={view.content} values={view.values} contactAddress={view.contactAddress} />
        <p className="ad-hint ad-gap">عددهای خط‌چین از جای‌نگهدارند و عدد امروز را دارند، نه عدد روز انتشار.</p>
      </section>
    </>
  );
}
