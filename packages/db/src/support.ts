/**
 * گفت‌وگوی پشتیبانی در پایگاه داده (برش ۱۲٫۱، ADR-068؛ سؤال‌های ۲۱۱ و ۳۰۹ تا ۳۱۶): مشتری از «سفارش‌های من» پیام می‌دهد، و مالک و متصدی
 * از «پشتیبانی» پنل پاسخ می‌دهند.
 *
 * مثل `reviews.ts` فقط کوئری و نوشتن زیر قفل است؛ مجوز، متن و پیام رابط در سرویس سایت و پنل. حکم آخر با محافظ‌های پایگاه داده (0058):
 * حال گفت‌وگو فقط با پیام، فقط افزودنی، سقف هر مشتری، و پیامک پاسخ همین گفت‌وگو؛ اینجا خطای محافظ به دلیلش برمی‌گردد.
 *
 * - **یک گفت‌وگو برای هر سفارش، و یک «سؤال کلی» برای هر مشتری** (سؤال ۳۰۹): پیام تازه به همان می‌رود و بسته‌اش را باز می‌کند. پیامِ پیش از
 *   گفت‌وگو آن را می‌سازد، در همان تراکنش، زیر قفل مشورتی همان مشتری (همان قفل تریگر سقف‌ها).
 * - **هر فرم یک پیام** (`request_id`): دو کلیک، یا فرستادن دوباره پس از پاسخی که نرسید، همان پیام است؛ همان شناسه با چیز دیگر «فرم کهنه».
 * - **پیامک پاسخ** (سؤال ۳۱۲): یکی برای هر پاسخ، مگر پیامک پاسخ قبلی همین گفت‌وگو رفته (یا در راه است) و مشتری از آن پس گفت‌وگو را
 *   ندیده؛ چند پاسخ پشت‌سرهم یک خبرند.
 */

import type { OrderStatus } from '@jozveyar/contracts/checkout';
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { constraintOf } from './orders.js';
import type { PanelSearch } from './panel.js';
import { adminEvents, adminUsers, orders, smsMessages, supportMessages, supportThreads, users } from './schema.js';
import { queuedSupportSms, shipmentSmsFields, shipmentSmsOf, type ShipmentSms } from './sms.js';

export type SupportStatus = 'open' | 'answered' | 'closed';
export type SupportKind = 'customer' | 'staff' | 'closed';

/** سقف متن پیام مشتری و پاسخ پشتیبانی (سؤال ۳۱۰)، همان CHECK `support_messages_body`. */
export const SUPPORT_CUSTOMER_MAX = 1000;
export const SUPPORT_STAFF_MAX = 2000;
/** سقف هر مشتری (سؤال ۳۱۰)، همان تریگر `support_messages_check`: پیام در یک ساعت، و گفت‌وگوی باز. */
export const SUPPORT_HOURLY_LIMIT = 10;
export const SUPPORT_OPEN_LIMIT = 3;

/** هدف رویدادهای پشتیبانی (`support.*`). */
export const SUPPORT_TARGET = 'support_thread';

/** قفل مشورتی هر مشتری: همان کلید تریگر `support_messages_check`، پس ساختن گفت‌وگو و شمردن سقف‌ها پشت‌سرهم‌اند. */
const customerLock = (userId: string) => sql`SELECT pg_advisory_xact_lock(hashtext('support_customer'), hashtext(${userId}))`;

const ts = (value: Date) => sql`${value.toISOString()}::timestamptz`;
const asDate = (value: unknown): Date | null => (value === null || value === undefined ? null : value instanceof Date ? value : new Date(String(value)));
const asNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/* ───────────────────────── سایت: «سفارش‌های من» ───────────────────────── */

/** آخرین پیام یک گفت‌وگو (نه نشان بستن). */
export interface SupportLast {
  kind: 'customer' | 'staff';
  body: string;
  at: Date;
}

/** یک ردیف «پیام‌ها»ی مشتری. */
export interface CustomerThreadLine {
  id: number;
  orderNumber: number | null;
  status: SupportStatus;
  lastMessageAt: Date;
  last: SupportLast | null;
  /** پاسخی هست که مشتری هنوز ندیده («پاسخ تازه»). */
  unseen: boolean;
}

export interface CustomerMessage {
  id: number;
  kind: SupportKind;
  body: string | null;
  at: Date;
}

/** گفت‌وگو از چشم مشتری: بی نام ادمین (سؤال ۳۱۴). */
export interface CustomerThreadView {
  id: number;
  orderNumber: number | null;
  orderToken: string | null;
  orderStatus: OrderStatus | null;
  status: SupportStatus;
  customerSeenAt: Date | null;
  messages: CustomerMessage[];
}

/** گفت‌وگوی یک سفارش برای کارت صفحهٔ سفارش. */
export interface CustomerOrderThread {
  id: number;
  status: SupportStatus;
  unseen: boolean;
}

/** پیام مشتری به کجا می‌رود. */
export type SupportTarget = { kind: 'order'; orderId: string } | { kind: 'general' } | { kind: 'thread'; threadId: number };

export type CustomerPost =
  | { ok: true; threadId: number; messageId: number; duplicate: boolean }
  /**
   * `not_found`: گفت‌وگو یا سفارش مال این مشتری نیست؛ `no_orders`: «سؤال کلی» از مشتری‌ای که هیچ سفارشی ندارد (سؤال ۳۰۶، راهش «تماس»)؛
   * `rate`: ۱۰ پیام در یک ساعت؛ `open_threads`: سه گفت‌وگوی باز دیگر؛ `stale`: همین فرم با متن دیگری پیش‌تر رسید.
   */
  | { ok: false; reason: 'not_found' | 'no_orders' | 'rate' | 'open_threads' | 'stale' };

/* ───────────────────────── پنل: «پشتیبانی» ───────────────────────── */

export type SupportBucket = 'open' | 'answered' | 'closed' | 'all';

/** جست‌وجوی صندوق: همان کادر «سفارش‌ها» (موبایل، شمارهٔ سفارش یا ته موبایل، نام). */
export type SupportSearch = Extract<PanelSearch, { kind: 'digits' | 'mobile' | 'name' }>;

/** مشتری از چشم پنل: نام و شهر از سفارش همین گفت‌وگو، یا برای «سؤال کلی» از تازه‌ترین سفارش مشتری. */
export interface SupportCustomer {
  userId: string;
  mobile: string;
  name: string | null;
  provinceId: number | null;
  cityId: number | null;
  /** نام شهر، یا برای سفارش بی شهر نام استان. */
  place: string | null;
}

/** یک ردیف صندوق. */
export interface InboxLine {
  id: number;
  status: SupportStatus;
  customer: SupportCustomer;
  orderNumber: number | null;
  orderStatus: OrderStatus | null;
  last: SupportLast | null;
  waitingSince: Date | null;
  lastMessageAt: Date;
}

export interface InboxPage {
  lines: InboxLine[];
  /** شمار هر چیپ، با همان جست‌وجو. */
  counts: Record<SupportBucket, number>;
}

/** پیام از چشم پنل: نام ادمین، و پیامک پاسخ هر پاسخ. */
export interface PanelMessage {
  id: number;
  kind: SupportKind;
  body: string | null;
  at: Date;
  adminName: string | null;
  sms: ShipmentSms | null;
}

export interface PanelThreadView {
  id: number;
  status: SupportStatus;
  createdAt: Date;
  waitingSince: Date | null;
  customerSeenAt: Date | null;
  customer: SupportCustomer;
  order: {
    id: string;
    number: number;
    status: OrderStatus;
    partnerName: string | null;
    partnerCity: string | null;
    postHandoffDueAt: Date | null;
    handedToPostAt: Date | null;
  } | null;
  /** شمار سفارش‌های مشتری (همه، و پرداخت‌شده‌ها)، و گفت‌وگوهای دیگرش. */
  history: { orders: number; paid: number; others: { id: number; orderNumber: number | null; status: SupportStatus }[] };
  messages: PanelMessage[];
}

/** کارت «پیام‌های مشتری» صفحهٔ سفارش پنل. */
export interface OrderThreadCard {
  id: number;
  status: SupportStatus;
  messages: number;
  last: { kind: SupportKind; adminName: string | null; at: Date } | null;
}

/** کسی که رویداد پنل را ساخت؛ کار، هدف، `detail` و زمان را خود نوشتن می‌گذارد. */
export type SupportEvent = Pick<AdminEventInput, 'adminUserId' | 'ipHash'>;

export type SupportReply =
  | { ok: true; messageId: number; smsId: number | null; duplicate: boolean; orderNumber: number | null }
  /** `not_found`: گفت‌وگو نیست؛ `stale`: همین فرم با متن دیگری پیش‌تر رسید. */
  | { ok: false; reason: 'not_found' | 'stale' };

export type SupportClose =
  | { ok: true; duplicate: boolean; orderNumber: number | null }
  /** `not_found`؛ `stale`: پس از دیدن صفحه پیام تازه‌ای رسید؛ `closed`: همین حالا بسته است. */
  | { ok: false; reason: 'not_found' | 'stale' | 'closed' };

/** پیامک پاسخ یک پاسخ، برای «دوباره بفرست». */
export interface ReplySmsRef {
  threadId: number;
  messageId: number;
  messageAt: Date;
  orderNumber: number | null;
  customerSeenAt: Date | null;
  /** پاسخ تازه‌تری در همین گفت‌وگو پیامک خودش را دارد: خبر همان است، پس این یکی دوباره نمی‌رود. */
  newer: boolean;
  sms: ShipmentSms;
}

/** گفت‌وگویی که پیامک آخرین پاسخش نرفت و مشتری هنوز آن پاسخ را ندیده، برای هشدار پیشخوان. */
export interface ReplySmsFailure {
  threadId: number;
  orderNumber: number | null;
  customer: string | null;
}

export interface SupportStore {
  /* سایت */
  customerThreads(userId: string): Promise<CustomerThreadLine[]>;
  customerThread(userId: string, threadId: number): Promise<CustomerThreadView | null>;
  customerOrderThread(userId: string, orderId: string): Promise<CustomerOrderThread | null>;
  /** پیام مشتری؛ گفت‌وگو اگر نیست ساخته می‌شود، و گفت‌وگوی پاسخ‌داده یا بسته دوباره «باز». */
  post(input: { userId: string; target: SupportTarget; body: string; requestId: string; at: Date }): Promise<CustomerPost>;
  /** مشتری گفت‌وگو را دید؛ «دیده شد» فقط جلو می‌رود. */
  markSeen(userId: string, threadId: number, at: Date): Promise<void>;

  /* پنل */
  inbox(input: { bucket: SupportBucket; search: SupportSearch | null; limit: number; offset: number }): Promise<InboxPage>;
  /** شمار «باز» و قدیمی‌ترین انتظار: زبانه و هشدار پیشخوان. */
  openSummary(): Promise<{ count: number; oldestWaiting: Date | null }>;
  panelThread(threadId: number): Promise<PanelThreadView | null>;
  orderThread(orderId: string): Promise<OrderThreadCard | null>;
  /**
   * پاسخ پشتیبانی با رویداد `support.reply`، و پیامک پاسخ «منتظر» اگر لازم است، در یک تراکنش. `customer` نام مشتری برای سطر «رویدادها»
   * (طرح: «پاسخ به گفت‌وگوی سفارش 10027 (مریم کاظمی)»)؛ متن پاسخ هرگز.
   */
  reply(input: {
    threadId: number;
    adminUserId: string;
    body: string;
    requestId: string;
    at: Date;
    event: SupportEvent;
    customer?: string | null;
  }): Promise<SupportReply>;
  /** «بستن گفت‌وگو» با رویداد `support.close`؛ فقط اگر از آخرین پیامی که ادمین دید پیامی نرسیده. */
  close(input: {
    threadId: number;
    adminUserId: string;
    requestId: string;
    seenMessageId: number | null;
    at: Date;
    event: SupportEvent;
    customer?: string | null;
  }): Promise<SupportClose>;
  replySms(messageId: number): Promise<ReplySmsRef | null>;
  /**
   * پیامک پاسخی که نرفت، یا «منتظر» و «در حال فرستادن»ی که پیش از `stuckBefore` ماند (همان حال «نرفت» و «معلوم نیست»، `SMS_STUCK_MS`)؛ فقط
   * پیامک آخرین پاسخ پیامک‌دار هر گفت‌وگو، پاسخ‌های پس از `since`، و تا مشتری همان پاسخ را ندیده (سؤال ۳۱۲)؛ کوچک‌ترین گفت‌وگو اول.
   */
  replySmsFailed(input: { since: Date; stuckBefore: Date }): Promise<ReplySmsFailure[]>;
  logEvent(event: AdminEventInput): Promise<void>;
}

/** آخرین پیام هر گفت‌وگو (نه نشان بستن)؛ برای `LEFT JOIN LATERAL`. */
const lastMessage = sql`LEFT JOIN LATERAL (
    SELECT m.kind, m.body, m.created_at FROM support_messages m
     WHERE m.thread_id = t.id AND m.kind <> 'closed' ORDER BY m.id DESC LIMIT 1
  ) lm ON true`;

/** تازه‌ترین سفارش مشتری، برای نام و شهر «سؤال کلی». */
const latestOrder = sql`LEFT JOIN LATERAL (
    SELECT lo.recipient_name, lo.province_id, lo.city_id FROM orders lo
     WHERE lo.user_id = t.user_id ORDER BY lo.created_at DESC LIMIT 1
  ) lo ON true`;

/** نام شهر و استان مشتری، از سفارش گفت‌وگو یا تازه‌ترین سفارش (پس از `latestOrder`). */
const customerPlace = sql`LEFT JOIN cities ci ON ci.id = coalesce(o.city_id, lo.city_id)
  LEFT JOIN provinces pv ON pv.id = coalesce(o.province_id, lo.province_id)`;

/** ستون‌های مشتری برای `customerOf`. */
const customerColumns = sql`t.user_id, u.mobile,
  coalesce(o.recipient_name, lo.recipient_name) AS customer_name,
  coalesce(o.province_id, lo.province_id) AS province_id,
  coalesce(o.city_id, lo.city_id) AS city_id,
  coalesce(ci.name_fa, pv.name_fa) AS place`;

const lastOf = (row: Record<string, unknown>): SupportLast | null =>
  row.last_kind === null || row.last_kind === undefined
    ? null
    : { kind: row.last_kind as 'customer' | 'staff', body: String(row.last_body), at: asDate(row.last_at)! };

const customerOf = (row: Record<string, unknown>): SupportCustomer => ({
  userId: String(row.user_id),
  mobile: String(row.mobile),
  name: (row.customer_name as string | null) ?? null,
  provinceId: asNumber(row.province_id),
  cityId: asNumber(row.city_id),
  place: (row.place as string | null) ?? null,
});

function searchWhere(search: SupportSearch | null): SQL {
  if (!search) return sql`true`;
  switch (search.kind) {
    case 'mobile':
      return sql`u.mobile = ${search.mobile}`;
    case 'digits': {
      const parts: SQL[] = [];
      if (search.orderNumber !== null) parts.push(sql`o.order_number = ${search.orderNumber}`);
      if (search.phoneSuffix) parts.push(sql`u.mobile LIKE ${`%${search.phoneSuffix}`}`);
      return parts.length > 0 ? sql`(${sql.join(parts, sql` OR `)})` : sql`false`;
    }
    case 'name':
      return sql`coalesce(o.recipient_name, lo.recipient_name) ILIKE ${`%${search.text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} ESCAPE '\\'`;
  }
}

export function createSupportStore({ db }: Database): SupportStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  /** پیامی با همین شناسهٔ فرم، اگر پیش‌تر رسید. */
  async function priorRequest(tx: Tx, requestId: string) {
    const [prior] = await tx
      .select({ id: supportMessages.id, threadId: supportMessages.threadId, kind: supportMessages.kind, body: supportMessages.body })
      .from(supportMessages)
      .where(eq(supportMessages.requestId, requestId))
      .limit(1);
    return prior ?? null;
  }

  /** گفت‌وگوی هدف این مشتری، یا ساختنش؛ null یعنی مال این مشتری نیست. */
  async function threadFor(tx: Tx, userId: string, target: SupportTarget, at: Date): Promise<number | null> {
    if (target.kind === 'thread') {
      const [row] = await tx
        .select({ id: supportThreads.id })
        .from(supportThreads)
        .where(and(eq(supportThreads.id, target.threadId), eq(supportThreads.userId, userId)))
        .limit(1);
      return row?.id ?? null;
    }
    if (target.kind === 'order') {
      const [order] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, target.orderId), eq(orders.userId, userId)))
        .limit(1);
      if (!order) return null;
    }
    const orderId = target.kind === 'order' ? target.orderId : null;
    const [existing] = await tx
      .select({ id: supportThreads.id })
      .from(supportThreads)
      .where(and(eq(supportThreads.userId, userId), orderId === null ? isNull(supportThreads.orderId) : eq(supportThreads.orderId, orderId)))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await tx
      .insert(supportThreads)
      .values({ userId, orderId, status: 'open', createdAt: at, lastMessageAt: at, waitingSince: at, customerSeenAt: at })
      .returning({ id: supportThreads.id });
    return created!.id;
  }

  /** پاسخ پشتیبانی، در یک تراکنش. */
  function replyOnce(input: Parameters<SupportStore['reply']>[0]): Promise<SupportReply> {
    return db.transaction(async (tx): Promise<SupportReply> => {
      const [thread] = await tx
        .select({
          id: supportThreads.id,
          customerSeenAt: supportThreads.customerSeenAt,
          mobile: users.mobile,
          orderNumber: orders.orderNumber,
        })
        .from(supportThreads)
        .innerJoin(users, eq(users.id, supportThreads.userId))
        .leftJoin(orders, eq(orders.id, supportThreads.orderId))
        .where(eq(supportThreads.id, input.threadId))
        .for('update', { of: supportThreads })
        .limit(1);
      if (!thread) return { ok: false, reason: 'not_found' };
      const orderNumber = thread.orderNumber ?? null;
      const prior = await priorRequest(tx, input.requestId);
      if (prior) {
        const same = prior.threadId === input.threadId && prior.kind === 'staff' && prior.body === input.body;
        if (!same) return { ok: false, reason: 'stale' };
        const [row] = await tx.select({ smsId: supportMessages.smsMessageId }).from(supportMessages).where(eq(supportMessages.id, prior.id));
        return { ok: true, messageId: prior.id, smsId: row?.smsId ?? null, duplicate: true, orderNumber };
      }
      // پیامک پاسخ قبلی همین گفت‌وگو که رفته یا در راه است، و مشتری از آن پس گفت‌وگو را ندیده: همان خبر کافی است (سؤال ۳۱۲).
      const [pending] = await tx
        .select({ id: smsMessages.id })
        .from(supportMessages)
        .innerJoin(smsMessages, eq(smsMessages.id, supportMessages.smsMessageId))
        .where(
          and(
            eq(supportMessages.threadId, input.threadId),
            sql`${smsMessages.status} IN ('pending', 'sending', 'sent', 'logged')`,
            sql`${supportMessages.createdAt} > coalesce(${thread.customerSeenAt ? ts(thread.customerSeenAt) : sql`NULL`}, '-infinity'::timestamptz)`,
          ),
        )
        .limit(1);
      const smsId = pending ? null : await queuedSupportSms(tx, { toMobile: thread.mobile, orderNumber, at: input.at });
      const [message] = await tx
        .insert(supportMessages)
        .values({
          threadId: input.threadId,
          kind: 'staff',
          adminUserId: input.adminUserId,
          body: input.body,
          requestId: input.requestId,
          smsMessageId: smsId,
          createdAt: input.at,
        })
        .returning({ id: supportMessages.id });
      await tx.insert(adminEvents).values(
        adminEventRow({
          ...input.event,
          action: 'support.reply',
          targetType: SUPPORT_TARGET,
          targetId: String(input.threadId),
          // بی متن (سؤال ۳۱۶): متن فقط در خود گفت‌وگو.
          detail: {
            thread: input.threadId,
            orderNumber,
            customer: input.customer ?? null,
            message: message!.id,
            sms: smsId === null ? 'skipped' : 'queued',
          },
          at: input.at,
        }),
      );
      return { ok: true, messageId: message!.id, smsId, duplicate: false, orderNumber };
    });
  }

  return {
    async customerThreads(userId) {
      const rows = (await db.execute(sql`
        SELECT t.id, t.status, t.last_message_at, o.order_number,
               lm.kind AS last_kind, lm.body AS last_body, lm.created_at AS last_at,
               EXISTS (SELECT 1 FROM support_messages s WHERE s.thread_id = t.id AND s.kind = 'staff'
                        AND s.created_at > coalesce(t.customer_seen_at, '-infinity'::timestamptz)) AS unseen
          FROM support_threads t
          LEFT JOIN orders o ON o.id = t.order_id
          ${lastMessage}
         WHERE t.user_id = ${userId}
         ORDER BY t.last_message_at DESC, t.id DESC`)) as unknown as Record<string, unknown>[];
      return rows.map((row) => ({
        id: Number(row.id),
        orderNumber: asNumber(row.order_number),
        status: row.status as SupportStatus,
        lastMessageAt: asDate(row.last_message_at)!,
        last: lastOf(row),
        unseen: row.unseen === true,
      }));
    },

    async customerThread(userId, threadId) {
      const [thread] = await db
        .select({
          id: supportThreads.id,
          status: supportThreads.status,
          customerSeenAt: supportThreads.customerSeenAt,
          orderNumber: orders.orderNumber,
          orderToken: orders.publicToken,
          orderStatus: orders.status,
        })
        .from(supportThreads)
        .leftJoin(orders, eq(orders.id, supportThreads.orderId))
        .where(and(eq(supportThreads.id, threadId), eq(supportThreads.userId, userId)))
        .limit(1);
      if (!thread) return null;
      const messages = await db
        .select({ id: supportMessages.id, kind: supportMessages.kind, body: supportMessages.body, at: supportMessages.createdAt })
        .from(supportMessages)
        .where(eq(supportMessages.threadId, threadId))
        .orderBy(asc(supportMessages.id));
      return { ...thread, orderStatus: thread.orderStatus as OrderStatus | null, messages };
    },

    async customerOrderThread(userId, orderId) {
      const rows = (await db.execute(sql`
        SELECT t.id, t.status,
               EXISTS (SELECT 1 FROM support_messages s WHERE s.thread_id = t.id AND s.kind = 'staff'
                        AND s.created_at > coalesce(t.customer_seen_at, '-infinity'::timestamptz)) AS unseen
          FROM support_threads t
         WHERE t.user_id = ${userId} AND t.order_id = ${orderId}
         LIMIT 1`)) as unknown as Record<string, unknown>[];
      const row = rows[0];
      return row ? { id: Number(row.id), status: row.status as SupportStatus, unseen: row.unseen === true } : null;
    },

    async post(input) {
      try {
        return await db.transaction(async (tx): Promise<CustomerPost> => {
          await tx.execute(customerLock(input.userId));
          const prior = await priorRequest(tx, input.requestId);
          if (prior) {
            const [owner] = await tx
              .select({ userId: supportThreads.userId })
              .from(supportThreads)
              .where(eq(supportThreads.id, prior.threadId))
              .limit(1);
            const same = owner?.userId === input.userId && prior.kind === 'customer' && prior.body === input.body;
            return same ? { ok: true, threadId: prior.threadId, messageId: prior.id, duplicate: true } : { ok: false, reason: 'stale' };
          }
          const threadId = await threadFor(tx, input.userId, input.target, input.at);
          if (threadId === null) return { ok: false, reason: 'not_found' };
          const [message] = await tx
            .insert(supportMessages)
            .values({ threadId, kind: 'customer', body: input.body, requestId: input.requestId, createdAt: input.at })
            .returning({ id: supportMessages.id });
          return { ok: true, threadId, messageId: message!.id, duplicate: false };
        });
      } catch (error) {
        const constraint = constraintOf(error);
        if (constraint === 'support_messages_rate') return { ok: false, reason: 'rate' };
        if (constraint === 'support_messages_open_threads') return { ok: false, reason: 'open_threads' };
        if (constraint === 'support_threads_customer') return { ok: false, reason: 'no_orders' };
        throw error;
      }
    },

    async markSeen(userId, threadId, at) {
      await db
        .update(supportThreads)
        .set({ customerSeenAt: sql`greatest(coalesce(${supportThreads.customerSeenAt}, ${ts(at)}), ${ts(at)})` })
        .where(and(eq(supportThreads.id, threadId), eq(supportThreads.userId, userId)));
    },

    async inbox({ bucket, search, limit, offset }) {
      const where = searchWhere(search);
      const from = sql`FROM support_threads t
          JOIN users u ON u.id = t.user_id
          LEFT JOIN orders o ON o.id = t.order_id
          ${latestOrder}
          ${customerPlace}`;
      const [counted] = (await db.execute(sql`
        SELECT count(*) FILTER (WHERE t.status = 'open')::int AS open,
               count(*) FILTER (WHERE t.status = 'answered')::int AS answered,
               count(*) FILTER (WHERE t.status = 'closed')::int AS closed,
               count(*)::int AS "all"
          ${from}
         WHERE ${where}`)) as unknown as Record<string, unknown>[];
      // «باز» به ترتیب انتظار، قدیمی‌ترین اول (سؤال ۳۱۳)؛ بقیه تازه‌ترین پیام اول.
      const order = bucket === 'open' ? sql`t.waiting_since ASC, t.id ASC` : sql`t.last_message_at DESC, t.id DESC`;
      const rows = (await db.execute(sql`
        SELECT t.id, t.status, t.waiting_since, t.last_message_at, ${customerColumns},
               o.order_number, o.status AS order_status,
               lm.kind AS last_kind, lm.body AS last_body, lm.created_at AS last_at
          ${from}
          ${lastMessage}
         WHERE ${where} ${bucket === 'all' ? sql`` : sql`AND t.status = ${bucket}`}
         ORDER BY ${order}
         LIMIT ${limit} OFFSET ${offset}`)) as unknown as Record<string, unknown>[];
      return {
        lines: rows.map((row) => ({
          id: Number(row.id),
          status: row.status as SupportStatus,
          customer: customerOf(row),
          orderNumber: asNumber(row.order_number),
          orderStatus: (row.order_status as OrderStatus | null) ?? null,
          last: lastOf(row),
          waitingSince: asDate(row.waiting_since),
          lastMessageAt: asDate(row.last_message_at)!,
        })),
        counts: {
          open: Number(counted?.open ?? 0),
          answered: Number(counted?.answered ?? 0),
          closed: Number(counted?.closed ?? 0),
          all: Number(counted?.all ?? 0),
        },
      };
    },

    async openSummary() {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int`, oldest: sql<Date | string | null>`min(${supportThreads.waitingSince})` })
        .from(supportThreads)
        .where(eq(supportThreads.status, 'open'));
      return { count: Number(row?.count ?? 0), oldestWaiting: asDate(row?.oldest) };
    },

    async panelThread(threadId) {
      const rows = (await db.execute(sql`
        SELECT t.id, t.status, t.created_at, t.waiting_since, t.customer_seen_at, ${customerColumns},
               o.id AS order_id, o.order_number, o.status AS order_status, o.post_handoff_due_at, o.handed_to_post_at,
               p.name AS partner_name, pc.name_fa AS partner_city,
               (SELECT count(*)::int FROM orders c WHERE c.user_id = t.user_id) AS order_count,
               (SELECT count(*)::int FROM orders c WHERE c.user_id = t.user_id
                  AND c.status IN ('paid', 'printing', 'handed_to_post', 'cancelled')) AS paid_count
          FROM support_threads t
          JOIN users u ON u.id = t.user_id
          LEFT JOIN orders o ON o.id = t.order_id
          LEFT JOIN print_partners p ON p.id = o.print_partner_id
          LEFT JOIN cities pc ON pc.id = p.city_id
          ${latestOrder}
          ${customerPlace}
         WHERE t.id = ${threadId}`)) as unknown as Record<string, unknown>[];
      const row = rows[0];
      if (!row) return null;
      const [messages, others] = await Promise.all([
        db
          .select({
            id: supportMessages.id,
            kind: supportMessages.kind,
            body: supportMessages.body,
            at: supportMessages.createdAt,
            adminName: adminUsers.displayName,
            ...shipmentSmsFields,
          })
          .from(supportMessages)
          .leftJoin(adminUsers, eq(adminUsers.id, supportMessages.adminUserId))
          .leftJoin(smsMessages, eq(smsMessages.id, supportMessages.smsMessageId))
          .where(eq(supportMessages.threadId, threadId))
          .orderBy(asc(supportMessages.id)),
        db
          .select({ id: supportThreads.id, orderNumber: orders.orderNumber, status: supportThreads.status })
          .from(supportThreads)
          .leftJoin(orders, eq(orders.id, supportThreads.orderId))
          .where(and(eq(supportThreads.userId, String(row.user_id)), sql`${supportThreads.id} <> ${threadId}`))
          .orderBy(desc(supportThreads.lastMessageAt)),
      ]);
      return {
        id: Number(row.id),
        status: row.status as SupportStatus,
        createdAt: asDate(row.created_at)!,
        waitingSince: asDate(row.waiting_since),
        customerSeenAt: asDate(row.customer_seen_at),
        customer: customerOf(row),
        order:
          row.order_id === null || row.order_id === undefined
            ? null
            : {
                id: String(row.order_id),
                number: Number(row.order_number),
                status: row.order_status as OrderStatus,
                partnerName: (row.partner_name as string | null) ?? null,
                partnerCity: (row.partner_city as string | null) ?? null,
                postHandoffDueAt: asDate(row.post_handoff_due_at),
                handedToPostAt: asDate(row.handed_to_post_at),
              },
        history: {
          orders: Number(row.order_count ?? 0),
          paid: Number(row.paid_count ?? 0),
          others: others.map((other) => ({ ...other, status: other.status as SupportStatus })),
        },
        messages: messages.map(({ id, kind, body, at, adminName, ...sms }) => ({
          id,
          kind,
          body,
          at,
          adminName: adminName ?? null,
          sms: shipmentSmsOf(sms),
        })),
      };
    },

    async orderThread(orderId) {
      const [thread] = await db
        .select({ id: supportThreads.id, status: supportThreads.status })
        .from(supportThreads)
        .where(eq(supportThreads.orderId, orderId))
        .limit(1);
      if (!thread) return null;
      const [last] = await db
        .select({ kind: supportMessages.kind, at: supportMessages.createdAt, adminName: adminUsers.displayName })
        .from(supportMessages)
        .leftJoin(adminUsers, eq(adminUsers.id, supportMessages.adminUserId))
        .where(eq(supportMessages.threadId, thread.id))
        .orderBy(desc(supportMessages.id))
        .limit(1);
      const [counted] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(supportMessages)
        .where(and(eq(supportMessages.threadId, thread.id), sql`${supportMessages.kind} <> 'closed'`));
      return {
        id: thread.id,
        status: thread.status,
        messages: Number(counted?.n ?? 0),
        last: last ? { kind: last.kind, adminName: last.adminName ?? null, at: last.at } : null,
      };
    },

    async reply(input) {
      try {
        return await replyOnce(input);
      } catch (error) {
        // همان فرم برای گفت‌وگوی دیگری، هم‌زمان: قفل ردیف دو گفت‌وگو جداست و شاخص یکتای فرم دیوار دوم.
        if (constraintOf(error) === 'support_messages_request') return { ok: false, reason: 'stale' };
        throw error;
      }
    },

    async close(input) {
      try {
        return await db.transaction(async (tx): Promise<SupportClose> => {
          const [thread] = await tx
            .select({ id: supportThreads.id, status: supportThreads.status, orderNumber: orders.orderNumber })
            .from(supportThreads)
            .leftJoin(orders, eq(orders.id, supportThreads.orderId))
            .where(eq(supportThreads.id, input.threadId))
            .for('update', { of: supportThreads })
            .limit(1);
          if (!thread) return { ok: false, reason: 'not_found' };
          const orderNumber = thread.orderNumber ?? null;
          const prior = await priorRequest(tx, input.requestId);
          if (prior) {
            return prior.threadId === input.threadId && prior.kind === 'closed'
              ? { ok: true, duplicate: true, orderNumber }
              : { ok: false, reason: 'stale' };
          }
          if (thread.status === 'closed') return { ok: false, reason: 'closed' };
          const [last] = await tx
            .select({ id: supportMessages.id })
            .from(supportMessages)
            .where(eq(supportMessages.threadId, input.threadId))
            .orderBy(desc(supportMessages.id))
            .limit(1);
          if ((last?.id ?? null) !== input.seenMessageId) return { ok: false, reason: 'stale' };
          await tx.insert(supportMessages).values({
            threadId: input.threadId,
            kind: 'closed',
            adminUserId: input.adminUserId,
            body: null,
            requestId: input.requestId,
            createdAt: input.at,
          });
          await tx.insert(adminEvents).values(
            adminEventRow({
              ...input.event,
              action: 'support.close',
              targetType: SUPPORT_TARGET,
              targetId: String(input.threadId),
              detail: { thread: input.threadId, orderNumber, customer: input.customer ?? null },
              at: input.at,
            }),
          );
          return { ok: true, duplicate: false, orderNumber };
        });
      } catch (error) {
        // دو «بستن» هم‌زمان با دو فرم: دومی پشت قفل ردیف می‌ماند و بسته می‌بیند؛ این دیوار دوم است.
        if (constraintOf(error) === 'support_messages_close_once') return { ok: false, reason: 'closed' };
        throw error;
      }
    },

    async replySms(messageId) {
      const [row] = await db
        .select({
          threadId: supportMessages.threadId,
          messageId: supportMessages.id,
          messageAt: supportMessages.createdAt,
          orderNumber: orders.orderNumber,
          customerSeenAt: supportThreads.customerSeenAt,
          newer: sql<boolean>`EXISTS (SELECT 1 FROM support_messages n
            WHERE n.thread_id = ${supportMessages.threadId} AND n.id > ${supportMessages.id} AND n.sms_message_id IS NOT NULL)`,
          ...shipmentSmsFields,
        })
        .from(supportMessages)
        .innerJoin(supportThreads, eq(supportThreads.id, supportMessages.threadId))
        .innerJoin(smsMessages, eq(smsMessages.id, supportMessages.smsMessageId))
        .leftJoin(orders, eq(orders.id, supportThreads.orderId))
        .where(and(eq(supportMessages.id, messageId), eq(supportMessages.kind, 'staff')))
        .limit(1);
      if (!row) return null;
      const { threadId, messageAt, orderNumber, customerSeenAt, newer, ...sms } = row;
      return { threadId, messageId, messageAt, orderNumber: orderNumber ?? null, customerSeenAt, newer: Boolean(newer), sms: shipmentSmsOf(sms)! };
    },

    async replySmsFailed({ since, stuckBefore }) {
      const stuck = ts(stuckBefore);
      const rows = (await db.execute(sql`
        SELECT t.id, o.order_number, coalesce(o.recipient_name, lo.recipient_name) AS customer_name
          FROM support_threads t
          LEFT JOIN orders o ON o.id = t.order_id
          ${latestOrder}
          JOIN LATERAL (
            SELECT m.created_at, s.status, s.created_at AS sms_created_at, s.attempted_at
              FROM support_messages m JOIN sms_messages s ON s.id = m.sms_message_id
             WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1
          ) r ON true
         WHERE r.created_at > ${ts(since)}
           AND (t.customer_seen_at IS NULL OR t.customer_seen_at < r.created_at)
           AND (r.status = 'failed'
             OR (r.status = 'pending' AND r.sms_created_at < ${stuck})
             OR (r.status = 'sending' AND r.attempted_at < ${stuck}))
         ORDER BY t.id`)) as unknown as Record<string, unknown>[];
      return rows.map((row) => ({ threadId: Number(row.id), orderNumber: asNumber(row.order_number), customer: (row.customer_name as string | null) ?? null }));
    },

    async logEvent(event) {
      await db.insert(adminEvents).values(adminEventRow(event));
    },
  };
}

/** مشتری پاسخی را هنوز ندیده: پاسخ پس از آخرین «دیده شد». */
export const unseenReply = (messageAt: Date, customerSeenAt: Date | null) => customerSeenAt === null || customerSeenAt.getTime() < messageAt.getTime();
