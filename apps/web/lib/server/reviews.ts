/**
 * نظر مشتری (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): «از جزوه راضی بودی؟» صفحهٔ سفارش برای صاحبش پس از «تحویل پست شد»، و «نظر مشتری‌ها» صفحهٔ
 * اصلی.
 *
 * - **نوشتن** (`POST /api/orders/<توکن>/review`): فقط نشست صاحب سفارش (غریبه همان ۴۰۴ سفارش ناموجود، مثل صفحهٔ سفارش، ADR-033)، فقط
 *   «تحویل پست شد»، یکی برای هر سفارش، نمرهٔ ۱ تا ۵ و متن اختیاری که هر خطش فارسی‌نرمال است (`tidyInputLinesFa`) تا ۵۰۰ نویسه. حکم آخر با
 *   محافظ‌های پایگاه داده (0052). پشت حالت مسیر خرید نیست، مثل خود صفحهٔ سفارش.
 * - **نام روی سایت** همان است که فرم زیر فیلد نشان داد (`reviewAttribution` در `checkout.ts`): نام کوچک و شهر، منجمد روی خود نظر با
 *   نوشتنش؛ نام خانوادگی، موبایل و شمارهٔ سفارش هرگز.
 * - **صفحهٔ اصلی:** فقط آنچه مالک روی سایت گذاشت، که همیشه متن دارد. مثل تعرفه (`tariff.ts`): build و بی پایگاه داده هیچ، و خطای پایگاه
 *   داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد.
 */

import type { OrderViewReview } from '@jozveyar/contracts/checkout';
import { createReviewStore, getDb, PUBLISHED_REVIEWS_LIMIT, type OrderStore, type ReviewStore } from '@jozveyar/db';
import { tidyInputLinesFa } from '@jozveyar/text/input';

import { REVIEW_BODY_MAX } from '../review';
import type { AuthUser } from './auth';
import { reviewAttribution, TOKEN } from './checkout';
import { fail, ok, type Result } from './result';
import { BUILD_PHASE } from './tariff';

export interface ReviewDeps {
  orders: Pick<OrderStore, 'details'>;
  reviews: Pick<ReviewStore, 'submit'>;
}

const field = (input: unknown, key: string): unknown =>
  input !== null && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined;

export async function submitReview(
  deps: ReviewDeps,
  token: string,
  user: AuthUser | null,
  input: unknown,
  at: Date,
): Promise<Result<OrderViewReview>> {
  if (!TOKEN.test(token)) return fail(404, 'not_found');
  const found = await deps.orders.details(token.toLowerCase());
  // غریبه همان سفارش ناموجود است: صفحهٔ سفارش هم چیزی از صاحب به او نمی‌گوید.
  if (!found || user === null || user.userId !== found.order.userId) return fail(404, 'not_found');
  if (found.order.status !== 'handed_to_post') return fail(409, 'review_not_open');
  if (found.review) return fail(409, 'review_exists');

  const rating = field(input, 'rating');
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, 'invalid_rating');
  const raw = field(input, 'body');
  const body = typeof raw === 'string' ? tidyInputLinesFa(raw) : '';
  if (body.length > REVIEW_BODY_MAX) return fail(400, 'review_too_long', { max: REVIEW_BODY_MAX });

  const result = await deps.reviews.submit({ orderId: found.order.id, rating, body: body === '' ? null : body, ...reviewAttribution(found.order), at });
  // هم‌زمان: نظر دیگری همان لحظه رسید، یا وضعیت سفارش همان لحظه برگشت (محافظ زیر قفل سطر سفارش).
  if (!result.ok) return fail(409, result.reason === 'exists' ? 'review_exists' : 'review_not_open');
  return ok({ rating, body: result.review.body, published: false });
}

/** نظر روی صفحهٔ اصلی: نمره، متن، و «سارا، مشهد». */
export interface SiteReview {
  rating: number;
  body: string;
  name: string;
  place: string;
}

let source: Pick<ReviewStore, 'published'> | undefined;

export async function siteReviews(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => Pick<ReviewStore, 'published'> = () => (source ??= createReviewStore(getDb())),
): Promise<SiteReview[]> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return [];
  try {
    const rows = await sourceOf().published(PUBLISHED_REVIEWS_LIMIT);
    return rows.map((row) => ({ rating: row.rating, body: row.body, name: row.publicName, place: row.publicPlace }));
  } catch (error) {
    console.error('✗ صفحهٔ اصلی: نظرها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
