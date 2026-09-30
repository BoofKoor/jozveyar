/**
 * پیامک مسیر خرید (سؤال ۱۱۴، ADR-049): `live` فقط sms.ir و `mock` فقط کنسولی (ADR-035)، هر چه `SMS_PROVIDER` بگوید؛ هرگز برگشت بی‌صدا از
 * یکی به دیگری. ساختن آداپتور به پایگاه داده نمی‌رسد؛ کلیدها با هر پیامک خوانده می‌شوند (تست `packages/sms` و یکپارچگی `packages/db`).
 */

import { describe, expect, it } from 'vitest';

import { checkoutSmsTransport } from './checkoutContext';

describe('پیامک مسیر خرید', () => {
  it('live فقط sms.ir؛ mock و off فقط کنسولی، حتی با SMS_PROVIDER=smsir', () => {
    expect(checkoutSmsTransport('live', {}).name).toBe('smsir');
    expect(checkoutSmsTransport('live', { SMS_PROVIDER: 'console' }).name).toBe('smsir');
    for (const mode of ['mock', 'off'] as const) {
      expect(checkoutSmsTransport(mode, { SMS_PROVIDER: 'smsir', SMSIR_API_URL: 'http://127.0.0.1:9' }).name, mode).toBe('console');
    }
  });
});
