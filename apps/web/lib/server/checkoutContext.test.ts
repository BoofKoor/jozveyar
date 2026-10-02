/**
 * سیم‌کشی درگاه وب (برش ۷٫۲، ADR-050؛ از ۷٫۵ سؤال ۱۶۴): کدام درگاه در کدام حالت، و استعلام خودکار در هر حالت با هر درگاهی که این سرور
 * دارد. پایگاه دادهٔ ساختگی فقط نشانی است: هیچ اتصالی ساخته نمی‌شود، چون هیچ درخواستی نمی‌رود.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { previewTokenFrom, startAutoInquiry, webPayments } from './checkoutContext';

const KEYS = ['DATABASE_URL', 'SESSION_SECRET', 'CHECKOUT_MODE', 'PAYMENT_PROVIDER'] as const;
let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = 'postgresql://jy:jy@127.0.0.1:9/none';
  process.env.SESSION_SECRET = 's'.repeat(64);
  delete process.env.CHECKOUT_MODE;
  delete process.env.PAYMENT_PROVIDER;
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('درگاه وب', () => {
  it('در `mock` درگاه نمونه با نشانی برگشت نسبی؛ در `live` زیبال با PAYMENT_CALLBACK_URL (درگاه نمونه هرگز در live)', () => {
    const mock = webPayments({ CHECKOUT_MODE: 'mock' });
    expect(Object.keys(mock.gateways)).toEqual(['mock']);
    expect(mock.gateway.name).toBe('mock');
    expect(mock.callbackUrl).toBe('/pay/callback');
    const live = webPayments({ CHECKOUT_MODE: 'live', PAYMENT_PROVIDER: 'zibal', PAYMENT_CALLBACK_URL: ' https://jozveyar.com/pay/callback ' });
    expect(Object.keys(live.gateways)).toEqual(['zibal']);
    expect(live.gateway.name).toBe('zibal');
    expect(live.callbackUrl).toBe('https://jozveyar.com/pay/callback');
  });

  it('برگشت و استعلام مستقل از حالت (سؤال ۱۶۴): `off` با PAYMENT_PROVIDER=zibal زیبال را دارد ولی درگاه شروعی نه؛ بی آن هیچ', () => {
    const off = webPayments({ CHECKOUT_MODE: 'off', PAYMENT_PROVIDER: 'zibal' });
    expect(Object.keys(off.gateways)).toEqual(['zibal']);
    expect(off.gateway.name).toBe('none');
    expect(Object.keys(webPayments({}).gateways)).toEqual([]);
    expect(webPayments({}).gateway.name).toBe('none');
    // درگاه نمونه روی jozveyar.com هرگز، حتی با CHECKOUT_MODE=mock.
    const onLive = webPayments({ CHECKOUT_MODE: 'mock', PAYMENT_PROVIDER: 'zibal' }, true);
    expect(Object.keys(onLive.gateways)).toEqual(['zibal']);
    expect(onLive.gateway.name).toBe('none');
  });

  it('درگاه شروعی که نیست هرگز پرداخت نمی‌سازد: «درگاه آماده نیست»', async () => {
    const { gateway } = webPayments({});
    await expect(gateway.start({ amountRials: 10_000, callbackUrl: '/x', orderId: '1-a', description: 'x' })).rejects.toMatchObject({
      code: 'unconfigured',
    });
  });

  it('استعلام خودکار در هر حالت، فقط اگر این سرور درگاهی دارد (وب ۳۱۰۱ CI و سایت زنده امروز: هیچ)', () => {
    process.env.CHECKOUT_MODE = 'off';
    expect(startAutoInquiry()).toBeNull();
    process.env.PAYMENT_PROVIDER = 'mock';
    expect(startAutoInquiry()).toBeNull();
    process.env.CHECKOUT_MODE = 'live';
    expect(startAutoInquiry()).toBeNull();
    // بی پایگاه داده هیچ.
    process.env.PAYMENT_PROVIDER = 'zibal';
    delete process.env.DATABASE_URL;
    expect(startAutoInquiry()).toBeNull();
    // شاهد: `off` با زیبال، بی SESSION_SECRET، حلقه راه می‌افتد (و همین‌جا می‌ایستد، پیش از هر دور).
    process.env.DATABASE_URL = 'postgresql://jy:jy@127.0.0.1:9/none';
    process.env.CHECKOUT_MODE = 'off';
    delete process.env.SESSION_SECRET;
    const stop = startAutoInquiry();
    expect(stop).toBeTypeOf('function');
    stop!();
  });
});

describe('کوکی پیش‌نمایش', () => {
  it('فقط توکن ۴۳ نویسهٔ base64url؛ هر چیز دیگر بی پرس‌وجو رد می‌شود', () => {
    expect(previewTokenFrom('A'.repeat(43))).toBe('A'.repeat(43));
    expect(previewTokenFrom('A'.repeat(42))).toBeNull();
    expect(previewTokenFrom(`${'A'.repeat(42)}=`)).toBeNull();
    expect(previewTokenFrom(undefined)).toBeNull();
  });
});
