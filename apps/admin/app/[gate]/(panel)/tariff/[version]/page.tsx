import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { Segments } from '../../../../../components/Segments';
import { TariffCards } from '../../../../../components/TariffCards';
import { TariffEditor } from '../../../../../components/TariffEditor';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { versionOf } from '../../../../../lib/server/tariff';
import { periodsText } from '../../../../../lib/tariff';

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }): Promise<Metadata> {
  const version = versionOf((await params).version);
  return { title: version ? `نسخهٔ ${version} تعرفه` : 'تعرفه' };
}

/** خطاهایی که «حذف پیش‌نویس» با برگشت به همین صفحه می‌گوید (`?e=`). */
const PAGE_ERRORS = new Set(['forbidden', 'not_draft', 'tariff_not_found']);

/**
 * یک نسخهٔ تعرفه: پیش‌نویس در ویرایشگر (طرح پنل `m-tariff-draft` و `m-tariff-invalid`، فقط مالک)، یا نسخه‌ای که پیش‌تر
 * فعال بود فقط‌خواندنی، با «دوباره فعال کن…» برای مالک (برگشت). نسخهٔ فعال خود صفحهٔ تعرفه است.
 */
export default async function TariffVersionPage({
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
  if (!can(session, 'tariff.read')) return <NoAccess gate={gate} partner={session.partner} />;
  const home = panelPath(gate, '/tariff');
  const back = (
    <Link href={home} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      تعرفه
    </Link>
  );
  const result = await tariff.version(session, param);
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} partner={session.partner} />;
    return (
      <>
        {back}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این نسخه پیدا نشد
          </h1>
          <p className="ad-lead">نسخه‌ها را در صفحهٔ تعرفه ببین؛ پیش‌نویسی که پاک شد دیگر نیست.</p>
        </section>
      </>
    );
  }
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;

  if (result.value.kind === 'version') {
    const { version, list, periods, canEdit } = result.value.view;
    if (version.isActive) redirect(home);
    return (
      <>
        {back}
        <div className="ad-pagehead">
          <div>
            <h1 className="ad-title">
              نسخهٔ <span className="num">{version.version}</span> · {version.label}
            </h1>
            <p className="ad-sub">
              <Segments segs={periodsText(periods, false)} /> · <span className="num">{formatNumber(version.orders)}</span> سفارش با این
              نسخه
            </p>
          </div>
          {canEdit ? (
            <Link href={panelPath(gate, `/tariff/${version.version}/activate`)} className="jy-btn jy-btn--secondary">
              دوباره فعال کن…
            </Link>
          ) : null}
        </div>
        {error ? (
          <div className="ad-flash">
            <Alert tone="error">{messageOf(error)}</Alert>
          </div>
        ) : null}
        <TariffCards list={list} />
      </>
    );
  }

  const view = result.value.view;
  const { version } = view;
  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">
              نسخهٔ <span className="num">{version.version}</span>
            </h1>
            <span className="jy-badge jy-badge--neutral">پیش‌نویس</span>
          </div>
          <p className="ad-sub">
            {version.basedOn !== null ? (
              <>
                از روی نسخهٔ <span className="num">{version.basedOn}</span> ·{' '}
              </>
            ) : null}
            {version.createdBy ? `${version.createdBy.name}، ` : ''}
            {whenText(version.createdAt, view.now)}
          </p>
        </div>
      </div>
      {error ? (
        <div className="ad-flash">
          <Alert tone="error">{messageOf(error)}</Alert>
        </div>
      ) : null}
      <TariffEditor
        key={view.fingerprint}
        gate={gate}
        version={version.version}
        initial={view.form}
        fingerprint={view.fingerprint}
        base={view.list}
        active={view.active.list}
        saved={query.saved === '1'}
        activateHref={panelPath(gate, `/tariff/${version.version}/activate`)}
      />
    </>
  );
}
