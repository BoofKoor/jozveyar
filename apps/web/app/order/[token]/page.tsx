import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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
  // دیوار دوم (برش ۶٫۳، ADR-047): نشانی صفحه توکن سفارش است و به هیچ سایت دیگری نمی‌رود، حتی اگر پیوندی `noreferrer` نداشت. نشان
  // اینماد پاورقی `referrerpolicy="origin"` خودش را دارد (ADR-032).
  referrer: 'no-referrer',
};

/**
 * صفحهٔ سفارش (`/order/<توکن>`، برش ۳ج؛ طرح `checkout.html`): برگشت از درگاه (`/pay/callback`) به اینجا
 * می‌رسد. کامپوننت سرور؛ فقط «دوباره پرداخت کن» جزیرهٔ کلاینت است.
 *
 * - **پرداخت‌شده:** «سفارش ثبت شد»، چهار گام بعد، و روز تحویل به پست (ADR-013).
 * - **وضعیت‌های پنل** (برش ۴٫۳، طرح `admin.html`، سؤال ۲۷): «جزوه‌ات در حال چاپ است»، «جزوه‌ات به پست رسید» با
 *   روزش، و «سفارش لغو شد … مبلغ پرداختی برمی‌گردد». دلیل لغو فقط در پنل است. پیامکی با تغییر وضعیت نیست (سؤال ۱۸).
 * - **در انتظار پرداخت:** اگر آخرین تلاش ناموفق بود «پرداخت انجام نشد»؛ همان مرور، با همان قیمت منجمد، و
 *   «دوباره پرداخت کن». سفارش ساخته شده، پس مرور پیوند ویرایش ندارد.
 * - **منقضی:** پیام روشن و «دوباره بینداز».
 * - **غریبه** (نه صاحب سفارش، ADR-033): فقط شماره، وضعیت و روز تحویل به پست؛ از ۶٫۳ اینکه کد رهگیری پیامک شد، بی خود کد.
 * - **کد رهگیری** (برش ۶٫۳، ADR-047، طرح `m-c-shipped`): صاحب سفارش گام «کد رهگیری پست» را انجام‌شده می‌بیند، با کد هر بستهٔ زنده و
 *   «رهگیری در سایت پست» (فقط `<a>` در زبانهٔ تازه با `noopener noreferrer`؛ چیزی از سایت پست بار نمی‌شود، قاعدهٔ ۸).
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

/** پرداخت‌شده، هر وضعیتی که پنل بعدش داده (برش ۴٫۳). */
const PAID: ReadonlySet<OrderView['status']> = new Set(['paid', 'printing', 'handed_to_post', 'cancelled']);

/** برچسب وضعیت؛ رنگ همیشه با آیکون و متن. نام کلاس‌ها کامل‌اند: Tailwind فقط آیکونی را می‌سازد که نامش در کد است. */
const BADGES: Record<OrderView['status'], { badge: string; icon: string; label: string }> = {
  paid: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-success', label: 'پرداخت شد' },
  printing: { badge: 'jy-badge jy-badge--info', icon: 'jy-icon jy-icon-printer', label: 'در حال چاپ' },
  handed_to_post: { badge: 'jy-badge jy-badge--success', icon: 'jy-icon jy-icon-truck', label: 'تحویل پست شد' },
  cancelled: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error', label: 'لغو شد' },
  awaiting_payment: { badge: 'jy-badge jy-badge--warning', icon: 'jy-icon jy-icon-warning', label: 'در انتظار پرداخت' },
  expired: { badge: 'jy-badge jy-badge--error', icon: 'jy-icon jy-icon-error', label: 'منقضی' },
};

function statusBadge(status: OrderView['status']) {
  const { badge, icon, label } = BADGES[status];
  return (
    <span className={badge}>
      <span className={icon} aria-hidden="true" />
      {label}
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
        {(view.status === 'paid' || view.status === 'printing') && view.postHandoffDay ? (
          <p className="ck-sub">
            تحویل به پست تا <Inline text={view.postHandoffDay} />.
          </p>
        ) : null}
        {view.handedToPost ? (
          <p className="ck-sub">
            <Inline text={view.handedToPost.day} /> تحویل پست شد.
          </p>
        ) : null}
        {view.trackingSent ? (
          <p className="ck-sub" data-testid="tracking-sent">
            کد رهگیری به موبایل گیرنده پیامک شد.
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

/** یک گام «بعد از پرداخت»: انجام‌شده (تیک)، همین حالا، یا بعد. */
function Step({ state, title, text, testId }: { state: 'done' | 'now' | 'next'; title: ReactNode; text: ReactNode; testId?: string }) {
  return (
    <li className={state === 'done' ? 'is-done' : state === 'now' ? 'is-now' : undefined} aria-current={state === 'now' ? 'step' : undefined}>
      <span className="ck-steps__dot">{state === 'done' ? <span className="jy-icon jy-icon-check" aria-hidden="true" /> : null}</span>
      <b data-testid={testId}>{title}</b>
      <span className="ck-steps__t">{text}</span>
    </li>
  );
}

/**
 * کد رهگیری پست ۲۴ رقمی (کیت `jy-barcode`، طرح برش ۶): شش گروه چهارتایی برای خواندن؛ فاصله در CSS است، پس کپی همان ۲۴ رقم است و
 * یک کلیک همه را انتخاب می‌کند؛ چپ‌به‌راست جدا از جملهٔ فارسی.
 */
function Barcode({ code }: { code: string }) {
  return (
    <span className="jy-barcode jy-barcode--lg" data-barcode={code}>
      {(code.match(/.{1,4}/g) ?? [code]).map((group, i) => (
        <span key={i}>{group}</span>
      ))}
    </span>
  );
}

/**
 * گام «کد رهگیری پست» انجام‌شده (برش ۶٫۳، طرح `m-c-shipped`): هر بستهٔ زنده کد خودش و پیوند سایت پست را دارد، به ترتیب ثبت. «هم
 * پیامک شد» فقط وقتی پیامکی واقعاً رفت؛ قول پیامکی را که نرفته نمی‌دهیم.
 */
function TrackingStep({ parcels, phone }: { parcels: OrderViewDetails['parcels']; phone: string }) {
  const sent = parcels.some((parcel) => parcel.smsSent);
  return (
    <li className="is-done" data-testid="tracking">
      <span className="ck-steps__dot">
        <span className="jy-icon jy-icon-check" aria-hidden="true" />
      </span>
      <b>کد رهگیری پست</b>
      <span className="ck-steps__t">
        {parcels.length > 1 ? (
          <>
            <span className="num">{formatNumber(parcels.length)}</span> بسته؛ هر کدام کد خودش را دارد.{' '}
          </>
        ) : null}
        {sent ? (
          <>
            به <span className="num">{formatMobile(phone)}</span> هم پیامک شد.
          </>
        ) : (
          'مسیر بسته را با این کد در سایت پست ببین.'
        )}
      </span>
      {parcels.map((parcel) => (
        <div key={parcel.barcode} className="ck-track">
          <Barcode code={parcel.barcode} />
          {/* فقط پیوند؛ چیزی از سایت پست بار نمی‌شود (قاعدهٔ ۸)، و نشانی این صفحه به آنجا نمی‌رود. */}
          <a className="jy-btn jy-btn--secondary" href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer">
            رهگیری در سایت پست<span className="sr-only"> (زبانهٔ تازه)</span>
          </a>
        </div>
      ))}
    </li>
  );
}

/**
 * سفارش پرداخت‌شده: «ثبت شد» (در صف چاپ)، «در حال چاپ»، «به پست رسید» یا «لغو شد» (برش ۴٫۳، طرح پنل `m-c-*`). گام‌ها
 * همان چهار گام «ثبت شد»، هر کدام به جای خودش.
 */
function PaidCard({ view, details }: { view: OrderView; details: OrderViewDetails }) {
  const payment = (
    <Step
      state="done"
      title="پرداخت"
      text={
        details.refId ? (
          <>
            کد پیگیری بانک <span className="num">{details.refId}</span>
          </>
        ) : (
          'پرداخت تأیید شد.'
        )
      }
    />
  );
  const handoffDue = (
    <Step
      state="next"
      testId="handoff-day"
      title={
        <>
          تحویل به پست تا <Inline text={view.postHandoffDay ?? ''} />
        </>
      }
      text={
        <>
          حداکثر <span className="num">{formatNumber(view.slaDays)}</span> روز کاری بعد از پرداخت.
        </>
      }
    />
  );
  const tracking = <Step state="next" title="کد رهگیری پست" text="با پیامک می‌آید؛ مسیر بسته را با آن می‌بینی." />;
  const another = (
    <a className="jy-btn jy-btn--secondary" href="/">
      جزوهٔ دیگری داری؟ بینداز
    </a>
  );

  if (view.status === 'cancelled') {
    return (
      <section className="jy-card" aria-labelledby="order-title" data-testid="order-cancelled">
        <span className="jy-icon jy-icon-error ck-done__icon ck-done__icon--error" aria-hidden="true" />
        <h1 id="order-title" className="ck-done__title">
          سفارش لغو شد
        </h1>
        <p className="ck-sub">
          سفارش <span className="num">{view.number}</span> لغو شد و چاپ نمی‌شود. مبلغ پرداختی، <Tomans rials={details.totalRials} /> تومان،
          برمی‌گردد.
        </p>
        <div className="ck-done__actions">{another}</div>
      </section>
    );
  }
  if (view.status === 'handed_to_post') {
    const handed = view.handedToPost;
    const parcels = details.parcels;
    return (
      <section className="jy-card" aria-labelledby="order-title" data-testid="order-handed">
        <span className="jy-icon jy-icon-truck ck-done__icon" aria-hidden="true" />
        <h1 id="order-title" className="ck-done__title">
          جزوه‌ات به پست رسید
        </h1>
        <p className="ck-sub">
          سفارش <span className="num">{view.number}</span> {handed ? <Inline text={handed.day} /> : null} تحویل پست شد.
          {parcels.length > 0 ? ' مسیر بسته را با کد رهگیری در سایت پست ببین.' : null}
        </p>
        <ol className="ck-steps">
          {payment}
          <Step state="done" title="چاپ و صحافی" text="چاپ و صحافی شد." />
          <Step
            state="done"
            title="تحویل به پست"
            text={handed ? <>{<Inline text={handed.day} />}{handed.onTime ? '، در مهلت.' : '.'}</> : null}
          />
          {parcels.length > 0 ? (
            <TrackingStep parcels={parcels} phone={details.recipient.phone} />
          ) : (
            <Step
              state="now"
              title="کد رهگیری پست"
              text={
                <>
                  به‌زودی به <span className="num">{formatMobile(details.recipient.phone)}</span> پیامک می‌شود.
                </>
              }
            />
          )}
        </ol>
      </section>
    );
  }
  const printing = view.status === 'printing';
  return (
    <section className="jy-card" aria-labelledby="order-title" data-testid={printing ? 'order-printing' : 'order-paid'}>
      {printing ? (
        <span className="jy-icon jy-icon-printer ck-done__icon ck-done__icon--info" aria-hidden="true" />
      ) : (
        <span className="jy-icon jy-icon-success ck-done__icon" aria-hidden="true" />
      )}
      <h1 id="order-title" className="ck-done__title">
        {printing ? 'جزوه‌ات در حال چاپ است' : 'سفارش ثبت شد'}
      </h1>
      <p className="ck-sub">
        سفارش <span className="num">{view.number}</span> · <Tomans rials={details.totalRials} /> تومان پرداخت شد.
        {printing ? null : (
          <>
            {' '}
            شمارهٔ سفارش را به <span className="num">{formatMobile(details.recipient.phone)}</span> هم پیامک کردیم.
          </>
        )}
      </p>
      <ol className="ck-steps">
        {payment}
        <Step
          state="now"
          title="چاپ و صحافی"
          text={printing ? 'جزوه‌ات در حال چاپ و صحافی است.' : 'جزوه‌ات در صف چاپ است.'}
        />
        {handoffDue}
        {tracking}
      </ol>
      {printing ? null : another}
    </section>
  );
}

/** خط کنار جمع: روز تحویل به پست، روزی که رسید، یا پیش از پرداخت چند روز کاری. لغوشده هیچ. */
function ShipLine({ view }: { view: OrderView }) {
  if (view.status === 'cancelled') return null;
  let text: ReactNode;
  if (view.handedToPost) {
    text = (
      <>
        <Inline text={view.handedToPost.day} /> تحویل پست شد.
      </>
    );
  } else if (PAID.has(view.status) && view.postHandoffDay) {
    text = (
      <>
        تحویل به پست تا <Inline text={view.postHandoffDay} />.
      </>
    );
  } else {
    text = (
      <>
        تحویل به پست تا <span className="num">{formatNumber(view.slaDays)}</span> روز کاری بعد از پرداخت.
      </>
    );
  }
  return (
    <p className="home-sum__ship">
      <span className="jy-icon jy-icon-truck" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

function Owner({ token, view, details }: { token: string; view: OrderView; details: OrderViewDetails }) {
  const paid = PAID.has(view.status);
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
            <PaidCard view={view} details={details} />
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
              {/* لغوشده: همان مبلغ پرداخت‌شده برمی‌گردد (سؤال ۲۷). */}
              <span className="home-sum__label">{view.status === 'cancelled' ? 'برمی‌گردد' : paid ? 'پرداخت شد' : 'جمع'}</span>
              <SumValue rials={details.totalRials} testId="summary-total" />
            </div>
            <ShipLine view={view} />
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
