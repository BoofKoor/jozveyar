import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { OrderView, OrderViewDetails } from '@jozveyar/contracts/checkout';
import { formatNumber } from '@jozveyar/text';
import { Inline } from '../../../components/Inline';
import { ForgetDraft } from '../../../components/checkout/ForgetDraft';
import { OrderDock, PayAgainButton, PayAgainNote } from '../../../components/checkout/OrderPay';
import { FlowNav, SumValue, SummaryLines, Tomans, printLabel } from '../../../components/checkout/parts';
import { JozveBrief, Recap, RecapAddress, RecapDelivery, RecapJozveValue } from '../../../components/checkout/recap';
import { formatMobile } from '../../../lib/checkout/format';
import { AUTH_COOKIE, authTokenFrom, orderViewOf } from '../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

// صفحهٔ هر سفارش خصوصی است: نه در نتیجهٔ جست‌وجو، نه canonical صفحهٔ اصلی.
export const metadata: Metadata = {
  title: 'سفارش',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * صفحهٔ سفارش (`/order/<توکن>`، برش ۳ج؛ طرح `checkout.html`): برگشت از درگاه (`/pay/callback`) به اینجا
 * می‌رسد. کامپوننت سرور؛ فقط «دوباره پرداخت کن» جزیرهٔ کلاینت است.
 *
 * - **پرداخت‌شده:** «سفارش ثبت شد»، چهار گام بعد، و روز تحویل به پست (ADR-013).
 * - **در انتظار پرداخت:** اگر آخرین تلاش ناموفق بود «پرداخت انجام نشد»؛ همان مرور، با همان قیمت منجمد، و
 *   «دوباره پرداخت کن». سفارش ساخته شده، پس مرور پیوند ویرایش ندارد.
 * - **منقضی:** پیام روشن و «دوباره بینداز».
 * - **غریبه** (نه صاحب سفارش، ADR-033): فقط شماره، وضعیت و روز تحویل به پست.
 *
 * پشت حالت مسیر خرید نیست: سفارش پرداخت‌شده با خاموش شدن خرید گم نمی‌شود.
 */
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const authToken = authTokenFrom((await cookies()).get(AUTH_COOKIE)?.value);
  const result = await orderViewOf(token, authToken);
  if (!result || !result.ok) notFound();
  const view = result.value;

  if (!view.details) return <Stranger view={view} />;
  if (view.status === 'expired' || (view.status === 'awaiting_payment' && !view.details.canPay)) return <Expired view={view} />;
  return <Owner token={token.toLowerCase()} view={view} details={view.details} />;
}

/** نشانهٔ حالت سفارش: صفحه green-50، سربرگ بی ناوبری و لوگو بی پیوند (globals.css)، و شبکهٔ سفارش (home.css). */
const OrderMode = () => <span hidden data-jozve="" />;

function statusBadge(status: OrderView['status']) {
  if (status === 'paid') {
    return (
      <span className="jy-badge jy-badge--success">
        <span className="jy-icon jy-icon-success" aria-hidden="true" />
        پرداخت شد
      </span>
    );
  }
  if (status === 'awaiting_payment') {
    return (
      <span className="jy-badge jy-badge--warning">
        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
        در انتظار پرداخت
      </span>
    );
  }
  return (
    <span className="jy-badge jy-badge--error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      منقضی
    </span>
  );
}

function OrderTitle({ view }: { view: OrderView }) {
  return (
    <div className="jy-card__head">
      <h1 className="jy-card__title">
        سفارش <span className="num">{view.number}</span>
      </h1>
      {statusBadge(view.status)}
    </div>
  );
}

/** نه صاحب سفارش: شماره، وضعیت و روز تحویل به پست، بی نشانی و موبایل و مبلغ. */
function Stranger({ view }: { view: OrderView }) {
  return (
    <main className="site-wrap ck-solo">
      <OrderMode />
      <section className="jy-card" data-testid="order-stranger">
        <OrderTitle view={view} />
        {view.status === 'paid' && view.postHandoffDay ? (
          <p className="ck-sub">
            تحویل به پست تا <Inline text={view.postHandoffDay} />.
          </p>
        ) : null}
        <p className="ck-sub">جزئیات این سفارش فقط با همان گوشی و مرورگری دیده می‌شود که با آن سفارش داده شد.</p>
      </section>
    </main>
  );
}

/** فایل‌ها دیگر روی سرور نیستند: این سفارش پرداختنی نیست. راه جلو، جزوهٔ تازه با قیمت امروز. */
function Expired({ view }: { view: OrderView }) {
  return (
    <main className="site-wrap ck-solo">
      <OrderMode />
      <section className="jy-card" data-testid="order-expired">
        <OrderTitle view={{ ...view, status: 'expired' }} />
        <div className="ck-card-note">
          <p className="jy-note jy-note--warning">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              این سفارش پرداخت نشد و فایل‌هایش دیگر روی سرور نمی‌مانند، پس دیگر پرداختنی نیست. جزوه را دوباره
              بینداز تا با قیمت امروز سفارش بدهی؛ از حسابت پولی کم نشده.
            </span>
          </p>
        </div>
        <a className="jy-btn jy-btn--primary jy-btn--lg ck-card-note" href="/">
          دوباره بینداز
        </a>
      </section>
    </main>
  );
}

function Owner({ token, view, details }: { token: string; view: OrderView; details: OrderViewDetails }) {
  const paid = view.status === 'paid';
  const breakdown = details.breakdown;
  const item = details.items[0]!;
  const lineItem = breakdown.items[0]!;
  const place = details.shipping.cityName ?? `استان ${details.shipping.provinceName}`;
  const print = printLabel(item.colorMode, item.sidesMode);
  const files = item.sections.map((section) => ({ name: section.name, pageCount: section.pageCount }));
  const failed = details.lastPayment?.status === 'failed';

  return (
    <main>
      <OrderMode />
      {/* پیش‌نویس جزوهٔ همین سفارش در این زبانه (۳د) */}
      {paid ? <ForgetDraft token={token} /> : null}
      <div className="site-wrap home-more">
        <FlowNav current={paid ? 'done' : 3} />

        <div className="home-desk">
          {paid ? (
            <section className="jy-card" aria-labelledby="order-title" data-testid="order-paid">
              <span className="jy-icon jy-icon-success ck-done__icon" aria-hidden="true" />
              <h1 id="order-title" className="ck-done__title">
                سفارش ثبت شد
              </h1>
              <p className="ck-sub">
                سفارش <span className="num">{view.number}</span> · <Tomans rials={details.totalRials} /> تومان پرداخت شد.
                شمارهٔ سفارش را به <span className="num">{formatMobile(details.recipient.phone)}</span> هم پیامک کردیم.
              </p>
              <ol className="ck-steps">
                <li className="is-done">
                  <span className="ck-steps__dot">
                    <span className="jy-icon jy-icon-check" aria-hidden="true" />
                  </span>
                  <b>پرداخت</b>
                  <span className="ck-steps__t">
                    {details.refId ? (
                      <>
                        کد پیگیری بانک <span className="num">{details.refId}</span>
                      </>
                    ) : (
                      'پرداخت تأیید شد.'
                    )}
                  </span>
                </li>
                <li className="is-now" aria-current="step">
                  <span className="ck-steps__dot" />
                  <b>چاپ و صحافی</b>
                  <span className="ck-steps__t">جزوه‌ات در صف چاپ است.</span>
                </li>
                <li>
                  <span className="ck-steps__dot" />
                  <b data-testid="handoff-day">
                    تحویل به پست تا <Inline text={view.postHandoffDay ?? ''} />
                  </b>
                  <span className="ck-steps__t">
                    حداکثر <span className="num">{formatNumber(view.slaDays)}</span> روز کاری بعد از پرداخت.
                  </span>
                </li>
                <li>
                  <span className="ck-steps__dot" />
                  <b>کد رهگیری پست</b>
                  <span className="ck-steps__t">با پیامک می‌آید؛ مسیر بسته را با آن می‌بینی.</span>
                </li>
              </ol>
              <a className="jy-btn jy-btn--secondary" href="/">
                جزوهٔ دیگری داری؟ بینداز
              </a>
            </section>
          ) : (
            <>
              {failed ? (
                <p className="jy-note jy-note--error" role="alert" data-testid="payment-failed">
                  <span className="jy-icon jy-icon-error" aria-hidden="true" />
                  <span>
                    <b className="font-semibold">پرداخت انجام نشد.</b> بانک پرداخت را تأیید نکرد، یا از درگاه برگشتی. اگر
                    پولی از حسابت کم شده، تا <span className="num">72</span> ساعت خودکار برمی‌گردد.
                  </span>
                </p>
              ) : null}
              <PayAgainNote />
              <section className="jy-card" aria-labelledby="order-title" data-testid="order-awaiting">
                <div className="jy-card__head">
                  <h1 id="order-title" className="jy-card__title">
                    سفارش <span className="num">{view.number}</span>
                  </h1>
                  {statusBadge(view.status)}
                </div>
                <p className="ck-sub">سفارشت با همین قیمت نگه داشته شده؛ هر وقت آماده بودی، دوباره پرداخت کن.</p>
                <Recap
                  rows={[
                    {
                      label: 'جزوه',
                      value: (
                        <RecapJozveValue
                          jozve={{ files, pageCount: item.pageCount, print, bindingName: item.bindingName, copies: item.copies }}
                        />
                      ),
                    },
                    {
                      label: 'ارسال به',
                      value: (
                        <RecapAddress
                          name={details.recipient.name}
                          city={place}
                          addressText={details.recipient.addressText}
                          postalCode={details.recipient.postalCode}
                        />
                      ),
                    },
                    {
                      label: 'موبایل',
                      value: (
                        <>
                          <span className="num">{formatMobile(details.recipient.phone)}</span>
                          <span className="jy-badge jy-badge--success">
                            <span className="jy-icon jy-icon-success" aria-hidden="true" />
                            تأیید شد
                          </span>
                        </>
                      ),
                    },
                    { label: 'تحویل', value: <RecapDelivery method={details.shipping.methodName} slaDays={view.slaDays} /> },
                  ]}
                />
              </section>
            </>
          )}
        </div>

        <aside className="home-side" aria-labelledby="summary-title">
          <div className="jy-card home-sum">
            <h2 id="summary-title" className="jy-card__title">
              خلاصهٔ سفارش
            </h2>
            <JozveBrief files={files} pageCount={item.pageCount} />
            <SummaryLines
              item={lineItem}
              print={print}
              bindingName={item.bindingName}
              shipping={
                breakdown.shippingRials !== null
                  ? { label: `ارسال ${details.shipping.methodName} به ${place}`, rials: breakdown.shippingRials }
                  : null
              }
            />
            <div className="home-sum__total">
              <span className="home-sum__label">{paid ? 'پرداخت شد' : 'جمع'}</span>
              <SumValue rials={details.totalRials} testId="summary-total" />
            </div>
            <p className="home-sum__ship">
              <span className="jy-icon jy-icon-truck" aria-hidden="true" />
              {paid && view.postHandoffDay ? (
                <span>
                  تحویل به پست تا <Inline text={view.postHandoffDay} />.
                </span>
              ) : (
                <span>
                  تحویل به پست تا <span className="num">{formatNumber(view.slaDays)}</span> روز کاری بعد از پرداخت.
                </span>
              )}
            </p>
            {paid ? null : (
              <>
                <PayAgainButton token={token} />
                <p className="home-sum__secure">
                  <span className="jy-icon jy-icon-lock" aria-hidden="true" />
                  پرداخت امن با همهٔ کارت‌های بانکی
                </p>
                <p className="home-sum__terms">
                  با پرداخت،{' '}
                  <a href="/terms" target="_blank" rel="noopener">
                    قوانین جزوه‌یار
                  </a>{' '}
                  را می‌پذیری.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      {paid ? null : <OrderDock token={token} totalRials={details.totalRials} ship={`${details.shipping.methodName} به ${place}`} />}
    </main>
  );
}
