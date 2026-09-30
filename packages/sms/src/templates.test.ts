import { describe, expect, it } from 'vitest';

import {
  SMS_PURPOSES,
  SMS_TEMPLATES,
  fillTemplate,
  orderPaidParams,
  orderPaidText,
  otpParams,
  otpText,
  smsParts,
  trackingParams,
  trackingText,
} from './templates';

const BARCODE = '118800000000000000000101';
const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

describe('سه قالب، یک منبع (ADR-049)', () => {
  it('متن و نام پارامترها عیناً جدول ADR-049', () => {
    expect(SMS_TEMPLATES).toEqual({
      otp: { key: 'SMS_OTP_TEMPLATE', params: ['CODE'], text: 'کد تأیید جزوه‌یار: ‹CODE›\nاین کد را به کسی نده.', sample: ['12345'] },
      order_paid: {
        key: 'SMS_PAID_TEMPLATE',
        params: ['ORDER', 'DAY'],
        text: 'جزوه‌یار: سفارش ‹ORDER› پرداخت شد؛ تحویل به پست تا ‹DAY›',
        sample: ['10027', 'دوشنبه 6 مهر'],
      },
      tracking: {
        key: 'SMS_TRACKING_TEMPLATE',
        params: ['ORDER', 'BARCODE'],
        text: 'جزوه‌یار: سفارش ‹ORDER› به پست رسید. کد رهگیری ‹BARCODE›',
        sample: ['10027', BARCODE],
      },
    });
    expect(SMS_PURPOSES).toEqual(['otp', 'order_paid', 'tracking']);
  });

  it('متن هر پیامک همان قالب با پارامترهایش است، نه متن دوم', () => {
    expect(otpText('12345')).toBe('کد تأیید جزوه‌یار: 12345\nاین کد را به کسی نده.');
    expect(orderPaidText(10001, 'دوشنبه 6 مهر')).toBe('جزوه‌یار: سفارش 10001 پرداخت شد؛ تحویل به پست تا دوشنبه 6 مهر');
    expect(trackingText(10027, BARCODE)).toBe(`جزوه‌یار: سفارش 10027 به پست رسید. کد رهگیری ${BARCODE}`);
    expect(otpText('12345')).toBe(fillTemplate('otp', otpParams('12345')));
    expect(orderPaidText(10001, 'دوشنبه 6 مهر')).toBe(fillTemplate('order_paid', orderPaidParams(10001, 'دوشنبه 6 مهر')));
    expect(trackingText(10027, BARCODE)).toBe(fillTemplate('tracking', trackingParams(10027, BARCODE)));
    // هر ‹…› قالب پر شد؛ نمونهٔ «آزمایش» هم متنی کامل می‌سازد.
    for (const purpose of SMS_PURPOSES) {
      expect(fillTemplate(purpose, SMS_TEMPLATES[purpose].sample)).not.toMatch(/[‹›]/);
      expect(SMS_TEMPLATES[purpose].text.match(/‹[A-Z]+›/g)).toEqual(SMS_TEMPLATES[purpose].params.map((name) => `‹${name}›`));
    }
  });

  it('هر سه یک تکه، حتی با شمارهٔ سفارش شش‌رقمی و بلندترین روز و ماه', () => {
    const longest: Record<string, number> = { otp: 0, order_paid: 0, tracking: 0 };
    for (const order of [10001, 99999, 100000, 999999]) {
      for (const weekday of WEEKDAYS) {
        for (const month of MONTHS) {
          for (const day of [1, 9, 10, 31]) {
            const text = orderPaidText(order, `${weekday} ${day} ${month}`);
            longest.order_paid = Math.max(longest.order_paid!, text.length);
            expect(smsParts(text)).toBe(1);
          }
        }
      }
      const text = trackingText(order, BARCODE);
      longest.tracking = Math.max(longest.tracking!, text.length);
      expect(smsParts(text)).toBe(1);
    }
    longest.otp = otpText('99999').length;
    expect(smsParts(otpText('99999'))).toBe(1);
    // ۷۰ نویسه سقف یک تکهٔ فارسی است (یافتهٔ ۱۰)؛ متن امروز درست همان‌جاست.
    expect(longest).toEqual({ otp: 46, order_paid: 70, tracking: 70 });
  });

  it('شمار تکه: فارسی ۷۰ و ۶۷، لاتین ۱۶۰ و ۱۵۳', () => {
    expect(smsParts('س'.repeat(70))).toBe(1);
    expect(smsParts('س'.repeat(71))).toBe(2);
    expect(smsParts('س'.repeat(134))).toBe(2);
    expect(smsParts('س'.repeat(135))).toBe(3);
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts('a'.repeat(159) + 'س')).toBe(3);
  });

  it('پارامتر نادرست متن نمی‌سازد؛ پیامک نیمه‌پر نمی‌رود', () => {
    expect(() => trackingText(10027, '1188 0000 0000 0000 0000 0101')).toThrow();
    expect(() => trackingText(10027, '1188')).toThrow();
    expect(() => trackingParams(-1, BARCODE)).toThrow();
    expect(() => orderPaidText(10027, '')).toThrow();
    expect(() => orderPaidText(10027, 'دوشنبه\n6 مهر')).toThrow();
    expect(() => orderPaidText(10027, 'x'.repeat(51))).toThrow();
    expect(orderPaidParams(10027, ' دوشنبه 6 مهر ')).toEqual(['10027', 'دوشنبه 6 مهر']);
    expect(() => otpText('12a45')).toThrow();
    expect(() => fillTemplate('tracking', ['10027'])).toThrow();
    expect(() => fillTemplate('otp', ['1', '2'])).toThrow();
    for (const param of trackingParams(10027, BARCODE)) expect(param).not.toMatch(/\s/);
  });
});
