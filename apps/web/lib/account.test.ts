/**
 * زمان‌ها و `next` «سفارش‌های من» (برش ۱۲٫۱، ADR-068): روز کارت و پیام نسبت به امروز تهران، روز تحویل به پست با «امروز» و «فردا»، تکهٔ
 * پیام فهرست، و مقصد پس از ورود که فقط صفحه‌های همین سایت است. «حالا» همان دوشنبه 13 مهر 1405، 11:20 طرح.
 */

import { describe, expect, it } from 'vitest';

import { cardDay, dayName, dueText, messageWhen, safeNext, snippet } from './account';

const NOW = new Date('2026-10-05T07:50:00Z');
const TODAY = new Date('2026-10-05T07:32:00Z'); // دوشنبه 13 مهر 11:02
const YESTERDAY = new Date('2026-10-04T17:44:00Z'); // یکشنبه 12 مهر 21:14
const SATURDAY = new Date('2026-10-03T08:00:00Z'); // شنبه 11 مهر 11:30
const LAST_YEAR = new Date('2026-03-18T05:30:00Z'); // چهارشنبه 27 اسفند 1404، 09:00
/** پایان انحصاری روزهای تهران: نیمه‌شب آغاز روز بعد. */
const END_OF_TODAY = new Date('2026-10-05T20:30:00Z');
const END_OF_TOMORROW = new Date('2026-10-06T20:30:00Z');
const END_OF_WEDNESDAY = new Date('2026-10-07T20:30:00Z');

describe('زمان‌های «سفارش‌های من»', () => {
  it('روز کارت: امروز و دیروز با ساعت، بقیه روز هفته بی ساعت، و سال دیگر با سال', () => {
    expect(cardDay(TODAY, NOW)).toBe('امروز 11:02');
    expect(cardDay(YESTERDAY, NOW)).toBe('دیروز 21:14');
    expect(cardDay(SATURDAY, NOW)).toBe('شنبه 11 مهر');
    expect(cardDay(LAST_YEAR, NOW)).toBe('27 اسفند 1404');
  });

  it('زمان پیام: همیشه با ساعت', () => {
    expect(messageWhen(TODAY, NOW)).toBe('امروز، 11:02');
    expect(messageWhen(YESTERDAY, NOW)).toBe('دیروز، 21:14');
    expect(messageWhen(SATURDAY, NOW)).toBe('شنبه 11 مهر، 11:30');
    expect(messageWhen(LAST_YEAR, NOW)).toBe('27 اسفند 1404، 09:00');
  });

  it('نام روز بی ساعت، به وقت تهران نه UTC', () => {
    expect(dayName(TODAY, NOW)).toBe('امروز');
    expect(dayName(YESTERDAY, NOW)).toBe('دیروز');
    expect(dayName(SATURDAY, NOW)).toBe('شنبه 11 مهر');
    // 23:59 تهران هنوز امروز است، و 00:01 فردا؛ UTC هر دو را یک روز می‌شمرد.
    expect(dayName(new Date('2026-10-05T20:29:00Z'), NOW)).toBe('امروز');
    expect(dayName(new Date('2026-10-05T20:31:00Z'), new Date('2026-10-05T20:29:00Z'))).toBe('سه‌شنبه 14 مهر');
  });

  it('روز تحویل به پست از مهلت انحصاری: امروز، فردا، و بعدتر روز هفته', () => {
    expect(dueText(END_OF_TODAY, NOW)).toBe('امروز، دوشنبه 13 مهر');
    expect(dueText(END_OF_TOMORROW, NOW)).toBe('فردا، سه‌شنبه 14 مهر');
    expect(dueText(END_OF_WEDNESDAY, NOW)).toBe('چهارشنبه 15 مهر');
  });

  it('تکهٔ پیام: یک خط، و بلند با سه‌نقطه', () => {
    expect(snippet('سلام.\nجزوه کی می‌رسد؟')).toBe('سلام. جزوه کی می‌رسد؟');
    const long = 'ن'.repeat(120);
    expect(snippet(long)).toBe(`${'ن'.repeat(90)}…`);
    expect(snippet('کوتاه', 90)).toBe('کوتاه');
  });
});

describe('مقصد پس از ورود (سؤال ۳۰۸)', () => {
  it('صفحهٔ سفارش و صفحه‌های همین بخش، به همان شکلی که سایت می‌سازد', () => {
    for (const path of [
      '/order/3f2b8c1e-9a7d-4c2e-8b1a-0d5e6f7a8b9c',
      '/orders',
      '/orders/messages/new',
      '/orders/messages/new?order=10027',
      '/orders/messages/42',
    ]) {
      expect(safeNext(path), path).toBe(path);
    }
  });

  it('هر چیز دیگر null: نشانی بیرونی، // و /\\، پارامتر دیگر، توکن نادرست، و بلند', () => {
    for (const path of [
      null,
      undefined,
      '',
      'https://evil.example/orders',
      '//evil.example/orders',
      '/\\evil.example',
      '/orders?page=2',
      '/orders/messages/new?order=10027&x=1',
      '/orders/messages/abc',
      '/order/not-a-token',
      '/order/3F2B8C1E-9A7D-4C2E-8B1A-0D5E6F7A8B9C',
      '/terms',
      `/orders/messages/${'1'.repeat(16)}`,
      `/order/3f2b8c1e-9a7d-4c2e-8b1a-0d5e6f7a8b9c${'/'.repeat(100)}`,
    ]) {
      expect(safeNext(path), String(path)).toBeNull();
    }
  });
});
