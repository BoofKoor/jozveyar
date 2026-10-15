import { panelPath } from '../lib/gate';
import { zipFileName, zipNote, type ZipView } from '../lib/orders';
import { Segments } from './Segments';

/**
 * «همهٔ فایل‌ها (zip)» یک سفارش (برش ۹٫۱، سؤال‌های ۲۳۱ و ۲۳۲): آماده یعنی پیوند دانلود، با شمار فایل و حجم کنارش؛ در حال ساختن یا
 * ساخته نشد یعنی دکمهٔ بسته با دلیل و راه جلو. سفارش پرداخت‌نشده، بسته‌ای که فایل چاپ نساخت، و پاک‌شده هیچ: کارت جزوه همان را
 * می‌گوید. پیوند ساده است، نه `Link`: پاسخ فایل است، نه صفحه.
 */
export function ZipButton({
  gate,
  orderNumber,
  view,
  block = false,
}: {
  gate: string;
  orderNumber: number;
  view: ZipView;
  /** ستون کنار صفحهٔ سفارش: دکمهٔ تمام‌عرض و یادداشت زیرش. */
  block?: boolean;
}) {
  if (view.kind !== 'ready' && view.kind !== 'waiting' && view.kind !== 'failed') return null;
  const className = `jy-btn jy-btn--secondary${block ? ' jy-btn--block' : ''}`;
  const label = (
    <>
      <span className="jy-icon jy-icon-download" aria-hidden="true" />
      همهٔ فایل‌ها (zip)
    </>
  );
  return (
    <>
      {view.kind === 'ready' ? (
        <a className={className} href={panelPath(gate, `/orders/${orderNumber}/zip`)} download={zipFileName(orderNumber)} data-zip="ready">
          {label}
        </a>
      ) : (
        <button type="button" className={`${className} is-status`} aria-disabled="true" data-zip={view.kind}>
          {label}
        </button>
      )}
      <p className={block ? 'ad-hint' : 'ad-zip__meta'}>
        <Segments segs={zipNote(view)} />
      </p>
    </>
  );
}
