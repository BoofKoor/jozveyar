import { Fragment } from 'react';

import type { Seg } from '../lib/orders';
import { Barcode } from './Barcode';

/**
 * متن تکه‌تکهٔ `lib/orders.ts`: عدد در `.num` خودش، نام لاتین در `bdi` چپ‌به‌راست، نام فایل و فونت مشتری در `bdi` با جهت خودش (فارسی
 * راست‌به‌چپ، لاتین چپ‌به‌راست؛ برش ۸٫۱) و کد رهگیری در `jy-barcode`، جدا از جملهٔ فارسی.
 */
export function Segments({ segs }: { segs: readonly Seg[] }) {
  return (
    <>
      {segs.map((seg, i) =>
        typeof seg === 'string' ? (
          <Fragment key={i}>{seg}</Fragment>
        ) : 'num' in seg ? (
          <span key={i} className="num">
            {seg.num}
          </span>
        ) : 'barcode' in seg ? (
          <Barcode key={i} code={seg.barcode} />
        ) : 'name' in seg ? (
          <bdi key={i}>{seg.name}</bdi>
        ) : (
          <bdi key={i} className="ad-ltr">
            {seg.ltr}
          </bdi>
        ),
      )}
    </>
  );
}
