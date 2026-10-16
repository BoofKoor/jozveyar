import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../../components/Alert';
import { NoAccess } from '../../../../../../../components/NoAccess';
import { TicketTemplateActivateForm } from '../../../../../../../components/TicketTemplateActivateForm';
import { whenText } from '../../../../../../../lib/format';
import { panelPath } from '../../../../../../../lib/gate';
import { messageOf } from '../../../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { KIND_NAMES } from '../../../../../../../lib/ticketTemplates';

export const metadata: Metadata = { title: 'فعال کردن قالب برگه' };

/** خطاهایی که «فعال کن» با برگشت به همین صفحه می‌گوید (`?e=`): وضع از نو، با پیامش. */
const PAGE_ERRORS = new Set(['template_changed', 'template_not_found', 'template_no_preview', 'forbidden']);

/**
 * فعال کردن یک نسخهٔ قالب، یا برگشت به قالب پیش‌فرض (`default-<نوع>`)، صفحهٔ جدا با کد تازه (برش ۹٫۲، ADR-057؛ مثل فعال کردن تعرفه):
 * چه عوض می‌شود، شمار سفارش‌های «در صف چاپ» که برگه‌شان از نو ساخته می‌شود، و راه برگشت. فقط مالک.
 */
export default async function ActivateTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const home = panelPath(gate, '/settings/templates');
  const result = await templates.activation(session, id);
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    // همین حالا فعال است (دو کلیک، یا برگشت مرورگر پس از فعال شدن): فهرست همان را نشان می‌دهد.
    if (result.error === 'already_active') redirect(home);
    return (
      <>
        <Link href={home} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          قالب برگه‌ها
        </Link>
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این نسخه پیدا نشد
          </h1>
          <p className="ad-lead">نسخه‌ها را در «قالب برگه‌ها» ببین.</p>
        </section>
      </>
    );
  }
  const { now, kind, target, active, queuedOrders, seen } = result.value;
  const name = KIND_NAMES[kind];
  const back = target ? panelPath(gate, `/settings/templates/${target.id}`) : home;
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  const version = (n: number | undefined) =>
    n === undefined ? (
      'قالب پیش‌فرض جزوه‌یار'
    ) : (
      <>
        نسخهٔ <span className="num">{n}</span>
      </>
    );

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        {target ? (
          <>
            نسخهٔ <span className="num">{target.version}</span>
          </>
        ) : (
          'قالب برگه‌ها'
        )}
      </Link>
      <section className="jy-card ad-narrow" aria-labelledby="t-act">
        <h1 id="t-act" className="jy-card__title">
          {target ? (
            <>
              {target.activatedAt ? 'فعال کردن دوبارهٔ' : 'فعال کردن'} {name}، نسخهٔ <span className="num">{target.version}</span>
            </>
          ) : (
            <>برگشت {name} به قالب پیش‌فرض</>
          )}
        </h1>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        <ul className="ad-changes ad-gap" data-changes="">
          <li>
            <span className="ad-changes__k">امروز</span>
            <span>{version(active?.version)}</span>
          </li>
          <li>
            <span className="ad-changes__k">از این لحظه</span>
            <span>{version(target?.version)}</span>
          </li>
          {target?.preview.at ? (
            <li>
              <span className="ad-changes__k">پیش‌نمایشی که دیدی</span>
              <span>
                {target.preview.orderNumber === null ? (
                  'دادهٔ نمونه'
                ) : (
                  <>
                    سفارش <span className="num">{target.preview.orderNumber}</span>
                  </>
                )}
                ، {whenText(target.preview.at, now)} · <span className="num">{target.preview.pages}</span> صفحه
              </span>
            </li>
          ) : null}
        </ul>
        <p className="jy-note jy-note--info ad-gap">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            برگهٔ سفارش‌های تازه با این قالب ساخته می‌شود
            {queuedOrders > 0 ? (
              <>
                ، و برگهٔ <span className="num">{formatNumber(queuedOrders)}</span> سفارش «در صف چاپ» همین حالا از نو
              </>
            ) : null}
            . برگهٔ سفارش‌های در حال چاپ و پست‌شده همان می‌ماند.
          </span>
        </p>
        <p className="ad-hint ad-gap">
          برای برگشت،{' '}
          {active ? (
            <>
              نسخهٔ <span className="num">{active.version}</span> را دوباره فعال کن.
            </>
          ) : (
            'از «قالب برگه‌ها» به قالب پیش‌فرض برگرد.'
          )}
        </p>
        <TicketTemplateActivateForm
          gate={gate}
          id={id}
          active={active?.id ?? null}
          seen={seen}
          back={back}
          label={target ? 'فعال کن' : 'به پیش‌فرض برگرد'}
        />
      </section>
    </>
  );
}
