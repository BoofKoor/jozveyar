import { StaticPage } from '../../components/StaticPage';
import { CONTACT } from '../../lib/contact';
import { siteFacts } from '../../lib/server/siteFacts';
import { STATIC_PAGES, pageMetadata } from '../../lib/staticPages';

/** مثل صفحهٔ اصلی ISR ۶۰ ثانیه: روز کاری تحویل از `settings` (`lib/server/siteFacts.ts`). */
export const revalidate = 60;

export const generateMetadata = pageMetadata(STATIC_PAGES.about);

/**
 * دربارهٔ ما (برش ۷٫۴): جزوه‌یار چیست و چطور کار می‌کند، از روی خود سایت و صفحهٔ اصلی («سه قدم»، تعرفه، سؤال‌ها). نام کسب‌وکار
 * همان جزوه‌یار است، و نشانی از اطلاعات تماس واقعی (`lib/contact.ts`، مرحلهٔ آخر) می‌آید، نه نسخهٔ دوم آن؛ بی نشانی بخشش نمی‌آید.
 */
export default async function AboutPage() {
  const { slaDays } = await siteFacts();
  return (
    <StaticPage
      id="about-title"
      title="دربارهٔ جزوه‌یار"
      lead="جزوه‌یار سایت سفارش آنلاین چاپ و صحافی جزوه است: فایل را می‌اندازی، قیمت را همان لحظه می‌بینی، و جزوهٔ چاپ‌شده با پست به دستت می‌رسد."
    >
      <h2>چطور کار می‌کند</h2>
      <ul>
        <li>
          فایل جزوه را در صفحهٔ اصلی بینداز: <bdi>PDF</bdi>، <bdi>Word</bdi>، پاورپوینت یا عکس؛ چند فایل هم در یک جزوه، با یک
          صحافی.
        </li>
        <li>
          صفحه‌ها و صفحه‌های رنگی را سایت خودش می‌شمارد و قیمت را پیش از هر ثبت‌نامی نشان می‌دهد؛ رنگ، دورو و تعداد را خودت
          انتخاب می‌کنی.
        </li>
        <li>شهر را با یک تپ انتخاب می‌کنی و نشانی را می‌نویسی؛ موبایل فقط در قدم پرداخت لازم است، با کد پیامکی.</li>
        <li>
          جزوه تا <span className="num">{slaDays}</span> روز کاری پس از پرداخت چاپ و صحافی و به پست تحویل می‌شود، و کد
          رهگیری برایت پیامک می‌شود.
        </li>
      </ul>

      <h2>قیمت روشن</h2>
      <p>
        <a className="jy-link" href="/#tariff">
          تعرفه
        </a>{' '}
        در صفحهٔ اصلی است: هزینهٔ هر رو، صحافی بر اساس شمار برگ، و کرایهٔ پست. مبلغی که پیش از پرداخت می‌بینی همان است که
        می‌پردازی.
      </p>

      <h2>نماد اعتماد</h2>
      <p>جزوه‌یار نماد اعتماد الکترونیکی (اینماد) دارد؛ نشانش پایین همهٔ صفحه‌هاست.</p>

      {CONTACT?.address ? (
        <>
          <h2>نشانی</h2>
          <p>
            {CONTACT.address}. راه‌های تماس و ساعت پاسخ‌گویی در صفحهٔ{' '}
            <a className="jy-link" href={STATIC_PAGES.contact.path}>
              تماس
            </a>{' '}
            است.
          </p>
        </>
      ) : null}
    </StaticPage>
  );
}
