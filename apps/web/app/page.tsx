import type { Metadata, ResolvingMetadata } from 'next';

import { inlineText, parseInline, placeholderValues } from '@jozveyar/content';
import { HeroTitle, InlineText } from '@jozveyar/content/render';

import { Faq } from '../components/Faq';
import { HomeBanner } from '../components/HomeBanner';
import { HowItWorks } from '../components/HowItWorks';
import { OrderFlow } from '../components/OrderFlow';
import { Reviews } from '../components/Reviews';
import { Tariff } from '../components/Tariff';
import { UploadCard } from '../components/UploadCard';
import { organizationLogo } from '../lib/brand';
import { DRAFT_KEY, RESTORING_ATTR } from '../lib/draftKey';
import { acceptOf } from '../lib/fileRules';
import { siteBanner, siteBrand } from '../lib/server/brand';
import { contentFacts, liveText, sitePublished } from '../lib/server/content';
import { siteFiles } from '../lib/server/fileRules';
import { siteReviews } from '../lib/server/reviews';
import { siteFacts } from '../lib/server/siteFacts';
import { siteTariff } from '../lib/server/tariff';
import { SITE_OPEN_GRAPH } from '../lib/staticPages';
import { homeGraph, jsonLd } from '../lib/structuredData';
import { TARIFF_ELEMENT_ID, tariffJson } from '../lib/tariff';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/**
 * ISR (برش ۴٫۴، ADR-040): صفحه ایستا می‌ماند و دست‌بالا هر ۶۰ ثانیه یک بار با تعرفهٔ فعال پایگاه داده و روز کاری تحویل
 * به پست دوباره ساخته می‌شود (`lib/server/tariff.ts`)؛ تعرفهٔ تازه حداکثر یک دقیقه بعد همه‌جای صفحه است.
 */
export const revalidate = 60;

/**
 * پیش از رسم (۳د، ADR-036): اگر این زبانه پیش‌نویس سفارش دارد، صفحه از همان اولین رسم حالت سفارش است و کارت
 * بارگذاری «در حال برگرداندن جزوه…»، نه لحظه‌ای صفحهٔ اول. چند بایت درون HTML، نه در باندل؛ حافظهٔ بستهٔ سایت یعنی
 * صفحهٔ معمول.
 */
const RESTORE_SCRIPT = `try{sessionStorage.getItem(${JSON.stringify(DRAFT_KEY)})&&document.documentElement.setAttribute(${JSON.stringify(RESTORING_ATTR)},'')}catch(e){}`;

/**
 * عنوان و توضیح گوگل صفحهٔ اصلی از «صفحهٔ اصلی» پنل (۱۱٫۱، سؤال ۲۸۳)، بی «| جزوه‌یار» الگوی layout؛ openGraph همان دو، با تصویر اشتراک
 * بالادست (`parent`)، مثل صفحه‌های ثابت. canonical خودش (۱۵٫۱، سؤال ۴۲۸): layout دیگر canonical پیش‌فرض ندارد، تا صفحه‌ای که canonical
 * نگذارد خودش را تکراری صفحهٔ اصلی اعلام نکند.
 */
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [images, { seo }] = await Promise.all([
    parent.then((meta) => meta.openGraph?.images ?? []),
    sitePublished().then((published) => liveText('home', published).content),
  ]);
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: '/' },
    openGraph: { ...SITE_OPEN_GRAPH, title: seo.title, description: seo.description, url: '/', images },
  };
}

/** نماد هر نوید، به ترتیب طرح؛ آیکون جزو طرح است و از پنل عوض نمی‌شود (سؤال ۲۸۳). */
const PROMISE_ICONS = ['tag', 'truck', 'lock'] as const;

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
 *
 * تعرفه و روز کاری تحویل به پست از پایگاه داده‌اند (برش ۴٫۴): در جدول تعرفه، سؤال‌ها و «روز کاری»ها، و به JSON درون HTML
 * (`#jy-tariff`) که رابط پس از فایل برای `quote()` می‌خواند (`lib/tariff.ts`)؛ پیش‌فاکتور مرورگر همان عدد سرور است. از ۱۲٫۳ نظرهایی که
 * مالک روی سایت گذاشت پس از تعرفه (`Reviews`). پیام «چاپخانه‌ها تعطیل‌اند» (۱۰٫۱) از ۱۱٫۳ بالای سربرگ همهٔ صفحه‌هاست (layout، `SiteBar`). از ۱۱٫۲
 * بنری که مالک یا متصدی از پنل روشن کرده بالای سه قدم (`HomeBanner`).
 *
 * از ۱۱٫۱ قهرمان، سه نوید، «سه قدم» و سؤال‌ها متنی است که مالک از پنل منتشر کرد، یا متن پیش‌فرض (`lib/server/content.ts`)، با عدد امروز هر
 * جای‌نگهدار؛ کارت بارگذاری، تعرفه و میز سفارش همان کد سایت‌اند.
 */
export default async function HomePage() {
  const [tariff, files, reviews, published, facts, banner, brand] = await Promise.all([
    siteTariff(),
    siteFiles(),
    siteReviews(),
    sitePublished(),
    siteFacts(),
    siteBanner(),
    siteBrand(),
  ]);
  const factsNow = contentFacts(tariff, files, facts);
  const values = placeholderValues(factsNow);
  const home = liveText('home', published, factsNow).content;
  const faq = liveText('faq', published, factsNow).content.items;
  const options = { values };
  // سازمان، نام سایت، خدمت و سؤال‌ها (۱۵٫۱، سؤال ۴۲۷)؛ پرسش و پاسخ همان سؤال‌های صفحه، بی قالب و با عدد امروز (سؤال ۲۸۹).
  const graph = homeGraph({
    siteUrl: SITE_URL,
    logo: organizationLogo(brand),
    contact: liveText('contact', published).content,
    faq: faq.map((item) => ({ q: item.q, a: inlineText(parseInline(item.a, 'paragraph').nodes, values) })),
  });

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script dangerouslySetInnerHTML={{ __html: RESTORE_SCRIPT }} />
      {/* پرسش و پاسخ و شبکه‌ها از پنل‌اند (۱۱٫۱): `jsonLd` «<» را هم \u003c می‌کند، تا هیچ متنی تگ اسکریپت را نبندد. */}
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />

      {/* نام سایت را لوگوی سربرگ می‌گوید. سربرگ و پاورقی در layout است. */}
      <main className="home">
        <OrderFlow
          rules={files.rules}
          accept={acceptOf(files.rules.formats)}
          hero={
            <div className="home-hero__text">
              {/*
               * «خط بالای تیتر» درون همان h1 است (۱۵٫۱، سؤال ۴۲۹)، با همان ظاهر: تیتر صفحه «چاپ و صحافی آنلاین جزوه» را هم دارد، و «؛» میان دو
               * تکه فقط برای صفحه‌خوان و متن خام است. تیتر فقط سر ویرگول می‌شکند؛ متن در HTML خام همان جمله است (سئو).
               */}
              <h1 id="hero-title" className="home-h1">
                <span className="home-eyebrow">
                  <InlineText text={home.eyebrow} format="line" options={options} />
                </span>
                <span className="home-h1__sep">؛ </span>
                <span className="home-title">
                  <HeroTitle text={home.title} options={options} clause="home-clause" />
                </span>
              </h1>
              <p className="home-lead">
                <InlineText text={home.lead} format="line" options={options} />
              </p>
            </div>
          }
          upload={<UploadCard formats={files.rules.formats} />}
          trust={
            <ul className="home-trust">
              {home.promises.map((promise, i) => (
                <li key={i}>
                  <span className="home-trust__ic">
                    <span className={`jy-icon jy-icon-${PROMISE_ICONS[i]}`} aria-hidden="true" />
                  </span>
                  <span className="home-trust__t">
                    <b>
                      <InlineText text={promise.title} format="line" options={options} />
                    </b>
                    <span>
                      <InlineText text={promise.sub} format="line" options={options} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          }
          more={
            <>
              {banner ? <HomeBanner banner={banner} /> : null}
              <HowItWorks title={home.howTitle} steps={home.steps} values={values} />
              <Tariff priceList={tariff.priceList} paused={tariff.paused} />
              <Reviews reviews={reviews} />
            </>
          }
        >
          <Faq items={faq} values={values} />
        </OrderFlow>
      </main>
      {/* تعرفهٔ `quote()` مرورگر؛ داده است و اجرا نمی‌شود. */}
      <script
        id={TARIFF_ELEMENT_ID}
        type="application/json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: tariffJson(tariff) }}
      />
    </>
  );
}
