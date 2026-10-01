/** کدهای وضعیت زیبال، گروه علت برای مشتری (سؤال ۱۳۱)، و برچسب خطا بی متن. */

import { describe, expect, it } from 'vitest';

import {
  CARD_REASONS,
  PaymentError,
  failureGroup,
  gatewayName,
  isPaymentErrorTag,
  parsePaymentErrorTag,
  paymentErrorTag,
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
