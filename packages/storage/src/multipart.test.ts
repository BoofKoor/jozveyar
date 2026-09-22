import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PART_SIZE_BYTES,
  partRange,
  partSize,
  planParts,
  verifyParts,
} from './multipart.js';

const MiB = 1024 * 1024;

describe('برنامهٔ تکه‌ها', () => {
  it('فایل کوچک یک تکه است — تکهٔ آخر می‌تواند زیر حداقل باشد', () => {
    const plan = planParts(300_000);
    expect(plan.partCount).toBe(1);
    expect(partSize(plan, 1)).toBe(300_000);
  });

  it('تکهٔ آخر باقی‌مانده است و جمع تکه‌ها دقیقاً حجم فایل', () => {
    const plan = planParts(20 * MiB + 7);
    expect(plan.partCount).toBe(3);
    expect([1, 2, 3].map((n) => partSize(plan, n))).toEqual([8 * MiB, 8 * MiB, 4 * MiB + 7]);
    expect(partRange(plan, 3)).toEqual({ start: 16 * MiB, end: 20 * MiB + 7 });
  });

  it('مضرب دقیق تکهٔ خالی اضافه نمی‌سازد', () => {
    const plan = planParts(16 * MiB);
    expect(plan.partCount).toBe(2);
    expect(partSize(plan, 2)).toBe(8 * MiB);
  });

  it('سقف ۱٫۵ گیگابایت ۱۹۲ تکه است', () => {
    expect(planParts(1_610_612_736).partCount).toBe(192);
    expect(DEFAULT_PART_SIZE_BYTES).toBe(8 * MiB);
  });

  it('ورودی نامعتبر رد می‌شود', () => {
    expect(() => planParts(0)).toThrow(RangeError);
    expect(() => planParts(1.5)).toThrow(RangeError);
    expect(() => planParts(10, MiB)).toThrow(RangeError);
    expect(() => partSize(planParts(10), 2)).toThrow(RangeError);
  });
});

describe('سنجش تکه‌های رسیده', () => {
  const plan = planParts(20 * MiB);

  it('همه با اندازهٔ درست → کامل', () => {
    const verdict = verifyParts(plan, [
      { partNumber: 1, sizeBytes: 8 * MiB },
      { partNumber: 2, sizeBytes: 8 * MiB },
      { partNumber: 3, sizeBytes: 4 * MiB },
    ]);
    expect(verdict).toEqual({ complete: true, received: [1, 2, 3], missing: [] });
  });

  it('تکهٔ جاافتاده و تکهٔ با اندازهٔ غلط هر دو «نرسیده»‌اند', () => {
    const verdict = verifyParts(plan, [
      { partNumber: 1, sizeBytes: 8 * MiB },
      { partNumber: 3, sizeBytes: 4 * MiB - 1 },
    ]);
    expect(verdict).toEqual({ complete: false, received: [1], missing: [2, 3] });
  });

  it('تکهٔ بیرون از برنامه چیزی را کامل نمی‌کند', () => {
    const verdict = verifyParts(planParts(8 * MiB), [{ partNumber: 2, sizeBytes: 8 * MiB }]);
    expect(verdict.complete).toBe(false);
    expect(verdict.missing).toEqual([1]);
  });
});
