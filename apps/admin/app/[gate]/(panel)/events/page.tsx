import type { Metadata } from 'next';
import Link from 'next/link';

import { formatTehranTime } from '@jozveyar/text';

import { NoAccess } from '../../../../components/NoAccess';
import { byDay, EVENT_KINDS, eventLines, type Segment } from '../../../../lib/events';
import { dayHeading } from '../../../../lib/format';
import { panelPath } from '../../../../lib/gate';
import { can, EVENTS_PAGE } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';

export const metadata: Metadata = { title: 'رویدادها' };

const BADGES = { login_failed: 'ورود ناموفق', code_failed: 'کد نادرست' } as const;

function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === 'string' ? (
          segment
        ) : (
          <bdi key={index} className="ad-ltr">
            {segment.ltr}
          </bdi>
        ),
      )}
    </>
  );
}

/**
 * رویدادها (طرح پنل، ADR-038): هر کار ادمین، چه کسی، کی، چه کاری؛ تازه‌ترین اول، روزبه‌روز، صفحه‌ای ۵۰
 * رویداد. مقدار کلید و رمز هرگز. فقط مالک.
 */
export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'events.read')) return <NoAccess gate={gate} partner={session.partner} />;

  const kind = typeof query.kind === 'string' && EVENT_KINDS.some((k) => k.kind === query.kind) ? query.kind : '';
  const before = typeof query.before === 'string' && /^\d{1,15}$/.test(query.before) ? Number(query.before) : undefined;
  const result = await auth.listEvents(session, { ...(kind ? { kind } : {}), ...(before ? { beforeId: before } : {}) });
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const events = result.value;
  const days = byDay(eventLines(events));
  const now = new Date();
  const base = panelPath(gate, '/events');
  const hrefOf = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) => (value === undefined || value === '' ? [] : [[key, String(value)]])),
    ).toString();
    return search ? `${base}?${search}` : base;
  };
  const older = events.length === EVENTS_PAGE ? events.at(-1)!.id : undefined;

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">رویدادها</h1>
          <p className="ad-sub">هر کار ادمین: چه کسی، کی، چه کاری. مقدار کلیدها هرگز.</p>
        </div>
      </div>
      <nav className="ad-chips" aria-label="نوع رویداد">
        {EVENT_KINDS.map((item) => (
          <Link
            key={item.kind}
            className="ad-chip"
            href={hrefOf({ kind: item.kind })}
            aria-current={item.kind === kind ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {days.length === 0 ? (
        <section className="jy-card">
          <p className="ad-lead">{before ? 'رویداد قدیمی‌تری نیست.' : 'هنوز رویدادی نیست.'}</p>
        </section>
      ) : (
        days.map((day) => (
          <section key={day.day} className="jy-card ad-days-log" aria-label={dayHeading(day.at, now)}>
            <h2 className="jy-card__title">{dayHeading(day.at, now)}</h2>
            <ol className="ad-log">
              {day.lines.map((line) => (
                <li key={line.id} data-action={line.badge ?? undefined}>
                  <span className="ad-log__when">
                    <span className="num">{formatTehranTime(line.at)}</span>
                    {line.who ? ` · ${line.who}` : ''}
                  </span>
                  <span>
                    {line.badge ? (
                      <span className="jy-badge jy-badge--warning">
                        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                        {BADGES[line.badge]}
                      </span>
                    ) : null}
                    {line.count > 1 ? (
                      <>
                        <span className="num">{line.count}</span> بار{' '}
                      </>
                    ) : null}
                    <Text segments={line.text} />
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
      {older ? (
        <div className="ad-pager">
          <Link className="jy-btn jy-btn--text" href={hrefOf({ kind, before: older })}>
            قدیمی‌تر
          </Link>
        </div>
      ) : null}
    </>
  );
}
