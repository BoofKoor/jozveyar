/**
 * سیم‌کشی درگاه وب (برش ۷٫۲، ADR-050): کدام درگاه در کدام حالت، و استعلام خودکار فقط وقتی مسیر خرید همین سرور روشن است. پایگاه دادهٔ
 * ساختگی فقط نشانی است: هیچ اتصالی ساخته نمی‌شود، چون هیچ درخواستی نمی‌رود.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startAutoInquiry, webPayments } from './checkoutContext';

const KEYS = ['DATABASE_URL', 'SESSION_SECRET', 'CHECKOUT_MODE'] as const;
let saved: Partial<Record<(typeof KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  process.env.DATABASE_URL = 'postgresql://jy:jy@127.0.0.1:9/none';
  process.env.SESSION_SECRET = 's'.repeat(64);
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('درگاه وب', () => {
  it('در `mock` فقط درگاه نمونه با نشانی برگشت نسبی؛ در `live` فقط زیبال با PAYMENT_CALLBACK_URL (درگاه نمونه هرگز در live)', () => {
    const mock = webPayments({ CHECKOUT_MODE: 'mock' });
    expect(Object.keys(mock.gateways)).toEqual(['mock']);
    expect(mock.gateway.name).toBe('mock');
    expect(mock.callbackUrl).toBe('/pay/callback');
    const live = webPayments({ CHECKOUT_MODE: 'live', PAYMENT_CALLBACK_URL: ' https://jozveyar.com/pay/callback ' });
    expect(Object.keys(live.gateways)).toEqual(['zibal']);
    expect(live.gateway.name).toBe('zibal');
    expect(live.callbackUrl).toBe('https://jozveyar.com/pay/callback');
    // `off` (و هر مقدار ناشناس) هرگز زیبال: مسیر خرید آنجا ۴۰۴ است.
    expect(Object.keys(webPayments({}).gateways)).toEqual(['mock']);
  });

  it('استعلام خودکار فقط وقتی مسیر خرید همین سرور روشن است: `off`، بی پایگاه داده و بی SESSION_SECRET هیچ', () => {
    process.env.CHECKOUT_MODE = 'off';
    expect(startAutoInquiry()).toBeNull();
    process.env.CHECKOUT_MODE = 'live';
    // live تا ۷٫۵ بسته است (`LIVE_ADAPTERS_READY`)، پس همان `off`.
    expect(startAutoInquiry()).toBeNull();
    process.env.CHECKOUT_MODE = 'mock';
    delete process.env.SESSION_SECRET;
    expect(startAutoInquiry()).toBeNull();
    process.env.SESSION_SECRET = 's'.repeat(64);
    delete process.env.DATABASE_URL;
    expect(startAutoInquiry()).toBeNull();
    // شاهد: `mock` با هر دو، حلقه راه می‌افتد (و همین‌جا می‌ایستد، پیش از هر دور).
    process.env.DATABASE_URL = 'postgresql://jy:jy@127.0.0.1:9/none';
    const stop = startAutoInquiry();
    expect(stop).toBeTypeOf('function');
    stop!();
  });
});
