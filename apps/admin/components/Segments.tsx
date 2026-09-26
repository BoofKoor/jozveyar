import { Fragment } from 'react';

import type { Seg } from '../lib/orders';

/** متن تکه‌تکهٔ `lib/orders.ts`: عدد در `.num` خودش و نام لاتین در `bdi`، جدا از جملهٔ فارسی. */
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
        ) : (
          <bdi key={i} className="ad-ltr">
            {seg.ltr}
          </bdi>
        ),
      )}
    </>
  );
}
