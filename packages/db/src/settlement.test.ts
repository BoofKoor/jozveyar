import { describe, expect, it } from 'vitest';

import { SHARE_BP_MAX, shareRialsOf } from './settlement.js';

describe('سهم چاپخانه از یک سفارش (برش ۱۰٫۳، سؤال‌های ۳۹۰ تا ۳۹۳)', () => {
  it('درصد از جمع چاپ، کاغذ و صحافی، به نزدیک‌ترین تومان', () => {
    // ۶۵٪ از 245,000 تومان: 159,250 تومان.
    expect(shareRialsOf(2_450_000n, 6_500)).toBe(1_592_500n);
    expect(shareRialsOf(2_450_000n, SHARE_BP_MAX)).toBe(2_450_000n);
    expect(shareRialsOf(2_450_000n, 0)).toBe(0n);
    expect(shareRialsOf(0n, 6_500)).toBe(0n);
  });

  it('نیم تومان رو به بالا، کمتر از نیم رو به پایین، و همیشه ریال گرد', () => {
    // ۰٫۰۱٪ از 245,000 تومان = 24.5 تومان ← 25.
    expect(shareRialsOf(2_450_000n, 1)).toBe(250n);
    // ۰٫۰۱٪ از 244,990 تومان = 24.499 تومان ← 24.
    expect(shareRialsOf(2_449_900n, 1)).toBe(240n);
    // ۳۳٫۳۳٪ از 100,000 تومان = 33,330 تومان، دقیق.
    expect(shareRialsOf(1_000_000n, 3_333)).toBe(333_300n);
    // ۳۳٫۳۳٪ از 1,005 تومان = 334.9665 تومان ← 335.
    expect(shareRialsOf(10_050n, 3_333)).toBe(3_350n);
    for (const [base, bp] of [
      [1_234_560n, 4_250],
      [9_999_990n, 9_999],
      [10n, 1],
    ] as const) {
      expect(shareRialsOf(base, bp) % 10n).toBe(0n);
    }
  });

  it('بی دقت از دست رفته برای مبلغ‌های بزرگ (bigint)', () => {
    expect(shareRialsOf(90_000_000_000_000_000n, 6_500)).toBe(58_500_000_000_000_000n);
  });

  it('درصد بیرون از ۰ تا ۱۰۰ یا ناصحیح، و پایهٔ منفی، خطاست', () => {
    expect(() => shareRialsOf(1_000n, -1)).toThrow(RangeError);
    expect(() => shareRialsOf(1_000n, SHARE_BP_MAX + 1)).toThrow(RangeError);
    expect(() => shareRialsOf(1_000n, 12.5)).toThrow(RangeError);
    expect(() => shareRialsOf(-10n, 100)).toThrow(RangeError);
  });
});
