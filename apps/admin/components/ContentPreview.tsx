import {
  KIND_NAMES,
  contactLead,
  contactRows,
  hasContact,
  type AnyContent,
  type ContactContent,
  type ContactRow,
  type ContentKind,
  type FaqContent,
  type HomeContent,
  type PageContent,
  type PlaceholderValues,
} from '@jozveyar/content';
import { HeroTitle, InlineText, MarkdownBlocks, TextContent, type RenderOptions } from '@jozveyar/content/render';

/** آیکون سه نوید، به ترتیب صفحهٔ اصلی سایت (برچسب، کامیون، قفل)؛ نام کامل، تا Tailwind بسازدشان. */
const PROMISE_ICONS = ['jy-icon jy-icon-tag', 'jy-icon jy-icon-truck', 'jy-icon jy-icon-lock'] as const;

function PagePreview({
  kind,
  page,
  options,
  updated,
  address,
}: {
  kind: ContentKind;
  page: PageContent;
  options: RenderOptions;
  updated?: string;
  address: string;
}) {
  return (
    <article className="pg-body" aria-label={`پیش‌نمایش ${KIND_NAMES[kind]}`}>
      <p className="pg-title">
        <TextContent text={page.title} />
      </p>
      {updated ? (
        <p className="pg-meta">
          به‌روز شده در <span className="num">{updated}</span>، با انتشار
        </p>
      ) : null}
      <p className="pg-lead">
        <InlineText text={page.lead} format="line" options={options} />
      </p>
      <MarkdownBlocks text={page.body} options={options} heading="h3" headingClass="ad-pv-h" />
      {kind === 'about' && address ? (
        <>
          <h3 className="ad-pv-h">نشانی</h3>
          <p>
            {address}. راه‌های تماس و ساعت پاسخ‌گویی در صفحهٔ <a className="jy-link">تماس</a> است.
          </p>
        </>
      ) : null}
    </article>
  );
}

function HomePreview({ home, options }: { home: HomeContent; options: RenderOptions }) {
  return (
    <>
      <p className="ad-pvh__eyebrow">
        <InlineText text={home.eyebrow} format="line" options={options} />
      </p>
      <p className="ad-pvh__title">
        <HeroTitle text={home.title} options={options} />
      </p>
      <p className="ad-pvh__lead">
        <InlineText text={home.lead} format="line" options={options} />
      </p>
      <ul className="ad-pvh__trust">
        {home.promises.map((promise, i) => (
          <li key={i}>
            <span className="ad-pvh__ic">
              <span className={PROMISE_ICONS[i]} aria-hidden="true" />
            </span>
            <span className="ad-pvh__t">
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
      <div className="ad-pvh__how">
        <p className="ad-h2">
          <InlineText text={home.howTitle} format="line" options={options} />
        </p>
        {home.steps.map((step, i) => (
          <div key={i}>
            <h3>
              <span className="num">{i + 1}</span>. <InlineText text={step.title} format="line" options={options} />
            </h3>
            <p>
              <InlineText text={step.body} format="paragraph" options={options} />
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

function FaqPreview({ faq, options }: { faq: FaqContent; options: RenderOptions }) {
  // همان فهرست `jy-faq` سایت، همه باز، تا پاسخ‌ها هم دیده شوند.
  return (
    <div className="jy-faq">
      {faq.items.map((item, i) => (
        <details key={i} open>
          <summary>
            <TextContent text={item.q} />
            <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
          </summary>
          <p>
            <InlineText text={item.a} format="paragraph" options={options} />
          </p>
        </details>
      ))}
    </div>
  );
}

/** مقدار یک ردیف تماس، مثل صفحهٔ «تماس» سایت، با پیوند بی نشانی. */
function ContactValue({ row }: { row: ContactRow }) {
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
  return <a className="jy-link">{row.kind === 'tel' ? <span className="num">{row.value}</span> : <bdi>{row.value}</bdi>}</a>;
}

function ContactPreview({ contact }: { contact: ContactContent }) {
  if (!hasContact(contact)) {
    return <p className="ad-hint">هیچ راه تماسی نیست، پس صفحهٔ «تماس» و پیوندش در پاورقی روی سایت نیستند.</p>;
  }
  return (
    <>
      <p className="pg-lead">{contactLead(contact)}</p>
      <dl className="pg-contact">
        {contactRows(contact).map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <ContactValue row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/**
 * پیش‌نمایش یک متن با ظاهر سایت (برش ۱۱٫۱، سؤال ۲۸۵): همان اجزای رسم سایت (`@jozveyar/content/render`) و همان کلاس‌های صفحه‌های ثابت
 * (`@jozveyar/ui/pages.css`)، با عدد امروز هر جای‌نگهدار خط‌چین (`ad-live-n`) و پیوندهای بی نشانی، تا از پنل به جایی نرود. تیترهای متن صفحه
 * `h3` اند، چون صفحهٔ پنل تیتر خودش را دارد. کامپوننت سرور، بی JS.
 */
export function ContentPreview({
  kind,
  content,
  values,
  contactAddress,
  updated,
}: {
  kind: ContentKind;
  content: AnyContent;
  values: PlaceholderValues;
  /** نشانی «تماس و پاورقی» روی سایت، برای بخش «نشانی» دربارهٔ ما. */
  contactAddress: string;
  /** «به‌روز شده در» قوانین و حریم خصوصی پس از انتشار (امروز). */
  updated?: string;
}) {
  const options: RenderOptions = { values, live: 'ad-live-n', inert: true };
  return (
    <div className="ad-pv__frame">
      {kind === 'home' ? (
        <HomePreview home={content as HomeContent} options={options} />
      ) : kind === 'faq' ? (
        <FaqPreview faq={content as FaqContent} options={options} />
      ) : kind === 'contact' ? (
        <ContactPreview contact={content as ContactContent} />
      ) : (
        <PagePreview kind={kind} page={content as PageContent} options={options} address={contactAddress} {...(updated ? { updated } : {})} />
      )}
    </div>
  );
}
