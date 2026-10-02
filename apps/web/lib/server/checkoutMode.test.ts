/**
 * حالت مسیر خرید (ADR-035): دو دیوار مستقل — پیش‌فرض خاموش، و درگاه نمونه هرگز روی jozveyar.com. از ۷٫۵ (ADR-052): حکم دسترسی با
 * آمادگی و مخاطب پنل، و درگاه و پیامک وب مستقل از روشن بودن مسیر خرید (سؤال ۱۶۴).
 */

import { describe, expect, it } from 'vitest';

import {
  accessOf,
  configuredMode,
  describeMode,
  describePayments,
  describeSms,
  effectiveMode,
  hostName,
  isLiveHost,
  sessionSecretOf,
  startGatewayOf,
  webGatewayNames,
  webSmsProvider,
  type AccessFacts,
} from './checkoutMode';

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

  it('live اینجا فقط «خواسته شده» است، روی هر میزبانی؛ آماده بودنش با آمادگی و مخاطب است (۷٫۵)', () => {
    expect(effectiveMode('live', ['jozveyar.com'])).toBe('live');
    expect(effectiveMode('live', ['127.0.0.1:3102'])).toBe('live');
  });

  it('رمز نشست کوتاه یا خالی یعنی خاموش، و لاگ بالا آمدن همین را می‌گوید', () => {
    expect(sessionSecretOf(undefined)).toBeNull();
    expect(sessionSecretOf('short')).toBeNull();
    expect(sessionSecretOf('a'.repeat(64))).toBe('a'.repeat(64));
    expect(describeMode('off', false)).toContain('مسیر خرید: off');
    expect(describeMode('mock', false)).toContain('SESSION_SECRET');
    expect(describeMode('mock', true)).toContain('jozveyar.com');
  });
});

describe('حکم دسترسی (۷٫۵، سؤال‌های ۱۶۳ و ۱۶۵)', () => {
  const live: AccessFacts = { mode: 'live', services: true, ready: true, audience: 'everyone', preview: false };

  it('`off` و بی پایگاه داده یا رمز نشست خاموش؛ `mock` همان امروز، بی مخاطب', () => {
    expect(accessOf({ ...live, mode: 'off' })).toEqual({ kind: 'off' });
    expect(accessOf({ ...live, services: false })).toEqual({ kind: 'off' });
    expect(accessOf({ ...live, mode: 'mock', services: false })).toEqual({ kind: 'off' });
    for (const audience of ['paused', 'preview', 'everyone'] as const) {
      expect(accessOf({ ...live, mode: 'mock', ready: false, audience })).toEqual({ kind: 'open', mode: 'mock', preview: false });
    }
  });

  it('`live` آماده‌نشده خاموش است، هر مخاطبی که پنل گفته باشد', () => {
    for (const audience of ['paused', 'preview', 'everyone'] as const) {
      expect(accessOf({ ...live, ready: false, audience, preview: true })).toEqual({ kind: 'off' });
    }
  });

  it('مخاطب: «همه» باز، «متوقف» متوقف، و «پیش‌نمایش» فقط با کوکی زنده؛ بی آن همان `off`', () => {
    expect(accessOf(live)).toEqual({ kind: 'open', mode: 'live', preview: false });
    expect(accessOf({ ...live, audience: 'paused', preview: true })).toEqual({ kind: 'paused' });
    expect(accessOf({ ...live, audience: 'preview', preview: true })).toEqual({ kind: 'open', mode: 'live', preview: true });
    expect(accessOf({ ...live, audience: 'preview', preview: false })).toEqual({ kind: 'off' });
  });
});

describe('درگاه و پیامک وب (۷٫۵، سؤال ۱۶۴)', () => {
  it('زیبال فقط با PAYMENT_PROVIDER=zibal، در هر حالت؛ درگاه نمونه فقط در `mock` و هرگز روی jozveyar.com', () => {
    expect(webGatewayNames({})).toEqual([]);
    expect(webGatewayNames({ CHECKOUT_MODE: 'live' })).toEqual([]);
    expect(webGatewayNames({ PAYMENT_PROVIDER: 'mock' })).toEqual([]);
    expect(webGatewayNames({ PAYMENT_PROVIDER: ' Zibal ' })).toEqual(['zibal']);
    expect(webGatewayNames({ CHECKOUT_MODE: 'off', PAYMENT_PROVIDER: 'zibal' })).toEqual(['zibal']);
    expect(webGatewayNames({ CHECKOUT_MODE: 'mock' })).toEqual(['mock']);
    expect(webGatewayNames({ CHECKOUT_MODE: 'mock' }, true)).toEqual([]);
    expect(webGatewayNames({ CHECKOUT_MODE: 'mock', PAYMENT_PROVIDER: 'zibal' })).toEqual(['zibal', 'mock']);
    // درگاه نمونه هرگز پشت `live`.
    expect(webGatewayNames({ CHECKOUT_MODE: 'live', PAYMENT_PROVIDER: 'mock' })).toEqual([]);
  });

  it('شروع پرداخت با درگاه همین حالت: زیبال در `live`، درگاه نمونه در `mock`، و `off` هیچ', () => {
    expect(startGatewayOf('live')).toBe('zibal');
    expect(startGatewayOf('mock')).toBe('mock');
    expect(startGatewayOf('off')).toBeNull();
  });

  it('پیامک: `mock` همیشه کنسولی؛ وگرنه SMS_PROVIDER', () => {
    expect(webSmsProvider({ CHECKOUT_MODE: 'mock', SMS_PROVIDER: 'smsir' })).toBe('console');
    expect(webSmsProvider({ CHECKOUT_MODE: 'live', SMS_PROVIDER: 'smsir' })).toBe('smsir');
    expect(webSmsProvider({ SMS_PROVIDER: 'smsir' })).toBe('smsir');
    expect(webSmsProvider({ CHECKOUT_MODE: 'live', SMS_PROVIDER: 'console' })).toBe('console');
    expect(webSmsProvider({})).toBe('console');
  });

  it('خط‌های بالا آمدن: سرور بی مسیر خرید و بی درگاه هیچ خطی ندارد (سایت زنده امروز)؛ بقیه منبع را می‌گویند، هرگز مقدار', () => {
    const today = { CHECKOUT_MODE: 'off', PAYMENT_PROVIDER: 'mock', SMS_PROVIDER: 'console' };
    expect(describeSms(today)).toBeNull();
    expect(describePayments(today)).toBeNull();
    const off = { CHECKOUT_MODE: 'off', PAYMENT_PROVIDER: 'zibal', SMS_PROVIDER: 'smsir', PAYMENT_MERCHANT_ID: 'merchant-secret-value' };
    expect(describePayments(off)).toContain('فقط برگشت و استعلام');
    expect(describePayments(off)).not.toContain('merchant-secret-value');
    expect(describeSms(off)).toContain('sms.ir');
    expect(describePayments({ CHECKOUT_MODE: 'live', PAYMENT_PROVIDER: 'zibal' })).toBe(
      '✓ درگاه وب: زیبال (کد پذیرنده از «تنظیمات» یا .env، نشانی برگشت PAYMENT_CALLBACK_URL)؛ استعلام خودکار هر دقیقه',
    );
    expect(describePayments({ CHECKOUT_MODE: 'mock' })).toBe('✓ درگاه وب: درگاه نمونه؛ استعلام خودکار هر دقیقه');
    expect(describeSms({ CHECKOUT_MODE: 'mock', SMS_PROVIDER: 'smsir' })).toBe('✓ پیامک وب: کنسولی (در sms_messages)');
  });
});
