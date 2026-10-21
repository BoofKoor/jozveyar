import type { Metadata, ResolvingMetadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { SLUG_MAX, SLUG_PATTERN } from '@jozveyar/content';
import { InlineText, PageSections, type BlockData } from '@jozveyar/content/render';
import { pausedOf } from '@jozveyar/pricing';

import { Crumbs } from '../../../components/Crumbs';
import { Faq } from '../../../components/Faq';
import { HomePromises } from '../../../components/HomePromises';
import { OrderFlow } from '../../../components/OrderFlow';
import { UploadCard } from '../../../components/UploadCard';
import { acceptOf } from '../../../lib/fileRules';
import { RESTORE_SCRIPT } from '../../../lib/restoreScript';
import { liveText, sitePublished } from '../../../lib/server/content';
import { landingOfResolution, presetConfig, seoText, sitePageContext, siteResolve } from '../../../lib/server/pages';
import { SITE_OPEN_GRAPH } from '../../../lib/staticPages';
import { breadcrumbGraph, jsonLd } from '../../../lib/structuredData';
import { TARIFF_ELEMENT_ID, tariffJson } from '../../../lib/tariff';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/** مثل صفحهٔ اصلی ISR ۶۰ ثانیه: انتشار، زمان‌داری که ساعتش رسید و برداشتن تا یک دقیقه بعد روی سایت است. */
export const revalidate = 60;

/**
 * مسیر درونی (`lib/routes.ts`): نشانی صفحه در ریشه است (`/print-pdf`) و میان‌افزار فقط نشانی صفحه‌ای را که همین حالا روی سایت است به اینجا می‌دهد؛
 * درخواست مستقیم `/lp/…` با ۳۰۱ به نشانی صفحه. هیچ صفحه‌ای در build ساخته نمی‌شود (پایگاه داده‌ای در کار نیست)؛ هر صفحه با اولین درخواست ساخته
 * و با ISR نگه داشته می‌شود، پس صفحه‌ای که مالک منتشر کرد بی build تازه روی سایت است، و نشانی ساختگی هیچ نسخهٔ ISR جدایی نمی‌سازد.
 */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * جواب این نشانی: صفحهٔ فرود روی سایت، یا ۳۰۱ (نشانی قبلی یا صفحهٔ برداشته «به صفحهٔ دیگری»؛ میان‌افزار پیش از این می‌فرستدش، و این پشتیبان
 * دقیقه‌ای است که فهرست میان‌افزار هنوز کهنه است)، یا null یعنی ۴۰۴ (همان دقیقه، پس از برداشتن). نشانی‌ای که شکل نشانی صفحه‌ها را ندارد اصلاً از
 * پایگاه داده پرسیده نمی‌شود.
 */
async function resolveLanding(slug: string) {
  if (slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) return null;
  const resolution = await siteResolve(slug);
  return resolution.kind === 'redirect' ? { redirect: resolution.to } : landingOfResolution(resolution);
}

/**
 * متادیتای صفحهٔ فرود، با canonical نشانی خود صفحه در ریشه (نه مسیر درونی). ۴۰۴ و ۳۰۱ را فقط خود صفحه می‌زند، نه اینجا؛ متادیتای ۴۰۴ همان
 * `not-found.tsx` است.
 */
export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { slug } = await params;
  const landing = await resolveLanding(slug);
  if (!landing || 'redirect' in landing) return {};
  const { content } = landing;
  const [images, { values }] = await Promise.all([parent.then((meta) => meta.openGraph?.images ?? []), sitePageContext()]);
  const title = seoText(content.seo.title, values);
  const description = seoText(content.seo.description, values);
  const path = `/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...SITE_OPEN_GRAPH, title: `${title} | جزوه‌یار`, description, url: path, images },
  };
}

/**
 * صفحهٔ فرود (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۲، ۴۳۳، ۴۵۳ تا ۴۵۶؛ طرح `seo.html`): در نوار green-50 قهرمان مسیر دیدنی، تیتر خود صفحه (`h1`)، جمله‌اش،
 * و همان کارت بارگذاری و سه نوید صفحهٔ اصلی؛ زیرش متن صفحه با بخش‌های `##` و بلوک‌های زنده (`PageSections`، همان `quote()`)، و «سؤال‌های [نام
 * صفحه]». همان فلوی سفارش صفحهٔ اصلی (`OrderFlow`): پس از انداختن فایل همه‌چیز جز میز کنار می‌رود (landing.css)، با پیش‌فرض میز همین صفحه
 * (`presetConfig`، فقط گزینه‌ای که امروز روشن است)؛ و همان برگرداندن بعد از رفرش و JSON تعرفه.
 *
 * سه نوید همان «صفحهٔ اصلی» پنل است؛ `BreadcrumbList` همان مسیر دیدنی، و `FAQPage` نه (سؤال ۴۲۷: فقط صفحهٔ اصلی).
 */
export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const landing = await resolveLanding(slug);
  if (!landing) notFound();
  if ('redirect' in landing) permanentRedirect(landing.redirect);
  const { content } = landing;
  const [{ tariff, files, values }, published] = await Promise.all([sitePageContext(), sitePublished()]);
  const home = liveText('home', published).content;
  const options = { values };
  const paused = pausedOf(tariff.priceList, tariff.paused);
  const data: BlockData = { priceList: tariff.priceList, paused, maxPages: files.rules.maxPages, tariffHref: '/tarefe' };
  const crumbs = [
    { name: 'جزوه‌یار', path: '/' },
    { name: content.name, path: `/${slug}` },
  ];

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script dangerouslySetInnerHTML={{ __html: RESTORE_SCRIPT }} />
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbGraph(SITE_URL, crumbs)) }} />

      <main className="home">
        <OrderFlow
          rules={files.rules}
          accept={acceptOf(files.rules.formats)}
          initialConfig={presetConfig(content.desk, tariff.priceList, paused)}
          hero={
            <div className="home-hero__text">
              <Crumbs items={crumbs} className="lp-crumbs" />
              <h1 id="hero-title" className="lp-title">
                <InlineText text={content.title} format="line" options={options} page />
              </h1>
              <p className="home-lead">
                <InlineText text={content.lead} format="line" options={options} page />
              </p>
            </div>
          }
          upload={<UploadCard formats={files.rules.formats} />}
          trust={<HomePromises promises={home.promises} values={values} />}
          more={<PageSections text={content.body} options={options} data={data} idPrefix="lp" />}
        >
          {content.faq.length > 0 ? <Faq items={content.faq} values={values} title={`سؤال‌های ${content.name}`} sub={null} page /> : null}
        </OrderFlow>
      </main>
      {/* تعرفهٔ `quote()` میز؛ داده است و اجرا نمی‌شود. */}
      <script
        id={TARIFF_ELEMENT_ID}
        type="application/json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: tariffJson(tariff) }}
      />
    </>
  );
}
