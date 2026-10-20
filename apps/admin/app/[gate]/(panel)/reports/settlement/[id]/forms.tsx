import Link from 'next/link';

import { panelPath } from '../../../../../../lib/gate';

/** بازهٔ صورت‌حساب برای برگشت فرم‌ها: فقط `d`، `from` و `to` به شکل خودشان. */
export function rangeOf(query: Record<string, string | string[] | undefined>): Record<string, string> {
  const pick = (key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');
  const d = pick('d');
  const from = pick('from');
  const to = pick('to');
  const day = (value: string) => /^[0-9۰-۹/]{1,10}$/.test(value);
  if (d === 'month' || d === 'last') return { d };
  return { ...(day(from) ? { from } : {}), ...(day(to) ? { to } : {}) };
}

/** «چاپخانه پیدا نشد» صفحه‌های فرم، با راه به نمای کلی. */
export function MissingPartner({ gate, partner }: { gate: string; partner: boolean }) {
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
      <h1 id="t-missing" className="jy-card__title">
        این چاپخانه پیدا نشد
      </h1>
      {partner ? null : (
        <div className="ad-actions">
          <Link href={panelPath(gate, '/reports/settlement')} className="jy-btn jy-btn--secondary">
            همهٔ چاپخانه‌ها
          </Link>
        </div>
      )}
    </section>
  );
}
