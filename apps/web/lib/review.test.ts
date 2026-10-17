/**
 * نام کوچک و نام نمره‌ها (برش ۱۲٫۳، `review.ts`): صفحهٔ اصلی و فرم صفحهٔ سفارش هر دو همین را دارند.
 */

import { describe, expect, it } from 'vitest';

import { firstNameOf, RATINGS, ratingLabel, REVIEW_BODY_MAX } from './review';

describe('نظر مشتری (۱۲٫۳)', () => {
  it('نام کوچک: اولین کلمه؛ با پیشوند «سید»، «سیده» و «میر» دو کلمه؛ نیم‌فاصله جزو کلمه؛ نام خانوادگی هرگز', () => {
    expect(firstNameOf('سارا احمدی')).toBe('سارا');
    expect(firstNameOf('  مینا   کاظمی  ')).toBe('مینا');
    expect(firstNameOf('محمد‌رضا بیک زاده')).toBe('محمد‌رضا');
    expect(firstNameOf('سید علی رضایی')).toBe('سید علی');
    expect(firstNameOf('سیده فاطمه حسینی')).toBe('سیده فاطمه');
    expect(firstNameOf('میر حسین موسوی')).toBe('میر حسین');
    // «سید» با یک کلمهٔ دیگر همان نام خانوادگی است، پس فقط «سید».
    expect(firstNameOf('سید رضایی')).toBe('سید');
    expect(firstNameOf('نگار')).toBe('نگار');
    expect(firstNameOf('   ')).toBe('');
  });

  it('نمره‌ها از بد به خوب، با نام هر کدام؛ سقف متن همان CHECK پایگاه داده', () => {
    expect(RATINGS.map((r) => r.value)).toEqual([1, 2, 3, 4, 5]);
    expect([ratingLabel(1), ratingLabel(3), ratingLabel(5), ratingLabel(9)]).toEqual(['خیلی بد', 'معمولی', 'عالی', '']);
    expect(REVIEW_BODY_MAX).toBe(500);
  });
});
