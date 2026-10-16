import type { PanelOrderNote } from '@jozveyar/db';

import { whenText } from '../lib/format';

/**
 * یادداشت‌های داخلی یک سفارش (برش ۹٫۳، ADR-058)، به ترتیب نوشتن: متن با خط‌هایش، و زیرش نویسنده و زمان. `visibility` نشان «چاپخانه هم
 * می‌بیند» را برای مالک و متصدی می‌گذارد؛ چاپخانه جز همین‌ها یادداشتی ندارد، پس نشان برایش چیزی نمی‌گوید. هم صفحهٔ سفارش، هم مشخصات
 * فهرست جمع‌وجور (۹٫۱).
 */
export function OrderNotes({ notes, now, visibility }: { notes: readonly PanelOrderNote[]; now: Date; visibility: boolean }) {
  return (
    <ol className="ad-notes">
      {notes.map((note) => (
        <li key={note.id} data-note={note.partnerVisible ? 'partner' : 'internal'}>
          <p className="ad-note__body" dir="auto">
            {note.body}
          </p>
          <p className="ad-note__meta">
            <span>
              {note.adminName ?? 'ادمین'} · {whenText(note.at, now)}
            </span>
            {visibility && note.partnerVisible ? <span className="jy-badge jy-badge--neutral">چاپخانه هم می‌بیند</span> : null}
          </p>
        </li>
      ))}
    </ol>
  );
}
