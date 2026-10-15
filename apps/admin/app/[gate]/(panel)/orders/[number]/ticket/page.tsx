import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NoAccess } from '../../../../../../components/NoAccess';
import { Segments } from '../../../../../../components/Segments';
import { panelPath } from '../../../../../../lib/gate';
import { TICKET_UPDATING_WITH, orderNumberOf, ticketFileName, ticketView } from '../../../../../../lib/orders';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';
import { ticketTemplatesSegs } from '../../../../../../lib/ticketTemplates';

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
 * چاپ کن، نه از این صفحه: مرورگر نشانی صفحه را، با مسیر محرمانهٔ پنل، در حاشیهٔ کاغذ چاپ می‌کند. از ۹٫۲ (ADR-057) هر صفحه: بیجک،
 * بعد برگهٔ اول هر جزوه، با قالب‌هایی که برگه با آنها ساخته شد؛ قالب‌ها برای مالک پیوند «قالب برگه‌ها» دارند.
 */
export default async function TicketPage({ params }: { params: Promise<{ gate: string; number: string }> }) {
  const { gate, number } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'orders.read') || !can(session, 'files.download')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await orders.details(session, number);
  // سفارشی که نیست یا بیرون از محدوده است (۵٫۳): همان ۴۰۴ صفحهٔ سفارش.
  if (!result.ok) notFound();
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
  const ticket = details.ticket!;
  const pages = Array.from({ length: ticket.pageCount }, (_, i) => i + 1);
  const templates = ticketTemplatesSegs(ticket.templates);
  return (
    <>
      {back}
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            برگهٔ سفارش <span className="num">{orderNumber}</span>
          </h1>
          <p className="ad-sub">
            {ticket.pageCount > 1 ? (
              <>
                <span className="num">{ticket.pageCount}</span> برگ A4، سیاه روی سفید، جدا از جزوه: اول بیجک روی بسته، بعد برگهٔ اول هر جزوه روی
                دستهٔ همان. برچسب پایین بیجک را ببر و روی بسته بچسبان.
              </>
            ) : (
              'یک برگ A4، سیاه روی سفید، جدا از جزوه. با جزوه چاپش کن؛ برچسب پایینش را ببر و روی بسته بچسبان.'
            )}
          </p>
          <p className="ad-hint" data-ticket-templates="">
            قالب‌ها: {can(session, 'templates.manage') ? (
              <Link href={panelPath(gate, '/settings/templates')}>
                <Segments segs={templates} />
              </Link>
            ) : (
              <Segments segs={templates} />
            )}
          </p>
        </div>
        <a className="jy-btn jy-btn--primary" href={`${self}/pdf`} download={`${ticketFileName(orderNumber)}.pdf`}>
          <span className="jy-icon jy-icon-download" aria-hidden="true" />
          دانلود PDF
        </a>
      </div>
      <div className="ad-sheet-wrap">
        {pages.map((page) => (
          <article key={page} className="ad-sheet" aria-label={`برگهٔ سفارش ${orderNumber}، پیش‌نمایش صفحهٔ ${page} از ${ticket.pageCount}`}>
            {/* پیش‌نمایش خصوصی از راه خود پنل (`preview`)، نه بهینه‌ساز تصویر نکست */}
            <img
              src={page === 1 ? `${self}/preview` : `${self}/preview?page=${page}`}
              alt={
                page === 1
                  ? `برگهٔ سفارش ${orderNumber}: شماره، مهلت، مشخصات چاپ و برچسب پست`
                  : `برگهٔ سفارش ${orderNumber}، صفحهٔ ${page} از ${ticket.pageCount}`
              }
              width={1241}
              height={1754}
              loading={page === 1 ? undefined : 'lazy'}
            />
          </article>
        ))}
      </div>
    </>
  );
}
