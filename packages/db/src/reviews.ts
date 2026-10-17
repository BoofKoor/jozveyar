/**
 * نظر مشتری (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): صاحب سفارش پس از «تحویل پست شد» یک بار نمره و متن اختیاری می‌دهد؛ مالک روی سایت می‌گذارد،
 * پنهان می‌کند یا پاک. صفحهٔ سفارش نظر را از `details()` سفارش می‌خواند؛ اینجا نوشتن مشتری، صفحهٔ اصلی و پنل است.
 *
 * - **حکم آخر با پایگاه داده** (محافظ‌های 0052): نظر فقط برای سفارش «تحویل پست شد»، یکی برای هر سفارش، و آنچه مشتری نوشت منجمد.
 * - **تصمیم مالک** از همان وضعیتی که دید (`from`)، با رویدادش در یک تراکنش. دو کلیک یک تصمیم است (`already`)؛ نظری که همان لحظه کس دیگری
 *   عوضش کرد `stale`، تا تصمیم کهنه روی تصمیم تازه ننشیند.
 * - **پاک یعنی پاک:** نمره و متن برای همیشه می‌روند؛ ردیف خالی می‌ماند تا همان سفارش دوباره فرم نگیرد.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { constraintOf } from './orders.js';
import { adminEvents, adminUsers, orderReviews, orders } from './schema.js';

export type ReviewStatus = 'pending' | 'approved' | 'hidden' | 'deleted';

/** نظر یک سفارش، همان‌طور که مشتری نوشت. */
export type OrderReviewRow = typeof orderReviews.$inferSelect;

/** نظر در پنل: با شمارهٔ سفارش و نام کسی که آخرین تصمیم را گرفت. */
export interface ReviewView extends OrderReviewRow {
  orderNumber: number;
  decidedByName: string | null;
}

/** نظر روی صفحهٔ اصلی: فقط تأییدشدهٔ متن‌دار، با نام کوچک و شهری که مشتری زیر فرم دید. */
export interface PublishedReview {
  rating: number;
  body: string;
  publicName: string;
  publicPlace: string;
  createdAt: Date;
}

export type ReviewFilter = 'pending' | 'approved' | 'hidden' | 'all';

/** چند نظر «روی سایت» صفحهٔ اصلی دارد، تازه‌ترین اول؛ پنل همین را در راهنمای «نظر مشتری‌ها» می‌گوید. */
export const PUBLISHED_REVIEWS_LIMIT = 6;

/** شمار هر وضعیت (پاک‌شده نه) و میانگین نمرهٔ همان‌ها. */
export interface ReviewCounts {
  pending: number;
  approved: number;
  hidden: number;
  total: number;
  averageRating: number | null;
}

export type SubmitOutcome = { ok: true; review: OrderReviewRow } | { ok: false; reason: 'exists' | 'not_delivered' };

export type DecideOutcome =
  | { ok: true; review: ReviewView; already: boolean }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'stale' | 'no_body'; review: ReviewView };

export interface ReviewStore {
  /** نظر تازهٔ صاحب سفارش. سرویس صاحب و وضعیت را پیش‌تر سنجیده؛ حکم آخر با محافظ و شاخص یکتا. */
  submit(input: { orderId: string; rating: number; body: string | null; publicName: string; publicPlace: string; at: Date }): Promise<SubmitOutcome>;
  /** تأییدشده‌ها برای صفحهٔ اصلی، تازه‌ترین اول. */
  published(limit: number): Promise<PublishedReview[]>;
  /** فهرست پنل، تازه‌ترین اول؛ پاک‌شده هرگز. */
  list(filter: ReviewFilter, limit: number): Promise<ReviewView[]>;
  counts(): Promise<ReviewCounts>;
  get(id: string): Promise<ReviewView | null>;
  /** تصمیم مالک از وضعیتی که دید، با رویداد `event` (هدفش همین نظر) در همان تراکنش. */
  decide(input: { id: string; from: ReviewStatus; to: Exclude<ReviewStatus, 'pending'>; event: AdminEventInput }): Promise<DecideOutcome>;
}

const decider = alias(adminUsers, 'decider');

const fields = {
  id: orderReviews.id,
  orderId: orderReviews.orderId,
  rating: orderReviews.rating,
  body: orderReviews.body,
  publicName: orderReviews.publicName,
  publicPlace: orderReviews.publicPlace,
  status: orderReviews.status,
  createdAt: orderReviews.createdAt,
  decidedAt: orderReviews.decidedAt,
  decidedBy: orderReviews.decidedBy,
  orderNumber: orders.orderNumber,
  decidedByName: decider.displayName,
};

export function createReviewStore({ db }: Database): ReviewStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const views = (tx: Tx | typeof db) =>
    tx
      .select(fields)
      .from(orderReviews)
      .innerJoin(orders, eq(orders.id, orderReviews.orderId))
      .leftJoin(decider, eq(decider.id, orderReviews.decidedBy));

  const countOf = (status: ReviewStatus) => sql<number>`count(*) filter (where ${orderReviews.status} = ${status})::int`;

  async function get(id: string): Promise<ReviewView | null> {
    const [row] = await views(db).where(eq(orderReviews.id, id)).limit(1);
    return row ?? null;
  }

  return {
    async submit({ orderId, rating, body, publicName, publicPlace, at }) {
      try {
        const [row] = await db
          .insert(orderReviews)
          .values({ orderId, rating, body, publicName, publicPlace, createdAt: at })
          .onConflictDoNothing({ target: orderReviews.orderId })
          .returning();
        return row ? { ok: true, review: row } : { ok: false, reason: 'exists' };
      } catch (error) {
        // سفارش همین حالا «تحویل پست شد» نیست (محافظ زیر قفل سطر سفارش).
        if (constraintOf(error) === 'order_reviews_delivered') return { ok: false, reason: 'not_delivered' };
        throw error;
      }
    },

    async published(limit) {
      const rows = await db
        .select({
          rating: orderReviews.rating,
          body: orderReviews.body,
          publicName: orderReviews.publicName,
          publicPlace: orderReviews.publicPlace,
          createdAt: orderReviews.createdAt,
        })
        .from(orderReviews)
        .where(eq(orderReviews.status, 'approved'))
        .orderBy(desc(orderReviews.createdAt), desc(orderReviews.id))
        .limit(limit);
      // روی سایت همیشه نمره و متن دارد (`order_reviews_content` و `order_reviews_approved_body`).
      return rows.map((row) => ({ ...row, rating: row.rating!, body: row.body! }));
    },

    async list(filter, limit) {
      return views(db)
        .where(filter === 'all' ? ne(orderReviews.status, 'deleted') : eq(orderReviews.status, filter))
        .orderBy(desc(orderReviews.createdAt), desc(orderReviews.id))
        .limit(limit);
    },

    async counts() {
      const [row] = await db
        .select({
          pending: countOf('pending'),
          approved: countOf('approved'),
          hidden: countOf('hidden'),
          average: sql<string | null>`avg(${orderReviews.rating}) filter (where ${orderReviews.status} <> 'deleted')`,
        })
        .from(orderReviews);
      const { pending = 0, approved = 0, hidden = 0, average = null } = row ?? {};
      return { pending, approved, hidden, total: pending + approved + hidden, averageRating: average === null ? null : Number(average) };
    },

    get,

    async decide({ id, from, to, event }) {
      try {
        return await db.transaction(async (tx) => {
          const [changed] = await tx
            .update(orderReviews)
            .set({
              status: to,
              decidedAt: event.at,
              decidedBy: event.adminUserId,
              // پاک یعنی پاک: نمره و متن برای همیشه (`order_reviews_content`).
              ...(to === 'deleted' ? { rating: null, body: null } : {}),
            })
            .where(and(eq(orderReviews.id, id), eq(orderReviews.status, from)))
            .returning({ id: orderReviews.id });
          if (changed) await tx.insert(adminEvents).values(adminEventRow({ ...event, targetType: 'order_review', targetId: id }));
          const [review] = await views(tx).where(eq(orderReviews.id, id));
          if (!review) return { ok: false, reason: 'not_found' } as const;
          if (changed) return { ok: true, review, already: false } as const;
          // دو کلیک همان تصمیم است؛ تصمیم دیگری که همان لحظه گرفته شد نه.
          return review.status === to ? ({ ok: true, review, already: true } as const) : ({ ok: false, reason: 'stale', review } as const);
        });
      } catch (error) {
        // نظر بی متن روی سایت نمی‌رود (`order_reviews_approved_body`)؛ سرویس پیش‌تر می‌سنجد، این دیوار دوم است.
        if (constraintOf(error) !== 'order_reviews_approved_body') throw error;
        const review = await get(id);
        if (!review) return { ok: false, reason: 'not_found' };
        return { ok: false, reason: 'no_body', review };
      }
    },
  };
}
