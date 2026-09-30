import type { Metadata } from 'next';
import Link from 'next/link';

import type { TariffVersion } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { Segments } from '../../../../components/Segments';
import { StatusButton } from '../../../../components/StatusButton';
import { TariffCards } from '../../../../components/TariffCards';
import { whenText } from '../../../../lib/format';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { versionOf } from '../../../../lib/server/tariff';
import { periodsText, type ActivePeriod } from '../../../../lib/tariff';
import { newDraftAction } from '../../actions';

export const metadata: Metadata = { title: 'تعرفه' };

/** خطایی که «نسخهٔ تازه» با برگشت به همین صفحه می‌گوید (`?e=`). */
const PAGE_ERRORS = new Set(['forbidden']);

/** سطر فهرست نسخه‌ها (طرح پنل `m-tariff`): شماره و نام، نشان، کار مالک، و دوره‌ها با شمار سفارش. */
function VersionRow({
  gate,
  version,
  periods,
  canEdit,
  now,
}: {
  gate: string;
  version: TariffVersion;
  periods: ActivePeriod[];
  canEdit: boolean;
  now: Date;
}) {
  const draft = version.activatedAt === null;
  const name = (
    <>
      نسخهٔ <span className="num">{version.version}</span> · {version.label}
    </>
  );
  // نسخهٔ فعال همین صفحه است؛ پیش‌نویس فقط برای مالک باز می‌شود.
  const opens = !version.isActive && (!draft || canEdit);
  const href = panelPath(gate, `/tariff/${version.version}`);
  return (
    <li data-version={version.version}>
      <span className="ad-versions__name">
        {opens ? (
          <Link href={href} className="jy-link">
            {name}
          </Link>
        ) : (
          name
        )}
      </span>
      {version.isActive ? (
        <span className="jy-badge jy-badge--success">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          فعال
        </span>
      ) : draft ? (
        <span className="jy-badge jy-badge--neutral">پیش‌نویس</span>
      ) : null}
      {canEdit && draft ? (
        <Link href={href} className="jy-btn jy-btn--secondary">
          ادامهٔ ویرایش
        </Link>
      ) : canEdit && !version.isActive ? (
        <Link href={panelPath(gate, `/tariff/${version.version}/activate`)} className="jy-btn jy-btn--text">
          دوباره فعال کن…
        </Link>
      ) : null}
      <span className="ad-versions__meta">
        {draft ? (
          <>
            {version.basedOn !== null ? (
              <>
                از روی نسخهٔ <span className="num">{version.basedOn}</span> ·{' '}
              </>
            ) : null}
            {version.createdBy ? `${version.createdBy.name}، ` : ''}
            {whenText(version.createdAt, now)}
          </>
        ) : (
          <>
            <Segments segs={periodsText(periods, version.isActive)} /> · <span className="num">{formatNumber(version.orders)}</span> سفارش با این نسخه
          </>
        )}
      </span>
    </li>
  );
}

/**
 * تعرفه (طرح پنل `m-tariff`، ADR-040): فهرست نسخه‌ها و نسخهٔ فعال فقط‌خواندنی. هر دو نقش می‌بینند؛ «نسخهٔ تازه»، ادامهٔ
 * پیش‌نویس و فعال کردن دوبارهٔ نسخهٔ قبل (برگشت) فقط مالک، و سرور هم هر کدام را خودش می‌سنجد.
 */
export default async function TariffPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'tariff.read')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await tariff.overview(session);
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} partner={session.partner} />;
    return (
      <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
        <h1 id="t-missing" className="jy-card__title">
          تعرفه خوانده نشد
        </h1>
        <p className="ad-lead">{messageOf(result.error)}</p>
      </section>
    );
  }
  const { now, active, versions, periods, draft, canEdit } = result.value;
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  // پیام پس از کار، فقط اگر هنوز راست است: همان نسخه فعال است، یا آن پیش‌نویس دیگر نیست.
  const done = versionOf(query.done);
  const deleted = versionOf(query.deleted);
  const doneNow = done !== null && done === active.version.version;
  const deletedNow = deleted !== null && !versions.some((v) => v.version === deleted);

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">تعرفه</h1>
          <p className="ad-sub">هر تغییر، نسخهٔ تازه است؛ سفارش ثبت‌شده همیشه با نسخهٔ خودش می‌ماند.</p>
        </div>
        {canEdit && draft ? (
          <Link href={panelPath(gate, `/tariff/${draft.version}`)} className="jy-btn jy-btn--primary">
            ادامهٔ پیش‌نویس
          </Link>
        ) : canEdit ? (
          <form action={newDraftAction}>
            <input type="hidden" name="gate" value={gate} />
            <StatusButton className="jy-btn jy-btn--primary">
              <span className="jy-icon jy-icon-plus" aria-hidden="true" />
              نسخهٔ تازه
            </StatusButton>
          </form>
        ) : null}
      </div>
      {error || doneNow || deletedNow ? (
        <div className="ad-flash" data-flash="">
          {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
          {doneNow ? (
            <Alert tone="success">
              نسخهٔ <span className="num">{done}</span> فعال شد. سفارش‌های تازه با همین نسخه قیمت می‌خورند و صفحهٔ اصلی سایت تا
              یک دقیقه تعرفهٔ تازه را نشان می‌دهد.
            </Alert>
          ) : null}
          {deletedNow ? (
            <Alert tone="success">
              پیش‌نویس نسخهٔ <span className="num">{deleted}</span> پاک شد.
            </Alert>
          ) : null}
        </div>
      ) : null}
      <div className="ad-stack">
        <section className="jy-card" aria-labelledby="t-ver">
          <h2 id="t-ver" className="jy-card__title">
            نسخه‌ها
          </h2>
          <ul className="ad-versions">
            {versions.map((version) => (
              <VersionRow
                key={version.version}
                gate={gate}
                version={version}
                periods={periods.get(version.version) ?? []}
                canEdit={canEdit}
                now={now}
              />
            ))}
          </ul>
        </section>
        <TariffCards list={active.list} reportHref={can(session, 'reports.read') ? panelPath(gate, '/shipments/report') : undefined} />
      </div>
    </>
  );
}
