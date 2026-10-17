/**
 * سرویس نظر مشتری‌ها در پنل (`reviews.ts`، برش ۱۲٫۳) با ذخیره‌گاه حافظه‌ای: مجوز در سرور پیش از هر خواندن، تصمیم از همان وضعیتی که صفحه دید
 * (`seen`)، دو کلیک یکی، کهنه رد، نظر بی متن روی سایت نه، گذار نادرست پیش از پایگاه داده، و رویداد با شمارهٔ سفارش و نمره، بی متن. محافظ‌ها
 * روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { AdminEventInput, ReviewFilter, ReviewStatus, ReviewStore, ReviewView } from '@jozveyar/db';

import { ipHashOf, type AdminSession } from './auth';
import { createPanelReviews, filterOf, REVIEWS_LIMIT } from './reviews';

const NOW = new Date('2026-10-16T08:00:00Z');
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';

function session(roles: string[], permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'parvin',
    displayName: 'پروین',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OWNER = session(['owner'], ['orders.read', 'reviews.manage']);
const OPERATOR = session(['operator'], ['orders.read', 'customers.block']);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const review = (n: number, over: Partial<ReviewView> = {}): ReviewView => ({
  id: id(n),
  orderId: `order-${n}`,
  orderNumber: 10_000 + n,
  rating: 5,
  body: 'صحافی محکم بود و زود رسید.',
  publicName: 'سارا',
  publicPlace: 'مشهد',
  status: 'pending',
  createdAt: new Date(NOW.getTime() - n * 60_000),
  decidedAt: null,
  decidedBy: null,
  decidedByName: null,
  ...over,
});

/** ذخیره‌گاه حافظه‌ای با همان قرارداد: تصمیم فقط از `from`، دو کلیک یکی، و پاک یعنی نمره و متن هیچ. */
function memoryStore(rows: ReviewView[]) {
  const events: AdminEventInput[] = [];
  const lists: { filter: ReviewFilter; limit: number }[] = [];
  const store: ReviewStore = {
    async submit() {
      throw new Error('پنل نظر نمی‌نویسد');
    },
    async published() {
      throw new Error('پنل صفحهٔ اصلی را نمی‌خواند');
    },
    async list(filter, limit) {
      lists.push({ filter, limit });
      return rows.filter((row) => (filter === 'all' ? row.status !== 'deleted' : row.status === filter));
    },
    async counts() {
      const live = rows.filter((row) => row.status !== 'deleted');
      const count = (status: ReviewStatus) => live.filter((row) => row.status === status).length;
      return {
        pending: count('pending'),
        approved: count('approved'),
        hidden: count('hidden'),
        total: live.length,
        averageRating: live.length ? live.reduce((sum, row) => sum + row.rating!, 0) / live.length : null,
      };
    },
    async get(reviewId) {
      return rows.find((row) => row.id === reviewId) ?? null;
    },
    async decide({ id: reviewId, from, to, event }) {
      const row = rows.find((r) => r.id === reviewId);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.status !== from) return row.status === to ? { ok: true, review: row, already: true } : { ok: false, reason: 'stale', review: row };
      if (to === 'approved' && row.body === null) return { ok: false, reason: 'no_body', review: row };
      Object.assign(row, { status: to, decidedAt: event.at, decidedBy: event.adminUserId, decidedByName: 'پروین' });
      if (to === 'deleted') Object.assign(row, { rating: null, body: null });
      events.push(event);
      return { ok: true, review: row, already: false };
    },
  };
  return { store, events, lists };
}

const panelOf = (rows: ReviewView[]) => {
  const memory = memoryStore(rows);
  return { ...memory, panel: createPanelReviews({ store: memory.store, secret: SECRET, now: () => NOW }) };
};

describe('نظر مشتری‌ها در پنل (۱۲٫۳)', () => {
  it('فقط مالک (`reviews.manage`)، پیش از هر خواندن؛ چیپ ناشناس «منتظر»، و شمار با میانگین', async () => {
    const { panel, lists } = panelOf([review(1), review(2, { status: 'approved', rating: 3 }), review(3, { status: 'deleted', rating: null, body: null })]);
    expect(await panel.list(OPERATOR, 'pending')).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(await panel.pendingCount(OPERATOR)).toBeNull();
    expect(await panel.decide(OPERATOR, { id: id(1), seen: 'pending', action: 'approve' }, IP)).toMatchObject({ status: 403 });
    expect(lists).toEqual([]);

    const listed = await panel.list(OWNER, 'نامعلوم');
    expect(listed).toMatchObject({ ok: true, value: { filter: 'pending', now: NOW, counts: { pending: 1, approved: 1, hidden: 0, total: 2, averageRating: 4 } } });
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value.reviews.map((r) => r.id)).toEqual([id(1)]);
    expect(lists).toEqual([{ filter: 'pending', limit: REVIEWS_LIMIT }]);
    expect(await panel.pendingCount(OWNER)).toBe(1);
    expect(REVIEW_FILTER_INPUTS.map(filterOf)).toEqual(['pending', 'approved', 'hidden', 'all', 'pending', 'pending']);
  });

  it('روی سایت، پنهان و پاک از همان که دید؛ دو کلیک یکی؛ کهنه و بی متن رد؛ رویداد با شماره و نمره، بی متن', async () => {
    const rows = [review(1), review(2, { body: null, rating: 2 })];
    const { panel, events } = panelOf(rows);
    const decide = (n: number, seen: unknown, action: unknown) => panel.decide(OWNER, { id: id(n), seen, action }, IP);

    expect(await decide(1, 'pending', 'approve')).toMatchObject({ ok: true, value: { action: 'approve', already: false, review: { status: 'approved' } } });
    expect(events).toEqual([
      {
        adminUserId: 'admin-1',
        action: 'reviews.approve',
        targetType: 'order_review',
        targetId: id(1),
        ipHash: ipHashOf(SECRET, IP),
        at: NOW,
        detail: { orderNumber: 10_001, rating: 5 },
      },
    ]);
    // دو کلیک (یا همان تصمیم از زبانهٔ دیگر) همان تصمیم است، بی رویداد دوم.
    expect(await decide(1, 'pending', 'approve')).toMatchObject({ ok: true, value: { already: true } });
    // صفحهٔ کهنه: نظر همین حالا «روی سایت» شد و این صفحه هنوز «منتظر» دیده بود.
    expect(await decide(1, 'pending', 'hide')).toEqual({ ok: false, status: 409, error: 'review_stale' });
    expect(await decide(2, 'pending', 'approve')).toEqual({ ok: false, status: 409, error: 'review_no_body' });
    expect(await decide(1, 'approved', 'hide')).toMatchObject({ ok: true, value: { review: { status: 'hidden' } } });
    expect(await decide(1, 'hidden', 'delete')).toMatchObject({ ok: true, value: { review: { status: 'deleted', rating: null, body: null } } });
    expect(events.map((e) => [e.action, e.detail])).toEqual([
      ['reviews.approve', { orderNumber: 10_001, rating: 5 }],
      ['reviews.hide', { orderNumber: 10_001, rating: 5 }],
      // نمرهٔ پیش از پاک کردن؛ متن هرگز.
      ['reviews.delete', { orderNumber: 10_001, rating: 5 }],
    ]);
    expect(JSON.stringify(events)).not.toContain('صحافی');
    // پاک‌شده دیگر تصمیم نمی‌گیرد.
    expect(await decide(1, 'deleted', 'approve')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(await decide(1, 'hidden', 'approve')).toEqual({ ok: false, status: 409, error: 'review_stale' });
    // نظر بی متن پنهان و پاک می‌شود.
    expect(await decide(2, 'pending', 'hide')).toMatchObject({ ok: true, value: { review: { status: 'hidden' } } });
  });

  it('فرم دست‌ساز: شناسهٔ بدشکل ۴۰۴، و تصمیم یا وضعیت ناشناس، یا گذاری که نیست، ۴۰۰ پیش از هر خواندن', async () => {
    const { panel, events } = panelOf([review(1, { status: 'approved' })]);
    const decide = (reviewId: unknown, seen: unknown, action: unknown) => panel.decide(OWNER, { id: reviewId, seen, action }, IP);
    expect(await decide('not-a-uuid', 'pending', 'approve')).toEqual({ ok: false, status: 404, error: 'review_not_found' });
    expect(await decide(id(9), 'pending', 'approve')).toEqual({ ok: false, status: 404, error: 'review_not_found' });
    expect(await decide(id(1), 'pending', 'publish')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(await decide(id(1), 'live', 'hide')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(await decide(id(1), 'approved', 'approve')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(await decide(id(1), 'hidden', 'hide')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(await decide(id(1), 'approved', 'toString')).toEqual({ ok: false, status: 400, error: 'review_bad_action' });
    expect(events).toEqual([]);
  });
});

const REVIEW_FILTER_INPUTS: unknown[] = ['pending', 'approved', 'hidden', 'all', 'deleted', undefined];
