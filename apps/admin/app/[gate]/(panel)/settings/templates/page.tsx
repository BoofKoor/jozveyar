import type { Metadata } from 'next';
import Link from 'next/link';

import type { TicketTemplateVersion } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { TicketTemplateUpload } from '../../../../../components/TicketTemplateUpload';
import { whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import {
  KIND_HINTS,
  KIND_NAMES,
  defaultRef,
  isTemplateKind,
  variableName,
  type TicketTemplateKind,
} from '../../../../../lib/ticketTemplates';
import { TICKET_TEMPLATE_VARIABLES } from '../../../../../lib/ticketTemplates.generated';

export const metadata: Metadata = { title: 'قالب برگه‌ها' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** حال پیش‌نمایش یک نسخه، کوتاه، برای فهرست. */
function previewBadge(version: TicketTemplateVersion) {
  const { preview } = version;
  if (preview.job === 'busy') return <span className="jy-badge jy-badge--neutral">پیش‌نمایش در حال ساختن</span>;
  if (preview.error) return <span className="jy-badge jy-badge--error">قالب ساخته نشد</span>;
  if (preview.at && preview.pages) return <span className="jy-badge jy-badge--info">پیش‌نمایش درست</span>;
  return <span className="jy-badge jy-badge--warning">بی پیش‌نمایش</span>;
}

function VersionRow({ gate, version, now }: { gate: string; version: TicketTemplateVersion; now: Date }) {
  const href = panelPath(gate, `/settings/templates/${version.id}`);
  return (
    <li data-template={version.id}>
      <span className="ad-versions__name">
        <Link href={href} className="jy-link">
          نسخهٔ <span className="num">{version.version}</span>
        </Link>{' '}
        · <bdi>{version.fileName}</bdi>
      </span>
      {version.isActive ? (
        <span className="jy-badge jy-badge--success">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          فعال
        </span>
      ) : (
        previewBadge(version)
      )}
      <span className="ad-versions__meta">
        <span className="num">{formatNumber(Math.max(1, Math.round(version.sizeBytes / 1024)))}</span> کیلوبایت · بارگذاری {version.createdBy}،{' '}
        {whenText(version.createdAt, now)}
        {version.activatedAt ? <> · اولین فعال شدن {whenText(version.activatedAt, now)}</> : null}
      </span>
    </li>
  );
}

/**
 * قالب برگه‌ها (برش ۹٫۲، ADR-057؛ سؤال‌های ۱۹۳ و ۱۹۴): برای هر نوع، بیجک و برگهٔ اول، قالب فعال (یا پیش‌فرض جزوه‌یار)، نسخه‌ها، بارگذاری
 * نسخهٔ تازه، و دانلود قالب پیش‌فرض برای شروع؛ پایین فهرست متغیرها با توضیح فارسی. فقط مالک (`templates.manage`)، و سرور هر کار را خودش
 * می‌سنجد. فعال کردن و برگشت در صفحهٔ جدا با کد تازه.
 */
export default async function TemplatesPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await templates.overview(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, kinds } = result.value;

  // پیام فقط وقتی با وضع امروز می‌خواند (مثل «تنظیمات»)، تا نشانی ساختگی متن دلخواه نشاند.
  const done = one(query, 'done');
  const doneKind = one(query, 'k');
  const doneView = isTemplateKind(doneKind) ? kinds.find((k) => k.kind === doneKind) : undefined;
  const requeued = /^[0-9]{1,6}$/.test(one(query, 'r')) ? Number(one(query, 'r')) : 0;
  const rebuilt =
    requeued > 0 ? (
      <>
        {' '}
        برگهٔ <span className="num">{formatNumber(requeued)}</span> سفارش «در صف چاپ» با آن از نو ساخته می‌شود.
      </>
    ) : null;
  const flash =
    doneView && done === 'activate' && doneView.active && String(doneView.active.version) === one(query, 'v') ? (
      <Alert tone="success">
        نسخهٔ <span className="num">{doneView.active.version}</span> {KIND_NAMES[doneView.kind]} فعال شد؛ برگهٔ سفارش‌های تازه با همین ساخته می‌شود.
        {rebuilt}
      </Alert>
    ) : doneView && done === 'default' && !doneView.active ? (
      <Alert tone="success">
        {KIND_NAMES[doneView.kind]} به قالب پیش‌فرض جزوه‌یار برگشت.{rebuilt}
      </Alert>
    ) : null;

  return (
    <>
      <Link href={panelPath(gate, '/settings')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        تنظیمات
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">قالب برگه‌ها</h1>
          <p className="ad-sub">
            برگه‌های چاپی هر سفارش، در یک PDF: اول بیجک روی بسته، بعد برگهٔ اول هر جزوه روی دستهٔ همان. لوگو، فرستنده و چیدمان مال قالب‌اند؛
            دادهٔ سفارش (بی مبلغ) از متغیرهای پایین.
          </p>
        </div>
      </div>
      {flash ? <div className="ad-flash">{flash}</div> : null}
      <div className="ad-stack">
        {kinds.map(({ kind, active, versions }) => (
          <section key={kind} className="jy-card" aria-labelledby={`t-${kind}`} data-kind={kind}>
            <div className="jy-card__head">
              <h2 id={`t-${kind}`} className="jy-card__title">
                {KIND_NAMES[kind]}
              </h2>
              <span className="jy-card__meta">{KIND_HINTS[kind]}</span>
            </div>
            <ul className="ad-versions">
              {versions.map((version) => (
                <VersionRow key={version.id} gate={gate} version={version} now={now} />
              ))}
              <li data-template={defaultRef(kind)}>
                <span className="ad-versions__name">قالب پیش‌فرض جزوه‌یار</span>
                {active ? null : (
                  <span className="jy-badge jy-badge--success">
                    <span className="jy-icon jy-icon-success" aria-hidden="true" />
                    فعال
                  </span>
                )}
                {active ? (
                  <Link href={panelPath(gate, `/settings/templates/${defaultRef(kind)}/activate`)} className="jy-btn jy-btn--text">
                    برگشت به پیش‌فرض…
                  </Link>
                ) : null}
                <span className="ad-versions__meta">
                  سیاه روی سفید، همان برگهٔ تا امروز.{' '}
                  <a href={panelPath(gate, `/settings/templates/${defaultRef(kind)}/source`)} download className="jy-link">
                    دانلود قالب
                  </a>{' '}
                  برای شروع قالب خودت.
                </span>
              </li>
            </ul>
            <TicketTemplateUpload gate={gate} kind={kind} />
          </section>
        ))}
        <details className="jy-card ad-vars" data-vars="">
          <summary className="jy-card__title">متغیرهای قالب</summary>
          <p className="ad-hint">
            قالب Jinja2 است: <bdi className="ad-ltr">{'{{ order.number }}'}</bdi>، <bdi className="ad-ltr">{'{% for f in order.files %}'}</bdi>. هر مقدار
            سفارش متن است، نه HTML. فقط نشانی <bdi className="ad-ltr">data:</bdi> بار می‌شود؛ عکس و فونت را درون قالب بگذار. مبلغ در داده نیست.
          </p>
          {TICKET_TEMPLATE_VARIABLES.map((group) => (
            <section key={group.title} className="ad-vars__group">
              <h3 className="ad-vars__title">
                {group.title}
                {group.in.length === 1 ? <span className="jy-badge jy-badge--neutral">فقط {KIND_NAMES[group.in[0] as TicketTemplateKind]}</span> : null}
              </h3>
              <dl className="ad-vars__list">
                {group.fields.map(([field, text, example]) => (
                  <div key={field}>
                    <dt>
                      <bdi className="ad-ltr">{variableName(group.prefix, field)}</bdi>
                    </dt>
                    <dd>
                      {text} <span className="ad-vars__example">نمونه: <bdi>{example}</bdi></span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </details>
      </div>
    </>
  );
}
