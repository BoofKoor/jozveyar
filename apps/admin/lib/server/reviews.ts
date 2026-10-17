/**
 * نظر مشتری‌ها در پنل (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): فهرست «نظرها» با شمار و میانگین، و تصمیم مالک: روی سایت گذاشتن، پنهان کردن و پاک
 * کردن. نوشتن نظر کار صاحب سفارش در سایت است؛ اینجا فقط تصمیم.
 *
 * - **مجوز در سرور** (ADR-038): همه با `reviews.manage` (فقط مالک)، پیش از هر خواندن؛ خبر پیشخوان بی آن null.
 * - **بی کد تازه:** نظر حرف مشتری است و پولی جابه‌جا نمی‌کند؛ پاک کردن تأیید جدای صفحه را دارد.
 * - **از همان که دید** (`seen`): تصمیم روی وضعیتی که مالک دید؛ حکم با ذخیره‌گاه زیر همان UPDATE: نظری که همان لحظه عوض شد `review_stale`، تا
 *   تصمیم کهنه روی تازه ننشیند، و دو کلیک همان تصمیم. گذار نادرست (مثلاً «روی سایت» از «روی سایت») پیش از پایگاه داده ۴۰۰.
 * - **روی سایت فقط با متن** (`review_no_body`، CHECK پایگاه داده)؛ پاک یعنی پاک: نمره و متن برای همیشه می‌روند.
 * - **رویداد** `reviews.approve`، `reviews.hide` و `reviews.delete` در همان تراکنش، با شمارهٔ سفارش و نمره، بی متن.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import type { AdminEventInput, ReviewCounts, ReviewFilter, ReviewStatus, ReviewStore, ReviewView } from '@jozveyar/db';

import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelReviewsDeps {
  store: ReviewStore;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** بیشترین نظر یک فهرست، تازه‌ترین اول. */
export const REVIEWS_LIMIT = 100;

export const REVIEW_FILTERS = ['pending', 'approved', 'hidden', 'all'] as const satisfies readonly ReviewFilter[];

export type ReviewAction = 'approve' | 'hide' | 'delete';

/** هر تصمیم به کدام وضعیت می‌برد، و از کدام وضعیت‌ها؛ همان گذارهای `order_reviews_flow` (0052). */
const ACTIONS: Record<ReviewAction, { to: Exclude<ReviewStatus, 'pending'>; from: readonly ReviewStatus[]; event: string }> = {
  approve: { to: 'approved', from: ['pending', 'hidden'], event: 'reviews.approve' },
  hide: { to: 'hidden', from: ['pending', 'approved'], event: 'reviews.hide' },
  delete: { to: 'deleted', from: ['pending', 'approved', 'hidden'], event: 'reviews.delete' },
};

const isAction = (value: unknown): value is ReviewAction => typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, value);
const isStatus = (value: unknown): value is ReviewStatus => value === 'pending' || value === 'approved' || value === 'hidden' || value === 'deleted';
export const filterOf = (value: unknown): ReviewFilter =>
  REVIEW_FILTERS.includes(value as ReviewFilter) ? (value as ReviewFilter) : 'pending';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createPanelReviews(deps: PanelReviewsDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    /** «نظرها»: نظرهای یک چیپ (پیش‌فرض منتظر)، و شمار هر وضعیت با میانگین. */
    async list(session: AdminSession, filter: unknown): Promise<Result<{ now: Date; filter: ReviewFilter; reviews: ReviewView[]; counts: ReviewCounts }>> {
      if (!can(session, 'reviews.manage')) return fail(403, 'forbidden');
      const chosen = filterOf(filter);
      const [reviews, counts] = await Promise.all([deps.store.list(chosen, REVIEWS_LIMIT), deps.store.counts()]);
      return ok({ now: now(), filter: chosen, reviews, counts });
    },

    /** شمار نظرهای منتظر برای خبر پیشخوان؛ null یعنی این نشست مجوزش را ندارد. */
    async pendingCount(session: AdminSession): Promise<number | null> {
      if (!can(session, 'reviews.manage')) return null;
      return (await deps.store.counts()).pending;
    },

    /** تصمیم مالک روی نظری که دید (`seen`: وضعیتی که صفحه نشان داد). */
    async decide(
      session: AdminSession,
      input: { id: unknown; seen: unknown; action: unknown },
      ip: string,
    ): Promise<Result<{ review: ReviewView; action: ReviewAction; already: boolean }>> {
      if (!can(session, 'reviews.manage')) return fail(403, 'forbidden');
      if (typeof input.id !== 'string' || !UUID.test(input.id)) return fail(404, 'review_not_found');
      if (!isAction(input.action) || !isStatus(input.seen)) return fail(400, 'review_bad_action');
      const action = ACTIONS[input.action];
      if (!action.from.includes(input.seen)) return fail(400, 'review_bad_action');
      // نمره و شمارهٔ سفارش برای رویداد؛ کهنه، دو کلیک و بی متن را خود `decide` زیر UPDATE می‌سنجد.
      const review = await deps.store.get(input.id);
      if (!review) return fail(404, 'review_not_found');

      const event: AdminEventInput = {
        adminUserId: session.userId,
        action: action.event,
        targetType: 'order_review',
        targetId: review.id,
        ipHash: ipHashOf(deps.secret, ip),
        at: now(),
        // نمرهٔ پیش از تصمیم (پاک کردن نمره را هم می‌برد)؛ متن هرگز.
        detail: { orderNumber: review.orderNumber, rating: review.rating },
      };
      const result = await deps.store.decide({ id: review.id, from: input.seen, to: action.to, event });
      if (result.ok) return ok({ review: result.review, action: input.action, already: result.already });
      if (result.reason === 'not_found') return fail(404, 'review_not_found');
      return fail(409, result.reason === 'no_body' ? 'review_no_body' : 'review_stale');
    },
  };
}

export type PanelReviews = ReturnType<typeof createPanelReviews>;
