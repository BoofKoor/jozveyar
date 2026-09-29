import type { Metadata } from 'next';
import Link from 'next/link';

import { POST_FILE_MAX_BYTES } from '@jozveyar/db';

import { Alert } from '../../../../components/Alert';
import { ImportBadge } from '../../../../components/ImportBadge';
import { NoAccess } from '../../../../components/NoAccess';
import { PostFileUpload } from '../../../../components/PostFileUpload';
import { Segments } from '../../../../components/Segments';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { importCounts, importMeta } from '../../../../lib/shipments';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'ارسال' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/**
 * ارسال (طرح پنل `m-ship`، برش ۶٫۱، ADR-045): بارگذاری فایل پست و ورودها، تازه‌ترین اول، با وضعیت، کسی که آورد، روز فایل و شمار
 * حکم‌ها؛ هر ورود پیوند صفحهٔ خودش (پیش‌نمایش، یا نتیجهٔ «ثبت»). مالک و متصدی (`shipments.import`)؛ چاپخانه از ۶٫۲.
 */
export default async function ShipmentsPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'shipments.import')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await shipments.list(session, { page: one(query, 'page') });
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { lines, now, page, more } = result.value;
  const error = one(query, 'e');
  const base = panelPath(gate, '/shipments');

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">ارسال</h1>
          <p className="ad-sub">فایل پست کد رهگیری، وزن و کرایهٔ هر بسته را می‌آورد؛ پیش از ثبت، هر سطر را با حکمش می‌بینی.</p>
        </div>
      </div>
      <div className="ad-stack">
        {error ? (
          <Alert tone="error">{messageOf(error)}</Alert>
        ) : one(query, 'done') === 'discard' ? (
          <Alert tone="success">فایل دور انداخته شد؛ چیزی ثبت نشد.</Alert>
        ) : null}
        <PostFileUpload gate={gate} maxMb={POST_FILE_MAX_BYTES / 1024 / 1024} partner={session.partner?.name ?? null} />

        <section className="jy-card ad-list" aria-labelledby="t-imports">
          <div className="jy-card__head">
            <h2 id="t-imports" className="jy-card__title">
              ورودها
            </h2>
            <span className="jy-card__meta">تازه‌ترین اول</span>
          </div>
          {lines.length === 0 ? (
            <p className="ad-list__sub">هنوز فایل پستی وارد نشده است.</p>
          ) : (
            <ul className="ad-rows" data-imports="">
              {lines.map((line) => (
                <li key={line.id} data-import={line.status}>
                  <Link href={`${base}/${line.id}`} className="ad-imp">
                    <span className="ad-imp__head">
                      <bdi className="ad-imp__name">{line.filename}</bdi>
                      <ImportBadge status={line.status} />
                    </span>
                    <span className="ad-imp__meta">
                      <Segments segs={importMeta(line, now)} />
                    </span>
                    <span className="ad-imp__counts">
                      <Segments segs={importCounts(line)} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {page > 1 || more ? (
            <div className="ad-pager">
              <span>
                صفحهٔ <span className="num">{page}</span>
              </span>
              <span className="ad-pager__nav">
                {page > 1 ? (
                  <Link className="jy-btn jy-btn--text" href={page === 2 ? base : `${base}?page=${page - 1}`}>
                    تازه‌ترها
                  </Link>
                ) : null}
                {more ? (
                  <Link className="jy-btn jy-btn--text" href={`${base}?page=${page + 1}`}>
                    قدیمی‌ترها
                  </Link>
                ) : null}
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
