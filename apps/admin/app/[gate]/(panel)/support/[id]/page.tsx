import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SUPPORT_STAFF_MAX, type PanelThreadView } from '@jozveyar/db';
import { formatDeadlineDay, formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { StateBadge } from '../../../../../components/OrderBadges';
import { ReplyForm } from '../../../../../components/ReplyForm';
import { Segments } from '../../../../../components/Segments';
import { StatusButton } from '../../../../../components/StatusButton';
import { SupportBadge } from '../../../../../components/SupportBadge';
import { dayText, phoneText, whenText } from '../../../../../lib/format';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { dayBounds, dueKind, orderState } from '../../../../../lib/orders';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { replySmsView } from '../../../../../lib/sms';
import { STATUS_LABELS, lastMessageId, latestSmsMessageId, messageHead, replySeen, replySmsGoes, topicSegs } from '../../../../../lib/support';
import { supportCloseAction, supportResendSmsAction } from '../../../actions';

export const metadata: Metadata = { title: 'گفت‌وگوی پشتیبانی' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

const ERRORS = new Set([
  'forbidden',
  'support_stale',
  'support_close_stale',
  'support_closed',
  'support_sms_seen',
  'support_sms_newer',
  'sms_not_failed',
  'unavailable',
]);

/** «سفارش 10019 · باز» برای هر گفت‌وگوی دیگر همین مشتری، پیوند گفت‌وگوی خودش. */
function OtherThreads({ gate, thread }: { gate: string; thread: PanelThreadView }) {
  const others = thread.history.others;
  if (others.length === 0) return <>فقط همین</>;
  return (
    <>
      همین، و{' '}
      {others.map((other, i) => (
        <span key={other.id}>
          {i === 0 ? '' : '، '}
          <Link className="jy-link" href={panelPath(gate, `/support/${other.id}`)}>
            <Segments segs={topicSegs(other.orderNumber)} />
          </Link>{' '}
          ({STATUS_LABELS[other.status]})
        </span>
      ))}
    </>
  );
}

/** «تحویل به پست» کارت سفارش: روز تحویل، یا مهلت سفارش باز؛ بقیه هیچ. */
function handoffText(order: NonNullable<PanelThreadView['order']>, now: Date): string | null {
  if (order.handedToPostAt) return `تحویل پست شد، ${dayText(order.handedToPostAt, now)}`;
  if (!order.postHandoffDueAt || (order.status !== 'paid' && order.status !== 'printing')) return null;
  const kind = dueKind(order.postHandoffDueAt, dayBounds(now));
  const day = formatDeadlineDay(order.postHandoffDueAt);
  if (kind === 'overdue') return `دیر شده؛ مهلت ${day} تمام شد`;
  return kind === 'today' ? `تا امروز، ${day}` : kind === 'tomorrow' ? `تا فردا، ${day}` : `تا ${day}`;
}

/**
 * یک گفت‌وگوی پشتیبانی (برش ۱۲٫۱، ADR-068؛ طرح «گفت‌وگو و پاسخ» و «پاسخ رفت»، سؤال ۳۱۴): پیام‌ها و فرم پاسخ در ستون اصلی (در گوشی اول)، و
 * مشتری، سفارش و «بستن گفت‌وگو» در ستون کنار. پنل نام ادمین هر پاسخ را دارد و مشتری «پشتیبانی جزوه‌یار» می‌بیند. زیر هر پاسخ ردیف «پیامک پاسخ»
 * با «دوباره بفرست» (سؤال ۳۱۲). هر کار روی خود سفارش (نشانی، لغو) از صفحهٔ سفارش است، نه از اینجا. مالک و متصدی (`support.reply`).
 */
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ gate: string; id: string }>; searchParams: Promise<Query> }) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { support } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'support.reply')) return <NoAccess gate={gate} session={session} />;
  const result = await support.thread(session, id);
  if (!result.ok) {
    if (result.error === 'support_not_found') notFound();
    return <NoAccess gate={gate} session={session} />;
  }
  const { now, thread } = result.value;
  const { customer, order } = thread;
  const name = customer.name ?? phoneText(customer.mobile);
  const error = ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const done = one(query, 'done');
  const sms = one(query, 'sms');
  const latestSms = latestSmsMessageId(thread);
  const smsGoes = replySmsGoes(thread);
  const topic = topicSegs(order?.number ?? null);
  const repliedNow = done === 'reply';
  const handoff = order ? handoffText(order, now) : null;
  const self = panelPath(gate, `/support/${thread.id}`);

  return (
    <>
      <Link href={panelPath(gate, '/support')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        پشتیبانی
      </Link>
      <div className="ad-pagehead">
        <div className="ad-title-row">
          <h1 className="ad-title">
            {name} · <Segments segs={topic} />
          </h1>
          <SupportBadge status={thread.status} />
        </div>
      </div>
      {error ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : done === 'close' ? (
        <Alert tone="success">گفت‌وگو بسته شد؛ مشتری «بسته» می‌بیند و با پیام تازه دوباره بازش می‌کند.</Alert>
      ) : done === 'resend' ? (
        sms === 'sent' ? (
          <Alert tone="success">پیامک پاسخ دوباره رفت.</Alert>
        ) : (
          <Alert tone="warning">پیامک پاسخ باز هم نرفت؛ علتش در ردیف «پیامک پاسخ» است.</Alert>
        )
      ) : null}

      <div className="ad-grid ad-grid--main-first">
        <aside className="ad-side" aria-label="مشتری و سفارش">
          <section className="jy-card" aria-labelledby="t-cust">
            <h2 id="t-cust" className="jy-card__title">
              مشتری
            </h2>
            <dl className="ad-facts">
              <div>
                <dt>موبایل</dt>
                <dd>
                  <span className="num">{phoneText(customer.mobile)}</span>
                </dd>
              </div>
              {customer.place ? (
                <div>
                  <dt>شهر</dt>
                  <dd>{customer.place}</dd>
                </div>
              ) : null}
              <div>
                <dt>سفارش‌ها</dt>
                <dd>
                  <span className="num">{formatNumber(thread.history.orders)}</span> سفارش، <span className="num">{formatNumber(thread.history.paid)}</span>{' '}
                  پرداخت‌شده
                </dd>
              </div>
              <div>
                <dt>گفت‌وگوها</dt>
                <dd>
                  <OtherThreads gate={gate} thread={thread} />
                </dd>
              </div>
            </dl>
            <div className="ad-actions">
              <Link href={`${panelPath(gate, '/orders')}?status=all&q=${customer.mobile}`} className="jy-btn jy-btn--text">
                سفارش‌های این مشتری
              </Link>
            </div>
          </section>

          {order ? (
            <section className="jy-card" aria-labelledby="t-order" data-thread-order={order.number}>
              <div className="jy-card__head">
                <h2 id="t-order" className="jy-card__title">
                  سفارش <span className="num">{order.number}</span>
                </h2>
                <StateBadge state={orderState(order.status, false)} />
              </div>
              {order.partnerName || handoff ? (
                <dl className="ad-facts">
                  {order.partnerName ? (
                    <div>
                      <dt>چاپخانه</dt>
                      <dd>
                        {order.partnerName}
                        {order.partnerCity ? `، ${order.partnerCity}` : ''}
                      </dd>
                    </div>
                  ) : null}
                  {handoff ? (
                    <div>
                      <dt>تحویل به پست</dt>
                      <dd>{handoff}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <div className="ad-actions">
                <Link href={panelPath(gate, `/orders/${order.number}`)} className="jy-btn jy-btn--secondary">
                  صفحهٔ سفارش
                </Link>
              </div>
            </section>
          ) : null}

          <section className="jy-card" aria-labelledby="t-state">
            <h2 id="t-state" className="jy-card__title">
              گفت‌وگو
            </h2>
            <p className="ad-meta">از {whenText(thread.createdAt, now)}</p>
            {thread.status === 'closed' ? (
              <p className="ad-hint ad-gap">بسته است؛ مشتری با پیام تازه دوباره بازش می‌کند، و پاسخ تو هم آن را «پاسخ داده شد» می‌کند.</p>
            ) : (
              <form action={supportCloseAction} className="ad-status__actions">
                <input type="hidden" name="gate" value={gate} />
                <input type="hidden" name="thread" value={thread.id} />
                <input type="hidden" name="seen" value={lastMessageId(thread) ?? ''} />
                <input type="hidden" name="request" value={randomUUID()} />
                <StatusButton className="jy-btn jy-btn--secondary jy-btn--block">بستن گفت‌وگو</StatusButton>
                <p className="ad-hint">فهرست «باز» را خلوت می‌کند؛ مشتری «بسته» می‌بیند و با پیام تازه دوباره بازش می‌کند. بی کد تازه.</p>
              </form>
            )}
          </section>
        </aside>

        <div className="ad-main">
          <section className="jy-card" aria-labelledby="t-msgs">
            <h2 id="t-msgs" className="jy-card__title">
              پیام‌ها
            </h2>
            <ol className="ad-msgs" data-testid="messages">
              {thread.messages.map((message) => {
                const head = messageHead(message, customer.name, now);
                if (message.kind === 'closed') {
                  return (
                    <li key={message.id} className="ad-msg ad-msg--closed" data-message={message.id} data-kind="closed">
                      <b>{head.who}</b> {head.when}
                    </li>
                  );
                }
                const seen = replySeen(message.at, thread.customerSeenAt);
                const view = message.kind === 'staff' ? replySmsView(message.sms, { latest: message.id === latestSms, seen }, now) : null;
                return (
                  <li
                    key={message.id}
                    className={message.kind === 'staff' ? 'ad-msg ad-msg--us' : 'ad-msg'}
                    data-message={message.id}
                    data-kind={message.kind}
                  >
                    <p className="ad-msg__who">
                      <b>{head.who}</b>
                      <span>{head.when}</span>
                    </p>
                    <p className="ad-msg__body">{message.body}</p>
                    {message.kind !== 'staff' ? null : view ? (
                      <div className="ad-paysms" data-reply-sms={view.state}>
                        <b>پیامک پاسخ</b>
                        {view.state === 'sent' ? (
                          <span className="ad-paysms__ok">
                            <span className="jy-icon jy-icon-success" aria-hidden="true" />
                            <span>
                              <Segments segs={view.text} />
                            </span>
                          </span>
                        ) : view.state === 'sending' ? (
                          <span>
                            <Segments segs={view.text} />
                          </span>
                        ) : (
                          <span className="ad-paysms__fail">
                            <span className="jy-icon jy-icon-error" aria-hidden="true" />
                            <span>
                              <Segments segs={view.text} />
                            </span>
                          </span>
                        )}
                        {view.resendable ? (
                          <form action={supportResendSmsAction} className="ad-inline-form">
                            <input type="hidden" name="gate" value={gate} />
                            <input type="hidden" name="thread" value={thread.id} />
                            <input type="hidden" name="message" value={message.id} />
                            <StatusButton className="jy-btn jy-btn--text">دوباره بفرست</StatusButton>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      // پاسخ پشت‌سرهم (سؤال ۳۱۲): خبر پاسخ قبلی هنوز دیده نشده بود، پس پیامک تازه نرفت.
                      <p className="ad-paysms" data-reply-sms="none">
                        <b>پیامک پاسخ</b>
                        <span>لازم نبود؛ خبر پاسخ قبلی هنوز دیده نشده بود.</span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            {repliedNow ? (
              <p className={`jy-note ${sms === 'failed' ? 'jy-note--warning' : 'jy-note--success'} ad-gap`} role="status" data-replied={sms}>
                <span className={sms === 'failed' ? 'jy-icon jy-icon-warning' : 'jy-icon jy-icon-success'} aria-hidden="true" />
                <span>
                  <b>پاسخ رفت.</b> {name} آن را در «سفارش‌های من» می‌بیند، با نام «پشتیبانی جزوه‌یار».
                  {sms === 'failed'
                    ? ' ولی پیامکش نرفت؛ از ردیف «پیامک پاسخ» دوباره بفرست.'
                    : sms === 'none'
                      ? ' پیامک تازه نرفت: خبر پاسخ قبلی هنوز دیده نشده.'
                      : ''}
                </span>
              </p>
            ) : null}
            <ReplyForm
              key={`${self}-${one(query, 'n')}`}
              gate={gate}
              threadId={thread.id}
              request={randomUUID()}
              maxLength={SUPPORT_STAFF_MAX}
              label={repliedNow ? 'پاسخ دیگر' : 'پاسخ'}
              rows={repliedNow ? 4 : 6}
              primary={!repliedNow}
              hint={
                <>
                  مشتری «پشتیبانی جزوه‌یار» می‌بیند، نه نامت.{' '}
                  {smsGoes ? (
                    <>
                      با فرستادن، پیامک «پاسخ پیامت دربارهٔ <Segments segs={topic} /> آمد» به{' '}
                      <span className="num">{phoneText(customer.mobile)}</span> می‌رود.
                    </>
                  ) : (
                    'پیامک تازه نمی‌رود: خبر پاسخ قبلی هنوز دیده نشده؛ همان بس است.'
                  )}
                  {thread.status === 'closed' ? ' پاسخ گفت‌وگوی بسته را «پاسخ داده شد» می‌کند.' : ''}
                </>
              }
            />
          </section>
        </div>
      </div>
    </>
  );
}
