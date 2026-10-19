/**
 * «سفارش‌های من» روی سرور (برش ۱۲٫۱، ADR-068) با ذخیره‌گاه‌های ساختگی و ساعت ثابت: کار بعدی هر کارت (سؤال ۳۰۷) با همان قاعده‌های صفحهٔ
 * سفارش، «پاسخ تازه»، «پیام تازه» با سه سفارش آخر و سفارشی که از صفحه‌اش آمده (سؤال ۳۰۹)، دیدن گفت‌وگو که «دیده شد» را جلو می‌برد، و
 * پیام مشتری با یکدست شدن، سقف و هر شکست به کد خودش (سؤال ۳۱۰). درستی کوئری‌ها و محافظ‌ها در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it, vi } from 'vitest';

import type { AccountStore, CustomerOrderRow, CustomerThreadLine, CustomerThreadView, PaymentRow, RefundRow, SupportStore } from '@jozveyar/db';

import { MESSAGE_MAX, ORDERS_PAGE_SIZE } from '../account';
import { GENERAL_CHOICE, createAccountService, nextOf } from './account';

const NOW = new Date('2026-10-05T07:50:00Z'); // دوشنبه 13 مهر 1405، 11:20
const HOUR = 3_600_000;
const SARA = { userId: 'u-sara', mobile: '09152345678' };
const TOKEN = '3f2b8c1e-9a7d-4c2e-8b1a-0d5e6f7a8b9c';

function orderRow(number: number, over: Partial<CustomerOrderRow['order']> = {}, rest: Partial<Omit<CustomerOrderRow, 'order'>> = {}): CustomerOrderRow {
  return {
    order: {
      id: `o-${number}`,
      orderNumber: number,
      publicToken: TOKEN,
      status: 'paid',
      createdAt: new Date('2026-10-03T08:00:00Z'),
      paidAt: new Date('2026-10-03T08:05:00Z'),
      totalRials: 3_747_500,
      postHandoffDueAt: new Date('2026-10-05T20:30:00Z'),
      handedToPostAt: null,
      ...over,
    },
    fileCount: 3,
    pageCount: 120,
    filesLiveUntil: new Date(NOW.getTime() + 48 * HOUR),
    payments: [],
    parcels: [],
    refunds: [],
    ...rest,
  };
}

const payment = (over: Partial<PaymentRow> = {}) => ({ id: 'p1', status: 'pending', gatewayStatus: null, gatewayError: null, returnedAt: null, ...over }) as PaymentRow;
const refund = (over: Partial<RefundRow> = {}) =>
  ({ id: 'r1', paymentId: 'p1', amountRials: 4_120_000, method: 'manual', status: 'succeeded', gatewayRef: null, gatewayStatus: null, ...over }) as RefundRow;

function service(input: { rows?: CustomerOrderRow[]; total?: number; threads?: CustomerThreadLine[]; thread?: CustomerThreadView | null; hours?: string | null } = {}) {
  const account = {
    customerOrders: vi.fn<AccountStore['customerOrders']>(async (_user, { limit }) => ({ rows: (input.rows ?? []).slice(0, limit), total: input.total ?? (input.rows ?? []).length })),
    customerOrder: vi.fn<AccountStore['customerOrder']>(async (_user, number) => (input.rows ?? []).find((row) => row.order.orderNumber === number) ?? null),
    ownedOrderId: vi.fn<AccountStore['ownedOrderId']>(async (_user, number) => (number === 10027 ? 'o-10027' : null)),
  };
  const support = {
    customerThreads: vi.fn<SupportStore['customerThreads']>(async () => input.threads ?? []),
    customerThread: vi.fn<SupportStore['customerThread']>(async () => input.thread ?? null),
    post: vi.fn<SupportStore['post']>(async () => ({ ok: true, threadId: 7, messageId: 70, duplicate: false })),
    markSeen: vi.fn<SupportStore['markSeen']>(async () => undefined),
  };
  const accountService = createAccountService({ account, support, hours: async () => (input.hours === undefined ? 'شنبه تا چهارشنبه، ساعت 9 تا 18' : input.hours), now: () => NOW });
  return { accountService, account, support };
}

describe('کار بعدی هر سفارش (سؤال ۳۰۷)', () => {
  it('در انتظار پرداخت: «پرداخت» فقط با فایل‌هایی که دست‌کم یک ساعت دیگر می‌مانند؛ «در حال بررسی» بی آن', () => {
    const awaiting = { status: 'awaiting_payment' as const, paidAt: null, postHandoffDueAt: null };
    expect(nextOf(orderRow(10036, awaiting), NOW)).toEqual({ kind: 'pay' });
    expect(nextOf(orderRow(10036, awaiting, { filesLiveUntil: new Date(NOW.getTime() + HOUR) }), NOW)).toEqual({ kind: 'pay' });
    expect(nextOf(orderRow(10036, awaiting, { filesLiveUntil: new Date(NOW.getTime() + HOUR - 1) }), NOW)).toBeNull();
    expect(nextOf(orderRow(10036, awaiting, { filesLiveUntil: null }), NOW)).toBeNull();
    // پولی شاید گرفته شده: نه «پرداخت»، حتی با فایل‌های رفته.
    expect(nextOf(orderRow(10036, awaiting, { filesLiveUntil: null, payments: [payment({ gatewayStatus: 1 })] }), NOW)).toEqual({ kind: 'checking' });
    expect(nextOf(orderRow(10036, awaiting, { payments: [payment({ status: 'failed', gatewayStatus: 1 })] }), NOW)).toEqual({ kind: 'pay' });
  });

  it('در صف و در حال چاپ با روز تحویل به پست؛ تحویل پست شد با روزش و کد هر بسته', () => {
    expect(nextOf(orderRow(10027), NOW)).toEqual({ kind: 'paid', due: 'امروز، دوشنبه 13 مهر' });
    expect(nextOf(orderRow(10027, { status: 'printing', postHandoffDueAt: new Date('2026-10-06T20:30:00Z') }), NOW)).toEqual({
      kind: 'printing',
      due: 'فردا، سه‌شنبه 14 مهر',
    });
    const barcode = '118800000000000000000087';
    const handed = nextOf(
      orderRow(10008, { status: 'handed_to_post', handedToPostAt: new Date('2026-09-26T07:00:00Z') }, { parcels: [{ barcode, createdAt: NOW }] }),
      NOW,
    );
    expect(handed).toMatchObject({ kind: 'handed', day: 'شنبه 4 مهر', parcels: [{ barcode, trackingUrl: expect.stringContaining(barcode) }] });
  });

  it('لغو شد: برگشت داده شد با روز (دستی روز ثبت، درگاه پایان)، در حال برگشت فقط وقتی درگاه پذیرفت، و بی بازپرداخت «برمی‌گردد»', () => {
    const cancelled = { status: 'cancelled' as const };
    const paid = [payment({ status: 'succeeded' })];
    expect(nextOf(orderRow(10002, cancelled, { payments: paid, refunds: [refund({ refundedOn: new Date('2026-09-21T20:30:00Z') })] }), NOW)).toEqual({
      kind: 'refunded',
      amountRials: 4_120_000,
      day: 'سه‌شنبه 31 شهریور',
    });
    expect(
      nextOf(orderRow(10002, cancelled, { payments: paid, refunds: [refund({ method: 'gateway', finishedAt: new Date('2026-10-04T17:44:00Z') })] }), NOW),
    ).toMatchObject({ kind: 'refunded', day: 'دیروز' });
    expect(nextOf(orderRow(10002, cancelled, { payments: paid, refunds: [refund({ status: 'pending', method: 'gateway', gatewayRef: 'z1' })] }), NOW)).toEqual({
      kind: 'refunding',
      amountRials: 4_120_000,
    });
    // درخواستی که جواب روشن نگرفت، و بازپرداخت پرداخت دیگر: همان «برمی‌گردد».
    expect(nextOf(orderRow(10002, cancelled, { payments: paid, refunds: [refund({ status: 'pending', method: 'gateway' })] }), NOW)).toEqual({ kind: 'cancelled' });
    expect(nextOf(orderRow(10002, cancelled, { payments: paid, refunds: [refund({ paymentId: 'other' })] }), NOW)).toEqual({ kind: 'cancelled' });
    expect(nextOf(orderRow(10002, { status: 'expired' }), NOW)).toBeNull();
  });
});

describe('سرویس «سفارش‌های من»', () => {
  it('فهرست: کارت با روز پرداخت یا ساختن، صفحه‌ها، گفت‌وگوها و «پاسخ تازه» تازه‌ترین گفت‌وگوی ندیده', async () => {
    const rows = [
      orderRow(10036, { status: 'awaiting_payment', paidAt: null, createdAt: new Date('2026-10-05T07:32:00Z'), postHandoffDueAt: null }, { fileCount: 1, pageCount: 46 }),
      orderRow(10027),
      // فایلش رفت میان کوئری و حالا: در فهرست نیست.
      orderRow(10020, { status: 'awaiting_payment', paidAt: null, postHandoffDueAt: null }, { filesLiveUntil: new Date(NOW.getTime() + 60_000) }),
    ];
    const threads: CustomerThreadLine[] = [
      { id: 9, orderNumber: 10027, status: 'answered', lastMessageAt: NOW, last: { kind: 'staff', body: 'سلام.\nجزوه‌ات امروز چاپ می‌شود.', at: new Date('2026-10-05T07:12:00Z') }, unseen: true },
      { id: 3, orderNumber: null, status: 'closed', lastMessageAt: NOW, last: { kind: 'customer', body: 'فاکتور رسمی می‌دهید؟', at: new Date('2026-09-23T09:00:00Z') }, unseen: false },
    ];
    const { accountService, account } = service({ rows, total: 45, threads });
    const view = await accountService.orders(SARA, 2);
    expect(account.customerOrders).toHaveBeenCalledWith(SARA.userId, { at: NOW, limit: ORDERS_PAGE_SIZE, offset: ORDERS_PAGE_SIZE });
    expect(view).toMatchObject({ mobile: SARA.mobile, page: 2, pages: 3, fresh: { threadId: 9, orderNumber: 10027 } });
    expect(view.orders.map((card) => [card.number, card.day, card.fileCount, card.pageCount, card.next.kind])).toEqual([
      [10036, 'امروز 11:02', 1, 46, 'pay'],
      [10027, 'شنبه 11 مهر', 3, 120, 'paid'],
    ]);
    expect(view.threads).toEqual([
      { id: 9, orderNumber: 10027, status: 'answered', fresh: true, last: { staff: true, when: 'امروز 10:42', body: 'سلام. جزوه‌ات امروز چاپ می‌شود.' } },
      { id: 3, orderNumber: null, status: 'closed', fresh: false, last: { staff: false, when: 'چهارشنبه 1 مهر', body: 'فاکتور رسمی می‌دهید؟' } },
    ]);
    // صفحهٔ نادرست همان صفحهٔ اول.
    expect((await accountService.orders(SARA, 0)).page).toBe(1);
    expect((await service().accountService.orders(SARA, 1)).fresh).toBeNull();
  });

  it('«پیام تازه»: سه سفارش آخر و «سؤال کلی»؛ سفارشی که از صفحه‌اش آمد از پیش و اول، قدیمی‌تر هم؛ بی آن هیچ از پیش', async () => {
    const rows = [orderRow(10036, { status: 'awaiting_payment', paidAt: null }), orderRow(10027), orderRow(10008, { status: 'handed_to_post' }), orderRow(10002, { status: 'cancelled' })];
    const { accountService } = service({ rows });
    const plain = await accountService.newMessage(SARA, null);
    expect(plain.choices.map((choice) => choice.value)).toEqual(['10036', '10027', '10008', 'general']);
    expect(plain.choices[1]).toEqual({ value: '10027', orderNumber: 10027, note: 'پرداخت شد · شنبه 11 مهر' });
    expect(plain.choices.at(-1)).toEqual(GENERAL_CHOICE);
    expect(plain).toMatchObject({ selected: '', from: null, hours: 'شنبه تا چهارشنبه، ساعت 9 تا 18', mobile: SARA.mobile });
    expect(await accountService.newMessage(SARA, 10027)).toMatchObject({ selected: '10027', from: { number: 10027, token: TOKEN } });
    const older = await accountService.newMessage(SARA, 10002);
    expect(older.choices.map((choice) => choice.value)).toEqual(['10002', '10036', '10027', '10008', 'general']);
    expect(older.selected).toBe('10002');
    // سفارشی که مال این مشتری نیست، یا در فهرست نیست: انگار نیامده.
    expect(await accountService.newMessage(SARA, 99999)).toMatchObject({ selected: '', from: null });
    // بی سفارشی در فهرست، «سؤال کلی» تنها گزینه و از پیش؛ بی ساعت پاسخ‌گویی هیچ.
    expect(await service({ hours: null }).accountService.newMessage(SARA, null)).toMatchObject({ choices: [GENERAL_CHOICE], selected: 'general', hours: null });
  });

  it('گفت‌وگو: پاسخ‌های پس از آخرین «دیده شد» تازه‌اند، و دیدن «دیده شد» را جلو می‌برد؛ گفت‌وگوی دیگران و شناسهٔ نادرست ۴۰۴', async () => {
    const seen = new Date('2026-10-04T18:00:00Z');
    const thread: CustomerThreadView = {
      id: 9,
      orderNumber: 10027,
      orderToken: TOKEN,
      orderStatus: 'paid',
      status: 'answered',
      customerSeenAt: seen,
      messages: [
        { id: 1, kind: 'customer', body: 'تا چهارشنبه می‌رسد؟', at: new Date('2026-10-04T17:44:00Z') },
        { id: 2, kind: 'staff', body: 'دیروز دیده شد', at: new Date('2026-10-04T17:50:00Z') },
        { id: 3, kind: 'staff', body: 'امروز چاپ می‌شود.', at: new Date('2026-10-05T07:12:00Z') },
      ],
    };
    const { accountService, support } = service({ thread });
    const result = await accountService.thread(SARA, 9);
    expect(support.customerThread).toHaveBeenCalledWith(SARA.userId, 9);
    expect(support.markSeen).toHaveBeenCalledWith(SARA.userId, 9, NOW);
    expect(result).toMatchObject({
      ok: true,
      value: { id: 9, orderNumber: 10027, order: { number: 10027, token: TOKEN, status: 'paid' }, status: 'answered', hours: 'شنبه تا چهارشنبه، ساعت 9 تا 18' },
    });
    if (!result.ok) return;
    expect(result.value.messages.map((m) => [m.id, m.when, m.fresh])).toEqual([
      [1, 'دیروز، 21:14', false],
      [2, 'دیروز، 21:20', false],
      [3, 'امروز، 10:42', true],
    ]);
    const missing = service({ thread: null });
    expect(await missing.accountService.thread(SARA, 9)).toMatchObject({ ok: false, status: 404, error: 'not_found' });
    expect(missing.support.markSeen).not.toHaveBeenCalled();
    expect(await missing.accountService.thread(SARA, 0)).toMatchObject({ status: 404 });
    expect(missing.support.customerThread).toHaveBeenCalledTimes(1);
  });

  it('پیام: هر خط فارسی‌نرمال، خالی و بلند رد، سفارش فقط با شمارهٔ همین مشتری، و هر شکست ذخیره‌گاه کد خودش', async () => {
    const { accountService, support, account } = service();
    const requestId = '0b6c2a6e-6f0d-4a8e-9d43-2f1b2c3d4e5f';
    const post = (body: unknown) => accountService.post(SARA, body);
    expect(await post({ requestId, body: '  سلام، جزوه كي مي‌رسد؟ \n\n  ممنون  ', to: { kind: 'order', number: 10027 } })).toEqual({
      ok: true,
      value: { threadId: 7, duplicate: false },
    });
    expect(account.ownedOrderId).toHaveBeenCalledWith(SARA.userId, 10027);
    expect(support.post).toHaveBeenLastCalledWith({
      userId: SARA.userId,
      target: { kind: 'order', orderId: 'o-10027' },
      body: 'سلام، جزوه کی می‌رسد؟\nممنون',
      requestId,
      at: NOW,
    });
    await post({ requestId, body: 'سؤال', to: { kind: 'general' } });
    expect(support.post).toHaveBeenLastCalledWith(expect.objectContaining({ target: { kind: 'general' } }));
    await post({ requestId, body: 'سؤال', to: { kind: 'thread', id: 9 } });
    expect(support.post).toHaveBeenLastCalledWith(expect.objectContaining({ target: { kind: 'thread', threadId: 9 } }));

    const calls = support.post.mock.calls.length;
    expect(await post({ requestId, body: ' \n‌ ', to: { kind: 'general' } })).toMatchObject({ status: 400, error: 'message_empty' });
    expect(await post({ requestId, body: 'ن'.repeat(MESSAGE_MAX + 1), to: { kind: 'general' } })).toMatchObject({ status: 400, error: 'message_too_long', max: MESSAGE_MAX });
    // سقف پس از یکدست شدن: فاصلهٔ اضافه شمرده نمی‌شود.
    expect(await post({ requestId, body: `  ${'ن'.repeat(MESSAGE_MAX)}  \n\n`, to: { kind: 'general' } })).toMatchObject({ ok: true });
    expect(await post({ requestId: 'x', body: 'سلام', to: { kind: 'general' } })).toMatchObject({ status: 400, error: 'invalid_request' });
    expect(await post({ requestId, body: 'سلام', to: { kind: 'order', number: 0 } })).toMatchObject({ status: 400, error: 'invalid_request' });
    expect(await post({ requestId, body: 'سلام' })).toMatchObject({ status: 400, error: 'invalid_request' });
    expect(await post({ requestId, body: 'سلام', to: { kind: 'order', number: 10028 } })).toMatchObject({ status: 404, error: 'not_found' });
    expect(support.post.mock.calls.length).toBe(calls + 1);

    for (const [reason, status, error] of [
      ['not_found', 404, 'not_found'],
      ['no_orders', 409, 'no_orders'],
      ['rate', 429, 'message_rate'],
      ['open_threads', 409, 'open_threads'],
      ['stale', 409, 'stale_form'],
    ] as const) {
      support.post.mockResolvedValueOnce({ ok: false, reason });
      expect(await post({ requestId, body: 'سلام', to: { kind: 'general' } }), reason).toMatchObject({ ok: false, status, error });
    }
  });
});
