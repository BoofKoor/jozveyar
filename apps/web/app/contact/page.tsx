import { notFound } from 'next/navigation';

import { contactLead, contactRows, hasContact, type ContactRow } from '@jozveyar/content';

import { StaticPage } from '../../components/StaticPage';
import { liveText, sitePublished } from '../../lib/server/content';
import { pageMetadata } from '../../lib/server/pageMetadata';

/** ISR ۶۰ ثانیه، مثل صفحه‌های دیگر: راه‌های تماس از «تماس و پاورقی» پنل (۱۱٫۱). */
export const revalidate = 60;

export const generateMetadata = pageMetadata('contact');

/** مقدار یک ردیف: شماره، ایمیل و شناسه چپ‌به‌راست و پیوند، و از نشانی فقط کد پستی عدد. */
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
  // تلگرام و اینستاگرام تنها پیوندهای بیرونی سایت‌اند (سؤال ۲۹۰)، با نشانی‌ای که سایت از شناسه ساخت؛ در زبانهٔ تازه.
  const external = row.kind === 'social' ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a className="jy-link" href={row.href} {...external}>
      {row.kind === 'tel' ? <span className="num">{row.value}</span> : <bdi>{row.value}</bdi>}
    </a>
  );
}

/**
 * تماس (برش ۷٫۴، طرح قدم ۵؛ از ۱۱٫۱ از پنل، سؤال ۲۹۰): هر راهی که مالک گذاشته یک ردیف، به ترتیب طرح. اطلاعات ساختگی روی سایت زنده نمی‌رود،
 * پس بی هیچ راه تماسی این صفحه ۴۰۴ است و در پاورقی و نقشهٔ سایت نیست (`hasContact`).
 */
export default async function ContactPage() {
  const contact = liveText('contact', await sitePublished()).content;
  if (!hasContact(contact)) notFound();
  return (
    <StaticPage id="contact-title" title="تماس با جزوه‌یار" lead={contactLead(contact)}>
      <dl className="pg-contact">
        {contactRows(contact).map((row) => (
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
