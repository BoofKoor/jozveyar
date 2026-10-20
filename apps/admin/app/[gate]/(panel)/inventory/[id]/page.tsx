import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';

import { PAPER_SIZE_LABEL } from '@jozveyar/db';

import { Alert } from '../../../../../components/Alert';
import { TrackForm } from '../../../../../components/InventoryForms';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { paperOption } from '../../../../../lib/inventory';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { StockTable } from '../StockTable';

export const metadata: Metadata = { title: 'موجودی کاغذ چاپخانه' };

/**
 * موجودی کاغذ یک چاپخانه (برش ۱۰٫۴، ADR-070؛ سؤال‌های ۴۰۵ و ۴۱۴): کاغذهایش با موجودی، نیاز صف و حال، و «کاغذ تازه» برای کسی که ثبت می‌کند
 * (`inventory.manage`). کاربر چاپخانه فقط چاپخانهٔ خودش؛ چاپخانهٔ دیگر «پیدا نشد». همه بی JS جز فرم.
 */
export default async function PartnerStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate, id } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'inventory.read')) return <NoAccess gate={gate} session={session} />;
  const result = await requirePanel(gate).inventory.partner(session, id);
  const back = session.partner ? null : (
    <Link href={panelPath(gate, '/inventory')} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      همهٔ چاپخانه‌ها
    </Link>
  );
  if (!result.ok) {
    return (
      <>
        {back}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این چاپخانه پیدا نشد
          </h1>
        </section>
      </>
    );
  }
  const { view, papers, canManage } = result.value;
  const { partner, items } = view;
  const error = typeof query.e === 'string' ? query.e : null;
  const choices = papers.flatMap((paper) =>
    paper.sizes.map((size) => ({ value: paperOption(paper.id, size), label: `${paper.name} ${PAPER_SIZE_LABEL[size]}` })),
  );

  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            موجودی کاغذ {partner.name} · {partner.cityName}
          </h1>
          <p className="ad-sub">
            «در صف»: برگی که سفارش‌های در صف چاپ همین چاپخانه از همان کاغذ و اندازه می‌خواهند؛ «پس از صف» موجودی منهای آن است.
          </p>
        </div>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <section className="jy-card" aria-labelledby="t-stock" data-stock="items">
        <h2 id="t-stock" className="jy-card__title">
          کاغذها
        </h2>
        {items.length === 0 ? <p className="ad-lead">هنوز موجودی هیچ کاغذی نگه داشته نمی‌شود.</p> : <StockTable gate={gate} items={items} />}
      </section>
      {canManage ? (
        choices.length > 0 ? (
          <TrackForm target={{ gate, partnerId: partner.id, request: randomUUID() }} papers={choices} />
        ) : (
          <p className="ad-hint ad-gap" data-stock="all-tracked">
            موجودی همهٔ کاغذهای تعرفهٔ فعال در همهٔ اندازه‌هایشان برای این چاپخانه نگه داشته می‌شود.
          </p>
        )
      ) : null}
    </>
  );
}
