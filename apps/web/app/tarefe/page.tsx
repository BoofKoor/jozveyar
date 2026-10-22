import type { Metadata, ResolvingMetadata } from 'next';

import {
  bindingTables,
  discountTiers,
  paperNotes,
  printTables,
  sampleQuote,
  shippingTable,
  shippingZones,
  zoneName,
} from '@jozveyar/content';
import {
  BindingNote,
  BindingTableView,
  InlineText,
  PrintNote,
  PrintTableView,
  SampleCard,
  ShippingTableView,
  TiersView,
  type BlockData,
} from '@jozveyar/content/render';
import { pausedOf } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID } from '@jozveyar/pricing/seed';
import { formatJalali, formatNumber } from '@jozveyar/text';

import { Crumbs } from '../../components/Crumbs';
import { Faq } from '../../components/Faq';
import { Inline } from '../../components/Inline';
import { TariffCalc } from '../../components/TariffCalc';
import { liveTariffPage, seoText, siteLivePages, sitePageContext } from '../../lib/server/pages';
import { SITE_OPEN_GRAPH } from '../../lib/staticPages';
import { breadcrumbGraph, jsonLd } from '../../lib/structuredData';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/** مثل صفحه‌های دیگر ISR ۶۰ ثانیه: متن از پنل (۱۵٫۲) و جدول‌ها و ماشین‌حساب از تعرفهٔ فعال، که هر دو تا یک دقیقه بعد روی سایت‌اند. */
export const revalidate = 60;

/** نشانی و مسیر دیدنی «تعرفه» (سؤال ۴۵۳). */
const PATH = '/tarefe';
const CRUMBS = [{ name: 'جزوه‌یار', path: '/' }, { name: 'تعرفه', path: PATH }] as const;

/** جزوه‌های نمونهٔ «تعرفه» (سؤال ۴۵۷): سیاه‌سفید و دورو، با صحافی و کاغذ پیش‌فرض، یک نسخه. */
const SAMPLE_PAGES = [50, 200, 600] as const;

/** شمار صفحهٔ اول ماشین‌حساب (سؤال ۴۵۸)، که HTML صفحه با آن رسم می‌شود. */
const CALC_PAGES = 120;

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [images, live, { values }] = await Promise.all([parent.then((meta) => meta.openGraph?.images ?? []), siteLivePages(), sitePageContext()]);
  const { seo } = liveTariffPage(live).content;
  const title = seoText(seo.title, values);
  const description = seoText(seo.description, values);
  return {
    title,
    description,
    alternates: { canonical: PATH },
    openGraph: { ...SITE_OPEN_GRAPH, title: `${title} | جزوه‌یار`, description, url: PATH, images },
  };
}

/**
 * «تعرفه» (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۴، ۴۵۷ و ۴۵۸؛ طرح `seo.html`): صفحه‌ای که فقط قیمت است، برای کسی که «قیمت چاپ جزوه» جست‌وجو کرده. مسیر
 * دیدنی، تیتر و جملهٔ پنل (یا متن پیش‌فرض)، «آخرین تغییر قیمت» (روز فعال شدن تعرفهٔ فعال)، ماشین‌حساب بی فایل (`TariffCalc`، تنها جزیرهٔ کلاینت)، و
 * جدول‌های چاپ هر اندازه، هر صحافی روشن، کرایهٔ پست، سه جزوهٔ نمونه، پله‌های تخفیف وقتی هست، و سؤال‌های قیمت. جدول‌ها همان اجزای بلوک‌های زندهٔ
 * صفحه‌های فرود‌اند (`@jozveyar/content/render`)، با تعرفهٔ فعال و همان `quote()` (قاعدهٔ ۱). سربرگ پیوند «تعرفه» را جاری می‌بیند (`data-tarefe`).
 */
export default async function TariffPage() {
  const [live, { tariff, files, values, priceChangedAt }] = await Promise.all([siteLivePages(), sitePageContext()]);
  const page = liveTariffPage(live).content;
  const list = tariff.priceList;
  const paused = pausedOf(list, tariff.paused);
  const data: BlockData = { priceList: list, paused, maxPages: files.rules.maxPages, tariffHref: null };
  const options = { values };
  const prints = printTables(list, paused);
  const tiers = discountTiers(list);
  const samples = SAMPLE_PAGES.map((pages) => ({
    pages,
    result: sampleQuote({ pages, copies: 1, color: null, sides: null, size: null, binding: null, paper: null }, list, paused),
  }));
  const typical = samples.find(({ pages }) => pages === 200)?.result;
  const zones = shippingZones(list).map((id) => ({ id, name: zoneName(id) }));

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbGraph(SITE_URL, CRUMBS)) }} />
      <main className="site-wrap tf">
        <span hidden data-tarefe="" />
        <header className="tf-head">
          <Crumbs items={CRUMBS} />
          <h1 className="tf-title">
            <InlineText text={page.title} format="line" options={options} page />
          </h1>
          {priceChangedAt ? (
            <p className="tf-meta" data-testid="tariff-changed">
              آخرین تغییر قیمت: <Inline text={formatJalali(priceChangedAt)} />
            </p>
          ) : null}
          <p className="tf-lead">
            <InlineText text={page.lead} format="line" options={options} page />
          </p>
        </header>

        <TariffCalc priceList={list} paused={tariff.paused} maxPages={files.rules.maxPages} zones={zones} initialPages={CALC_PAGES} />

        <section className="home-sec" aria-labelledby="tf-print">
          <h2 id="tf-print" className="home-sec__title">
            چاپ، هر رو
          </h2>
          {prints.map((table) => (
            <PrintTableView key={table.size} table={table} caption={prints.length > 1 ? 'shown' : 'hidden'} />
          ))}
          <PrintNote papers={paperNotes(list, paused)} />
        </section>

        <div className="tf-grid">
          {bindingTables(list, paused).map((table) => (
            <section key={`${table.id}:${table.size}`} className="home-sec" aria-labelledby={`tf-bind-${table.id}-${table.size}`}>
              <h2 id={`tf-bind-${table.id}-${table.size}`} className="home-sec__title">
                صحافی <Inline text={table.name} />
                {table.size === 'a4' ? null : (
                  <>
                    ، <bdi>{table.label}</bdi>
                  </>
                )}
              </h2>
              <BindingTableView table={table} />
              <BindingNote table={table} />
            </section>
          ))}
          <section className="home-sec" aria-labelledby="tf-ship">
            <h2 id="tf-ship" className="home-sec__title">
              ارسال با پست پیشتاز
            </h2>
            <ShippingTableView table={shippingTable(list)} />
            <p className="tf-note">
              «تهران» یعنی استان تهران.
              {typical?.ok ? (
                <>
                  {' '}
                  جزوهٔ <span className="num">200</span> صفحه‌ای دورو با بسته‌بندی حدود{' '}
                  <span className="num">{formatNumber(Math.round(typical.quote.breakdown.estWeightGrams / 10) * 10)}</span> گرم است؛
                </>
              ) : null}{' '}
              میز و ماشین‌حساب وزن هر جزوه را خودشان حساب می‌کنند.
            </p>
          </section>
        </div>

        <section className="home-sec" aria-labelledby="tf-samples">
          <h2 id="tf-samples" className="home-sec__title">
            قیمت چند جزوهٔ نمونه
          </h2>
          <div className="lp-samples">
            {samples.map(({ pages, result }) => (
              <SampleCard key={pages} raw={`قیمت: ${pages} صفحه`} result={result} data={data} foot={false} />
            ))}
          </div>
          <p className="tf-note">
            همه {list.bindingTypes[DEFAULT_BINDING_TYPE_ID] ? <Inline text={list.bindingTypes[DEFAULT_BINDING_TYPE_ID]!.nameFa} /> : null}، یک نسخه، با
            تعرفهٔ امروز.
            {tiers.length > 0 ? null : ' تخفیف سفارش بزرگ امروز پله‌ای ندارد؛ وقتی داشت، جدولش همین‌جاست.'}
          </p>
          {tiers.length > 0 ? <TiersView tiers={tiers} caption="shown" /> : null}
        </section>

        {page.faq.length > 0 ? <Faq items={page.faq} values={values} title="سؤال‌های قیمت" sub={null} page /> : null}
      </main>
    </>
  );
}
