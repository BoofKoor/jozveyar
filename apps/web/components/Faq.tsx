import type { FaqItem, PlaceholderValues } from '@jozveyar/content';
import { InlineText, TextContent } from '@jozveyar/content/render';

/**
 * سؤال‌ها، مقصد «سؤال‌ها» در سربرگ: فهرست `details` کیت (`jy-faq`)، که بی JS باز و بسته می‌شود و متنش در HTML می‌ماند. کامپوننت سرور. پس از
 * فایل کارتی در ستون سفارش می‌شود (home.css)، پس پیوند پاسخ در زبانهٔ تازه باز می‌شود تا جزوهٔ نیمه‌کاره نرود. از ۱۱٫۱ سؤال‌ها از پنل‌اند (سؤال
 * ۲۸۹): پرسش متن ساده، و پاسخ یک بند با پررنگ، پیوند و عدد امروز جای‌نگهدارها؛ همان در JSON-LD صفحه (`FAQPage`)، بی قالب.
 */
export function Faq({
  items,
  values,
  title = 'سؤال‌های پرتکرار',
  sub = 'دربارهٔ قیمت، فایل و ارسال.',
  page,
}: {
  items: readonly FaqItem[];
  values: PlaceholderValues;
  /** صفحهٔ فرود و «تعرفه» (۱۵٫۲): «سؤال‌های [نام صفحه]»، بی جملهٔ زیر، و دو جای‌نگهدار صفحه‌ها. */
  title?: string;
  sub?: string | null;
  page?: boolean;
}) {
  const options = { values, newTab: true };
  return (
    <section id="faq" className="home-sec home-faq" aria-labelledby="faq-title">
      <div>
        <h2 id="faq-title" className="home-sec__title">
          <TextContent text={title} />
        </h2>
        {sub ? <p className="home-sec__sub">{sub}</p> : null}
      </div>
      <div className="jy-faq">
        {items.map((item, i) => (
          <details key={i}>
            <summary>
              <TextContent text={item.q} />
              <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
            </summary>
            <p>
              <InlineText text={item.a} format="paragraph" options={options} page={page === true} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
