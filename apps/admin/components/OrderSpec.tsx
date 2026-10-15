import Link from 'next/link';

import type { PanelOrderSpec } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { panelPath } from '../lib/gate';
import { breakdownOf, specLine, specSum, zipNote, zipView } from '../lib/orders';
import { FileWarnings } from './FileWarnings';
import { Segments } from './Segments';
import { ZipButton } from './ZipButton';

/**
 * مشخصات فایل‌های یک سفارش در فهرست جمع‌وجور (برش ۹٫۱، طرح `m-l91`؛ سؤال‌های ۲۲۹ تا ۲۳۴): برای هر جزوه یک کارت، با یک خط مشخصات،
 * فایل‌ها به ترتیب صحافی با صفحهٔ هر کدام، خط جمع و هشدارهای فایل ۸٫۱؛ و زیرشان «همهٔ فایل‌ها (zip)» و «صفحهٔ کامل سفارش». دانلود
 * تک‌تک و «PDF اصلی جزوه» فقط در صفحهٔ سفارش، کنار «چه عوض شد».
 */
export function OrderSpec({ gate, spec, at, canZip }: { gate: string; spec: PanelOrderSpec; at: Date; canZip: boolean }) {
  const { order } = spec;
  const breakdown = breakdownOf(order);
  const many = spec.items.length > 1;
  const zip = zipView(spec, at);
  const page = panelPath(gate, `/orders/${order.orderNumber}`);
  return (
    <div className="ad-fold__body">
      {spec.items.map((item, i) => (
        <section key={item.id} className="ad-jz" aria-label={many ? `جزوهٔ ${item.seq}` : 'جزوه'}>
          <p className="ad-jz__head">
            <b>
              {many ? (
                <>
                  جزوهٔ <span className="num">{item.seq}</span>
                </>
              ) : (
                'جزوه'
              )}
            </b>
            <span className="ad-jz__spec">
              <Segments segs={specLine(item)} />
            </span>
          </p>
          <ol className="ad-files">
            {item.sections.map((section) => (
              <li key={section.seq}>
                <span className="ad-files__n num">{section.seq}</span>
                <span className="ad-files__name" dir="auto">
                  {section.originalName}
                </span>
                <span className="ad-files__pages">
                  <span className="num">{formatNumber(section.pageCount)}</span> صفحه
                </span>
              </li>
            ))}
          </ol>
          <p className="ad-jz__sum">
            <Segments segs={specSum(item, breakdown.items[i])} />
          </p>
          <FileWarnings item={item} />
        </section>
      ))}
      <div className="ad-zip">
        {canZip ? (
          <ZipButton gate={gate} orderNumber={order.orderNumber} view={zip} />
        ) : null}
        {/* سفارش پرداخت‌نشده، بسته یا پاک‌شده دکمه ندارد؛ یادداشتش همان صفحهٔ سفارش است. */}
        {canZip && (zip.kind === 'ready' || zip.kind === 'waiting' || zip.kind === 'failed') ? null : (
          <p className="ad-zip__meta">
            <Segments segs={zipNote(zip)} />
          </p>
        )}
        <Link className="jy-btn jy-btn--text ad-zip__page" href={page}>
          صفحهٔ کامل سفارش
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
