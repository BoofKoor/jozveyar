import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';

import { TARIFF_SLUG, type DiffSegment, type LandingContent } from '@jozveyar/content';
import { TextContent } from '@jozveyar/content/render';
import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../../components/Alert';
import { ContentSegs } from '../../../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { PagePublishForm } from '../../../../../../../components/PagePublishForm';
import { unchangedText } from '../../../../../../../lib/content';
import { dayText, whenText } from '../../../../../../../lib/format';
import { panelPath } from '../../../../../../../lib/gate';
import { messageOf } from '../../../../../../../lib/messages';
import { newPageSummary, pagePublishTitle, warningLine } from '../../../../../../../lib/pages';
import { can } from '../../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

export const metadata: Metadata = { title: 'انتشار صفحه' };

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
 * انتشار یک صفحه، یا برگرداندن نسخه‌ای قبلی یا متن پیش‌فرض «تعرفه» (برش ۱۵٫۲، ADR-071؛ طرح «انتشار»، سؤال ۴۶۵): «چه عوض می‌شود» بند به بند،
 * همان‌طور که مشتری می‌خواند (یا برای صفحه‌ای که روی سایت نیست یک خط از آنچه می‌آید)، نشانی تازه و ۳۰۱ قبلی، هشدار بلوک‌ها، «همین حالا» یا
 * «در روز و ساعت»، و کد تازه. آخرین نسخه و اثر انگشت همین متن با فرم می‌روند (همان که دیده شد). فقط مالک (`content.edit`).
 */
export default async function PagePublishPage({ params, searchParams }: { params: Promise<{ gate: string; page: string }>; searchParams: Promise<Query> }) {
  const { gate, page: param } = await params;
  const query = await searchParams;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const fromParam = one(query, 'from');
  const error = one(query, 'e');
  const result = await pages.publishView(session, param, fromParam || undefined);
  const editor = panelPath(gate, `/content/pages/${encodeURIComponent(param)}`);
  const restoring = fromParam !== '' && fromParam !== 'draft';
  const back = restoring ? `${editor}/versions` : editor;
  const backLabel = restoring ? 'برگرد به نسخه‌ها' : 'برگرد به ویرایش';

  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    if (result.error === 'page_not_found' && !error) notFound();
    // کاری که دیگر شدنی نیست (همین حالا منتشر شد، پیش‌نویس رفت یا خطا دارد، زمان‌داری در راه است): پیام همان و راه برگشت، بی فرم کد.
    return (
      <>
        <Link href={back} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          {restoring ? 'نسخه‌ها' : 'ویرایش'}
        </Link>
        <section className="jy-card ad-measure" aria-labelledby="t-pub">
          <h1 id="t-pub" className="jy-card__title">
            انتشار
          </h1>
          <Alert tone="error">{messageOf(error || result.error)}</Alert>
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
  const { kind, from, content, live, diff, warnings, now, draft, source } = view;
  const name = kind === 'tariff' ? 'تعرفه' : (content as LandingContent).name;
  const slug = kind === 'tariff' ? TARIFF_SLUG : (content as LandingContent).slug;
  const slugChanged = kind === 'landing' && view.liveSlug !== null && view.liveSlug !== slug;
  const unchanged = diff ? unchangedText(diff.unchanged) : null;
  const what =
    from.type === 'draft'
      ? `پیش‌نویس ${draft ? whenText(draft.updatedAt, now) : ''}`.trim()
      : from.type === 'default' || !source
        ? 'متن پیش‌فرض سایت'
        : `متن نسخهٔ ${formatNumber(source.version)} (${dayText(source.createdAt, now)}، ${source.createdByName})`;
  const where = live && view.liveSlug ? (view.isDefault ? 'متن پیش‌فرض' : 'متن روی سایت') : null;

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        {restoring ? 'نسخه‌ها' : name}
      </Link>
      <section className="jy-card ad-measure" aria-labelledby="t-pub">
        <h1 id="t-pub" className="jy-card__title">
          <ContentSegs segs={pagePublishTitle(name, from)} />
        </h1>
        <p className="ad-sub">
          {where ? (
            <>
              {what} به جای {where}، در <bdi className="ad-ltr">{`jozveyar.com/${slug}`}</bdi>.
            </>
          ) : (
            <>
              صفحه در <bdi className="ad-ltr">{`jozveyar.com/${slug}`}</bdi>، از {what}.
            </>
          )}
        </p>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        {view.staleBase && draft ? (
          <Alert tone="warning">
            این پیش‌نویس از روی{' '}
            {draft.baseVersion === 0 ? (
              'صفحهٔ بی نسخه'
            ) : (
              <>
                نسخهٔ <span className="num">{formatNumber(draft.baseVersion)}</span>
              </>
            )}{' '}
            ساخته شد، ولی آخرین نسخه حالا <span className="num">{formatNumber(view.seenVersion)}</span> است. با انتشار، هر چه در آن عوض شده و در
            پیش‌نویس نیست برمی‌گردد؛ «چه عوض می‌شود» را با دقت ببین.
          </Alert>
        ) : null}

        <h2 className="ad-h2 ad-gap">چه عوض می‌شود</h2>
        <ul className="ad-mddiff" data-testid="page-diff">
          {diff ? (
            diff.changes.map((change, i) => (
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
            ))
          ) : (
            <li className="ad-mddiff__new">
              <span className="ad-mddiff__k">پس از انتشار</span>
              <ContentSegs segs={newPageSummary(kind, content)} />
            </li>
          )}
        </ul>
        {diff?.reordered ? <p className="ad-hint ad-gap">ترتیب سؤال‌ها هم عوض می‌شود.</p> : null}
        {unchanged ? <p className="ad-hint ad-gap">{unchanged}</p> : null}
        {slugChanged ? (
          <Alert tone="info">
            نشانی <bdi className="ad-ltr">{`/${view.liveSlug}`}</bdi> از این پس برای همیشه با ۳۰۱ به <bdi className="ad-ltr">{`/${slug}`}</bdi> می‌رود،
            تا پیوندها و رتبه‌اش در گوگل گم نشوند.
          </Alert>
        ) : null}
        {warnings.map((warning, i) => (
          <Alert key={i} tone="warning">
            <ContentSegs segs={warningLine(warning)} />
          </Alert>
        ))}
        <PagePublishForm
          gate={gate}
          page={view.param}
          from={from.type === 'version' ? String(from.version) : from.type}
          version={view.seenVersion}
          seen={view.seen}
          label={from.type === 'draft' ? 'منتشر کن' : 'برگردان'}
          dayDefault={view.dayDefault}
          back={back}
          backLabel={backLabel}
        />
      </section>
    </>
  );
}
