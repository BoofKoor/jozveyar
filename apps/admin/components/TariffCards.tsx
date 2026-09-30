import type { PriceList } from '@jozveyar/contracts';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import Link from 'next/link';

import { formatNumber, formatTomans } from '@jozveyar/text';

import { rateRows, restRows, weightLabel, ZONES } from '../lib/tariff';
import { Segments } from './Segments';

/**
 * یک نسخهٔ تعرفه، فقط‌خواندنی (طرح پنل `m-tariff`): چاپ هر رو و کاغذ، صحافی بر حسب برگ، پست پیشتاز (وزن × منطقه)، و بقیه.
 * پول تومان است؛ هر عدد در `.num` خودش. `reportHref`: پیوند «کرایه‌ای که پست واقعاً گرفت» زیر کرایه‌ها، فقط برای مالک (گزارش
 * ارسال، ۶٫۴، تصمیم ۱۰۶).
 */
export function TariffCards({ list, reportHref }: { list: PriceList; reportHref?: string }) {
  const paper = list.paperTypes[DEFAULT_PAPER_TYPE_ID];
  const binding = list.bindingTypes[DEFAULT_BINDING_TYPE_ID];
  const post = list.shippingMethods[DEFAULT_SHIPPING_METHOD_ID];
  const othersOff = Object.entries(list.shippingMethods).every(([id, method]) => id === DEFAULT_SHIPPING_METHOD_ID || !method.enabled);

  return (
    <div className="ad-cards">
      <section className="jy-card" aria-labelledby="t-click" data-tariff="print">
        <h2 id="t-click" className="jy-card__title">
          چاپ، هر رو
        </h2>
        <table className="ad-table">
          <tbody>
            <tr>
              <th scope="row">سیاه‌سفید</th>
              <td>
                <span className="num">{formatTomans(list.clickRates.bw ?? 0, false)}</span> تومان
              </td>
            </tr>
            <tr>
              <th scope="row">رنگی</th>
              <td>
                <span className="num">{formatTomans(list.clickRates.color ?? 0, false)}</span> تومان
              </td>
            </tr>
            <tr>
              <th scope="row">کاغذ</th>
              <td>{paper?.nameFa ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        {paper?.ratePerSheetRials === 0 ? <p className="ad-hint ad-gap">یکرو و دورو هم‌قیمت‌اند؛ هر رو یک صفحه است.</p> : null}
      </section>

      {binding ? (
        <section className="jy-card" aria-labelledby="t-bind" data-tariff="binding">
          <h2 id="t-bind" className="jy-card__title">
            صحافی {binding.nameFa}
          </h2>
          <table className="ad-table">
            <thead>
              <tr>
                <th scope="col">برگ</th>
                <th scope="col">قیمت (تومان)</th>
              </tr>
            </thead>
            <tbody>
              {binding.bands.map((band) => (
                <tr key={band.minSheets}>
                  <td>
                    <span className="num">{formatNumber(band.minSheets)}</span> تا <span className="num">{formatNumber(band.maxSheets)}</span>
                  </td>
                  <td className="num">{formatTomans(band.priceRials, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ad-hint ad-gap">
            بالای <span className="num">{formatNumber(binding.maxSheetsPerVolume)}</span> برگ، جلد تازه.
          </p>
        </section>
      ) : null}

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
