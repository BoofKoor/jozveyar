import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import { KIND_NAMES, type ContentKind, type DiffSegment } from '@jozveyar/content';
import { TextContent } from '@jozveyar/content/render';
import { formatJalaliNumeric, formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../components/Alert';
import { ContentPublishForm } from '../../../../../../components/ContentPublishForm';
import { ContentSegs } from '../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../components/NoAccess';
import { keepNote, publishEffect, publishLabel, publishLead, publishTitle, unchangedText } from '../../../../../../lib/content';
import { panelPath } from '../../../../../../lib/gate';
import { messageOf } from '../../../../../../lib/messages';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const ERRORS = new Set(['forbidden', 'content_not_found', 'content_no_draft', 'content_invalid', 'content_unchanged', 'content_changed']);

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: kind in KIND_NAMES ? `انتشار ${KIND_NAMES[kind as ContentKind]}` : 'محتوای سایت' };
}

/** متن یک بند با واژه‌های افزوده (`ins`) و برداشته (`del`)؛ عدد و واژهٔ لاتین مثل خود سایت (`TextContent`). */
function Segments({ segments }: { segments: readonly DiffSegment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.mark === 'ins' ? (
          <ins key={i}>
            <TextContent text={segment.text} />
          </ins>
        ) : segment.mark === 'del' ? (
          <del key={i}>
            <TextContent text={segment.text} />
          </del>
        ) : (
          <TextContent key={i} text={segment.text} />
        ),
      )}
    </>
  );
}

/**
 * انتشار یک متن سایت، یا برگرداندن نسخه‌ای قبلی یا متن پیش‌فرض (برش ۱۱٫۱، ADR-065؛ طرح «انتشار»، سؤال‌های ۲۸۶ تا ۲۸۸): «چه عوض می‌شود» بند
 * به بند، همان‌طور که مشتری می‌خواند (عدد امروز جای‌نگهدارها، بی نشانهٔ Markdown)، اثرش روی سایت، و کد تازه. پیش‌نویسی که از روی نسخهٔ دیگری
 * ساخته شد هشدار دارد. نسخهٔ روی سایت و اثر انگشت همین متن با فرم می‌روند (همان که دیده شد). فقط مالک (`content.edit`).
 */
export default async function ContentPublishPage({
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
  const fromParam = one(query, 'from');
  const error = ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const result = await content.publishView(session, param, fromParam || undefined);
  const editor = panelPath(gate, `/content/${encodeURIComponent(param)}`);
  const restoring = fromParam !== '' && fromParam !== 'draft';
  const back = restoring ? `${editor}/versions` : editor;
  const backLabel = restoring ? 'برگرد به نسخه‌ها' : 'برگرد به ویرایش';

  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    if (result.error === 'content_not_found' && !error) notFound();
    // کاری که دیگر شدنی نیست (همین حالا منتشر شد، پیش‌نویس رفت یا خطا دارد): پیام همان و راه برگشت، بی فرم کد.
    return (
      <>
        <Link href={back} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          {restoring ? 'نسخه‌ها' : (KIND_NAMES[param as ContentKind] ?? 'محتوای سایت')}
        </Link>
        <section className="jy-card ad-measure" aria-labelledby="t-pub">
          <h1 id="t-pub" className="jy-card__title">
            انتشار {KIND_NAMES[param as ContentKind] ?? ''}
          </h1>
          <Alert tone="error">{messageOf(error ?? result.error)}</Alert>
          <div className="ad-actions">
            <Link href={back} className="jy-btn jy-btn--secondary">
              {backLabel}
            </Link>
          </div>
        </section>
      </>
    );
  }

  const view = result.value;
  const { kind, from, live, draft, diff, now } = view;
  const unchanged = unchangedText(diff.unchanged);
  const today = formatJalaliNumeric(now);

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        {restoring ? 'نسخه‌ها' : KIND_NAMES[kind]}
      </Link>
      <section className="jy-card ad-measure" aria-labelledby="t-pub">
        <h1 id="t-pub" className="jy-card__title">
          <ContentSegs segs={publishTitle(kind, from)} />
        </h1>
        <p className="ad-sub">
          <ContentSegs segs={publishLead(from, live, draft, view.source, now)} />
        </p>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        {view.staleBase && draft ? (
          <Alert tone="warning">
            این پیش‌نویس از روی{' '}
            {draft.baseVersion === 0 ? (
              'متن پیش‌فرض'
            ) : (
              <>
                نسخهٔ <span className="num">{formatNumber(draft.baseVersion)}</span>
              </>
            )}{' '}
            ساخته شد، ولی روی سایت حالا{' '}
            {live.isDefault || !live.latest ? (
              'متن پیش‌فرض'
            ) : (
              <>
                نسخهٔ <span className="num">{formatNumber(live.latest.version)}</span>
              </>
            )}{' '}
            است. با انتشار، هر چه در آن عوض شده و در پیش‌نویس نیست برمی‌گردد؛ «چه عوض می‌شود» را با دقت ببین.
          </Alert>
        ) : null}

        <h2 className="ad-h2 ad-gap">چه عوض می‌شود</h2>
        <ul className="ad-mddiff" data-testid="content-diff">
          {diff.changes.map((change, i) => (
            <Fragment key={i}>
              <li className="ad-mddiff__sec">
                <TextContent text={change.section} />
              </li>
              {change.before ? (
                <li className="ad-mddiff__old">
                  <span className="ad-mddiff__k">روی سایت</span>
                  <Segments segments={change.before} />
                </li>
              ) : null}
              <li className="ad-mddiff__new">
                <span className="ad-mddiff__k">پس از انتشار</span>
                {change.after ? <Segments segments={change.after} /> : 'برداشته می‌شود.'}
              </li>
            </Fragment>
          ))}
        </ul>
        {diff.reordered ? <p className="ad-hint ad-gap">ترتیب سؤال‌ها هم عوض می‌شود.</p> : null}
        {unchanged ? <p className="ad-hint ad-gap">{unchanged}</p> : null}
        <Alert tone="info">
          <ContentSegs segs={publishEffect(kind, today)} />
        </Alert>
        <p className="ad-hint ad-gap">
          <ContentSegs segs={keepNote(live)} />
        </p>
        <ContentPublishForm
          gate={gate}
          kind={kind}
          from={from.type === 'version' ? String(from.version) : from.type}
          live={view.seenLive}
          seen={view.seen}
          label={publishLabel(from)}
          back={back}
          backLabel={backLabel}
        />
      </section>
    </>
  );
}
