import { Fragment, type ReactNode } from 'react';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { STATUS_LABELS, type AccountMessage, type AccountOrderCard, type AccountOrdersView, type AccountThreadLine, type AccountThreadView } from '../../lib/account';
import { formatMobile } from '../../lib/checkout/format';
import { Inline } from '../Inline';
import { StatusBadge } from '../StatusBadge';

/**
 * نماهای سرور «سفارش‌های من» (برش ۱۲٫۱، ADR-068؛ طرح `docs/ui/mockups/account.html`): فهرست سفارش‌ها با کار بعدی هر کدام، «پیام‌ها» و
 * گفت‌وگو. بی JS؛ فقط فرم‌ها جزیرهٔ کلاینت‌اند (`AccountLogin`، `MessageForm`).
 */

/** نشانهٔ صفحه‌های حساب: پیوند «سفارش‌های من» سربرگ جاری دیده می‌شود (globals.css). */
export const AccountMark = () => <span hidden data-account="" />;

/** پیوند برگشت بالای صفحه؛ پیکان «به عقب» در راست‌به‌چپ رو به راست است. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ac-back" href={href}>
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      {children}
    </a>
  );
}

function Barcode({ code }: { code: string }) {
  return (
    <span className="jy-barcode" data-barcode={code}>
      {(code.match(/.{1,4}/g) ?? [code]).map((group, i) => (
        <span key={i}>{group}</span>
      ))}
    </span>
  );
}

function Line({ icon, children }: { icon: 'info' | 'truck' | 'success' | 'printer'; children: ReactNode }) {
  return (
    <p className="ac-order__line">
      <span className={`jy-icon jy-icon-${icon}`} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** کار بعدی کارت (سؤال ۳۰۷): «پرداخت»، «در حال بررسی»، روز تحویل به پست، کد رهگیری، یا بازپرداخت. */
function OrderNext({ card }: { card: AccountOrderCard }) {
  const { next } = card;
  switch (next.kind) {
    case 'pay':
      return (
        <div className="ac-order__next">
          <Line icon="info">پرداخت نشده؛ سفارشت با همین قیمت نگه داشته شده.</Line>
          <a className="jy-btn jy-btn--primary" href={`/order/${card.token}`}>
            پرداخت
          </a>
        </div>
      );
    case 'checking':
      return (
        <div className="ac-order__next">
          <Line icon="info">پرداختت در حال بررسی است؛ نتیجه را در صفحهٔ سفارش می‌بینی.</Line>
        </div>
      );
    case 'paid':
    case 'printing': {
      const stage = next.kind === 'paid' ? 'در صف چاپ' : 'در حال چاپ';
      return (
        <div className="ac-order__next">
          <Line icon={next.kind === 'paid' ? 'truck' : 'printer'}>
            {next.due ? (
              <>
                {stage}؛ تحویل به پست تا <Inline text={next.due} />.
              </>
            ) : (
              `${stage}.`
            )}
          </Line>
        </div>
      );
    }
    case 'handed':
      return (
        <div className={`ac-order__next${next.parcels.length > 0 ? ' ac-order__next--track' : ''}`}>
          <Line icon="truck">
            <Inline text={next.day} /> تحویل پست شد.
          </Line>
          {next.parcels.map((parcel) => (
            <Fragment key={parcel.barcode}>
              <Barcode code={parcel.barcode} />
              {/* فقط پیوند؛ چیزی از سایت پست بار نمی‌شود (قاعدهٔ ۸). */}
              <a className="jy-btn jy-btn--secondary" href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer">
                رهگیری در سایت پست<span className="sr-only"> (زبانهٔ تازه)</span>
              </a>
            </Fragment>
          ))}
        </div>
      );
    case 'refunded':
      return (
        <div className="ac-order__next">
          <Line icon="success">
            <span className="num">{formatTomans(next.amountRials, false)}</span> تومان <Inline text={next.day} /> برگشت داده شد.
          </Line>
        </div>
      );
    case 'refunding':
      return (
        <div className="ac-order__next">
          <Line icon="info">
            <span className="num">{formatTomans(next.amountRials, false)}</span> تومان در حال برگشت است.
          </Line>
        </div>
      );
    case 'cancelled':
      return (
        <div className="ac-order__next">
          <Line icon="info">سفارش لغو شد؛ مبلغ پرداختی برمی‌گردد.</Line>
        </div>
      );
  }
}

export function OrderCard({ card }: { card: AccountOrderCard }) {
  return (
    <li className="jy-card ac-order" data-testid="account-order" data-order={card.number}>
      <div className="ac-order__head">
        <h2 className="ac-order__title">
          <a className="ac-order__link" href={`/order/${card.token}`}>
            سفارش <span className="num">{card.number}</span>
          </a>
        </h2>
        <StatusBadge status={card.status} />
        <span className="jy-icon jy-icon-chevron ac-order__go" aria-hidden="true" />
      </div>
      <p className="ac-order__meta">
        <Inline text={card.day} /> · <span className="num">{formatNumber(card.fileCount)}</span> فایل، <span className="num">{formatNumber(card.pageCount)}</span>{' '}
        صفحه · <span className="num">{formatTomans(card.totalRials, false)}</span> تومان
      </p>
      <OrderNext card={card} />
    </li>
  );
}

/** عنوان یک گفت‌وگو: «دربارهٔ سفارش 10027» یا «سؤال کلی». */
export function ThreadTitle({ orderNumber, about = true }: { orderNumber: number | null; about?: boolean }) {
  if (orderNumber === null) return <>سؤال کلی</>;
  return (
    <>
      {about ? 'دربارهٔ سفارش' : 'سفارش'} <span className="num">{orderNumber}</span>
    </>
  );
}

/** حال گفت‌وگو برای مشتری (سؤال ۳۱۱): «منتظر پاسخ»، «پاسخ داده شد»، «بسته»؛ و پاسخ ندیده «پاسخ تازه». */
export function ThreadBadge({ status, fresh = false }: { status: AccountThreadLine['status']; fresh?: boolean }) {
  if (fresh) {
    return (
      <span className="jy-badge jy-badge--info">
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        پاسخ تازه
      </span>
    );
  }
  if (status === 'answered') {
    return (
      <span className="jy-badge jy-badge--success">
        <span className="jy-icon jy-icon-success" aria-hidden="true" />
        پاسخ داده شد
      </span>
    );
  }
  return <span className="jy-badge jy-badge--neutral">{status === 'open' ? 'منتظر پاسخ' : 'بسته'}</span>;
}

function ThreadRow({ line }: { line: AccountThreadLine }) {
  return (
    <li>
      <a className="ac-thread" href={`/orders/messages/${line.id}`} data-testid="account-thread" data-thread={line.id}>
        <span className="ac-thread__top">
          <b>
            <ThreadTitle orderNumber={line.orderNumber} />
          </b>
          <ThreadBadge status={line.status} fresh={line.fresh} />
        </span>
        {line.last ? (
          <span className="ac-thread__snip">
            {line.last.staff ? 'پشتیبانی' : 'تو'}، <Inline text={line.last.when} />: {line.last.body}
          </span>
        ) : null}
        <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
      </a>
    </li>
  );
}

/** «پیام‌ها»: هر گفت‌وگو یک ردیف، تازه‌ترین پیام اول، و «پیام به پشتیبانی». */
export function ThreadsSection({ threads }: { threads: AccountThreadLine[] }) {
  return (
    <section className="ac-sec" aria-labelledby="ac-msgs-title">
      <div className="ac-sec__head">
        <h2 id="ac-msgs-title" className="ac-h2">
          پیام‌ها
        </h2>
        <a className="jy-btn jy-btn--secondary" href="/orders/messages/new">
          پیام به پشتیبانی
        </a>
      </div>
      {threads.length > 0 ? (
        <ul className="jy-card ac-threads">
          {threads.map((line) => (
            <ThreadRow key={line.id} line={line} />
          ))}
        </ul>
      ) : (
        <p className="ck-sub">سؤالی دربارهٔ سفارش‌هایت داری؟ پیام بده؛ پاسخ را همین‌جا می‌بینی و پیامکش هم می‌آید.</p>
      )}
    </section>
  );
}

/** صفحهٔ «سفارش‌های من»: سربرگ با موبایل و «خروج»، «پاسخ تازه»، سفارش‌ها و «پیام‌ها». */
export function OrdersList({ view }: { view: AccountOrdersView }) {
  return (
    <main className="site-wrap ac-page" data-testid="account-orders">
      <AccountMark />
      <div className="ac-head">
        <h1 className="ac-title">سفارش‌های من</h1>
        <form className="ac-who" method="post" action="/api/account/logout">
          <span className="num nw">{formatMobile(view.mobile)}</span>
          <button type="submit" className="jy-btn jy-btn--text">
            خروج
          </button>
        </form>
      </div>
      {view.fresh ? (
        <p className="jy-note jy-note--info" role="status" data-testid="account-fresh">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            پشتیبانی به پیامت {view.fresh.orderNumber === null ? 'دربارهٔ سؤال کلی' : <>دربارهٔ سفارش <span className="num">{view.fresh.orderNumber}</span></>}{' '}
            پاسخ داد.{' '}
            <a className="jy-link" href={`/orders/messages/${view.fresh.threadId}`}>
              دیدن پاسخ
            </a>
          </span>
        </p>
      ) : null}
      {view.orders.length > 0 ? (
        <ol className="ac-orders" aria-label="سفارش‌ها، تازه‌ترین اول">
          {view.orders.map((card) => (
            <OrderCard key={card.number} card={card} />
          ))}
        </ol>
      ) : (
        <section className="jy-card" data-testid="account-empty">
          <p>
            هنوز سفارشی در فهرست نیست. <a className="jy-link" href="/">جزوه‌ات را بینداز</a> و قیمتش را همان لحظه ببین.
          </p>
        </section>
      )}
      {view.pages > 1 ? (
        <nav className="ac-pages" aria-label="صفحه‌های سفارش‌ها">
          {view.page > 1 ? (
            <a className="jy-btn jy-btn--text" href={view.page === 2 ? '/orders' : `/orders?page=${view.page - 1}`}>
              تازه‌ترها
            </a>
          ) : null}
          <span className="ac-pages__at">
            صفحهٔ <span className="num">{formatNumber(view.page)}</span> از <span className="num">{formatNumber(view.pages)}</span>
          </span>
          {view.page < view.pages ? (
            <a className="jy-btn jy-btn--text" href={`/orders?page=${view.page + 1}`}>
              قدیمی‌ترها
            </a>
          ) : null}
        </nav>
      ) : null}
      <ThreadsSection threads={view.threads} />
    </main>
  );
}

function Message({ message }: { message: AccountMessage }) {
  if (message.kind === 'closed') {
    return (
      <li className="ac-sys">
        پشتیبانی این گفت‌وگو را بست · <Inline text={message.when} />
      </li>
    );
  }
  const staff = message.kind === 'staff';
  return (
    <li className={`ac-msg${staff ? ' ac-msg--us' : ''}`} data-testid="account-message" data-kind={message.kind}>
      <p className="ac-msg__who">
        {/* نام ادمین به مشتری نمی‌رسد (سؤال ۳۱۴). */}
        <b>{staff ? 'پشتیبانی جزوه‌یار' : 'تو'}</b>
        <span>
          <Inline text={message.when} />
        </span>
        {message.fresh ? <span className="ac-msg__new">تازه</span> : null}
      </p>
      {/* متن فقط متن است، نه پیوند (سؤال ۳۱۰). */}
      <p className="ac-msg__body">{message.body}</p>
    </li>
  );
}

/** گفت‌وگو: پیام‌ها زیر هم، و جای فرم پیام (`compose`). */
export function ThreadCard({ view, sent, compose }: { view: AccountThreadView; sent: boolean; compose: ReactNode }) {
  return (
    <section className="jy-card" aria-labelledby="ac-thread-title" data-testid="account-thread-view">
      <div className="jy-card__head">
        <h1 id="ac-thread-title" className="jy-card__title">
          {view.orderNumber === null ? (
            'سؤال کلی'
          ) : (
            <>
              پیام دربارهٔ سفارش <span className="num">{view.orderNumber}</span>
            </>
          )}
        </h1>
        <ThreadBadge status={view.status} />
      </div>
      {view.order ? (
        <p className="ck-sub">
          <a className="jy-link" href={`/order/${view.order.token}`}>
            دیدن سفارش <span className="num">{view.order.number}</span>
          </a>{' '}
          · {STATUS_LABELS[view.order.status]}
        </p>
      ) : null}
      {sent && view.status === 'open' ? (
        <p className="jy-note jy-note--success ck-card-note" role="status" data-testid="account-sent">
          <span className="jy-icon jy-icon-success" aria-hidden="true" />
          <span>
            <b>پیامت رسید.</b> پاسخ را همین‌جا می‌بینی و به <span className="num nw">{formatMobile(view.mobile)}</span> هم پیامک می‌کنیم.
            {view.hours ? (
              <>
                {' '}
                پاسخ‌گویی <Inline text={view.hours} /> است.
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      <ol className="ac-msgs">
        {view.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </ol>
      {compose}
    </section>
  );
}
