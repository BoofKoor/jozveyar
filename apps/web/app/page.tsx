import { Faq, FAQ } from '../components/Faq';
import { HowItWorks } from '../components/HowItWorks';
import { OrderFlow } from '../components/OrderFlow';
import { Tariff } from '../components/Tariff';
import { UploadCard } from '../components/UploadCard';

/**
 * صفحهٔ اصلی — هم لندینگ سئو است و هم ابزار سفارش. طرح ز (docs/UI.md، ۴الف و ۴ب؛ چیدمان در
 * home.css).
 *
 * همه‌چیز HTML ایستای سمت سرور است، جز `OrderFlow`: تنها جزیرهٔ کلاینت، که چیدمان صفحه را دور
 * فلوی سفارش می‌گذارد. هر بخش ثابت (قهرمان، کارت بارگذاری، سه قدم، تعرفه، سؤال‌ها) کامپوننت سرور
 * است و از props می‌آید، پس متنش در HTML است و در باندل نیست. pdf.js فقط با اولین فایل بار می‌شود،
 * پس ۳۵۰ کیلوبایت کتابخانه به بودجهٔ LCP نمی‌خورد (ADR-014)؛ و رابط پس از فایل هم (۴ب).
 *
 * پیش از فایل: نوار بالای green-50 (سربرگ و قهرمان)، و روی سفید سه قدم، تعرفه و سؤال‌ها. پس از فایل
 * کل صفحه green-50 است: قدم‌های سفارش، کارت‌ها، خلاصهٔ سفارش در کنار (در موبایل نوار پایین) و
 * سؤال‌ها در همان شبکه. قهرمان و بخش‌ها با CSS و نشانهٔ `data-jozve` جزیره کنار می‌روند.
 */
export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://jozveyar.com/#org',
        name: 'جزوه‌یار',
        url: 'https://jozveyar.com',
        areaServed: { '@type': 'Country', name: 'ایران' },
      },
      {
        '@type': 'Service',
        name: 'چاپ و صحافی جزوه',
        serviceType: 'چاپ جزوه',
        provider: { '@id': 'https://jozveyar.com/#org' },
        areaServed: { '@type': 'Country', name: 'ایران' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* نام سایت را لوگوی سربرگ می‌گوید. سربرگ و پاورقی در layout است. */}
      <main className="home">
        <OrderFlow
          hero={
            <div className="home-hero__text">
              <p className="home-eyebrow">چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران</p>
              {/* تیتر فقط سر ویرگول می‌شکند؛ متن در HTML خام همان جمله است (سئو). */}
              <h1 id="hero-title" className="home-title">
                <span className="home-clause">جزوه‌ات را بینداز،</span>{' '}
                <span className="home-clause">
                  قیمت را <mark>همین حالا</mark> ببین
                </span>
              </h1>
              <p className="home-lead">صفحه‌ها و صفحه‌های رنگی را خودمان می‌شماریم؛ بی‌ثبت‌نام و بی فرم.</p>
            </div>
          }
          upload={<UploadCard />}
          trust={
            <ul className="home-trust">
              <li>
                <span className="home-trust__ic">
                  <span className="jy-icon jy-icon-tag" aria-hidden="true" />
                </span>
                <span className="home-trust__t">
                  <b>قیمت دقیق، پیش از ثبت‌نام</b>
                  <span>شمارهٔ موبایل فقط موقع پرداخت</span>
                </span>
              </li>
              <li>
                <span className="home-trust__ic">
                  <span className="jy-icon jy-icon-truck" aria-hidden="true" />
                </span>
                <span className="home-trust__t">
                  <b>
                    تحویل پست تا <span className="num">2</span> روز کاری
                  </b>
                  <span>با کد رهگیری، به سراسر ایران</span>
                </span>
              </li>
              <li>
                <span className="home-trust__ic">
                  <span className="jy-icon jy-icon-lock" aria-hidden="true" />
                </span>
                <span className="home-trust__t">
                  <b>فایلت پیش ما نمی‌ماند</b>
                  <span>
                    <span className="num">2</span> روز بعد خودکار پاک می‌شود
                  </span>
                </span>
              </li>
            </ul>
          }
          more={
            <>
              <HowItWorks />
              <Tariff />
            </>
          }
        >
          <Faq />
        </OrderFlow>
      </main>
    </>
  );
}
