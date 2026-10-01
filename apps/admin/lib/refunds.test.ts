/**
 * بازپرداخت به زبان پنل (برش ۷٫۳، ADR-051): حالت کارت، فرم ثبت دستی، متن رد درگاه، رویدادهای سفارش و صفحهٔ «رویدادها»، و بی مبلغ.
 * خالص و بی پایگاه داده؛ ساختن زیر قفل و محافظ‌ها در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { AdminEventView, PanelOrderDetails, PanelPayment, PanelRefund } from '@jozveyar/db';

import { eventLines } from './events';
import { orderTimeline, withoutMoney, type Seg } from './orders';
import { REFUND_NOTE_MAX, hasLiveRefund, readManualRefund, refundAskable, refundCard, rejectionNow, rejectionPast, rejectionResult } from './refunds';

/** «حالا»: دوشنبه 13 مهر 1405، 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const MINUTE = 60_000;
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : s.barcode)).join('');

const payment = (over: Partial<PanelPayment> = {}): PanelPayment =>
  ({
    id: 'p1',
    orderId: 'o1',
    provider: 'zibal',
    amountRials: 3_747_500,
    status: 'succeeded',
    authority: '3715022987',
    cardMask: '603799******1234',
    verifiedAt: new Date('2026-10-03T08:00:00Z'),
    createdAt: new Date('2026-10-03T07:58:00Z'),
    sms: null,
    ...over,
  }) as PanelPayment;

const refund = (over: Partial<PanelRefund> = {}): PanelRefund =>
  ({
    id: 'r1',
    orderId: 'o1',
    paymentId: 'p1',
    amountRials: 3_747_500,
    feeRials: 15_000,
    method: 'gateway',
    status: 'pending',
    gatewayRef: null,
    reference: null,
    refundedOn: null,
    note: null,
    gatewayStatus: null,
    gatewayError: null,
    gatewayCheckedAt: null,
    failureReason: null,
    settledVia: null,
    adminUserId: 'a1',
    raw: null,
    createdAt: new Date(NOW.getTime() - 15 * MINUTE),
    finishedAt: null,
    adminName: 'سارا',
    ...over,
  }) as PanelRefund;

const details = (status: PanelOrderDetails['order']['status'], refunds: PanelRefund[] = [], payments = [payment()]) =>
  ({
    order: { id: 'o1', orderNumber: 10026, status, filesDeletedAt: null },
    payments,
    refunds,
    statusEvents: [],
    events: [],
    assignments: [],
    shipments: [],
    items: [],
    pdfJob: null,
    ticketJob: null,
  }) as unknown as PanelOrderDetails;

describe('کارت «بازپرداخت»', () => {
  it('فقط سفارش «لغو شد» با پرداخت موفق؛ حالت از آخرین بازپرداخت همان پرداخت', () => {
    expect(refundCard(details('paid'))).toBeNull();
    expect(refundCard(details('cancelled', [], [payment({ status: 'failed' })]))).toBeNull();
    expect(refundCard(details('cancelled'))).toMatchObject({ state: 'none', seen: '', latest: null });
    // درخواست رفت و هنوز نه شناسه‌ای از درگاه، نه وضعیتی: «معلوم نیست»، نه «در حال برگشت» (سؤال ۱۵۴).
    expect(refundCard(details('cancelled', [refund()]))).toMatchObject({ state: 'unknown', seen: 'r1' });
    expect(refundCard(details('cancelled', [refund({ gatewayRef: 'R1', gatewayStatus: 16 })]))!.state).toBe('refunding');
    expect(refundCard(details('cancelled', [refund({ status: 'succeeded', reference: '552190', finishedAt: NOW })]))!.state).toBe('refunded');
    // تازه‌ترین اول: «برنگشت» قدیمی زیر برگشت تازه.
    const failed = refund({ id: 'r0', status: 'failed', failureReason: 'balance', finishedAt: NOW });
    expect(refundCard(details('cancelled', [failed]))).toMatchObject({ state: 'failed', seen: 'r0' });
    expect(hasLiveRefund(details('cancelled', [failed]))).toBe(false);
    expect(hasLiveRefund(details('cancelled', [refund()]))).toBe(true);
  });

  it('«استعلام از درگاه» فقط وقتی درخواست دیگر در راه نیست', () => {
    expect(refundAskable(null, NOW)).toBe(false);
    expect(refundAskable(refund({ createdAt: new Date(NOW.getTime() - 10_000) }), NOW)).toBe(false);
    expect(refundAskable(refund({ createdAt: new Date(NOW.getTime() - 2 * MINUTE) }), NOW)).toBe(true);
    expect(refundAskable(refund({ createdAt: new Date(NOW.getTime() - 10_000), gatewayRef: 'R1' }), NOW)).toBe(true);
    expect(refundAskable(refund({ status: 'succeeded', finishedAt: NOW }), NOW)).toBe(false);
    expect(refundAskable(refund({ method: 'manual', status: 'succeeded' }), NOW)).toBe(false);
  });

  it('متن رد درگاه به حال و گذشته، و عدد ردِ `other` از برچسب', () => {
    expect(rejectionNow('balance', 'zibal', null)).toBe('موجودی کیف پول کافی نیست');
    expect(rejectionNow('ip', 'zibal', null)).toBe('IP این سرور در پنل زیبال ثبت نیست');
    expect(rejectionNow('other', 'zibal', 207)).toBe('کد 207');
    expect(rejectionNow(null, 'mock', null)).toBe('علتی نگفت');
    expect(rejectionPast('balance', 'zibal', null)).toBe('موجودی کیف پول زیبال کافی نبود');
    expect(rejectionPast('not_found', 'mock', null)).toBe('درخواست به درگاه نمونه نرسیده بود');
    expect(rejectionResult('rejected:207')).toBe(207);
    expect(rejectionResult('unavailable')).toBeNull();
    expect(rejectionResult(null)).toBeNull();
  });
});

describe('فرم «ثبت بازپرداخت دستی»', () => {
  const bounds = { paidAt: new Date('2026-10-03T08:00:00Z'), at: NOW };
  const read = (over: Record<string, unknown>) => readManualRefund({ day: '1405/07/13', reference: '552190', note: '', ...over }, bounds);

  it('روز شمسی (رقم فارسی، خط تیره و نقطه هم)، از روز پرداخت تا امروز؛ آغاز روز تهران', () => {
    expect(read({})).toEqual({ ok: true, value: { refundedOn: new Date('2026-10-04T20:30:00Z'), reference: '552190', note: null } });
    expect(read({ day: '۱۴۰۵-۰۷-۱۱' })).toMatchObject({ ok: true, value: { refundedOn: new Date('2026-10-02T20:30:00Z') } });
    expect(read({ day: '1405.07.12' })).toMatchObject({ ok: true });
    expect(read({ day: 'دیروز' })).toEqual({ ok: false, field: 'day', error: 'refund_day_invalid' });
    expect(read({ day: '1405/07/14' })).toEqual({ ok: false, field: 'day', error: 'refund_day_future' });
    expect(read({ day: '1405/07/10' })).toEqual({ ok: false, field: 'day', error: 'refund_day_early' });
  });

  it('کد پیگیری بی فاصله، رقم فارسی هم؛ «چطور برگشت» تمیز و تا 200 نویسه', () => {
    expect(read({ reference: '۵۵ ۲۱ ۹۰' })).toMatchObject({ ok: true, value: { reference: '552190' } });
    expect(read({ reference: 'TRK-77AB' })).toMatchObject({ ok: true, value: { reference: 'TRK-77AB' } });
    for (const reference of ['', '12', 'کد۱۲۳', 'a'.repeat(41)]) {
      expect(read({ reference }), reference).toEqual({ ok: false, field: 'reference', error: 'refund_reference_invalid' });
    }
    expect(read({ note: '  کارت‌به‌کارت   به همان کارت ' })).toMatchObject({ ok: true, value: { note: 'کارت‌به‌کارت به همان کارت' } });
    expect(read({ note: 'ی'.repeat(REFUND_NOTE_MAX) })).toMatchObject({ ok: true });
    expect(read({ note: 'ی'.repeat(REFUND_NOTE_MAX + 1) })).toEqual({ ok: false, field: 'note', error: 'refund_note_too_long' });
  });
});

describe('بازپرداخت در رویدادهای سفارش و صفحهٔ «رویدادها»', () => {
  it('دستی یک سطر؛ از درگاه درخواست و نتیجه، با کننده یا «استعلام خودکار»؛ رد با علت؛ رویداد `orders.refund` جدا نمی‌آید', () => {
    const asked = new Date(NOW.getTime() - 15 * MINUTE);
    const d = {
      ...details('cancelled', [
        refund({ id: 'r3', method: 'manual', status: 'succeeded', feeRials: null, reference: '91822', refundedOn: NOW, createdAt: new Date(NOW.getTime() - 2 * MINUTE), finishedAt: NOW, adminName: 'علی' }),
        refund({ id: 'r2', status: 'failed', failureReason: 'balance', createdAt: new Date(NOW.getTime() - 40 * MINUTE), finishedAt: new Date(NOW.getTime() - 40 * MINUTE), settledVia: 'request' }),
        refund({ id: 'r1', status: 'succeeded', reference: '552190', gatewayRef: 'R1', createdAt: asked, finishedAt: new Date(NOW.getTime() - 5 * MINUTE), settledVia: 'auto' }),
      ]),
      events: [
        { id: 1, at: asked, action: 'orders.refund', detail: { orderNumber: 10026 }, adminName: 'سارا' },
        { id: 2, at: new Date(NOW.getTime() - 10 * MINUTE), action: 'orders.refund_inquiry', detail: { outcome: 'refunding' }, adminName: 'سارا' },
        { id: 3, at: new Date(NOW.getTime() - 5 * MINUTE), action: 'orders.refund_inquiry', detail: { outcome: 'refunded' }, adminName: 'سارا' },
      ],
    } as unknown as PanelOrderDetails;
    expect(orderTimeline(d).map((e) => [text(e.text), e.who])).toEqual([
      ['بازپرداخت 374,750 تومان از درگاه درخواست شد', 'سارا'],
      ['بازپرداخت از درگاه رد شد: موجودی کیف پول زیبال کافی نبود', 'سارا'],
      ['بازپرداخت 374,750 تومان از درگاه درخواست شد', 'سارا'],
      ['استعلام بازپرداخت از درگاه: هنوز در راه است', 'سارا'],
      ['بازپرداخت برگشت داده شد، کد پیگیری 552190', 'درگاه، استعلام خودکار'],
      ['بازپرداخت دستی 374,750 تومان ثبت شد، کد پیگیری 91822', 'علی'],
    ]);
    // بی مبلغ (متصدی بی `orders.money` نیست، ولی چاپخانه): هیچ بازپرداختی و هیچ رویدادش.
    const blind = withoutMoney(d);
    expect(blind.refunds).toEqual([]);
    expect(blind.events).toEqual([]);
  });

  it('صفحهٔ «رویدادها»: همان متن طرح برای دستی، درخواست از درگاه با کارمزد، و استعلام', () => {
    const event = (id: number, action: string, detail: Record<string, unknown>): AdminEventView =>
      ({ id, at: NOW, action, detail, adminUserId: 'a1', targetType: 'order', targetId: 'o1', ipHash: null, username: 'sara', displayName: 'سارا' }) as AdminEventView;
    const lines = eventLines([
      event(3, 'orders.refund', { orderNumber: 10033, method: 'manual', amountRials: 4_625_000, reference: '91822' }),
      event(2, 'orders.refund', { orderNumber: 10026, method: 'gateway', amountRials: 3_747_500, feeRials: 15_000, provider: 'zibal' }),
      event(1, 'orders.refund_inquiry', { orderNumber: 10026, outcome: 'refunded', status: 15 }),
    ]);
    const plain = (segs: readonly (string | { ltr: string })[]) => segs.map((s) => (typeof s === 'string' ? s : s.ltr)).join('');
    expect(lines.map((line) => [plain(line.text), line.who])).toEqual([
      ['سفارش 10033: بازپرداخت دستی 462,500 تومان ثبت شد، کد پیگیری 91822', 'سارا'],
      ['سفارش 10026: بازپرداخت 374,750 تومان از درگاه زیبال درخواست شد؛ کارمزد 1,500 تومان', 'سارا'],
      ['سفارش 10026: استعلام بازپرداخت از درگاه؛ پول به کارت برگشت', 'سارا'],
    ]);
  });
});
