import { describe, expect, it } from 'vitest';
import type { Breakdown } from '@jozveyar/contracts';

import { formatClock, formatMobile, minutesFrom, newCheckoutKey, priceChange } from './format';

describe('formatMobile', () => {
  it('موبایل نرمال‌شده در سه تکه، مثل طرح؛ هر شکل دیگر همان‌طور', () => {
    expect(formatMobile('09123456789')).toBe('0912 345 6789');
    expect(formatMobile('9123456789')).toBe('9123456789');
    expect(formatMobile('0912345678')).toBe('0912345678');
  });
});

describe('formatClock', () => {
  it('دقیقه و ثانیه، کسر ثانیه به بالا؛ «0:00» فقط وقتی تمام شده', () => {
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(84)).toBe('1:24');
    expect(formatClock(60.2)).toBe('1:01');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(0.1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('minutesFrom', () => {
  it('دقیقهٔ کامل، به بالا؛ کمتر از یک دقیقه، یک دقیقه', () => {
    expect(minutesFrom(3600)).toBe(60);
    expect(minutesFrom(61)).toBe(2);
    expect(minutesFrom(60)).toBe(1);
    expect(minutesFrom(5)).toBe(1);
    expect(minutesFrom(0)).toBe(1);
  });
});

describe('newCheckoutKey', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  /** `getRandomValues` ساختگی: همهٔ بایت‌ها صفر می‌مانند. */
  const none = <T extends ArrayBufferView | null>(array: T): T => array;
  /** همهٔ بایت‌ها ۰xff. */
  const all = <T extends ArrayBufferView | null>(array: T): T => {
    new Uint8Array(array!.buffer).fill(0xff);
    return array;
  };

  it('`randomUUID` اگر هست', () => {
    const key = newCheckoutKey({ randomUUID: () => '00000000-0000-4000-8000-000000000001', getRandomValues: none });
    expect(key).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('بیرون از زمینهٔ امن، همان UUID نسخهٔ ۴ از `getRandomValues`', () => {
    expect(newCheckoutKey({ getRandomValues: all })).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(newCheckoutKey({ getRandomValues: none })).toBe('00000000-0000-4000-8000-000000000000');
    expect(newCheckoutKey({ getRandomValues: crypto.getRandomValues.bind(crypto) })).toMatch(V4);
  });
});

describe('priceChange', () => {
  const breakdown = (pages: number[], shippingRials: number | null, priceListVersion = 1) =>
    ({ items: pages.map((pageCount) => ({ pageCount })), shippingRials, priceListVersion }) as unknown as Breakdown;

  it('اول صفحه‌ها (جمع همهٔ قلم‌ها)، بعد کرایه، بعد تعرفه', () => {
    expect(priceChange(breakdown([12], 1_377_500), breakdown([10], 1_295_000, 2))).toEqual({ kind: 'pages', before: 12, after: 10 });
    expect(priceChange(breakdown([4, 6], 1_377_500), breakdown([10], 1_295_000, 2))).toEqual({ kind: 'shipping' });
    expect(priceChange(breakdown([10], 1_377_500), breakdown([10], 1_377_500, 2))).toEqual({ kind: 'tariff' });
    expect(priceChange(breakdown([10], null), breakdown([10], null))).toEqual({ kind: 'other' });
  });
});
