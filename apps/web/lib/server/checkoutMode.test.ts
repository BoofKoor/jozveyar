/**
 * حالت مسیر خرید (ADR-035): دو دیوار مستقل — پیش‌فرض خاموش، و درگاه نمونه هرگز روی jozveyar.com.
 */

import { describe, expect, it } from 'vitest';

import { configuredMode, describeMode, effectiveMode, hostName, isLiveHost, sessionSecretOf } from './checkoutMode';

describe('حالت مسیر خرید', () => {
  it('پیش‌فرض و هر مقدار ناشناس خاموش است', () => {
    expect(configuredMode(undefined)).toBe('off');
    expect(configuredMode('')).toBe('off');
    expect(configuredMode('on')).toBe('off');
    expect(configuredMode('true')).toBe('off');
    expect(configuredMode(' MOCK ')).toBe('mock');
    expect(configuredMode('live')).toBe('live');
  });

  it('دامنهٔ زنده و زیردامنه‌هایش شناخته می‌شوند، با پورت و حروف بزرگ', () => {
    for (const host of ['jozveyar.com', 'JOZVEYAR.COM:443', 'www.jozveyar.com', 'admin.jozveyar.com', 'jozveyar.com.']) {
      expect(isLiveHost(host), host).toBe(true);
    }
    // دامنه‌ای که فقط به «jozveyar.com» ختم می‌شود، یا آن را وسط دارد، زنده نیست.
    for (const host of ['localhost:3000', '127.0.0.1:3100', 'notjozveyar.com', 'jozveyar.com.evil.io', '[::1]:3000', '', null]) {
      expect(isLiveHost(host), String(host)).toBe(false);
    }
    expect(hostName('[::1]:3000')).toBe('[::1]');
  });

  it('درگاه نمونه روی jozveyar.com خاموش است، حتی با CHECKOUT_MODE=mock', () => {
    expect(effectiveMode('mock', ['localhost:3000'])).toBe('mock');
    expect(effectiveMode('mock', ['jozveyar.com'])).toBe('off');
    // هر نامی که درخواست برای میزبان آورده حساب است، نه فقط Host.
    expect(effectiveMode('mock', ['localhost:3000', 'jozveyar.com', 'localhost'])).toBe('off');
    expect(effectiveMode('off', ['localhost'])).toBe('off');
  });

  it('live تا درگاه و پنل پیامک واقعی (برش ۷) خاموش است، و درگاه نمونه پشتش نمی‌نشیند', () => {
    expect(effectiveMode('live', ['jozveyar.com'])).toBe('off');
    expect(effectiveMode('live', ['jozveyar.com'], true)).toBe('live');
  });

  it('رمز نشست کوتاه یا خالی یعنی خاموش، و لاگ بالا آمدن همین را می‌گوید', () => {
    expect(sessionSecretOf(undefined)).toBeNull();
    expect(sessionSecretOf('short')).toBeNull();
    expect(sessionSecretOf('a'.repeat(64))).toBe('a'.repeat(64));
    expect(describeMode('off', false)).toContain('مسیر خرید: off');
    expect(describeMode('mock', false)).toContain('SESSION_SECRET');
    expect(describeMode('mock', true)).toContain('jozveyar.com');
    expect(describeMode('live', true)).toContain('برش ۷');
  });
});
