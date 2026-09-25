import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  DEFAULT_SHIPPING_METHOD_ID,
  SEED_PRICE_LIST,
} from '@jozveyar/pricing/seed';
import { formatNumber, formatTomans } from '@jozveyar/text';
import { Inline } from './Inline';

/*
 * «تعرفه، بی هزینهٔ پنهان»، مقصد «تعرفه» در سربرگ؛ از طرح ز (docs/UI.md، ۴الف). کامپوننت سرور.
 *
 * هیچ عددی اینجا نوشته نشده: نرخ‌ها، بازه‌های صحافی و کرایه‌ها از همان `SEED_PRICE_LIST` است که
 * فلوی سفارش با آن قیمت می‌دهد، و مثال را همان `quote()` حساب می‌کند. تعرفه که عوض شد، این بخش
 * هم با همان عوض می‌شود.
 */

const LIST = SEED_PRICE_LIST;
const paper = LIST.paperTypes[DEFAULT_PAPER_TYPE_ID]!;
const binding = LIST.bindingTypes[DEFAULT_BINDING_TYPE_ID]!;
const shipping = LIST.shippingMethods[DEFAULT_SHIPPING_METHOD_ID]!;

/** نام منطقه‌های کرایه؛ خود تعرفه فقط شناسه دارد. */
const ZONES = [
  { id: 'tehran', name: 'تهران' },
  { id: 'other', name: 'شهرهای دیگر' },
] as const;

/** کمترین ردیف تعرفهٔ کرایهٔ یک منطقه: «از» همین است. */
function lowestShippingRials(zoneId: string): number {
  return Math.min(
    ...LIST.shippingRates
      .filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID && rate.zoneId === zoneId)
      .map((rate) => rate.priceRials),
  );
}

/** مثال: جزوهٔ ۱۲۰ صفحه‌ای سیاه‌سفید و دورو، یک نسخه، با همان `quote()` فلوی سفارش. */
export const EXAMPLE_PAGES = 120;
const exampleQuote = quote(
  {
    items: [
      {
        sections: [{ documentId: 'example', pageCount: EXAMPLE_PAGES }],
        rules: wholeDocumentRule(EXAMPLE_PAGES, 'bw', DEFAULT_PAPER_TYPE_ID),
        copies: 1,
        sidesMode: 'double',
        bindingTypeId: DEFAULT_BINDING_TYPE_ID,
      },
    ],
    shipping: null,
  },
  LIST,
);
const example = exampleQuote.items[0]!;

/** «1,600 تومان»: عدد در span خودش، واحد کوچک بیرون آن. */
function Tomans({ rials }: { rials: number }) {
  return (
    <>
      <span className="num">{formatTomans(rials, false)}</span> <small>تومان</small>
    </>
  );
}

export function Tariff() {
  const bands = binding.bands;
  return (
    <section id="tariff" className="home-sec" aria-labelledby="tariff-title">
      <h2 id="tariff-title" className="home-sec__title">
        تعرفه، بی هزینهٔ پنهان
      </h2>
      <p className="home-sec__sub">همان عددهایی که موقع سفارش حساب می‌شوند. قیمت کامل را پیش از هر ثبت‌نامی می‌بینی.</p>
      <div className="home-prices">
        <article className="home-price" data-testid="tariff-print">
          <div className="home-price__head">
            <span className="jy-icon jy-icon-printer" aria-hidden="true" />
            <h3>چاپ، هر رو</h3>
          </div>
          <dl>
            <div>
              <dt>سیاه‌سفید</dt>
              <dd>
                <Tomans rials={LIST.clickRates.bw ?? 0} />
              </dd>
            </div>
            <div>
              <dt>رنگی</dt>
              <dd>
                <Tomans rials={LIST.clickRates.color ?? 0} />
              </dd>
            </div>
          </dl>
          <p className="home-price__note">
            کاغذ <Inline text={paper.nameFa} />. هر برگ در چاپ دورو دو صفحه است.
          </p>
        </article>

        <article className="home-price" data-testid="tariff-binding">
          <div className="home-price__head">
            <span className="jy-icon jy-icon-binding" aria-hidden="true" />
            <h3>صحافی {binding.nameFa}</h3>
          </div>
          <p className="home-price__big">
            از <Tomans rials={Math.min(...bands.map((band) => band.priceRials))} />
          </p>
          <details>
            <summary>
              بر اساس تعداد برگ
              <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
            </summary>
            <table>
              <tbody>
                {bands.map((band, i) => (
                  <tr key={band.minSheets}>
                    <td>
                      {i === 0 ? (
                        <>
                          تا <span className="num">{formatNumber(band.maxSheets)}</span> برگ
                        </>
                      ) : (
                        <>
                          <span className="num">{formatNumber(band.minSheets)}</span> تا{' '}
                          <span className="num">{formatNumber(band.maxSheets)}</span>
                        </>
                      )}
                    </td>
                    <td className="num">{formatTomans(band.priceRials, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="home-price__note">
            بالای <span className="num">{formatNumber(binding.maxSheetsPerVolume)}</span> برگ خودکار چند جلد می‌شود.
          </p>
        </article>

        <article className="home-price" data-testid="tariff-shipping">
          <div className="home-price__head">
            <span className="jy-icon jy-icon-truck" aria-hidden="true" />
            <h3>ارسال با {shipping.nameFa}</h3>
          </div>
          <dl>
            {ZONES.map((zone) => (
              <div key={zone.id}>
                <dt>{zone.name}</dt>
                <dd>
                  از <Tomans rials={lowestShippingRials(zone.id)} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="home-price__note">شهر را در قدم آدرس انتخاب می‌کنی؛ کرایه تقریباً همین است.</p>
        </article>
      </div>

      <p className="home-example" data-testid="tariff-example">
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        <span>
          مثال: جزوهٔ <span className="num">{formatNumber(EXAMPLE_PAGES)}</span> صفحه‌ای، سیاه‌سفید و دورو (
          <span className="num">{formatNumber(example.sheets)}</span> برگ): چاپ{' '}
          <span className="num">{formatTomans(example.printRials, false)}</span> و صحافی{' '}
          <span className="num">{formatTomans(example.bindingRials, false)}</span>، روی هم{' '}
          <b>
            <span className="num">{formatTomans(exampleQuote.totalWithoutShippingRials, false)}</span> تومان
          </b>{' '}
          به‌علاوهٔ ارسال.
        </span>
      </p>
    </section>
  );
}
