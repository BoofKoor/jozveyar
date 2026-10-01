/** کدهای وضعیت زیبال، گروه علت برای مشتری (سؤال ۱۳۱)، و برچسب خطا بی متن. */

import { describe, expect, it } from 'vitest';

import {
  CARD_REASONS,
  PaymentError,
  failureGroup,
  gatewayName,
  isPaymentErrorTag,
  isRefundedStatus,
  mockGateway,
  mockRefundRef,
  mockRefundReference,
  parsePaymentErrorTag,
  paymentErrorTag,
  refundFeeRials,
  statusLabel,
  statusVerdict,
} from './index';

describe('وضعیت‌ها', () => {
  it('فقط ۲ «پرداخت‌شده، تأییدنشده» است و فقط وضعیت صریح ناموفق؛ ناشناس هیچ‌کدام', () => {
    expect(statusVerdict(-1)).toEqual({ kind: 'waiting' });
    expect(statusVerdict(2)).toEqual({ kind: 'paid' });
    expect(statusVerdict(1)).toEqual({ kind: 'verified' });
    expect(statusVerdict(3)).toEqual({ kind: 'failed', code: 'cancelled' });
    for (const status of Object.keys(CARD_REASONS).map(Number)) expect(statusVerdict(status)).toEqual({ kind: 'failed', code: 'declined' });
    for (const status of [-2, 11, 21]) expect(statusVerdict(status)).toEqual({ kind: 'failed', code: 'bank_error' });
    for (const status of [15, 16, 18]) expect(statusVerdict(status)).toEqual({ kind: 'failed', code: 'returned' });
    for (const status of [0, 13, 14, 17, 19, 20, 22, 100]) expect(statusVerdict(status)).toEqual({ kind: 'unknown' });
    expect(statusLabel(2)).toBe('پرداخت‌شده، تأییدنشده');
    expect(statusLabel(99)).toBe('وضعیت 99');
    expect(gatewayName('zibal')).toBe('زیبال');
    expect(gatewayName('mock')).toBe('درگاه نمونه');
  });

  it('گروه علت: لغو، کارت با علت، بانک (بی علت روشن)، پرداخت‌شده ولی تأییدنشده، برگشت‌خورده', () => {
    expect(failureGroup('cancelled', 3)).toBe('cancelled');
    expect(failureGroup('declined', 5)).toBe('card');
    expect(failureGroup('declined', null)).toBe('bank');
    expect(failureGroup('bank_error', 11)).toBe('bank');
    expect(failureGroup('expired', 2)).toBe('paid_unverified');
    expect(failureGroup('expired', 16)).toBe('paid_unverified');
    expect(failureGroup('expired', 18)).toBe('returned');
    expect(failureGroup('returned', 16)).toBe('returned');
    expect(failureGroup('expired', -1)).toBe('bank');
    expect(failureGroup('verify_failed', null)).toBe('bank');
    expect(failureGroup(null, null)).toBe('bank');
  });
});

describe('برچسب خطا', () => {
  it('کد و عدد پاسخ؛ `result` بر HTTP مقدم؛ و برعکسش', () => {
    expect(paymentErrorTag(new PaymentError('rejected', { result: 115, http: 200 }))).toBe('rejected:115');
    expect(paymentErrorTag(new PaymentError('unavailable', { http: 503 }))).toBe('unavailable:503');
    expect(paymentErrorTag(new Error('هر چیز دیگر'))).toBe('unavailable');
    expect(parsePaymentErrorTag('rejected:-1')).toEqual({ code: 'rejected', number: -1 });
    expect(parsePaymentErrorTag('چرند')).toEqual({ code: 'unavailable', number: null });
    expect(isPaymentErrorTag('malformed')).toBe(true);
    expect(isPaymentErrorTag('rejected:115 merchant')).toBe(false);
  });
});

describe('بازپرداخت (برش ۷٫۳)', () => {
  it('کارمزد: ۰٫۱٪، گرد به بالا تا تومان، دست‌کم ۱٬۵۰۰ تومان', () => {
    expect(refundFeeRials(3_747_500)).toBe(15_000);
    expect(refundFeeRials(15_000_000)).toBe(15_000);
    expect(refundFeeRials(15_000_010)).toBe(15_010);
    expect(refundFeeRials(20_000_000)).toBe(20_000);
    expect(refundFeeRials(123_456_780)).toBe(123_460);
    expect(() => refundFeeRials(0)).toThrow(RangeError);
    expect(() => refundFeeRials(1.5)).toThrow(RangeError);
  });

  const payment = (refund?: string) => ({
    authority: 'MOCK00',
    amountRials: 3_747_500,
    orderId: '10026-3f9c2a1b',
    refId: '552190',
    raw: { decision: 'success', verified: true, refId: '552190', ...(refund ? { refund } : {}) },
  });
  const ID = '3f9c2a1b-0000-4000-8000-000000000001';
  const refunds = mockGateway().refunds!;

  it('درگاه نمونه: درخواست «در حال استرداد» با شناسهٔ خودش، استعلام «استردادشده» با کد پیگیری ثابت', async () => {
    const asked = await refunds.request({ payment: payment(), amountRials: 3_747_500, refundId: ID, description: 'x' });
    expect(asked).toMatchObject({ state: 'pending', gatewayRef: mockRefundRef(ID), status: 16, reason: null });
    const done = await refunds.inquire({ payment: payment(), amountRials: 3_747_500, refundId: ID, gatewayRef: asked.gatewayRef });
    expect(done).toMatchObject({ state: 'succeeded', gatewayRef: mockRefundRef(ID), status: 15, reference: mockRefundReference(ID) });
    expect(mockRefundReference(ID)).toMatch(/^[1-9]\d{5}$/);
    expect(refunds.feeRials(3_747_500)).toBe(15_000);
  });

  it('درگاه نمونه: موجودی کم رد می‌شود؛ پاسخ گم‌شده یا رسیده یا نرسیده؛ کند همیشه در راه', async () => {
    const input = (plan: string) => ({ payment: payment(plan), amountRials: 3_747_500, refundId: ID, description: 'x' });
    const lookup = (plan: string) => ({ payment: payment(plan), amountRials: 3_747_500, refundId: ID, gatewayRef: null });
    expect(await refunds.request(input('balance'))).toMatchObject({ state: 'failed', reason: 'balance' });
    await expect(refunds.request(input('lost'))).rejects.toMatchObject({ code: 'unavailable' });
    expect(await refunds.inquire(lookup('lost'))).toMatchObject({ state: 'succeeded', gatewayRef: mockRefundRef(ID) });
    await expect(refunds.request(input('dropped'))).rejects.toMatchObject({ code: 'unavailable' });
    expect(await refunds.inquire(lookup('dropped'))).toBeNull();
    expect(await refunds.inquire(lookup('slow'))).toMatchObject({ state: 'pending', status: 16 });
  });

  it('درگاه نمونه: استعلام پرداختی که پیش‌تر بازپرداخت شد «در حال استرداد» است', async () => {
    const gateway = mockGateway();
    const attempt = { authority: 'MOCK00', amountRials: 1, orderId: null };
    expect((await gateway.inquire({ ...attempt, raw: payment().raw })).status).toBe(1);
    const already = await gateway.inquire({ ...attempt, raw: payment('already').raw });
    expect(already.status).toBe(16);
    expect(isRefundedStatus(already.status)).toBe(true);
    expect(isRefundedStatus(15)).toBe(true);
    expect(isRefundedStatus(18)).toBe(false);
    expect(isRefundedStatus(null)).toBe(false);
  });
});
