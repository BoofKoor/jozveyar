/**
 * «سفارش‌های من» و پیام به پشتیبانی روی سرور (برش ۱۲٫۱، ADR-068؛ طرح `account.html`، سؤال‌های ۳۰۷ تا ۳۱۲).
 *
 * پشت حالت مسیر خرید نیست، مثل صفحهٔ سفارش: پایگاه داده و `SESSION_SECRET` کافی است (`accountContext.ts`)، پس سفارشی که ثبت شد با خاموش
 * یا «متوقف» شدن خرید از فهرست مشتری گم نمی‌شود. هر کار فقط با نشست همان مشتری، و هر خواندن در خود کوئری به `user_id` او بسته است.
 *
 * - **فهرست** (سؤال ۳۰۷): کار بعدی هر سفارش با همان قاعده‌های صفحهٔ سفارش: «پرداخت» فقط برای پرداختنی، «در حال بررسی» بی آن، روز
 *   تحویل به پست، کد هر بستهٔ زنده با پیوند سایت پست، و بازپرداخت همان شکل صفحهٔ سفارش (`refundView`).
 * - **گفت‌وگو** (سؤال‌های ۳۰۹ و ۳۱۴): مشتری نام ادمین را نمی‌بیند؛ دیدن گفت‌وگو «دیده شد» را جلو می‌برد، پس پیامک پاسخی که هنوز نرفته دیگر
 *   نمی‌رود (تریگر `sms_messages_live`).
 * - **پیام** (سؤال ۳۱۰): هر خط فارسی‌نرمال (`tidyInputLinesFa`)، ۱ تا ۱٬۰۰۰ نویسه، و هر فرم یک پیام (`requestId`).
 */

import { supportMessageSchema } from '@jozveyar/contracts/checkout';
import {
  FILE_MARGIN_MS,
  IRAN_POST,
  SUPPORT_CUSTOMER_MAX,
  isChecking,
  type AccountStore,
  type CustomerOrderRow,
  type SupportStore,
} from '@jozveyar/db';
import { tidyInputLinesFa } from '@jozveyar/text/input';

import {
  MESSAGE_MAX,
  ORDERS_PAGE_SIZE,
  RECENT_ORDERS,
  STATUS_LABELS,
  cardDay,
  dayName,
  dueText,
  messageWhen,
  snippet,
  type AccountNext,
  type AccountOrderCard,
  type AccountOrdersView,
  type AccountThreadView,
  type MessageChoice,
  type NewMessageView,
} from '../account';
import type { AuthUser } from './auth';
import { fail, ok, type Result } from './result';

export interface AccountServiceDeps {
  account: Pick<AccountStore, 'customerOrders' | 'customerOrder' | 'ownedOrderId'>;
  support: Pick<SupportStore, 'customerThreads' | 'customerThread' | 'post' | 'markSeen'>;
  /** ساعت پاسخ‌گویی «تماس» (۱۱٫۱)؛ null یعنی مالک نگذاشته. */
  hours: () => Promise<string | null>;
  now?: () => Date;
}

// سقف یک منبع است: همان CHECK پایگاه داده.
if (MESSAGE_MAX !== SUPPORT_CUSTOMER_MAX) throw new Error('سقف پیام سایت و پایگاه داده یکی نیست');

/** بازپرداخت سفارش لغوشده برای کارت فهرست، همان قاعدهٔ صفحهٔ سفارش (`refundView`، سؤال ۱۵۷). */
function refundNext(row: CustomerOrderRow, now: Date): AccountNext {
  const paid = row.payments.find((p) => p.status === 'succeeded');
  const refund = paid ? row.refunds.find((r) => r.paymentId === paid.id) : undefined;
  if (refund?.status === 'succeeded') {
    const at = refund.method === 'manual' ? refund.refundedOn! : refund.finishedAt!;
    return { kind: 'refunded', amountRials: refund.amountRials, day: dayName(at, now) };
  }
  if (refund?.status === 'pending' && (refund.gatewayRef !== null || refund.gatewayStatus !== null)) {
    return { kind: 'refunding', amountRials: refund.amountRials };
  }
  return { kind: 'cancelled' };
}

/** کار بعدی یک سفارش؛ null یعنی در فهرست نیست (همان شرط کوئری، با ساعت همین لحظه). */
export function nextOf(row: CustomerOrderRow, now: Date): AccountNext | null {
  const { order } = row;
  switch (order.status) {
    case 'awaiting_payment': {
      if (row.payments.some(isChecking)) return { kind: 'checking' };
      const live = row.filesLiveUntil !== null && row.filesLiveUntil.getTime() - now.getTime() >= FILE_MARGIN_MS;
      return live ? { kind: 'pay' } : null;
    }
    case 'paid':
    case 'printing':
      return { kind: order.status, due: order.postHandoffDueAt ? dueText(order.postHandoffDueAt, now) : null };
    case 'handed_to_post':
      return {
        kind: 'handed',
        day: dayName(order.handedToPostAt ?? order.createdAt, now),
        parcels: row.parcels.map((parcel) => ({ barcode: parcel.barcode, trackingUrl: IRAN_POST.trackingUrl(parcel.barcode) })),
      };
    case 'cancelled':
      return refundNext(row, now);
    case 'expired':
      return null;
  }
}

function cardOf(row: CustomerOrderRow, now: Date): AccountOrderCard | null {
  const next = nextOf(row, now);
  if (!next) return null;
  const { order } = row;
  return {
    number: order.orderNumber,
    token: order.publicToken,
    status: order.status,
    day: cardDay(order.paidAt ?? order.createdAt, now),
    fileCount: row.fileCount,
    pageCount: row.pageCount,
    totalRials: order.totalRials,
    next,
  };
}

const choiceOf = (row: CustomerOrderRow, now: Date): MessageChoice => ({
  value: String(row.order.orderNumber),
  orderNumber: row.order.orderNumber,
  note: `${STATUS_LABELS[row.order.status]} · ${dayName(row.order.paidAt ?? row.order.createdAt, now)}`,
});

export const GENERAL_CHOICE: MessageChoice = { value: 'general', orderNumber: null, note: 'دربارهٔ هیچ سفارشی نیست' };

export function createAccountService(deps: AccountServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    /** «سفارش‌های من»: یک صفحه از سفارش‌ها (تازه‌ترین اول)، و همهٔ گفت‌وگوها با «پاسخ تازه» بالای فهرست. */
    async orders(user: AuthUser, page: number): Promise<AccountOrdersView> {
      const at = now();
      const current = Number.isInteger(page) && page >= 1 ? page : 1;
      const [found, threads] = await Promise.all([
        deps.account.customerOrders(user.userId, { at, limit: ORDERS_PAGE_SIZE, offset: (current - 1) * ORDERS_PAGE_SIZE }),
        deps.support.customerThreads(user.userId),
      ]);
      const fresh = threads.find((thread) => thread.unseen);
      return {
        mobile: user.mobile,
        orders: found.rows.flatMap((row) => cardOf(row, at) ?? []),
        page: current,
        pages: Math.max(1, Math.ceil(found.total / ORDERS_PAGE_SIZE)),
        threads: threads.map((thread) => ({
          id: thread.id,
          orderNumber: thread.orderNumber,
          status: thread.status,
          fresh: thread.unseen,
          last: thread.last ? { staff: thread.last.kind === 'staff', when: cardDay(thread.last.at, at), body: snippet(thread.last.body) } : null,
        })),
        fresh: fresh ? { threadId: fresh.id, orderNumber: fresh.orderNumber } : null,
      };
    },

    /**
     * «پیام تازه» (سؤال ۳۰۹): سه سفارش آخر و «سؤال کلی»؛ سفارشی که از صفحه‌اش آمده (`order`) از پیش انتخاب شده، قدیمی‌تر از سه تا هم. بی
     * `order` هیچ‌کدام از پیش نه، جز وقتی سفارشی در فهرست نیست و «سؤال کلی» تنها گزینه است.
     */
    async newMessage(user: AuthUser, orderNumber: number | null): Promise<NewMessageView> {
      const at = now();
      const [recent, from, hours] = await Promise.all([
        deps.account.customerOrders(user.userId, { at, limit: RECENT_ORDERS, offset: 0 }),
        orderNumber === null ? Promise.resolve(null) : deps.account.customerOrder(user.userId, orderNumber, at),
        deps.hours(),
      ]);
      const rows = from && !recent.rows.some((row) => row.order.orderNumber === from.order.orderNumber) ? [from, ...recent.rows] : recent.rows;
      const choices = [...rows.map((row) => choiceOf(row, at)), GENERAL_CHOICE];
      return {
        mobile: user.mobile,
        choices,
        selected: from ? String(from.order.orderNumber) : choices.length === 1 ? GENERAL_CHOICE.value : '',
        hours,
        from: from ? { number: from.order.orderNumber, token: from.order.publicToken } : null,
      };
    },

    /** یک گفت‌وگوی همین مشتری؛ دیدنش «دیده شد» را جلو می‌برد. پاسخ‌هایی که پیش از این بار ندیده بود «تازه»‌اند. */
    async thread(user: AuthUser, threadId: number): Promise<Result<AccountThreadView>> {
      if (!Number.isSafeInteger(threadId) || threadId < 1) return fail(404, 'not_found');
      const [view, hours] = await Promise.all([deps.support.customerThread(user.userId, threadId), deps.hours()]);
      if (!view) return fail(404, 'not_found');
      const at = now();
      const seen = view.customerSeenAt?.getTime() ?? -Infinity;
      await deps.support.markSeen(user.userId, threadId, at);
      return ok({
        id: view.id,
        orderNumber: view.orderNumber,
        order:
          view.orderNumber !== null && view.orderToken !== null && view.orderStatus !== null
            ? { number: view.orderNumber, token: view.orderToken, status: view.orderStatus }
            : null,
        status: view.status,
        mobile: user.mobile,
        hours,
        messages: view.messages.map((message) => ({
          id: message.id,
          kind: message.kind,
          body: message.body,
          when: messageWhen(message.at, at),
          fresh: message.kind === 'staff' && message.at.getTime() > seen,
        })),
      });
    },

    /** پیام مشتری؛ گفت‌وگو اگر نیست ساخته می‌شود و بسته یا پاسخ‌داده دوباره «باز». */
    async post(user: AuthUser, input: unknown): Promise<Result<{ threadId: number; duplicate: boolean }>> {
      const parsed = supportMessageSchema.safeParse(input);
      if (!parsed.success) return fail(400, 'invalid_request');
      const body = tidyInputLinesFa(parsed.data.body);
      if (body === '') return fail(400, 'message_empty');
      if (body.length > MESSAGE_MAX) return fail(400, 'message_too_long', { max: MESSAGE_MAX });
      const { to, requestId } = parsed.data;
      let target: Parameters<SupportStore['post']>[0]['target'];
      if (to.kind === 'order') {
        const orderId = await deps.account.ownedOrderId(user.userId, to.number);
        if (!orderId) return fail(404, 'not_found');
        target = { kind: 'order', orderId };
      } else {
        target = to.kind === 'general' ? { kind: 'general' } : { kind: 'thread', threadId: to.id };
      }
      const result = await deps.support.post({ userId: user.userId, target, body, requestId, at: now() });
      if (result.ok) return ok({ threadId: result.threadId, duplicate: result.duplicate });
      switch (result.reason) {
        case 'not_found':
          return fail(404, 'not_found');
        case 'no_orders':
          return fail(409, 'no_orders');
        case 'rate':
          return fail(429, 'message_rate');
        case 'open_threads':
          return fail(409, 'open_threads');
        case 'stale':
          return fail(409, 'stale_form');
      }
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
