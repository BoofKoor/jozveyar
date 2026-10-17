import type { Metadata } from 'next';
import Link from 'next/link';

import type { DiscountCodeView } from '@jozveyar/db';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { Segments } from '../../../../components/Segments';
import { StatusButton } from '../../../../components/StatusButton';
import { DISCOUNT_STATE_LABEL, discountState, discountTermsText, discountUseText, discountWindowText, type DiscountState } from '../../../../lib/discounts';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { disableDiscountAction } from '../../actions';

export const metadata: Metadata = { title: 'تخفیف‌ها' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** نشان حال کد: روشن موفق، هنوز شروع نشده اطلاع، بقیه خنثی؛ همیشه با متن. نام کلاس‌ها کامل و ثابت. */
const STATE_BADGE: Record<DiscountState, string> = {
  on: 'jy-badge jy-badge--success',
  soon: 'jy-badge jy-badge--info',
  off: 'jy-badge jy-badge--neutral',
  ended: 'jy-badge jy-badge--neutral',
  full: 'jy-badge jy-badge--neutral',
};

function StateBadge({ state }: { state: DiscountState }) {
  return (
    <span className={STATE_BADGE[state]} data-discount-state={state}>
      {state === 'on' ? <span className="jy-icon jy-icon-success" aria-hidden="true" /> : null}
      {DISCOUNT_STATE_LABEL[state]}
    </span>
  );
}

/** پیام پس از هر کار، فقط اگر هنوز راست است (مثل «چاپخانه‌ها»). */
function doneNote(done: string, code: DiscountCodeView | undefined, now: Date) {
  if (!code) return null;
  const state = discountState(code, now);
  switch (done) {
    case 'create':
      return state === 'on'
        ? `کد ${code.code} ساخته شد و از همین حالا در «مرور و پرداخت» پذیرفته است.`
        : state === 'soon'
          ? `کد ${code.code} ساخته شد؛ از روز اولش پذیرفته است.`
          : `کد ${code.code} ساخته شد، خاموش؛ تا روشنش نکنی پذیرفته نیست.`;
    case 'update':
      return `کد ${code.code} ذخیره شد.`;
    case 'same':
      return `در کد ${code.code} چیزی عوض نشد.`;
    case 'disable':
      return code.enabled
        ? null
        : `کد ${code.code} خاموش شد؛ سفارش تازه با آن ساخته نمی‌شود. سفارشی که پیش‌تر با آن ساخته شده همان قیمت را دارد و هنوز پرداخت‌شدنی است.`;
    default:
      return null;
  }
}

/**
 * تخفیف‌ها (برش ۱۱٫۴، ADR-062؛ سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۴): کدهای تخفیف، تازه‌ترین اول، هر کدام با حال همین لحظه، تخفیف، روزها و شمار
 * استفاده و رزرو. مالک «کد تازه» می‌سازد، هر کد را ویرایش می‌کند و «خاموش کن» را بی کد تازه می‌زند؛ حسابدار فقط می‌بیند. تخفیف سفارش
 * بزرگ جای دیگری است: پله‌های نسخهٔ تعرفه.
 */
export default async function DiscountsPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { discounts } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'discounts.read')) return <NoAccess gate={gate} session={session} />;
  const result = await discounts.list(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, codes, canManage } = result.value;
  const error = one(query, 'e');
  const target = codes.find((code) => code.id === one(query, 'd'));
  const done = error ? null : doneNote(one(query, 'done'), target, now);

  return (
    <>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">تخفیف‌ها</h1>
          <p className="ad-sub">
            مشتری کد را در «مرور و پرداخت» وارد می‌کند و تخفیفش از جمع چاپ، کاغذ و صحافی کم می‌شود. تخفیف سفارش بزرگ با پله‌های{' '}
            {can(session, 'tariff.read') ? (
              <Link href={panelPath(gate, '/tariff')} className="jy-link">
                تعرفه
              </Link>
            ) : (
              'تعرفه'
            )}{' '}
            است؛ هر سفارش فقط یکی را می‌گیرد، هر کدام بیشتر.
          </p>
        </div>
        {canManage ? (
          <Link href={panelPath(gate, '/discounts/new')} className="jy-btn jy-btn--primary">
            <span className="jy-icon jy-icon-plus" aria-hidden="true" />
            کد تازه
          </Link>
        ) : null}
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : done ? <Alert tone="success">{done}</Alert> : null}
      <section className="jy-card" aria-labelledby="t-discounts">
        <h2 id="t-discounts" className="jy-card__title">
          {codes.length === 0 ? (
            'هنوز کدی نیست'
          ) : (
            <>
              <span className="num">{codes.length}</span> کد
            </>
          )}
        </h2>
        {codes.length === 0 ? (
          <p className="ad-lead">{canManage ? 'با «کد تازه» اولین کد را بساز.' : 'مالک پنل کدها را می‌سازد.'}</p>
        ) : (
          <ul className="ad-partners ad-discounts">
            {codes.map((code) => {
              const state = discountState(code, now);
              return (
                <li key={code.id} data-discount={code.code}>
                  <div>
                    <p>
                      <bdi className="ad-ltr ad-code ad-partners__name">{code.code}</bdi>
                      <StateBadge state={state} />
                    </p>
                    <p className="ad-partners__meta">
                      <Segments segs={discountTermsText(code)} /> · <Segments segs={discountWindowText(code)} />
                    </p>
                    <p className="ad-partners__meta" data-discount-uses>
                      استفاده: <Segments segs={discountUseText(code)} />
                      {code.note ? <> · {code.note}</> : null}
                    </p>
                  </div>
                  <div className="ad-people__btns">
                    <Link href={panelPath(gate, `/discounts/${code.id}`)} className="jy-btn jy-btn--text">
                      {canManage ? 'ویرایش' : 'جزئیات'}
                    </Link>
                    {canManage && code.enabled ? (
                      <form action={disableDiscountAction}>
                        <input type="hidden" name="gate" value={gate} />
                        <input type="hidden" name="id" value={code.id} />
                        <input type="hidden" name="seen" value={code.updatedAt.getTime()} />
                        <StatusButton className="jy-btn jy-btn--text">خاموش کن</StatusButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="ad-hint ad-gap">
          کد پاک نمی‌شود، خاموش می‌شود: سفارش‌هایی که با آن ساخته شده‌اند به آن اشاره می‌کنند. نوع، مقدار، سقف و حداقل پس از اولین سفارش
          عوض نمی‌شوند؛ روزها، سقف‌ها، روشن و یادداشت هر وقت. «استفاده» سفارش‌های پرداخت‌شده است، لغوشده هم.
        </p>
      </section>
    </>
  );
}
