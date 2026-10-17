import type { PaperSize, PriceList } from '@jozveyar/contracts';
import { PAPER_SIZES, PAPER_SIZE_ORDER, offeredSizes } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import Link from 'next/link';

import { formatNumber, formatTomans } from '@jozveyar/text';

import { rateRows, restRows, tierRows, weightLabel, ZONES } from '../lib/tariff';
import { Segments } from './Segments';

/** «A4»، با جهت خودش. */
const Size = ({ size }: { size: PaperSize }) => <bdi>{PAPER_SIZES[size].label}</bdi>;

/** پیش‌فرض اول، بقیه به ترتیب نسخه. */
function defaultFirst<T>(table: Readonly<Record<string, T>>, defaultId: string): [string, T][] {
  const entries = Object.entries(table);
  return [...entries.filter(([id]) => id === defaultId), ...entries.filter(([id]) => id !== defaultId)];
}

/**
 * یک نسخهٔ تعرفه، فقط‌خواندنی (طرح پنل `m-tariff`؛ کاتالوگ از ۸٫۳): چاپ هر رو برای هر اندازه، یکرو و دورو؛ کاغذها با نرخ هر
 * برگ هر اندازه؛ صحافی‌ها با برگ هر جلد و بازه‌های هر اندازه؛ پست پیشتاز (وزن × منطقه)؛ و بقیه. پول تومان است؛ هر عدد در
 * `.num` خودش. `reportHref`: پیوند «کرایه‌ای که پست واقعاً گرفت» زیر کرایه‌ها، فقط برای مالک (گزارش ارسال، ۶٫۴، تصمیم ۱۰۶).
 */
export function TariffCards({ list, reportHref }: { list: PriceList; reportHref?: string }) {
  const sizes = offeredSizes(list);
  const papers = defaultFirst(list.paperTypes, DEFAULT_PAPER_TYPE_ID);
  const post = list.shippingMethods[DEFAULT_SHIPPING_METHOD_ID];
  const othersOff = Object.entries(list.shippingMethods).every(([id, method]) => id === DEFAULT_SHIPPING_METHOD_ID || !method.enabled);

  return (
    <div className="ad-cards">
      <section className="jy-card" aria-labelledby="t-click" data-tariff="print">
        <h2 id="t-click" className="jy-card__title">
          چاپ، هر رو
        </h2>
        <table className="ad-table ad-table--num">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">رنگ و اندازه</span>
              </th>
              <th scope="col">دورو</th>
              <th scope="col">یکرو</th>
            </tr>
          </thead>
          <tbody>
            {sizes.flatMap((size) =>
              (['bw', 'color'] as const).map((color) => {
                const rate = list.printRates[size]!;
                return (
                  <tr key={`${size}-${color}`}>
                    <th scope="row">
                      {color === 'bw' ? 'سیاه‌سفید' : 'رنگی'} <Size size={size} />
                    </th>
                    <td className="num">{formatTomans(rate.double[color], false)}</td>
                    <td className="num">{formatTomans(rate.single[color], false)}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
        <p className="ad-hint ad-gap">
          تومان؛ هر رو یک صفحه است.{' '}
          {sizes.length < PAPER_SIZE_ORDER.length ? (
            <>
              {PAPER_SIZE_ORDER.filter((size) => !sizes.includes(size)).map((size, i) => (
                <span key={size}>
                  {i > 0 ? ' و ' : null}
                  <Size size={size} />
                </span>
              ))}{' '}
              ارائه نمی‌شود.
            </>
          ) : null}
        </p>
      </section>

      <section className="jy-card" aria-labelledby="t-paper" data-tariff="paper">
        <h2 id="t-paper" className="jy-card__title">
          کاغذ
        </h2>
        <table className="ad-table ad-table--num">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">کاغذ</span>
              </th>
              <th scope="col">گرم</th>
              {sizes.map((size) => (
                <th key={size} scope="col">
                  <Size size={size} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {papers.map(([id, paper]) => (
              <tr key={id}>
                <th scope="row">
                  <bdi>{paper.nameFa}</bdi>
                  {paper.enabled ? null : <span className="ad-hint"> (خاموش)</span>}
                </th>
                <td className="num">{formatNumber(paper.gsm)}</td>
                {sizes.map((size) => (
                  <td key={size} className="num">
                    {paper.sheetRates[size] === undefined ? '—' : formatTomans(paper.sheetRates[size]!, false)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ad-hint ad-gap">
          تومان هر برگ، روی نرخ چاپ.
          {papers.some(([, paper]) => sizes.some((size) => paper.sheetRates[size] === undefined)) ? ' «—» یعنی این کاغذ آن اندازه را ندارد.' : ''}
        </p>
      </section>

      <section className="jy-card" aria-labelledby="t-bind" data-tariff="binding">
        <h2 id="t-bind" className="jy-card__title">
          صحافی
        </h2>
        {defaultFirst(list.bindingTypes, DEFAULT_BINDING_TYPE_ID).map(([id, binding]) => {
          const sized = sizes.filter((size) => binding.bands[size]?.length);
          return (
            <div key={id} className="ad-binding-view" data-binding={id}>
              <h3 className="ad-binding-view__name">
                <bdi>{binding.nameFa}</bdi>
                {binding.enabled ? null : <span className="ad-hint"> (خاموش)</span>}
              </h3>
              <p className="ad-hint">
                هر جلد <span className="num">{formatNumber(binding.minSheets)}</span> تا{' '}
                <span className="num">{formatNumber(binding.maxSheetsPerVolume)}</span> برگ؛ بالاتر{' '}
                {binding.splitsVolumes ? 'چند جلد می‌شود' : 'نمی‌خورد'} · وزن هر جلد{' '}
                <span className="num">{formatNumber(binding.weightPerVolumeGrams)}</span> گرم
              </p>
              {sized.map((size) => (
                <table key={size} className="ad-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        برگ{sizes.length > 1 ? <> (<Size size={size} />)</> : null}
                      </th>
                      <th scope="col">قیمت (تومان)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {binding.bands[size]!.map((band) => (
                      <tr key={band.minSheets}>
                        <td>
                          <span className="num">{formatNumber(band.minSheets)}</span> تا{' '}
                          <span className="num">{formatNumber(band.maxSheets)}</span>
                        </td>
                        <td className="num">{formatTomans(band.priceRials, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
              {sized.length === 0 ? <p className="ad-hint">در هیچ اندازه‌ای بازه ندارد.</p> : null}
            </div>
          );
        })}
      </section>

      {post ? (
        <section className="jy-card" aria-labelledby="t-ship" data-tariff="shipping">
          <h2 id="t-ship" className="jy-card__title">
            {post.nameFa}
          </h2>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">وزن</th>
                {ZONES.map((zone) => (
                  <th key={zone.id} scope="col">
                    {zone.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rateRows(list).map((row) => (
                <tr key={row.minGrams}>
                  <th scope="row">
                    <Segments segs={weightLabel(row.minGrams, row.maxGrams)} />
                  </th>
                  {row.prices.map((rials, i) => (
                    <td key={ZONES[i]!.id} className="num">
                      {rials === null ? '—' : formatTomans(rials, false)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ad-hint ad-gap">تومان.{othersOff ? ' روش‌های دیگر ارسال خاموش‌اند.' : ''}</p>
          {reportHref ? (
            <p className="ad-hint">
              <Link className="jy-link" href={reportHref}>
                کرایه‌ای که پست واقعاً گرفت
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="jy-card" aria-labelledby="t-tiers" data-tariff="tiers">
        <h2 id="t-tiers" className="jy-card__title">
          تخفیف سفارش بزرگ
        </h2>
        <table className="ad-table">
          <tbody>
            {tierRows(list).map((row, i) => (
              <tr key={i}>
                <th scope="row">
                  <Segments segs={row.label} />
                </th>
                <td>
                  <Segments segs={row.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ad-hint">روی جمع چاپ، کاغذ و صحافی، پیش از کرایه؛ فقط بالاترین پله‌ای که سفارش به آن رسیده، و با کد تخفیف جمع نمی‌شود.</p>
      </section>

      <section className="jy-card" aria-labelledby="t-rest" data-tariff="rest">
        <h2 id="t-rest" className="jy-card__title">
          بقیه
        </h2>
        <table className="ad-table">
          <tbody>
            {restRows(list).map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>
                  <Segments segs={row.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
