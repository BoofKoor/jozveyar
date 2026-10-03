import { notFound } from 'next/navigation';

import { StaticPage } from '../../components/StaticPage';
import { CONTACT, contactLead, contactRows, type ContactRow } from '../../lib/contact';
import { STATIC_PAGES, pageMetadata } from '../../lib/staticPages';

export const generateMetadata = pageMetadata(STATIC_PAGES.contact);

/** مقدار یک ردیف: شماره و ایمیل چپ‌به‌راست و پیوند، و از نشانی فقط کد پستی عدد. */
function Value({ row }: { row: ContactRow }) {
  if (row.kind === 'text') {
    return (
      <>
        {row.value}
        {row.postalCode ? (
          <>
            ، کد پستی <span className="num">{row.postalCode}</span>
          </>
        ) : null}
      </>
    );
  }
  return (
    <a className="jy-link" href={row.href}>
      {row.kind === 'tel' ? <span className="num">{row.value}</span> : <bdi>{row.value}</bdi>}
    </a>
  );
}

/**
 * تماس (برش ۷٫۴، طرح قدم ۵؛ اطلاعات واقعی در مرحلهٔ آخر): هر راه یک ردیف. اطلاعات ساختگی روی سایت زنده نمی‌رود، پس بی
 * `CONTACT` این صفحه ۴۰۴ است و در پاورقی و نقشهٔ سایت نیست (`lib/staticPages.ts`).
 */
export default function ContactPage() {
  if (!CONTACT) notFound();
  return (
    <StaticPage id="contact-title" title="تماس با جزوه‌یار" lead={contactLead(CONTACT)}>
      <dl className="pg-contact">
        {contactRows(CONTACT).map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <Value row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </StaticPage>
  );
}
