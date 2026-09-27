import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert } from '../../../../../../components/Alert';
import { NoAccess } from '../../../../../../components/NoAccess';
import { Segments } from '../../../../../../components/Segments';
import { TariffActivateForm } from '../../../../../../components/TariffActivateForm';
import { panelPath } from '../../../../../../lib/gate';
import { messageOf } from '../../../../../../lib/messages';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';
import { versionOf } from '../../../../../../lib/server/tariff';
import { joinFa } from '../../../../../../lib/tariff';

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }): Promise<Metadata> {
  const version = versionOf((await params).version);
  return { title: version ? `فعال کردن نسخهٔ ${version}` : 'تعرفه' };
}

/** خطاهایی که «فعال کن» با برگشت به همین صفحه می‌گوید (`?e=`): تغییرها از نو، با پیامش. */
const PAGE_ERRORS = new Set(['tariff_changed', 'tariff_not_found', 'invalid_draft', 'forbidden']);

/**
 * فعال کردن یک نسخه، صفحهٔ جدا (طرح پنل `m-tariff-activate`): تغییرها نسبت به نسخهٔ فعال، اثرش روی سایت، و کد تازهٔ
 * برنامهٔ تأیید. برگشت همین است برای نسخهٔ قبل («فعال کردن دوباره»). فقط مالک؛ پیش‌نویسی که ایراد دارد فرم ندارد.
 */
export default async function ActivateTariffPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; version: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, version: param } = await params;
  const query = await searchParams;
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'tariff.edit')) return <NoAccess gate={gate} />;
  const home = panelPath(gate, '/tariff');
  const result = await tariff.activation(session, param);
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} />;
    // همین حالا فعال است (دو کلیک، یا برگشت مرورگر پس از فعال شدن): صفحهٔ تعرفه همان را نشان می‌دهد.
    if (result.error === 'already_active') redirect(home);
    return (
      <>
        <Link href={home} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          تعرفه
        </Link>
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این نسخه پیدا نشد
          </h1>
          <p className="ad-lead">نسخه‌ها را در صفحهٔ تعرفه ببین؛ پیش‌نویسی که پاک شد دیگر نیست.</p>
        </section>
      </>
    );
  }
  const view = result.value;
  const n = view.version.version;
  const back = panelPath(gate, `/tariff/${n}`);
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  const { lines, unchanged } = view.changes;

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        نسخهٔ <span className="num">{n}</span>
      </Link>
      <section className="jy-card ad-narrow" aria-labelledby="t-act">
        <h1 id="t-act" className="jy-card__title">
          {view.again ? 'فعال کردن دوبارهٔ' : 'فعال کردن'} نسخهٔ <span className="num">{n}</span>
        </h1>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        <ul className="ad-changes ad-gap" data-changes="">
          {lines.map((line, i) => (
            <li key={i}>
              <span className="ad-changes__k">
                <Segments segs={line.key} />
              </span>
              <span>
                <Segments segs={line.value} />
              </span>
            </li>
          ))}
          {lines.length === 0 ? (
            <li>
              <span className="ad-changes__k">همهٔ عددها</span>
              <span>مثل نسخهٔ فعال</span>
            </li>
          ) : unchanged.length ? (
            <li>
              <span className="ad-changes__k">{joinFa(unchanged)}</span>
              <span>بی تغییر</span>
            </li>
          ) : null}
        </ul>
        {view.problems.length ? (
          <>
            <div className="ad-issues ad-gap" data-problems="">
              {view.problems.map((problem, i) => (
                <p key={i} className="jy-error">
                  <span className="jy-icon jy-icon-error" aria-hidden="true" />
                  <span>
                    <Segments segs={problem} />
                  </span>
                </p>
              ))}
            </div>
            <p className="jy-note ad-gap">این پیش‌نویس هنوز فعال‌شدنی نیست؛ اول در ویرایشگر درستش کن.</p>
            <div className="ad-actions">
              <Link href={back} className="jy-btn jy-btn--secondary">
                برگشت به پیش‌نویس
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="jy-note jy-note--info ad-gap">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                از همین لحظه، سفارش‌های تازه با نسخهٔ <span className="num">{n}</span> قیمت می‌خورند و صفحهٔ اصلی سایت تا یک دقیقه
                تعرفهٔ تازه را نشان می‌دهد. سفارش‌های ثبت‌شده همان قیمت خودشان را دارند.
              </span>
            </p>
            <p className="ad-hint ad-gap">
              {view.again ? null : 'نسخهٔ فعال‌شده دیگر ویرایش نمی‌شود. '}
              برای برگشت، نسخهٔ <span className="num">{view.active.version}</span> را دوباره فعال کن.
            </p>
            <TariffActivateForm gate={gate} version={n} active={view.active.version} fingerprint={view.fingerprint} back={back} />
          </>
        )}
      </section>
    </>
  );
}
