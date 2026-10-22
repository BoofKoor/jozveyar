import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../components/Alert';
import { ContentSegs } from '../../../../../components/ContentSegs';
import { NoAccess } from '../../../../../components/NoAccess';
import { PageBadges } from '../../../../../components/PageBadges';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { rowMeta } from '../../../../../lib/pages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import type { PageRow } from '../../../../../lib/server/pages';

export const metadata: Metadata = { title: 'صفحه‌ها و مقاله‌ها' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** پیام پس از کاری که به فهرست برمی‌گردد (`?done=`). */
const DONE: Record<string, string> = {
  deleted: 'پیش‌نویس دور انداخته شد؛ صفحه‌ای که هرگز منتشر نشده بود هم با آن رفت.',
  removed: 'صفحه از سایت برداشته شد؛ تا یک دقیقه بعد نشانی‌اش همان می‌شود که انتخاب کردی.',
};

function Row({ gate, row, now }: { gate: string; row: PageRow; now: Date }) {
  const href = panelPath(gate, `/content/pages/${row.param}`);
  const onSite = row.state.live !== null && row.state.live.content !== null;
  const removable = row.kind === 'landing' && onSite && !row.state.pending;
  return (
    <li data-page={row.param}>
      <span className="ad-texts__name">
        {row.name}
        <PageBadges row={row} />
      </span>
      <span className="ad-texts__meta">
        <ContentSegs segs={rowMeta(row, now)} />
      </span>
      <Link href={href} className="jy-btn jy-btn--secondary">
        {row.draft ? 'ادامهٔ ویرایش' : 'ویرایش'}
      </Link>
      {removable ? (
        <Link href={`${href}/remove`} className="jy-btn jy-btn--text ad-rowact">
          از سایت بردار…
        </Link>
      ) : null}
    </li>
  );
}

/**
 * صفحه‌ها و مقاله‌ها (برش ۱۵٫۲، ADR-071؛ طرح «صفحه‌ها و مقاله‌ها (برش ۱۵)»، سؤال ۴۶۱): «تعرفه» و صفحه‌های فرود، هر کدام با حالش (روی سایت،
 * زمان‌دار با روز و ساعت، پیش‌نویس، برداشته، و هشدار بلوک‌هایی که امروز قیمت ندارند)، «صفحهٔ تازه»، و «نشانی‌های قبلی» که برای همیشه به
 * نشانی تازه می‌روند. مقاله‌ها با ۱۵٫۳. فقط مالک (`content.edit`).
 */
export default async function PagesPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { pages } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'content.edit')) return <NoAccess gate={gate} session={session} />;
  const result = await pages.overview(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, tariff, landings, moved, counts } = result.value;
  const done = DONE[one(query, 'done')];
  const error = one(query, 'e');

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">صفحه‌ها و مقاله‌ها</h1>
          <p className="ad-sub">
            صفحه‌های فرود و «تعرفه»ی <bdi className="ad-ltr">jozveyar.com</bdi>. هر انتشار نسخه‌ای عوض‌نشدنی است و تا یک دقیقه بعد روی سایت.
          </p>
        </div>
        <div className="ad-headbtns">
          <Link href={panelPath(gate, '/content/pages/new')} className="jy-btn jy-btn--primary">
            <span className="jy-icon jy-icon-plus" aria-hidden="true" />
            صفحهٔ تازه
          </Link>
        </div>
      </div>
      {done ? <Alert tone="success">{done}</Alert> : error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <div className="ad-stack">
        <section className="jy-card" aria-labelledby="pages-title">
          <div className="jy-card__head">
            <h2 id="pages-title" className="jy-card__title">
              صفحه‌های فرود
            </h2>
            <span className="jy-card__meta">
              <span className="num">{counts.live}</span> روی سایت · <span className="num">{counts.pending}</span> زمان‌دار ·{' '}
              <span className="num">{counts.drafts}</span> پیش‌نویس
            </span>
          </div>
          <ul className="ad-texts" data-testid="pages-list">
            <Row gate={gate} row={tariff} now={now} />
            {landings.map((row) => (
              <Row key={row.param} gate={gate} row={row} now={now} />
            ))}
          </ul>
          {landings.length === 0 ? (
            <p className="ad-hint ad-gap">هنوز صفحهٔ فرودی نیست. «صفحهٔ تازه» نشانی، تیتر و متن خودش را دارد، با همان کارت بارگذاری و میز سفارش صفحهٔ اصلی.</p>
          ) : null}
        </section>

        <section className="jy-card" aria-labelledby="moved-title">
          <div className="jy-card__head">
            <h2 id="moved-title" className="jy-card__title">
              نشانی‌های قبلی
            </h2>
            <span className="jy-card__meta">برای همیشه به نشانی تازه</span>
          </div>
          <ul className="ad-texts" data-testid="pages-moved">
            <li>
              <span className="ad-texts__name">
                <bdi className="ad-ltr">/chap-jozve</bdi> ← صفحهٔ اصلی
              </span>
              <span className="ad-texts__meta">«چاپ جزوه» خود صفحهٔ اصلی است؛ ثابت سایت، نه از پنل</span>
            </li>
            {moved.map((row) => (
              <li key={row.from}>
                <span className="ad-texts__name">
                  <bdi className="ad-ltr">{row.from}</bdi> ← {row.to === '/' ? 'صفحهٔ اصلی' : <bdi className="ad-ltr">{row.to}</bdi>}
                </span>
                <span className="ad-texts__meta">
                  {row.why === 'slug' ? `نشانی «${row.name}» پس از انتشار عوض شد` : `«${row.name}» از سایت برداشته شد، «به صفحهٔ دیگری»`}
                </span>
              </li>
            ))}
          </ul>
          <p className="ad-hint ad-gap">
            نشانی‌ای که یک بار روی سایت بود هیچ‌وقت ناخواسته «پیدا نشد» نمی‌شود: یا به نشانی تازه می‌رود، یا با «از سایت بردار» خودت انتخاب می‌کنی.
          </p>
        </section>
      </div>
    </>
  );
}
