/**
 * قرارداد قلم سفارش: یک جزوه، یک یا چند بخش (ADR-030).
 */

import { describe, expect, it } from 'vitest';

import { MAX_SECTIONS_PER_ITEM, itemSpecSchema, type ItemSpec } from './index.js';

function jozve(sectionCount: number): ItemSpec {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({ documentId: `d${i + 1}`, pageCount: 10 }));
  return {
    sections,
    rules: [{ pageRanges: [[1, Math.max(1, sectionCount * 10)]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
    copies: 1,
    sidesMode: 'double',
    bindingTypeId: 'spiral_clear',
  };
}

describe('itemSpecSchema', () => {
  it('یک بخش تا سقف بخش‌ها را می‌پذیرد', () => {
    expect(itemSpecSchema.safeParse(jozve(1)).success).toBe(true);
    expect(itemSpecSchema.safeParse(jozve(MAX_SECTIONS_PER_ITEM)).success).toBe(true);
  });

  it('جزوهٔ بی‌فایل و جزوهٔ بیشتر از سقف را رد می‌کند', () => {
    expect(itemSpecSchema.safeParse(jozve(0)).success).toBe(false);
    expect(itemSpecSchema.safeParse(jozve(MAX_SECTIONS_PER_ITEM + 1)).success).toBe(false);
  });

  it('بخش بی‌صفحه یا بی‌سند پذیرفته نمی‌شود', () => {
    const empty = jozve(2);
    empty.sections[1] = { documentId: 'd2', pageCount: 0 };
    expect(itemSpecSchema.safeParse(empty).success).toBe(false);

    const anonymous = jozve(2);
    anonymous.sections[0] = { documentId: '', pageCount: 10 };
    expect(itemSpecSchema.safeParse(anonymous).success).toBe(false);
  });

  it('تعداد صفحهٔ کل قلم در قرارداد نیست — فقط `quote()` جمعش می‌کند', () => {
    const parsed = itemSpecSchema.parse({ ...jozve(2), pageCount: 999 });
    expect(parsed).not.toHaveProperty('pageCount');
  });
});
