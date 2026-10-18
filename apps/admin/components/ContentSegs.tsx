import { Fragment } from 'react';

import type { ContentSeg } from '../lib/content';

/**
 * متن تکه‌تکهٔ `lib/content.ts` (برش ۱۱٫۱): عدد در `.num` خودش، نوشتهٔ لاتین (`tel:`، نشانی) در `bdi` چپ‌به‌راست، و نحو Markdown یا نام
 * جای‌نگهدار با زمینهٔ `ad-ph`، جدا از جملهٔ فارسی.
 */
export function ContentSegs({ segs }: { segs: readonly ContentSeg[] }) {
  return (
    <>
      {segs.map((seg, i) =>
        typeof seg === 'string' ? (
          <Fragment key={i}>{seg}</Fragment>
        ) : 'num' in seg ? (
          <span key={i} className="num">
            {seg.num}
          </span>
        ) : 'ph' in seg ? (
          <span key={i} className="ad-ph">
            {seg.ph}
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
