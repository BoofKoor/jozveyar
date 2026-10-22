import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../../components/Alert';
import { ContentSegs } from '../../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { panelPath } from '../../../../../../../lib/gate';
import { pageVersionMeta, pageVersionName, scheduleText } from '../../../../../../../lib/pages';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

export const metadata: Metadata = { title: 'نسخه‌های صفحه' };

function Badge({ tone, children }: { tone: 'success' | 'info' | 'neutral'; children: React.ReactNode }) {
  const icon = tone === 'success' ? 'jy-icon jy-icon-success' : tone === 'info' ? 'jy-icon jy-icon-info' : null;
  const badge = tone === 'success' ? 'jy-badge jy-badge--success' : tone === 'info' ? 'jy-badge jy-badge--info' : 'jy-badge jy-badge--neutral';
  return (
    <span className={badge}>
      {icon ? <span className={icon} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * نسخه‌های یک صفحه (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۶۵ و ۴۶۶): هر انتشار، زمان‌دار، برگرداندن و برداشتن نسخه‌ای عوض‌نشدنی است، تازه‌ترین اول، با
 * «روی سایت»، «زمان‌دار» و «پس گرفته شد»؛ «برگرداندن…» همان صفحهٔ انتشار با متن آن نسخه است، با سنجش امروز و کد تازه. «تعرفه» متن پیش‌فرض را هم
 * ته فهرست دارد. فقط مالک (`content.edit`).
 */
export default async function PageVersionsPage({ params, searchParams }: { params: Promise<{ gate: string; page: string }>; searchParams: Promise<Query> }) {
  const { gate, page: param } = await params;
  const query = await searchParams;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await pages.versions(session, param);
  if (!result.ok) {
    if (result.error === 'page_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const { kind, detail, state, isDefault, name, now } = result.value;
  const base = panelPath(gate, `/content/pages/${result.value.param}`);
  const versions = detail?.versions ?? [];
  const done = versions.find((row) => String(row.version) === one(query, 'done'));
  const live = state.live;

  return (
    <>
      <Link href={panelPath(gate, '/content/pages')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صفحه‌ها و مقاله‌ها
      </Link>
      <div className="ad-pagehead">
        <h1 className="ad-title">نسخه‌های {name}</h1>
        <Link href={base} className="jy-btn jy-btn--secondary">
          ویرایش
        </Link>
      </div>
      <section className="jy-card ad-measure" aria-label="نسخه‌ها">
        {done ? (
          <Alert tone="success">
            {done.liveFrom.getTime() > now.getTime() ? (
              <>
                نسخهٔ <span className="num">{formatNumber(done.version)}</span> برای {scheduleText(done.liveFrom)} زمان‌دار شد؛ تا آن ساعت روی سایت نیست و تا پیش
                از آن از ویرایش بی کد پس گرفته می‌شود.
              </>
            ) : done.restoredFrom === 0 ? (
              <>
                متن پیش‌فرض برگشت (نسخهٔ <span className="num">{formatNumber(done.version)}</span>)؛ تا یک دقیقه بعد روی سایت است.
              </>
            ) : done.restoredFrom !== null ? (
              <>
                نسخهٔ <span className="num">{formatNumber(done.restoredFrom)}</span> برگشت (نسخهٔ <span className="num">{formatNumber(done.version)}</span>)؛ تا یک
                دقیقه بعد روی سایت است.
              </>
            ) : (
              <>
                نسخهٔ <span className="num">{formatNumber(done.version)}</span> منتشر شد؛ تا یک دقیقه بعد روی سایت است.
              </>
            )}
          </Alert>
        ) : null}
        <ul className="ad-versions ad-gap" data-testid="page-versions">
          {versions.map((row) => {
            const isLive = live?.version === row.version;
            const isPending = state.pending?.version === row.version;
            const restore = row.content === null && row.removal === null ? 'default' : String(row.version);
            // برگرداندن: نسخه‌ای با متن (پس‌گرفته هم)، یا برگشت به پیش‌فرض «تعرفه» وقتی متن دیگری روی سایت است؛ نه همانی که روی سایت است، نه
            // برداشتن، و نه تا زمان‌داری در راه است.
            const canRestore = !isLive && !state.pending && row.removal === null && (row.content !== null || !isDefault);
            return (
              <li key={row.version} data-version={row.version}>
                <span className="ad-versions__name">
                  <ContentSegs segs={pageVersionName(row)} />
                </span>
                {isLive ? <Badge tone="success">{row.removal ? 'همین حالا' : 'روی سایت'}</Badge> : null}
                {isPending ? <Badge tone="info">زمان‌دار</Badge> : null}
                {row.withdrawnAt ? <Badge tone="neutral">پس گرفته شد</Badge> : null}
                {row.removal === null ? (
                  <Link href={`${base}/versions/${row.version}`} className="jy-btn jy-btn--secondary">
                    دیدن
                  </Link>
                ) : null}
                {canRestore ? (
                  <Link href={`${base}/publish?from=${restore}`} className="jy-btn jy-btn--text">
                    برگرداندن…
                  </Link>
                ) : null}
                <span className="ad-versions__meta">{pageVersionMeta(row, now)}</span>
              </li>
            );
          })}
          {kind === 'tariff' ? (
            <li data-version="default">
              <span className="ad-versions__name">متن پیش‌فرض</span>
              {isDefault && !live ? <Badge tone="success">روی سایت</Badge> : null}
              <Link href={`${base}/versions/default`} className="jy-btn jy-btn--secondary">
                دیدن
              </Link>
              {isDefault || state.pending ? null : (
                <Link href={`${base}/publish?from=default`} className="jy-btn jy-btn--text">
                  برگرداندن…
                </Link>
              )}
              <span className="ad-versions__meta">متنی که سایت با خودش دارد؛ با به‌روزرسانی سایت به‌روز می‌شود.</span>
            </li>
          ) : null}
        </ul>
        <p className="ad-hint ad-gap">
          «برگرداندن» متن همان نسخه را با صفحهٔ انتشار، سنجش امروز و کد تازه دوباره منتشر می‌کند و نسخهٔ تازه‌ای می‌سازد. هیچ نسخه‌ای پاک یا عوض
          نمی‌شود، و صفحهٔ برداشته با انتشار دوباره همان نشانی را برمی‌گرداند.
        </p>
      </section>
    </>
  );
}
