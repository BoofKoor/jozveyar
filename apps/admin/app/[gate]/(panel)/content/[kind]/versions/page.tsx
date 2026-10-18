import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KIND_NAMES, type ContentKind } from '@jozveyar/content';

import { Alert } from '../../../../../../components/Alert';
import { ContentSegs } from '../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../components/NoAccess';
import { doneText, versionMeta, versionName } from '../../../../../../lib/content';
import { panelPath } from '../../../../../../lib/gate';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind in KIND_NAMES ? `نسخه‌های ${KIND_NAMES[kind as ContentKind]}` : 'محتوای سایت' };
}

/** نشان «روی سایت». */
function LiveBadge() {
  return (
    <span className="jy-badge jy-badge--success">
      <span className="jy-icon jy-icon-success" aria-hidden="true" />
      روی سایت
    </span>
  );
}

/**
 * نسخه‌های یک متن سایت (برش ۱۱٫۱، ADR-065؛ طرح «نسخه‌ها»، سؤال ۲۸۸): هر انتشار نسخه‌ای عوض‌نشدنی، تازه‌ترین اول، و متن پیش‌فرضی که سایت با
 * خودش دارد ته فهرست. «برگرداندن…» همان صفحهٔ انتشار با متن آن نسخه است: «چه عوض می‌شود» و کد تازه، و نسخهٔ تازه‌ای می‌سازد. نسخه‌ای که
 * خودش برگشت به متن پیش‌فرض بود همان «متن پیش‌فرض» را برمی‌گرداند. فقط مالک (`content.edit`).
 */
export default async function ContentVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; kind: string }>;
  searchParams: Promise<Query>;
}) {
  const { gate, kind: param } = await params;
  const query = await searchParams;
  const { content } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await content.versions(session, param);
  if (!result.ok) {
    if (result.error === 'content_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const { kind, versions, live, now } = result.value;
  const base = panelPath(gate, `/content/${kind}`);
  const done = versions.find((row) => String(row.version) === one(query, 'done'));
  const latest = versions[0];

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <h1 className="ad-title">نسخه‌های {KIND_NAMES[kind]}</h1>
        <Link href={base} className="jy-btn jy-btn--secondary">
          ویرایش
        </Link>
      </div>
      <section className="jy-card ad-measure" aria-label="نسخه‌ها">
        {done ? (
          <Alert tone="success">
            <ContentSegs segs={doneText(kind, done)} />
          </Alert>
        ) : null}
        <ul className="ad-versions ad-gap" data-testid="content-versions">
          {versions.map((row) => {
            const isLatest = row.version === latest?.version;
            const restore = row.content === null ? 'default' : String(row.version);
            // برگرداندن نسخه‌ای که همان متن روی سایت است کاری نمی‌کند؛ نسخه‌ای که برگشت به پیش‌فرض بود، با متن پیش‌فرض روی سایت هم.
            const canRestore = !isLatest && !(row.content === null && live.isDefault);
            return (
              <li key={row.version} data-version={row.version}>
                <span className="ad-versions__name">
                  <ContentSegs segs={versionName(row)} />
                </span>
                {isLatest ? <LiveBadge /> : null}
                <Link href={`${base}/versions/${row.version}`} className="jy-btn jy-btn--secondary">
                  دیدن
                </Link>
                {canRestore ? (
                  <Link href={`${base}/publish?from=${restore}`} className="jy-btn jy-btn--text">
                    برگرداندن…
                  </Link>
                ) : null}
                <span className="ad-versions__meta">{versionMeta(row, isLatest, now)}</span>
              </li>
            );
          })}
          <li data-version="default">
            <span className="ad-versions__name">متن پیش‌فرض</span>
            {live.isDefault && !latest ? <LiveBadge /> : null}
            <Link href={`${base}/versions/default`} className="jy-btn jy-btn--secondary">
              دیدن
            </Link>
            {live.isDefault ? null : (
              <Link href={`${base}/publish?from=default`} className="jy-btn jy-btn--text">
                برگرداندن…
              </Link>
            )}
            <span className="ad-versions__meta">متنی که سایت با خودش دارد؛ با به‌روزرسانی سایت به‌روز می‌شود.</span>
          </li>
        </ul>
        <p className="ad-hint ad-gap">
          «برگرداندن» متن همان نسخه را با صفحهٔ انتشار، «چه عوض می‌شود» و کد تازه دوباره منتشر می‌کند و نسخهٔ تازه‌ای می‌سازد. هیچ نسخه‌ای پاک یا
          عوض نمی‌شود.
        </p>
      </section>
    </>
  );
}
