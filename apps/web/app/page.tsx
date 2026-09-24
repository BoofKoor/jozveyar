import { formatTomans } from '@jozveyar/text';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { OrderFlow } from '../components/OrderFlow';

/**
 * صفحهٔ اصلی — هم لندینگ سئو است و هم ابزار سفارش.
 *
 * هیرو و تمام متن، HTML ایستای سمت سرور است. `OrderFlow` تنها جزیرهٔ کلاینت
 * است و pdf.js فقط با اولین تعامل فایل بارگذاری می‌شود، پس ۳۵۰ کیلوبایت
 * کتابخانه به بودجهٔ LCP نمی‌خورد. (ADR-014)
 */

const FAQ = [
  {
    q: 'قیمت چاپ جزوه چطور حساب می‌شود؟',
    a: `به‌ازای هر صفحهٔ چاپ‌شده: سیاه‌سفید ${formatTomans(SEED_PRICE_LIST.clickRates.bw ?? 0)} و رنگی ${formatTomans(SEED_PRICE_LIST.clickRates.color ?? 0)}. هزینهٔ صحافی جدا و بر اساس تعداد برگ محاسبه می‌شود. قیمت نهایی را قبل از هر ثبت‌نامی روی صفحه می‌بینید.`,
  },
  {
    q: 'باید تعداد صفحات را خودم بشمارم؟',
    a: 'نه. فایل را که انداختید، سایت خودش تعداد صفحات، اندازهٔ کاغذ و صفحات رنگی را تشخیص می‌دهد و قیمت را نشان می‌دهد.',
  },
  {
    q: 'چه فایل‌هایی را می‌توانم بفرستم؟',
    a: 'PDF، Word، پاورپوینت و عکس اسکن‌شده. فایل PDF همان لحظه در مرورگر خوانده می‌شود و بقیه سمت سرور تبدیل می‌شوند. چند فایل را هم می‌شود با هم انداخت: به ترتیبی که می‌خواهید پشت‌سرهم در یک جزوه صحافی می‌شوند و فقط یک بار هزینهٔ صحافی می‌گیرند.',
  },
  {
    q: 'فایلم کجا می‌رود و چقدر نگه داشته می‌شود؟',
    a: 'قیمت را خود مرورگرتان حساب می‌کند. بعد از آن، فایل برای چاپ به سرور جزوه‌یار فرستاده می‌شود — اگر اینترنت قطع شد، از همان‌جا ادامه می‌دهد. فایل دو روز بعد خودکار پاک می‌شود و هیچ‌جای دیگری نمی‌رود.',
  },
  {
    q: 'ارسال چقدر طول می‌کشد؟',
    a: 'تعهد ما این است که سفارش حداکثر دو روز کاری پس از پرداخت به پست تحویل داده شود. بعد از آن کد رهگیری پستی برایتان ارسال می‌شود تا خودتان مسیر مرسوله را ببینید.',
  },
  {
    q: 'برای گرفتن قیمت باید ثبت‌نام کنم؟',
    a: 'نه. قیمت قبل از هر ثبت‌نامی نشان داده می‌شود. شماره موبایل فقط در لحظهٔ پرداخت گرفته می‌شود، با کد پیامکی و بدون رمز.',
  },
];

/** واژهٔ لاتین در bdi، تا «PDF، Word» کنار ویرگول فارسی برعکس دیده نشود. متن خود سؤال دست نمی‌خورد. */
function isolateLatin(text: string) {
  return text.split(/([A-Za-z]+)/).map((part, i) => (i % 2 ? <bdi key={i}>{part}</bdi> : part));
}

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

      {/* نام سایت را لوگوی سربرگ می‌گوید؛ بالای تیتر دیگر خط «جزوه‌یار» نیست. پاورقی در layout است. */}
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pb-16 pt-2 sm:gap-10 sm:pt-12">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            جزوه‌ات را بینداز، قیمت را همین حالا ببین
          </h1>
          <p className="text-lg leading-relaxed text-muted">
            تعداد صفحات را خودت نمی‌شماری و فرم پر نمی‌کنی. فایل را می‌خوانیم، قیمت را نشان
            می‌دهیم، چاپ می‌کنیم و برایت می‌فرستیم.
          </p>
        </header>

        <OrderFlow />

        {/* مقصد «سؤال‌ها» در سربرگ */}
        <section id="faq" aria-labelledby="faq-title" className="flex flex-col gap-5 border-t border-line pt-8">
          <h2 id="faq-title" className="text-xl font-semibold text-ink">
            سؤال‌های پرتکرار
          </h2>
          <div className="flex flex-col gap-5">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-1.5">
                <h3 className="font-semibold text-ink">{item.q}</h3>
                <p className="leading-relaxed text-muted">{isolateLatin(item.a)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
