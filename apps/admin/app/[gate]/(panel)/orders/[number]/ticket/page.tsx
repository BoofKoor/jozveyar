import type { Metadata } from 'next';
import Link from 'next/link';

import { NoAccess } from '../../../../../../components/NoAccess';
import { panelPath } from '../../../../../../lib/gate';
import { TICKET_UPDATING_WITH, orderNumberOf, ticketFileName, ticketView } from '../../../../../../lib/orders';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const orderNumber = orderNumberOf((await params).number);
  return { title: orderNumber ? `برگهٔ سفارش ${orderNumber}` : 'برگهٔ سفارش' };
}

/** وقتی برگه آماده نیست: چرا، و راه جلو (همان ردیف صفحهٔ سفارش). */
const NOT_READY = {
  building: 'برگه در حال ساختن است؛ چند ثانیهٔ دیگر دوباره باز کن.',
  failed: 'برگه ساخته نشد؛ از صفحهٔ سفارش «دوباره بساز» را بزن.',
  closed: 'برگهٔ این سفارش ساخته نشد و سفارش دیگر چاپ نمی‌شود.',
  unpaid: 'برگه بعد از پرداخت ساخته می‌شود.',
  purged: 'فایل‌های این سفارش، برگه هم، پس از روزهای نگهداری پاک شده‌اند.',
} as const;

/**
 * برگهٔ سفارش (طرح پنل، `m-ticket`؛ ADR-043): پیش‌نمایش همان PDF کارگر در اندازهٔ A4، و «دانلود PDF». برگه را از همان PDF
 * چاپ کن، نه از این صفحه: مرورگر نشانی صفحه را، با مسیر محرمانهٔ پنل، در حاشیهٔ کاغذ چاپ می‌کند.
 */
export default async function TicketPage({ params }: { params: Promise<{ gate: string; number: string }> }) {
  const { gate, number } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'orders.read') || !can(session, 'files.download')) return <NoAccess gate={gate} />;
  const result = await orders.details(session, number);
  if (!result.ok) {
    return (
      <>
        <Link href={panelPath(gate, '/orders')} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          سفارش‌ها
        </Link>
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این سفارش پیدا نشد
          </h1>
          <p className="ad-lead">شماره را در فهرست سفارش‌ها جست‌وجو کن.</p>
        </section>
      </>
    );
  }
  const { details } = result.value;
  const orderNumber = details.order.orderNumber;
  const self = panelPath(gate, `/orders/${orderNumber}/ticket`);
  const view = ticketView(details);
  const back = (
    <Link href={panelPath(gate, `/orders/${orderNumber}`)} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      سفارش <span className="num">{orderNumber}</span>
    </Link>
  );
  if (view.kind !== 'ready') {
    return (
      <>
        {back}
        <section className="jy-card" aria-labelledby="t-ticket" data-ticket={view.kind}>
          <h1 id="t-ticket" className="jy-card__title">
            برگهٔ سفارش <span className="num">{orderNumber}</span>
          </h1>
          <p className="ad-lead">
            {view.kind === 'updating'
              ? `برگه ${TICKET_UPDATING_WITH[view.cause]} در حال به‌روز شدن است؛ چند ثانیهٔ دیگر دوباره باز کن.`
              : NOT_READY[view.kind]}
          </p>
        </section>
      </>
    );
  }
  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            برگهٔ سفارش <span className="num">{orderNumber}</span>
          </h1>
          <p className="ad-sub">یک برگ A4، سیاه روی سفید، جدا از جزوه. با جزوه چاپش کن؛ برچسب پایینش را ببر و روی بسته بچسبان.</p>
        </div>
        <a className="jy-btn jy-btn--primary" href={`${self}/pdf`} download={`${ticketFileName(orderNumber)}.pdf`}>
          <span className="jy-icon jy-icon-download" aria-hidden="true" />
          دانلود PDF
        </a>
      </div>
      <div className="ad-sheet-wrap">
        <article className="ad-sheet" aria-label={`برگهٔ سفارش ${orderNumber}، پیش‌نمایش`}>
          {/* پیش‌نمایش خصوصی از راه خود پنل (`preview`)، نه بهینه‌ساز تصویر نکست */}
          <img src={`${self}/preview`} alt={`برگهٔ سفارش ${orderNumber}: شماره، مهلت، مشخصات چاپ و برچسب پست`} width={1240} height={1755} />
        </article>
      </div>
    </>
  );
}
