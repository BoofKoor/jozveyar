import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../../components/Alert';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { PageRemoveForm } from '../../../../../../../components/PageRemoveForm';
import { dayText } from '../../../../../../../lib/format';
import { panelPath } from '../../../../../../../lib/gate';
import { messageOf } from '../../../../../../../lib/messages';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

export const metadata: Metadata = { title: 'از سایت برداشتن' };

/**
 * از سایت برداشتن صفحه‌ای که روی سایت است (برش ۱۵٫۲، ADR-071؛ طرح «از سایت بردار»، سؤال ۴۶۶): «به صفحهٔ دیگری» (۳۰۱) یا «پیدا نشد» (۴۰۴)، که تا
 * متنی روی سایت یا زمان‌دار به صفحه پیوند دارد بسته است، با فهرست همان‌ها؛ نشانی‌هایی که همین حالا به این صفحه می‌روند؛ و کد تازه. فقط مالک.
 */
export default async function PageRemovePage({ params, searchParams }: { params: Promise<{ gate: string; page: string }>; searchParams: Promise<Query> }) {
  const { gate, page: param } = await params;
  const query = await searchParams;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await pages.removeView(session, param);
  const list = panelPath(gate, '/content/pages');
  const error = one(query, 'e');

  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    if (result.error === 'page_not_found') notFound();
    return (
      <>
        <Link href={list} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          صفحه‌ها و مقاله‌ها
        </Link>
        <section className="jy-card ad-measure" aria-labelledby="t-rm">
          <h1 id="t-rm" className="jy-card__title">
            از سایت برداشتن
          </h1>
          <Alert tone="error">{messageOf(error || result.error)}</Alert>
          <div className="ad-actions">
            <Link href={list} className="jy-btn jy-btn--secondary">
              برگرد به صفحه‌ها
            </Link>
          </div>
        </section>
      </>
    );
  }

  const view = result.value;
  const { inbound, redirectsHere, now } = view;
  return (
    <>
      <Link href={list} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        صفحه‌ها و مقاله‌ها
      </Link>
      <section className="jy-card ad-measure" aria-labelledby="t-rm">
        <h1 id="t-rm" className="jy-card__title">
          از سایت برداشتن «{view.name}»
        </h1>
        <p className="ad-sub">
          <bdi className="ad-ltr">{`jozveyar.com/${view.slug}`}</bdi> · روی سایت از {dayText(view.live.liveFrom, now)}، نسخهٔ{' '}
          <span className="num">{formatNumber(view.live.version)}</span>
        </p>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        {inbound.length > 0 ? (
          <div className="jy-note jy-note--info ad-gap" data-testid="page-inbound">
            <span className="jy-icon jy-icon-info" aria-hidden="true" />
            <span>
              <span className="num">{formatNumber(inbound.length)}</span> پیوند روی سایت به این صفحه است:
              <ul className="ad-errs">
                {inbound.map((link, i) => (
                  <li key={i}>
                    «{link.where}»{link.scheduled ? ' (زمان‌دار)' : ''}، به <bdi className="ad-ltr">{link.path}</bdi>
                  </li>
                ))}
              </ul>
              با «به صفحهٔ دیگری» پیوندشان به همان‌جا می‌رسد؛ «پیدا نشد» تا وقتی بسته است که پیوندشان را عوض نکرده‌ای، تا هیچ متنی روی سایت به صفحه‌ای
              که نیست پیوند ندهد.
            </span>
          </div>
        ) : (
          <p className="ad-hint ad-gap">هیچ متنی روی سایت به این صفحه پیوند ندارد. «پیدا نشد» از نقشهٔ سایت و پاورقی هم می‌برد و گوگل کم‌کم از نتیجه‌ها برش می‌دارد.</p>
        )}
        {redirectsHere.length > 0 ? (
          <p className="ad-hint ad-gap">
            {redirectsHere.map((path, i) => (
              <span key={path}>
                {i > 0 ? '، ' : ''}
                <bdi className="ad-ltr">{path}</bdi>
              </span>
            ))}{' '}
            هم همین حالا به این صفحه می‌رود: با «به صفحهٔ دیگری» به همان مقصد، و با «پیدا نشد» آن هم پیدا نمی‌شود.
          </p>
        ) : null}
        <PageRemoveForm
          gate={gate}
          page={view.param}
          version={view.seenVersion}
          targets={view.targets}
          goneBlocked={inbound.length}
          back={list}
        />
      </section>
    </>
  );
}
