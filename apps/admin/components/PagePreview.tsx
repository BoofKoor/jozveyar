import type { AnyPageContent, LandingContent, PageValues, SitePageKind, TariffPageContent } from '@jozveyar/content';
import { InlineText, MarkdownBlocks, TextContent, type BlockData, type RenderOptions } from '@jozveyar/content/render';
import { formatJalali } from '@jozveyar/text';

import type { PageFacts } from '../lib/server/pages';

/** سؤال‌های صفحه، همان آکاردئون سایت، همه باز تا پاسخ‌ها هم دیده شوند. */
function FaqPreview({ items, options }: { items: AnyPageContent['faq']; options: RenderOptions }) {
  return (
    <div className="jy-faq">
      {items.map((item, i) => (
        <details key={i} open>
          <summary>
            <TextContent text={item.q} />
            <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
          </summary>
          <p>
            <InlineText text={item.a} format="paragraph" options={options} page />
          </p>
        </details>
      ))}
    </div>
  );
}

/**
 * پیش‌نمایش یک صفحهٔ فرود یا «تعرفه» با ظاهر سایت (برش ۱۵٫۲، طرح «صفحهٔ فرود»، سؤال ۴۶۲): مسیر دیدنی، تیتر و جمله، جای کارت بارگذاری و میز
 * سفارش (یا ماشین‌حساب و جدول‌های «تعرفه»)، متن با همان بلوک‌های زندهٔ سایت (`@jozveyar/content/render`، تعرفهٔ فعال)، و سؤال‌ها. عدد هر
 * جای‌نگهدار و بلوک خط‌چین (`ad-live-n`) و پیوندها بی نشانی، تا از پنل به جایی نرود. کامپوننت سرور، بی JS.
 */
export function PagePreview({ kind, content, facts }: { kind: SitePageKind; content: AnyPageContent; facts: PageFacts }) {
  const values: PageValues = facts.values;
  const options: RenderOptions = { values, live: 'ad-live-n', inert: true };
  const data: BlockData = { priceList: facts.priceList, paused: facts.paused, maxPages: facts.maxPages, tariffHref: null, live: 'ad-live-n' };
  if (kind === 'tariff') {
    const page = content as TariffPageContent;
    return (
      <div className="ad-pv__frame" data-testid="page-preview">
        <p className="ad-pvc">جزوه‌یار ‹ تعرفه</p>
        <p className="ad-pvh__title">
          <InlineText text={page.title} format="line" options={options} page />
        </p>
        {facts.priceChangedAt ? (
          <p className="ad-pvc">
            آخرین تغییر قیمت: <TextContent text={formatJalali(facts.priceChangedAt)} />
          </p>
        ) : null}
        <p className="ad-pvh__lead">
          <InlineText text={page.lead} format="line" options={options} page />
        </p>
        <p className="ad-pvslot">
          <span className="jy-icon jy-icon-tag" aria-hidden="true" />
          ماشین‌حساب بی فایل، و جدول‌های چاپ، صحافی و ارسال و سه قیمت نمونه، همه از تعرفهٔ فعال
        </p>
        {page.faq.length > 0 ? (
          <>
            <p className="ad-pvlabel">سؤال‌های قیمت</p>
            <FaqPreview items={page.faq} options={options} />
          </>
        ) : null}
      </div>
    );
  }
  const page = content as LandingContent;
  return (
    <div className="ad-pv__frame" data-testid="page-preview">
      <p className="ad-pvc">
        جزوه‌یار ‹ <TextContent text={page.name || 'نام کوتاه'} />
      </p>
      <p className="ad-pvh__title">
        <InlineText text={page.title} format="line" options={options} page />
      </p>
      <p className="ad-pvh__lead">
        <InlineText text={page.lead} format="line" options={options} page />
      </p>
      <p className="ad-pvslot">
        <span className="jy-icon jy-icon-upload" aria-hidden="true" />
        کارت بارگذاری، سه نوید و میز سفارش صفحهٔ اصلی
      </p>
      <article className="pg-body" aria-label="پیش‌نمایش متن صفحه">
        <MarkdownBlocks text={page.body} options={options} heading="h3" headingClass="ad-pv-h" blocks={data} />
      </article>
      {page.faq.length > 0 ? (
        <>
          <p className="ad-pvlabel">
            سؤال‌های <TextContent text={page.name} />
          </p>
          <FaqPreview items={page.faq} options={options} />
        </>
      ) : null}
    </div>
  );
}
