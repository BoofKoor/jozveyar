import type { Metadata } from 'next';
import Link from 'next/link';

import type { PartnerView } from '@jozveyar/db';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { Segments } from '../../../../components/Segments';
import { StatusButton } from '../../../../components/StatusButton';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { partnerMeta } from '../../../../lib/partners';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { partnerStateAction } from '../../actions';

export const metadata: Metadata = { title: 'چاپخانه‌ها' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** «پیش‌فرض کن»، «غیرفعال کن» یا «فعال کن»: فرم بی JS، برگشت به همین فهرست. */
function StateForm({ gate, partner, intent, children }: { gate: string; partner: PartnerView; intent: string; children: React.ReactNode }) {
  return (
    <form action={partnerStateAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="id" value={partner.id} />
      <input type="hidden" name="intent" value={intent} />
      <StatusButton className="jy-btn jy-btn--text">{children}</StatusButton>
    </form>
  );
}

/** پیام پس از هر کار، فقط اگر هنوز راست است (مثل «تنظیمات»، ۴٫۶). */
function doneNote(done: string, partner: PartnerView | undefined) {
  if (!partner) return null;
  switch (done) {
    case 'create':
      return `چاپخانهٔ «${partner.name}» در ${partner.cityName} افزوده شد؛ سفارش‌های تازهٔ همین شهر، و بعد همین استان، به آن می‌روند.`;
    case 'update':
      return `«${partner.name}» ذخیره شد.`;
    case 'default':
      return partner.isDefault ? `«${partner.name}» حالا پیش‌فرض است: سفارشی که در شهر و استانش چاپخانه‌ای نیست، به آن می‌رود.` : null;
    case 'deactivate':
      return partner.deactivatedAt ? `«${partner.name}» غیرفعال شد؛ از این لحظه سفارش تازه نمی‌گیرد.` : null;
    case 'activate':
      return partner.deactivatedAt ? null : `«${partner.name}» دوباره فعال شد.`;
    default:
      return null;
  }
}

/**
 * چاپخانه‌ها (طرح پنل `m-partners`، برش ۵٫۲، ADR-042): فقط مالک. هر چاپخانه با شهر، سفارش‌های باز و کاربرها؛ «ویرایش» نام و
 * شهر، «پیش‌فرض کن» در خود فهرست، «غیرفعال کن» فقط برای چاپخانه‌ای که پیش‌فرض نیست و سفارش باز ندارد، و «فعال کن» برای
 * غیرفعال. سرور هر کار را خودش هم می‌سنجد.
 */
export default async function PartnersPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { partners } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'partners.manage')) return <NoAccess gate={gate} />;
  const result = await partners.list(session);
  if (!result.ok) return <NoAccess gate={gate} />;
  const list = result.value;
  const error = one(query, 'e');
  const target = list.find((partner) => partner.id === one(query, 'p'));
  const done = error ? null : doneNote(one(query, 'done'), target);

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">چاپخانه‌ها</h1>
          <p className="ad-sub">هر سفارش هنگام پرداخت به چاپخانهٔ همان شهر می‌رود، وگرنه همان استان، وگرنه پیش‌فرض.</p>
        </div>
        <Link href={panelPath(gate, '/partners/new')} className="jy-btn jy-btn--primary">
          <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          افزودن چاپخانه
        </Link>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : done ? <Alert tone="success">{done}</Alert> : null}
      <section className="jy-card" aria-labelledby="t-partners">
        <h2 id="t-partners" className="jy-card__title">
          <span className="num">{list.length}</span> چاپخانه
        </h2>
        <ul className="ad-partners">
          {list.map((partner) => (
            <li key={partner.id} data-partner={partner.name}>
              <div>
                <p>
                  <span className="ad-partners__name">{partner.name}</span>
                  {partner.isDefault ? <span className="jy-badge jy-badge--neutral">پیش‌فرض</span> : null}
                  {partner.deactivatedAt ? <span className="jy-badge jy-badge--neutral">غیرفعال</span> : null}
                </p>
                <p className="ad-partners__meta">
                  <Segments segs={partnerMeta(partner)} />
                </p>
              </div>
              <div className="ad-people__btns">
                {partner.deactivatedAt ? (
                  <StateForm gate={gate} partner={partner} intent="activate">
                    فعال کن
                  </StateForm>
                ) : (
                  <>
                    <Link href={panelPath(gate, `/partners/${partner.id}`)} className="jy-btn jy-btn--text">
                      ویرایش
                    </Link>
                    {partner.isDefault ? null : (
                      <StateForm gate={gate} partner={partner} intent="default">
                        پیش‌فرض کن
                      </StateForm>
                    )}
                    {partner.isDefault || partner.openOrders > 0 ? null : (
                      <StateForm gate={gate} partner={partner} intent="deactivate">
                        غیرفعال کن
                      </StateForm>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="ad-hint ad-gap">
          چاپخانه پاک نمی‌شود، غیرفعال می‌شود: سفارش‌های قبلی به آن اشاره می‌کنند. غیرفعال کردن فقط وقتی سفارش باز ندارد.
        </p>
      </section>
    </>
  );
}
